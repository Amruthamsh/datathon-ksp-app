import logging
import traceback
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import Response

from auth.dependencies import get_current_user
from db.catalyst.catalyst import get_catalyst_app
from db.dependencies import get_chat_repository, get_conversation_repository
from db.catalyst.nosql_chat_repository import ChatRepository, ConversationRepository
from schemas.chat import RenameConversationRequest, FeedbackRequest
from services.evidence_service import (
    MAX_EVIDENCE_BYTES,
    download_evidence_file,
    upload_evidence_file,
)

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/chat", tags=["Chat"])

_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")


def _looks_like_image(content_type: str | None, filename: str | None) -> bool:
    if (content_type or "").lower().startswith("image/"):
        return True
    return (filename or "").lower().endswith(_IMAGE_EXTS)

_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        from agents.sql_query_db.graph import graph
        _graph = graph
    return _graph


def _trace_detail(node: str, update: dict) -> dict:
    """Compact, display-safe summary of what a node contributed."""
    u = update or {}
    if node == "language_detection":
        return {"language": u.get("language")}
    if node == "translate_query":
        return {"translated": u.get("translated_query") if "messages" in u else None}
    if node == "evidence":
        return {"skipped": not u.get("evidence_context")}
    if node == "legal_reference":
        refs = u.get("legal_references") or []
        return {"skipped": not refs, "sections": len(refs)}
    if node == "scene":
        return {"skipped": not u.get("scene_cards")}
    if node == "router":
        return {"intent": u.get("intent")}
    if node == "planner":
        return {"tables": u.get("selected_tables") or []}
    if node == "fetch_column_values":
        return {"columns": len(u.get("distinct_values") or {})}
    if node == "generate_sql":
        return {"chars": len(u.get("sql_query") or "")}
    if node == "execute_sql":
        guard = u.get("sql_guard") or {}
        return {
            "rows": len(u.get("sql_result") or []),
            "guard": guard.get("passed"),
            "scoped": bool((u.get("sql_scope") or {}).get("applied")),
            "error": bool(u.get("error")),
        }
    if node == "chart":
        return {"charts": [c.get("type") or c.get("intent") for c in u.get("charts") or []]}
    if node == "response":
        return {"follow_ups": len(u.get("follow_up_questions") or [])}
    if node == "translate_response":
        return {"skipped": not u}
    if node == "finalize":
        return {"skipped": True}
    return {}


def _run_graph_with_trace(state: dict) -> tuple[dict, list]:
    """Invoke the agent graph, recording per-node wall time for the audit trail.

    The graph is linear per turn, so the gap between consecutive update
    events is the node's own execution time.
    """
    import time

    trace: list[dict] = []
    final: dict = {}
    t_prev = time.perf_counter()
    for mode, chunk in _get_graph().stream(state, stream_mode=["updates", "values"]):
        if mode == "values":
            final = chunk
            continue
        now = time.perf_counter()
        for node, update in (chunk or {}).items():
            trace.append({
                "node": node,
                "ms": round((now - t_prev) * 1000),
                "detail": _trace_detail(node, update if isinstance(update, dict) else {}),
            })
        t_prev = now
    return final, trace


def _scope_label(scope: dict) -> str:
    """Human label for the officer's jurisdiction ("Bengaluru Urban district")."""
    level = (scope or {}).get("level", "self")
    if level == "all":
        return "Karnataka (statewide)"
    try:
        from db.sqlite.sqlite import get_connection

        with get_connection() as conn:
            if level == "district" and scope.get("district_id") is not None:
                row = conn.execute(
                    "SELECT DistrictName FROM District WHERE DistrictID = ?", [scope["district_id"]]
                ).fetchone()
                return f"{row[0]} district" if row else "your district"
            if level == "unit" and scope.get("unit_id") is not None:
                row = conn.execute("SELECT UnitName FROM Unit WHERE UnitID = ?", [scope["unit_id"]]).fetchone()
                return row[0] if row else "your station"
    except Exception:
        pass
    return "cases assigned to you"


