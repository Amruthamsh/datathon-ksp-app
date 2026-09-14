"""Zoho QuickML vision transcription (Qwen 3.6-35B Vision Language endpoint).

Used by both the Crime-document OCR route (image overlay + entity chips)
and the Home-chat evidence pipeline (so uploaded images are actually *read*
instead of arriving at the agent as empty context).

Setup (console, one time — already done):
  QuickML -> LLM Serving -> Qwen 3.6-35B VL -> Save Configuration
  -> Endpoints -> Create Endpoint (type "LLM Configuration").
  Copy Endpoint URL + x-quickml-endpoint-key from the endpoint details page
  and set them as env vars, locally (.env) and in the Catalyst console
  (Function -> Configuration -> Environment Variables):
    ZOHO_VL_ENDPOINT_URL=https://console.catalyst.zoho.in/quickml/v1/project/.../genai/endpoints/vlm/generate
    ZOHO_VL_ENDPOINT_KEY=<x-quickml-endpoint-key from the endpoint page>

Endpoint contract (from the endpoint details page):
  POST <url>, multipart/form-data fields:
    images: <Base64-encoded image> (repeated per image)
    prompt: <full instruction + context text>
  Headers: Authorization: Zoho-oauthtoken <token>, CATALYST-ORG,
           Environment: Development, x-quickml-endpoint-key: <key>
  Response JSON: {request_id, model, response: "<VLM text>", metrics: {...}}

Note: the contract has no system-prompt channel, so the STRICT JSON schema
instructions are folded into the per-request `prompt` field (the saved
"Instructions" config applies on top).

Framework-agnostic: raises RuntimeError on failure; callers map to HTTP
errors as appropriate. Auth uses the Catalyst credential token, so callers
pass the request-derived ``catalyst_app`` (None in standalone dev mode ->
RuntimeError -> graceful degradation).
"""

import base64
import io
import json
import logging
import os
import re

logger = logging.getLogger("fastapi_function")

_ORG_ID = os.getenv("CATALYST_ORG_ID", "60073558955")
_ENVIRONMENT = os.getenv("ZOHO_VL_ENVIRONMENT", "Development")

DOCUMENT_PROMPT = """You are a Karnataka police document analyst. Given a crime-related image \
(FIR scan, complaint, proforma, seizure memo, vehicle plate photo, CCTV still), do OCR and return STRICT JSON only:
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
Kind must be one of the listed values. No markdown, JSON only.

Case context: %s
Response language: %s
Transcribe this crime document image and return the JSON."""


def _get_config() -> tuple[str, str]:
    url = os.getenv("ZOHO_VL_ENDPOINT_URL", "").strip()
    if not url:
        raise RuntimeError(
            "ZOHO_VL_ENDPOINT_URL not configured. Create a QuickML LLM Serving "
            "endpoint for the Qwen vision model and set its URL as an env var."
        )
    key = os.getenv("ZOHO_VL_ENDPOINT_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "ZOHO_VL_ENDPOINT_KEY not configured. Copy x-quickml-endpoint-key "
            "from the endpoint details page into env vars."
        )
    return url, key


def _get_access_token(catalyst_app) -> str:
    if catalyst_app is None:
        raise RuntimeError("Catalyst app unavailable (standalone dev mode).")
    # token() returns a tuple: (credential_type_name, token_value)
    _cred_type, token = catalyst_app.credential.token()
    return token


def _parse_json(raw: str) -> dict:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.S).strip()
    m = re.search(r"\{.*\}", raw, flags=re.S)
    return json.loads(m.group(0) if m else raw)


def _extract_text(body) -> str:
    """Pull the VLM text out of the endpoint response."""
    if isinstance(body, str):
        return body
    if not isinstance(body, dict):
        return str(body)
    resp = body.get("response")
    if isinstance(resp, str) and resp.strip():
        return resp
    raise RuntimeError(f"Unrecognized QuickML vision response shape: {str(body)[:300]}")


def _downscale_image(blob: bytes) -> bytes:
    """Downscale large photos to the VL model's input budget (best-effort)."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(blob))
        if max(img.size) > 1568:
            img.thumbnail((1568, 1568), Image.LANCZOS)
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=82)
        return buf.getvalue()
    except Exception as e:
        logger.warning(f"Image downscale skipped (non-fatal): {e}")
        return blob


def _b64_from_data_url(data_url: str) -> str:
    if "," in data_url:
        return data_url.split(",", 1)[1]
    return data_url


def transcribe_data_url(
    data_url: str,
    case_hint: str = "",
    language: str = "en",
    catalyst_app=None,
    system_prompt: str | None = None,
) -> dict:
    """Transcribe a data-URL image via the Zoho VL endpoint. Returns parsed JSON."""
    import requests  # lazy: keeps cold start light; already a deploy dep

    url, endpoint_key = _get_config()
    token = _get_access_token(catalyst_app)

    raw_b64 = _b64_from_data_url(data_url)
    # Re-encode through the downscaler so oversized photos fit the input budget.
    try:
        scaled = _downscale_image(base64.b64decode(raw_b64))
        payload_b64 = base64.b64encode(scaled).decode()
    except Exception:
        payload_b64 = raw_b64

    schema = system_prompt or DOCUMENT_PROMPT
    # DOCUMENT_PROMPT carries %(case_hint, language) slots; a custom prompt
    # is used verbatim with context appended.
    if "%s" in schema:
        prompt = schema % ((case_hint or "")[:500], language or "en")
    else:
        prompt = (
            f"{schema}\n\nCase context: {(case_hint or '')[:500]}\n"
            f"Response language: {language or 'en'}\n"
            "Transcribe this crime document image and return the JSON."
        )

    try:
        resp = requests.post(
            url,
            data=[("images", payload_b64), ("prompt", prompt)],
            headers={
                "Authorization": f"Zoho-oauthtoken {token}",
                "CATALYST-ORG": _ORG_ID,
                "Environment": _ENVIRONMENT,
                "x-quickml-endpoint-key": endpoint_key,
            },
            timeout=120,
        )
        resp.raise_for_status()
        body = resp.json()
    except Exception as e:
        raise RuntimeError(f"Zoho VL endpoint call failed: {e}") from e

    return _parse_json(_extract_text(body))


def transcribe_image_bytes(
    blob: bytes,
    mime: str | None,
    case_hint: str = "",
    language: str = "en",
    catalyst_app=None,
) -> dict:
    """Convenience wrapper: raw image bytes -> parsed transcription dict."""
    scaled = _downscale_image(blob)
    data_url = f"data:{mime or 'image/jpeg'};base64,{base64.b64encode(scaled).decode()}"
    return transcribe_data_url(data_url, case_hint, language, catalyst_app)
