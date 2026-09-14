"""Evidence ingestion node — runs before the router.

Builds ``evidence_context``: a compact, citable summary of the FileStore-backed
files attached to this turn (filename, size, download link, text snippet).
Downstream nodes (router / planner / response / chat) read it to ground the
analysis in the uploaded evidence and to cite each file with its link.
"""

from langchain_core.messages import HumanMessage

from agents.sql_query_db.state import SQLAgentState


def _format_size(num: int) -> str:
    try:
        n = int(num or 0)
    except (TypeError, ValueError):
        return "unknown size"
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / (1024 * 1024):.1f} MB"


def evidence_node(state: SQLAgentState):
    evidence_files: list = state.get("evidence_files") or []
    if not evidence_files:
        return {"evidence_context": "", "evidence_files": []}

    lines = []
    for ev in evidence_files:
        fname = ev.get("filename", "evidence")
        link = ev.get("download_url", "")
        snippet = (ev.get("snippet") or ev.get("ocr_text") or "").strip()
        summary = (ev.get("doc_summary") or "").strip()
        header = f"- **{fname}** ({_format_size(ev.get('size_bytes', 0))})"
        if link:
            header += f" — [Open file]({link})"
        lines.append(header)
        if summary:
            lines.append(f"  Vision summary: {summary}")
        if snippet:
            # Full transcription so planner/response can ground on entities
            # (FIR numbers, districts, sections, names, vehicles).
            clipped = snippet[:3000] + ("…" if len(snippet) > 3000 else "")
            lines.append(f"  Transcription: {clipped}")

    evidence_context = (
        "Uploaded evidence for this turn (stored in Catalyst FileStore, "
        "citable via the links below):\n" + "\n".join(lines)
    )

    # Make the evidence visible to downstream LLM nodes via conversation.
    return {
        "evidence_context": evidence_context,
        "messages": [HumanMessage(content=f"[Evidence attached]\n{evidence_context}")],
    }
