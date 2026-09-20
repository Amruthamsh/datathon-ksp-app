"""Legal Reference node — runs after evidence ingestion, before the router.

Deterministic behaviour (no LLM call, keeps cold-start light):

- If the turn carries ``use_codebook`` OR the query looks like a
  section-lookup question (punishment / bailability / "IPC 302" ...),
  extract ACT+section pairs and resolve them against the local codebook
  (``services.legal_reference_service``).
- Emits ``legal_references`` (structured cards for the analysis workspace)
  and ``legal_context`` (compact citable block for downstream LLM prompts).
- Appends a ``[Legal Codebook]`` HumanMessage so router / planner /
  response / chat nodes see the grounding without prompt changes.
- Pure legal questions (no crime-DB need) are still answered by the
  ``chat`` branch — chat_node reads ``legal_context`` instead of refusing.
"""

from langchain_core.messages import HumanMessage

from agents.sql_query_db.state import SQLAgentState
from services.legal_reference_service import (
    build_legal_context,
    find_legal_references,
    is_legal_query,
)


def legal_reference_node(state: SQLAgentState):
    use_codebook = bool(state.get("use_codebook"))
    query = state.get("translated_query") or state.get("original_query") or ""
    # Fall back to the latest human message (translated_query may be empty).
    if not query:
        try:
            for m in reversed(state.get("messages", [])):
                if getattr(m, "type", "") == "human":
                    query = str(getattr(m, "content", ""))
                    break
        except Exception:
            query = ""

    evidence_text = state.get("evidence_context") or ""
    refs: list = []
    if use_codebook or is_legal_query(query) or is_legal_query(evidence_text):
        try:
            refs = find_legal_references(query, evidence_text)
        except Exception:
            refs = []

    if not refs:
        return {"legal_references": [], "legal_context": ""}

    context = build_legal_context(refs)
    return {
        "legal_references": refs,
        "legal_context": context,
        "messages": [HumanMessage(content=f"[Legal Codebook]\n{context}")],
    }
