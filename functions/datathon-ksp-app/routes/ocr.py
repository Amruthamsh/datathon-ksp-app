"""Crime-document OCR route.

Only stdlib (+ Pillow for image downscale, fastapi) so the Catalyst ~115MB
zip limit is untouched. OCR itself is done by the Zoho QuickML Qwen vision
endpoint (ZOHO_VL_ENDPOINT_URL); bounding boxes are returned as 0-1000
relative coords and the frontend renders them as an overlay.
"""

import base64
import logging
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from auth.dependencies import get_current_user
from db.catalyst.catalyst import get_catalyst_app
from services.vision_service import transcribe_data_url

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/ocr", tags=["OCR"])

MAX_BYTES = 8 * 1024 * 1024

# Offline regex safety net — merged with LLM entities so demo still shows chips
# even if the model under-extracts.
RE = {
    "fir_no": re.compile(r"\b\d{2,4}/\d{4}\b"),
    "sections": re.compile(r"\b(?:BNS|BNSS|IPC|CrPC|NDPS|POCSO|KA\s*PA)\s*\.?\s*\d[\dA-Z()\-/.]*", re.I),
    "vehicles": re.compile(r"\b[A-Z]{2}[- ]?\d{1,2}[- ]?[A-Z]{1,3}[- ]?\d{3,4}\b"),
    "phones": re.compile(r"\b[6-9]\d{4}\s?\d{5}\b"),
    "dates": re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"),
}


def _regex_entities(text: str) -> dict:
    return {
        "fir_no": sorted(set(RE["fir_no"].findall(text or ""))),
        "sections": sorted(set(RE["sections"].findall(text or ""))),
        "vehicles": sorted(set(RE["vehicles"].findall(text or ""))),
        "phones": sorted(set(RE["phones"].findall(text or ""))),
        "dates": sorted(set(RE["dates"].findall(text or ""))),
        "stations": [],
        "names": [],
    }


def _parse_json(raw: str) -> dict:
    # Response parsing lives in services.vision_service; kept here for
    # backwards-compat imports.
    from services.vision_service import _parse_json as _shared_parse_json

    return _shared_parse_json(raw)


def _sanitize_blocks(blocks) -> list:
    clean = []
    for b in (blocks or [])[:40]:
        if not isinstance(b, dict) or not b.get("text"):
            continue
        try:
            x, y, w, h = (int(b.get(k, 0)) for k in ("x", "y", "w", "h"))
        except (TypeError, ValueError):
            continue
        x, y = max(0, min(1000, x)), max(0, min(1000, y))
        w, h = max(8, min(1000 - x, w)), max(8, min(1000 - y, h))
        try:
            conf = max(0.0, min(1.0, float(b.get("conf", 0.7))))
        except (TypeError, ValueError):
            conf = 0.7
        kind = str(b.get("kind", "other")).lower()
        if kind not in ("fir_no", "station", "date", "section", "vehicle", "phone", "name", "other"):
            kind = "other"
        clean.append({"text": str(b["text"])[:160], "x": x, "y": y, "w": w, "h": h, "conf": conf, "kind": kind})
    return clean


def _call_vision(data_url: str, case_hint: str, language: str, catalyst_app=None) -> dict:
    try:
        return transcribe_data_url(
            data_url, (case_hint or "")[:500], language or "en", catalyst_app
        )
    except RuntimeError as e:
        msg = str(e)
        if "ZOHO_VL_ENDPOINT_URL" in msg or "ZOHO_VL_ENDPOINT_KEY" in msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Zoho vision endpoint not configured (ZOHO_VL_ENDPOINT_URL / ZOHO_VL_ENDPOINT_KEY).",
            )
        if "Catalyst credential unavailable" in msg or "standalone dev mode" in msg:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OCR needs Catalyst auth — serve via `catalyst serve`, not standalone `python main.py`.",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Vision OCR failed: {e}",
        )


@router.post("/analyze", status_code=200)
async def analyze_document(
    request: Request,
    file: UploadFile = File(...),
    case_hint: str = Form(""),
    language: str = Form("en"),
    current_user: dict = Depends(get_current_user),
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image file (PNG/JPG/WEBP).")
    blob = await file.read()
    if not blob:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(blob) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 8MB).")

    try:
        catalyst_app = get_catalyst_app(request)
    except Exception:
        catalyst_app = None

    mime = file.content_type or "image/png"
    data_url = f"data:{mime};base64,{base64.b64encode(blob).decode()}"
    parsed = _call_vision(data_url, (case_hint or "")[:500], language or "en", catalyst_app)

    ocr_text = str(parsed.get("ocr_text", "") or "")
    blocks = _sanitize_blocks(parsed.get("blocks"))
    llm_ent = parsed.get("entities") or {}
    rx_ent = _regex_entities(ocr_text)
    entities = {k: sorted(set((llm_ent.get(k) or []) + rx_ent.get(k, [])))[:20]
                for k in ("fir_no", "stations", "dates", "sections", "vehicles", "phones", "names")}

    return {
        "status": "success",
        "filename": file.filename,
        "ocr_text": ocr_text,
        "blocks": blocks,
        "entities": entities,
        "summary": str(parsed.get("summary", "") or ""),
        "crime_head": str(parsed.get("crime_head", "") or ""),
        "insights": list(parsed.get("insights", []) or [])[:6],
        "verify": list(parsed.get("verify", []) or [])[:6],
    }
