"""Crime-document OCR POC route.

Zero new deploy deps (stdlib + groq + fastapi only) so the Catalyst
~115MB zip limit is untouched. OCR itself is done by a Groq vision
model; bounding boxes are returned as 0-1000 relative coords and the
frontend renders them as an overlay (flashy + useful for verification).
"""

import base64
import json
import logging
import os
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from auth.dependencies import get_current_user

logger = logging.getLogger("fastapi_function")
router = APIRouter(prefix="/ocr", tags=["OCR"])

MAX_BYTES = 8 * 1024 * 1024
# Groq retired all Llama vision models (Scout/Maverick Jul 2026, 3.2-Vision Apr 2025).
# Current vision models per https://console.groq.com/docs/vision:
VISION_MODEL = os.getenv("OCR_VISION_MODEL", "qwen/qwen3.6-27b")
FALLBACK_VISION_MODEL = os.getenv("OCR_VISION_FALLBACK", "qwen/qwen3.8-27b")

SYSTEM_PROMPT = """You are a Karnataka police document analyst. Given a crime-related image \
(FIR scan, complaint, seizure memo, vehicle plate photo, CCTV still), do OCR and return STRICT JSON only:
{
  "ocr_text": "full transcribed text, line breaks preserved",
  "blocks": [{"text": "line/word", "x": 0-1000, "y": 0-1000, "w": 0-1000, "h": 0-1000,
              "conf": 0.0-1.0, "kind": "fir_no|station|date|section|vehicle|phone|name|other"}],
  "entities": {"fir_no": [], "stations": [], "dates": [], "sections": [],
               "vehicles": [], "phones": [], "names": []},
  "summary": "3-line crime summary: what, where/when, who/what involved",
  "crime_head": "theft|robbery|assault|fraud|...",
  "insights": ["3 short actionable IO insights"],
  "verify": ["fields to double-check against original (low confidence / handwriting)"]
}
Rules: boxes cover each text LINE (max 40). Coords are relative 0-1000. conf is your estimate. \
Kind must be one of the listed values. No markdown, JSON only."""

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
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.S).strip()
    m = re.search(r"\{.*\}", raw, flags=re.S)
    return json.loads(m.group(0) if m else raw)


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


def _call_vision(data_url: str, case_hint: str, language: str) -> dict:
    from groq import Groq

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="GROQ_API_KEY not configured.")
    client = Groq(api_key=api_key)
    user_text = (f"Case context: {case_hint}\nResponse language: {language}\n"
                 "Transcribe this crime document image and return the JSON.").strip()
    last_err: Exception | None = None
    for model in (VISION_MODEL, FALLBACK_VISION_MODEL):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": data_url}},
                    ]},
                ],
                temperature=0.1,
                max_completion_tokens=2500,
                response_format={"type": "json_object"},
            )
            return _parse_json(resp.choices[0].message.content)
        except Exception as e:  # fall through to fallback model, then 502
            last_err = e
            logger.warning(f"OCR vision call failed on {model}: {e}")
    raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Vision OCR failed: {last_err}")


@router.post("/analyze", status_code=200)
async def analyze_document(
    file: UploadFile = File(...),
    case_hint: str = Form(""),
    language: str = Form("en"),
    current_user: dict = Depends(get_current_user),
):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image file (PNG/JPG).")
    blob = await file.read()
    if not blob:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(blob) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 8MB).")

    mime = file.content_type or "image/png"
    data_url = f"data:{mime};base64,{base64.b64encode(blob).decode()}"
    parsed = _call_vision(data_url, (case_hint or "")[:500], language or "en")

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