def _build_state_messages(history: list, current_query: str) -> list:
    from langchain_core.messages import HumanMessage, AIMessage

    messages = []
    for m in history:
        if m.get("role") == "user":
            messages.append(HumanMessage(content=m["content"]))
        else:
            messages.append(AIMessage(content=m["content"]))
    messages.append(HumanMessage(content=current_query))
    return messages


@router.post("/generate", status_code=200)
async def generate_response(
    request: Request,
    user_query: str = Form(...),
    conversation_id: str | None = Form(None),
    language: str | None = Form(None),
    use_codebook: str | None = Form(None),
    use_osint: str | None = Form(None),
    use_scene_pin: str | None = Form(None),
    use_location: str | None = Form(None),
    use_web: str | None = Form(None),
    location_lat: str | None = Form(None),
    location_lng: str | None = Form(None),
    location_radius_km: str | None = Form(None),
    files: list[UploadFile] = File(default=[]),
    current_user: dict = Depends(get_current_user),
    chat_repo: Optional[ChatRepository] = Depends(get_chat_repository),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
):
    user_id = current_user["kgid"]
    history = []

    # Persistence is best-effort — never block the query on a Catalyst failure
    if conv_repo and chat_repo:
        try:
            if conversation_id:
                conversation = conv_repo.get(conversation_id, user_id)
                if not conversation:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
                history = chat_repo.get_messages(conversation_id)
            else:
                conversation = conv_repo.create(user_id, user_query)
                conversation_id = conversation["conversation_id"]
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"NoSQL conversation setup failed (non-fatal): {e}")
            conversation_id = conversation_id  # keep whatever was passed in

    # --- Evidence: persist Home-chat uploads to Catalyst FileStore ---
    # Best-effort — the query must still run even if FileStore is unavailable.
    # Uploads happen BEFORE the user message is saved so the message record
    # carries the FileStore metadata (analysis.evidence_files).
    evidence_files: list[dict] = []
    failed_uploads: list[str] = []
    ocr_warnings: list[str] = []
    if files:
        try:
            catalyst_app = get_catalyst_app(request)
        except Exception as e:
            logger.warning(f"Catalyst SDK unavailable for evidence upload: {e}")
            catalyst_app = None
        for f in files:
            try:
                blob = await f.read()
                if not blob:
                    failed_uploads.append(f.filename or "unnamed file")
                    continue
                if len(blob) > MAX_EVIDENCE_BYTES:
                    logger.warning(
                        f"Evidence file too large, skipping: {f.filename} "
                        f"({len(blob)} bytes)"
                    )
                    failed_uploads.append(f.filename or "unnamed file")
                    continue
                meta = upload_evidence_file(
                    catalyst_app,
                    blob,
                    f.filename or "evidence",
                    f.content_type,
                    conversation_id,
                )
                # Images carry no extractable text via the storage path —
                # transcribe with the Zoho QuickML vision endpoint so the
                # agent actually reads the document. Match by MIME *or*
                # extension: some browsers/OS report an empty or generic
                # MIME, which previously skipped OCR silently.
                if _looks_like_image(f.content_type, f.filename):
                    try:
                        from services.vision_service import (
                            sanitize_blocks,
                            transcribe_image_bytes,
                        )

                        parsed = transcribe_image_bytes(
                            blob,
                            f.content_type,
                            (user_query or "")[:200],
                            language or "en",
                            catalyst_app,
                        )
                        ocr_text = str(parsed.get("ocr_text") or "").strip()
                        if ocr_text:
                            meta["ocr_text"] = ocr_text[:6000]
                            meta["snippet"] = ocr_text[:2000]
                            summary = str(parsed.get("summary") or "").strip()
                            if summary:
                                meta["doc_summary"] = summary[:500]
                            # Bounding boxes + entities power the analysis
                            # workspace overlay (image + boxes + chips).
                            blocks = sanitize_blocks(parsed.get("blocks"))
                            if blocks:
                                meta["ocr_blocks"] = blocks
                            entities = parsed.get("entities") or {}
                            if isinstance(entities, dict):
                                capped = {
                                    k: list(v)[:20]
                                    for k, v in entities.items()
                                    if isinstance(v, list) and v
                                }
                                if capped:
                                    meta["ocr_entities"] = capped
                            logger.info(
                                f"Evidence OCR transcribed {len(ocr_text)} chars "
                                f"({len(blocks)} boxes) from {f.filename}"
                            )
                        else:
                            ocr_warnings.append(
                                f"OCR returned no text for {f.filename or 'image'}."
                            )
                    except Exception as e:
                        # Surface to the UI instead of a log-only warning —
                        # previously OCR failed silently and the agent saw an
                        # empty file.
                        msg = str(e)
                        logger.warning(
                            f"Evidence OCR failed for {f.filename} "
                            f"(non-fatal): {e}"
                        )
                        meta["ocr_error"] = msg[:300]
                        if "ZOHO_VL_ENDPOINT_URL" in msg or "ZOHO_VL_ENDPOINT_KEY" in msg:
                            ocr_warnings.append(
                                "Document OCR is not configured (ZOHO_VL_ENDPOINT "
                                "URL/KEY missing). The file was stored but not read."
                            )
                        elif "Catalyst credential unavailable" in msg:
                            ocr_warnings.append(
                                f"OCR unavailable in standalone dev mode for "
                                f"{f.filename or 'image'} — serve via "
                                "`catalyst serve` so the vision endpoint can "
                                "authenticate. The file was stored but not read."
                            )
                        elif "INVALID_OAUTHTOKEN" in msg or "HTTP 401" in msg:
                            ocr_warnings.append(
                                f"OCR authentication failed for "
                                f"{f.filename or 'image'} (vision endpoint "
                                "rejected the token). Re-login and retry; if it "
                                "persists, the QuickML endpoint's OAuth scope "
                                "may need attention. The file was stored but "
                                "not read."
                            )
                        else:
                            ocr_warnings.append(
                                f"OCR failed for {f.filename or 'image'}: "
                                f"{msg[:160]}"
                            )
                elif (f.filename or "").lower().endswith(".pdf") or (
                    f.content_type or ""
                ).lower() == "application/pdf":
                    # Digital PDFs get text via extract_text_snippet; scanned
                    # PDFs have no text layer and the VL endpoint only accepts
                    # images — flag so the UI can advise uploading a photo.
                    if not (meta.get("snippet") or "").strip():
                        meta["needs_image_ocr"] = True
                        ocr_warnings.append(
                            f"{f.filename or 'PDF'} has no readable text "
                            "(scanned PDF?). For OCR, upload a photo "
                            "(PNG/JPG) of the document."
                        )
                evidence_files.append(meta)
                logger.info(
                    f"Received file upload: {f.filename} ({f.content_type}) "
                    f"-> {meta['storage']}:{meta['file_id']}"
                )
            except Exception as e:
                logger.warning(f"Evidence upload failed for {f.filename}: {e}")
                failed_uploads.append(f.filename or "unnamed file")
            finally:
                try:
                    await f.close()
                except Exception:
                    pass

    if conv_repo and chat_repo and conversation_id:
        try:
            user_analysis = (
                {"evidence_files": evidence_files} if evidence_files else None
            )
            chat_repo.save_message(
                conversation_id, "user", user_query, analysis=user_analysis
            )
        except Exception as e:
            logger.warning(f"Failed to save user message (non-fatal): {e}")

    def _to_float(raw: str | None) -> float | None:
        try:
            v = float(raw) if raw not in (None, "") else None
        except (TypeError, ValueError):
            return None
        return v

    scope = current_user.get("scope") or {"level": "self", "employee_id": current_user.get("employee_id")}
    state = {
        "messages": _build_state_messages(history, user_query),
        # RBAC: enforced on every executed query (functions/sql_scope.py).
        "scope": scope,
        "scope_label": _scope_label(scope),
        "language": language or "en",
        "original_query": user_query,
        "translated_query": "",
        "evidence_files": evidence_files,
        "evidence_context": "",
        # Investigator-framed source flags (frontend Form fields; the enriched
        # query text also carries hint markers for LLM-only paths).
        "use_codebook": (use_codebook or "").lower() in ("true", "1", "yes", "on"),
        "legal_references": [],
        "legal_context": "",
        # Location Query: dropped scene pin + fixed 10 km radius. Previously
        # these fields were accepted but ignored — only the text hint reached
        # the LLM, so nearby counts were improvised. Now scene_node runs real
        # radius queries (crime mix, repeat offenders, cached OSM POIs).
        "use_scene_pin": (use_scene_pin or use_location or "").lower() in ("true", "1", "yes", "on"),
        "scene_lat": _to_float(location_lat),
        "scene_lng": _to_float(location_lng),
        "scene_radius_km": _to_float(location_radius_km) or 10.0,
        "scene_cards": {},
        "scene_context": "",
    }

    graph_error = None
    trace: list[dict] = []
    try:
        result, trace = _run_graph_with_trace(state)
    except Exception:
        traceback.print_exc()
        graph_error = True
        result = {}

    audit = {
        "trace": trace,
        "sql_guard": result.get("sql_guard") or None,
        "sql_scope": result.get("sql_scope") or None,
        "officer": {
            "kgid": user_id,
            "rank": current_user.get("rank"),
            "tier": current_user.get("tier"),
            "scope": scope.get("level"),
            "jurisdiction": state["scope_label"],
        },
        "language": result.get("language") or language or "en",
    }

    response_text = result.get("response") or (
        "I encountered an error while processing your request. Please try again."
        if graph_error else ""
    )

    assistant_msg = None
    if chat_repo and conversation_id:
        try:
            assistant_msg = chat_repo.save_message(
                conversation_id,
                "assistant",
                response_text,
                analysis={
                    "response": response_text,
                    "sql_query": result.get("sql_query"),
                    "sql_result": result.get("sql_result", []),
                    "charts": result.get("charts", []),
                    "follow_up_questions": result.get("follow_up_questions", []),
                    # FileStore-backed evidence, rendered with links in the
                    # analysis workspace.
                    "evidence_files": result.get("evidence_files") or evidence_files,
                    "evidence_context": result.get("evidence_context", ""),
                    # Legal Codebook references — rendered as cards in the
                    # analysis workspace whenever they grounded the answer.
                    "legal_references": result.get("legal_references", []),
                    "legal_context": result.get("legal_context", ""),
                    # Scene Intel workup — rendered in the analysis workspace
                    # whenever the pin grounded the answer.
                    "scene_cards": result.get("scene_cards", {}),
                    "scene_context": result.get("scene_context", ""),
                    # Explainability: node trace + SQL guard verdict.
                    "audit": audit,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to save assistant message (non-fatal): {e}")

    if conv_repo and conversation_id:
        try:
            conv_repo.touch(conversation_id, user_id, user_query)
        except Exception as e:
            logger.warning(f"Failed to touch conversation (non-fatal): {e}")

    return {
        "status": "success",
        "conversation_id": conversation_id,
        "message_id": assistant_msg.get("message_id") if assistant_msg else None,
        "created_at": assistant_msg.get("created_at") if assistant_msg else None,
        "response": response_text,
        "sql_query": result.get("sql_query"),
        "sql_result": result.get("sql_result", []),
        "error": result.get("error"),
        "follow_up_questions": result.get("follow_up_questions", []),
        "charts": result.get("charts", []),
        "evidence_files": result.get("evidence_files") or evidence_files,
        "evidence_context": result.get("evidence_context", ""),
        "legal_references": result.get("legal_references", []),
        "legal_context": result.get("legal_context", ""),
        "scene_cards": result.get("scene_cards", {}),
        "scene_context": result.get("scene_context", ""),
        "audit": audit,
        "failed_uploads": failed_uploads,
        "ocr_warnings": ocr_warnings,
    }


@router.get("/evidence/{file_id}/download", status_code=200)
async def download_evidence(
    file_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Stream an evidence file back (FileStore first, local fallback).

    Auth is required; the link is rendered in the analysis workspace as
    ``/api/chat/evidence/<file_id>/download``.
    """
    try:
        catalyst_app = get_catalyst_app(request)
    except Exception:
        catalyst_app = None
    found = download_evidence_file(catalyst_app, file_id)
    if not found:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence file not found.")
    blob, filename, content_type = found
    safe = (filename or file_id).replace('"', "_")
    return Response(
        content=blob,
        media_type=content_type or "application/octet-stream",
        # inline (not attachment) so images/PDFs preview when opened
        # directly; the frontend still downloads via authenticated blob URLs.
        headers={"Content-Disposition": f'inline; filename="{safe}"'},
    )


@router.get("/conversations", status_code=200)
async def list_conversations(
    current_user: dict = Depends(get_current_user),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
):
    if not conv_repo:
        return {"status": "success", "conversations": []}

    try:
        conversations = conv_repo.list_for_user(current_user["kgid"])
    except Exception as e:
        logger.warning(f"Failed to list conversations (non-fatal): {e}")
        return {"status": "success", "conversations": []}

    return {
        "status": "success",
        "conversations": [
            {
                "conversation_id": c["conversation_id"],
                "title": c.get("title", ""),
                "last_message": c.get("last_message", ""),
                "updated_at": c.get("updated_at", ""),
                "message_count": c.get("message_count", 0),
            }
            for c in conversations
        ],
    }


@router.patch("/conversation/{conversation_id}", status_code=200)
async def rename_conversation(
    conversation_id: str,
    body: RenameConversationRequest,
    current_user: dict = Depends(get_current_user),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
):
    if not conv_repo:
        raise HTTPException(status_code=503, detail="Persistence unavailable.")

    conversation = conv_repo.get(conversation_id, current_user["kgid"])
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    try:
        conv_repo.rename(conversation_id, current_user["kgid"], body.title)
    except Exception as e:
        logger.error(f"Failed to rename conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to rename conversation.")

    return {"status": "success", "conversation_id": conversation_id, "title": body.title}


@router.delete("/conversation/{conversation_id}", status_code=200)
async def delete_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
    chat_repo: Optional[ChatRepository] = Depends(get_chat_repository),
):
    if not conv_repo:
        raise HTTPException(status_code=503, detail="Persistence unavailable.")

    conversation = conv_repo.get(conversation_id, current_user["kgid"])
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    try:
        conv_repo.delete(conversation_id, current_user["kgid"])
    except Exception as e:
        logger.error(f"Failed to delete conversation {conversation_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete conversation.")

    if chat_repo:
        chat_repo.delete_messages(conversation_id)

    return {"status": "success", "conversation_id": conversation_id}


@router.post("/feedback", status_code=200)
async def submit_feedback(
    body: FeedbackRequest,
    current_user: dict = Depends(get_current_user),
    chat_repo: Optional[ChatRepository] = Depends(get_chat_repository),
):
    if not chat_repo:
        raise HTTPException(status_code=503, detail="Persistence unavailable.")

    try:
        chat_repo.update_message_feedback(
            body.conversation_id,
            body.created_at,
            body.feedback,
        )
    except Exception as e:
        logger.error(f"Failed to update feedback: {e}")
        raise HTTPException(status_code=500, detail="Failed to save feedback.")

    return {
        "status": "success",
        "conversation_id": body.conversation_id,
        "created_at": body.created_at,
        "feedback": body.feedback,
    }


@router.get("/conversation/{conversation_id}", status_code=200)
async def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
    conv_repo: Optional[ConversationRepository] = Depends(get_conversation_repository),
    chat_repo: Optional[ChatRepository] = Depends(get_chat_repository),
):
    if not conv_repo or not chat_repo:
        raise HTTPException(status_code=503, detail="Persistence unavailable.")

    conversation = conv_repo.get(conversation_id, current_user["kgid"])
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    messages = chat_repo.get_messages(conversation_id, limit=100)
    return {
        "status": "success",
        "conversation_id": conversation_id,
        "title": conversation.get("title", ""),
        "messages": [
            {
                "role": m["role"],
                "content": m["content"],
                "analysis": m.get("analysis"),
                "created_at": m.get("created_at"),
                "message_id": m.get("message_id"),
                "feedback": m.get("feedback"),
            }
            for m in messages
        ],
    }
