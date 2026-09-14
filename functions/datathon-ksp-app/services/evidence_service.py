"""Evidence file handling backed by Zoho Catalyst Cloud Scale FileStore.

Home-chat uploads are persisted to a FileStore folder (configured via
``EVIDENCE_FILESTORE_FOLDER_ID``) so files survive across requests and can be
referenced from the analysis workspace with a download link.

Design notes:
- Zero new deploy deps (stdlib only). FileStore access goes through the
  already-vendored ``zcatalyst_sdk``.
- Graceful fallback: when the Catalyst SDK / folder id is unavailable
  (standalone ``python main.py`` dev mode), files are staged under the OS temp
  dir with ``storage="local"`` so the LangGraph workflow and UI still work.
- Text snippets are extracted with stdlib (+ python-docx which is already a
  deploy dep for DOCX export) so the LLM can reason about evidence without
  loading full binaries into the prompt.
"""

import io
import logging
import os
import tempfile
import uuid

logger = logging.getLogger("fastapi_function")

MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
_SNIPPET_CHARS = 2000

# FileStore folder holding Home-chat evidence. Create the folder in the
# Catalyst console (Cloud Scale -> File Store) and set this env var both
# locally (.env) and in the Catalyst console (Function -> Configuration ->
# Environment Variables).
EVIDENCE_FOLDER_ENV = "EVIDENCE_FILESTORE_FOLDER_ID"

_LOCAL_STAGEDIR = os.path.join(tempfile.gettempdir(), "ksp-evidence")


def get_evidence_folder_id() -> str | None:
    folder_id = os.getenv(EVIDENCE_FOLDER_ENV, "").strip()
    return folder_id or None


def _safe_filename(name: str | None) -> str:
    base = (name or "evidence").strip().replace("/", "_").replace("\\", "_")
    return base[:150] or "evidence"


def _unique_stored_name(conversation_id: str | None, filename: str) -> str:
    prefix = (conversation_id or "adhoc")[:12]
    return f"{prefix}_{uuid.uuid4().hex[:8]}_{_safe_filename(filename)}"


def extract_text_snippet(
    blob: bytes, content_type: str | None, filename: str | None
) -> str:
    """Best-effort text extraction for LLM context (never raises)."""
    try:
        ctype = (content_type or "").lower()
        name = (filename or "").lower()
        if ctype.startswith("text/") or name.endswith((".txt", ".csv", ".md", ".json")):
            return blob.decode("utf-8", errors="replace")[:_SNIPPET_CHARS]
        if name.endswith(".docx"):
            try:
                from docx import Document

                doc = Document(io.BytesIO(blob))
                text = "\n".join(p.text for p in doc.paragraphs)
                return text[:_SNIPPET_CHARS]
            except Exception as e:
                logger.warning(f"DOCX snippet extraction failed: {e}")
                return ""
        if name.endswith(".pdf") or ctype == "application/pdf":
            # pypdf is NOT a deploy dep (size limits) — skip server-side parse.
            # The filename itself still gives the agent a citation handle.
            return ""
        return ""
    except Exception as e:
        logger.warning(f"Evidence snippet extraction failed: {e}")
        return ""


def upload_evidence_file(
    catalyst_app,
    blob: bytes,
    filename: str,
    content_type: str | None,
    conversation_id: str | None = None,
) -> dict:
    """Persist one uploaded file; returns evidence metadata dict.

    Metadata shape (stored in chat messages + passed to LangGraph state):
      {file_id, filename, content_type, size_bytes, storage, folder_id,
       download_url, snippet}
    ``download_url`` is the backend-served link rendered in the analysis
    workspace: ``/api/chat/evidence/<file_id>/download``.
    """
    filename = _safe_filename(filename)
    size = len(blob)
    snippet = extract_text_snippet(blob, content_type, filename)

    folder_id = get_evidence_folder_id()

    # --- Catalyst FileStore path ---
    if catalyst_app is not None and folder_id:
        try:
            stored_name = _unique_stored_name(conversation_id, filename)
            # SDK expects a binary file object: folder.upload_file(name, file)
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=f"_{filename}"
            ) as tmp:
                tmp.write(blob)
                tmp_path = tmp.name
            try:
                with open(tmp_path, "rb") as fh:
                    filestore = catalyst_app.filestore()
                    folder = filestore.folder(folder_id)
                    uploaded = folder.upload_file(stored_name, fh)
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass
            file_id = str(
                (uploaded or {}).get("id")
                or (uploaded or {}).get("file_id")
                or uuid.uuid4()
            )
            logger.info(
                f"Evidence uploaded to FileStore folder {folder_id}: "
                f"{filename} -> {stored_name} (id={file_id})"
            )
            return {
                "file_id": file_id,
                "filename": filename,
                "stored_name": stored_name,
                "content_type": content_type or "application/octet-stream",
                "size_bytes": size,
                "storage": "filestore",
                "folder_id": str(folder_id),
                "download_url": f"/api/chat/evidence/{file_id}/download",
                "snippet": snippet,
            }
        except Exception as e:
            logger.warning(f"FileStore upload failed, using local fallback: {e}")

    # --- Local fallback (standalone dev / missing config) ---
    os.makedirs(_LOCAL_STAGEDIR, exist_ok=True)
    file_id = uuid.uuid4().hex
    stored_name = _unique_stored_name(conversation_id, filename)
    try:
        with open(os.path.join(_LOCAL_STAGEDIR, f"{file_id}_{stored_name}"), "wb") as fh:
            fh.write(blob)
    except Exception as e:
        logger.warning(f"Local evidence staging failed: {e}")
    logger.info(f"Evidence staged locally: {filename} (id={file_id})")
    return {
        "file_id": file_id,
        "filename": filename,
        "stored_name": stored_name,
        "content_type": content_type or "application/octet-stream",
        "size_bytes": size,
        "storage": "local",
        "folder_id": folder_id,
        "download_url": f"/api/chat/evidence/{file_id}/download",
        "snippet": snippet,
    }


def download_evidence_file(catalyst_app, file_id: str) -> tuple[bytes, str, str] | None:
    """Return (bytes, filename, content_type) for an evidence file, or None.

    FileStore lookup uses the configured evidence folder. Local fallback files
    are matched by ``file_id`` prefix in the staging dir.
    """
    folder_id = get_evidence_folder_id()

    if catalyst_app is not None and folder_id:
        try:
            folder = catalyst_app.filestore().folder(folder_id)
            data = folder.download_file(file_id)
            if isinstance(data, (bytes, bytearray)):
                return bytes(data), file_id, "application/octet-stream"
            if hasattr(data, "read"):
                return data.read(), file_id, "application/octet-stream"
        except Exception as e:
            logger.warning(f"FileStore download failed for {file_id}: {e}")

    # Local fallback
    try:
        if os.path.isdir(_LOCAL_STAGEDIR):
            for entry in os.listdir(_LOCAL_STAGEDIR):
                if entry.startswith(file_id):
                    path = os.path.join(_LOCAL_STAGEDIR, entry)
                    with open(path, "rb") as fh:
                        blob = fh.read()
                    # Original filename sits after "<file_id>_<prefix>_<uuid>_"
                    parts = entry.split("_", 3)
                    fname = parts[3] if len(parts) == 4 else entry
                    return blob, fname, "application/octet-stream"
    except Exception as e:
        logger.warning(f"Local evidence download failed for {file_id}: {e}")
    return None
