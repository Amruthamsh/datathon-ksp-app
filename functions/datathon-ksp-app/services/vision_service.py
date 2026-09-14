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

Endpoint contract (verified live Sep 2026 against the vlm/generate endpoint):
  POST <url>, multipart/form-data fields:
    images: JSON-encoded array string of base64 images, e.g. '["<b64>"]'
            (bare base64 is rejected with
            "Error in processing `images` parameter"; a binary file upload
            404s; a JSON body 500s)
    prompt: <full instruction + context text>
  Headers: Authorization: Zoho-oauthtoken <token>, CATALYST-ORG,
            x-quickml-endpoint-key: <key> (REQUIRED — 400 without it)
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

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("fastapi_function")


def _get_org_id() -> str:
    # Read lazily (not at import time) so .env loaded later by other modules
    # still applies. Defaults to the known org; override via CATALYST_ORG_ID.
    return os.getenv("CATALYST_ORG_ID", "60073558955").strip() or "60073558955"


def _get_environment() -> str:
    return os.getenv("ZOHO_VL_ENVIRONMENT", "Development").strip() or "Development"

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
        raise RuntimeError(
            "Catalyst credential unavailable. Under `python main.py` standalone "
            "mode there is no Catalyst request context; serve via "
            "`catalyst serve` so the vision endpoint can authenticate."
        )
    cred = catalyst_app.credential
    # The VLM endpoint requires Admin scope, but the request-derived credential
    # defaults to the *user* scope. Under `catalyst serve` both tokens are
    # admin-privileged so either works, but real browser sessions carry a
    # low-privilege user token → HTTP 401 INVALID_OAUTHTOKEN. Temporarily
    # switch to admin for this server-side model call, then switch back so
    # other SDK operations keep their original scope.
    switched = False
    try:
        if cred.current_user() != "admin":
            cred._switch_user("admin")
            switched = cred.current_user() == "admin"
    except Exception:
        switched = False
    try:
        # token() returns a tuple: (credential_type_name, token_value)
        _cred_type, token = cred.token()
        return token
    finally:
        if switched:
            try:
                cred._switch_user("user")
            except Exception:
                pass


def _parse_json(raw: str) -> dict:
    raw = (raw or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.S).strip()
    m = re.search(r"\{.*\}", raw, flags=re.S)
    return json.loads(m.group(0) if m else raw)


def _scan_json_string(s: str, i: int) -> tuple[str | None, int]:
    """Scan a JSON string starting at s[i]=='"'. Returns (raw_inner, end_idx)
    where raw_inner keeps escape sequences intact. (None, i) if unterminated."""
    assert s[i] == '"'
    out = []
    i += 1
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            out.append(s[i : i + 2])
            i += 2
            continue
        if c == '"':
            return "".join(out), i + 1
        out.append(c)
        i += 1
    return None, i


def _decode_json_string(raw_inner: str) -> str:
    try:
        return json.loads('"' + raw_inner + '"')
    except Exception:
        pass
    # Model often emits literal control chars inside strings — escape them.
    fixed = raw_inner.replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t")
    try:
        return json.loads('"' + fixed + '"')
    except Exception:
        return raw_inner


def _extract_string_field(raw: str, name: str) -> str:
    m = re.search(r'"' + re.escape(name) + r'"\s*:\s*"', raw)
    if not m:
        return ""
    val, _ = _scan_json_string(raw, m.end() - 1)
    if val is None:
        return ""
    return _decode_json_string(val)


def _scan_balanced(s: str, i: int) -> str | None:
    """Return the balanced [...] / {...} substring starting at s[i], or None
    if truncated. String-aware (ignores brackets inside quotes)."""
    if i >= len(s) or s[i] not in "[{":
        return None
    depth = 0
    in_str = False
    esc = False
    for j in range(i, len(s)):
        c = s[j]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c in "[{":
                depth += 1
            elif c in "]}":
                depth -= 1
                if depth == 0:
                    return s[i : j + 1]
    return None


