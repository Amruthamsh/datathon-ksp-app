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

_graph = None


def _get_graph():
    global _graph
    if _graph is None:
        from agents.sql_query_db.graph import graph
        _graph = graph
    return _graph


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
                # Images/PDF scans carry no extractable text via the storage
                # path — transcribe with the Zoho QuickML vision endpoint so
                # the agent actually reads the document (best-effort; never
                # blocks the query).
                if (f.content_type or "").startswith("image/"):
                    try:
                        from services.vision_service import transcribe_image_bytes

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
                            logger.info(
                                f"Evidence OCR transcribed {len(ocr_text)} chars "
                                f"from {f.filename}"
                            )
                    except Exception as e:
                        logger.warning(
                            f"Evidence OCR failed for {f.filename} "
                            f"(non-fatal): {e}"
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

    state = {
        "messages": _build_state_messages(history, user_query),
        "language": language or "en",
        "original_query": user_query,
        "translated_query": "",
        "evidence_files": evidence_files,
        "evidence_context": "",
    }

    graph_error = None
    try:
        result = _get_graph().invoke(state)
    except Exception:
        traceback.print_exc()
        graph_error = True
        result = {}

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
        "failed_uploads": failed_uploads,
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
        headers={"Content-Disposition": f'attachment; filename="{safe}"'},
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