def _extract_json_fragment(raw: str, name: str, default):
    """Find `"name": <json value>`, balanced-scan it, json.loads it."""
    m = re.search(r'"' + re.escape(name) + r'"\s*:\s*', raw)
    if not m:
        return default
    i = m.end()
    while i < len(raw) and raw[i] in " \t\r\n":
        i += 1
    if i < len(raw) and raw[i] == '"':
        val, _ = _scan_json_string(raw, i)
        return _decode_json_string(val) if val is not None else default
    frag = _scan_balanced(raw, i) if i < len(raw) else None
    if frag is None:
        return default
    try:
        return json.loads(frag)
    except Exception:
        return default


def _parse_json_lenient(raw: str) -> dict:
    """Strict parse first; fall back to field-wise tolerant extraction.

    VLM transcription output routinely contains unescaped quotes / literal
    newlines inside `ocr_text` (or gets truncated), which breaks naive
    json.loads. Field-wise recovery still yields the transcription plus any
    intact blocks/entities instead of failing the whole OCR turn.
    """
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.S).strip()
    try:
        m = re.search(r"\{.*\}", text, flags=re.S)
        parsed = json.loads(m.group(0) if m else text)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    blocks_raw = _extract_json_fragment(text, "blocks", [])
    blocks = []
    if isinstance(blocks_raw, list):
        for b in blocks_raw:
            if isinstance(b, dict) and b.get("text"):
                blocks.append(b)
    else:
        # Truncated array: salvage individually parseable {...} items.
        for m in re.finditer(r"\{", text):
            frag = _scan_balanced(text, m.start())
            if not frag:
                continue
            try:
                b = json.loads(frag)
            except Exception:
                continue
            if isinstance(b, dict) and b.get("text"):
                blocks.append(b)
                if len(blocks) >= 40:
                    break
    entities = _extract_json_fragment(text, "entities", {})
    if not isinstance(entities, dict):
        entities = {}
    out = {
        "ocr_text": _extract_string_field(text, "ocr_text"),
        "blocks": blocks,
        "entities": entities,
        "summary": _extract_string_field(text, "summary"),
        "crime_head": _extract_string_field(text, "crime_head"),
        "insights": _extract_json_fragment(text, "insights", []) or [],
        "verify": _extract_json_fragment(text, "verify", []) or [],
    }
    if not isinstance(out["insights"], list):
        out["insights"] = []
    if not isinstance(out["verify"], list):
        out["verify"] = []
    if not any([out["ocr_text"], out["blocks"], out["summary"]]):
        raise RuntimeError(
            "Vision model returned unparseable output "
            f"(preview: {text[:200]!r})"
        )
    return out


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
        raw_bytes = base64.b64decode(raw_b64)
    except Exception:
        raw_bytes = b""
    scaled_bytes = _downscale_image(raw_bytes) if raw_bytes else raw_bytes

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
    # Debug escape hatch (local diagnostics only): VL_SHORT_PROMPT=1 sends a
    # minimal prompt to isolate endpoint-side failures from prompt-related ones.
    if os.getenv("VL_SHORT_PROMPT", "").strip() in ("1", "true", "yes"):
        prompt = "Describe this image briefly."

    try:
        # Multipart with the images field as a JSON array string of base64
        # (see module docstring for the verified contract). Do NOT set
        # Content-Type manually; requests generates the boundary.
        payload_b64 = base64.b64encode(scaled_bytes).decode() if scaled_bytes else ""
        resp = requests.post(
            url,
            files={
                "images": (None, json.dumps([payload_b64])),
                "prompt": (None, prompt),
            },
            headers={
                "Authorization": f"Zoho-oauthtoken {token}",
                "CATALYST-ORG": _get_org_id(),
                "x-quickml-endpoint-key": endpoint_key,
            },
            timeout=120,
        )
        try:
            resp.raise_for_status()
        except Exception as http_err:
            # Surface the endpoint's error body (it explains the 4xx cause);
            # raise_for_status() alone discards it.
            detail = ""
            try:
                detail = (resp.text or "").strip()[:800]
            except Exception:
                pass
            raise RuntimeError(
                f"Zoho VL endpoint HTTP {resp.status_code}: {detail or http_err}"
            ) from http_err
        try:
            body = resp.json()
        except Exception as json_err:
            raise RuntimeError(
                f"Zoho VL endpoint returned non-JSON: {(resp.text or '')[:300]}"
            ) from json_err
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"Zoho VL endpoint call failed: {e}") from e

    raw_text = _extract_text(body)
    return _parse_json_lenient(raw_text)


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
