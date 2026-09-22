from langchain_core.messages import AIMessage

from agents.sql_query_db.state import SQLAgentState
from llm.catalyst_llm_service import catalyst_llm_service as llm


def _visible_conversation(state: SQLAgentState) -> str:
    """Transcript without the injected grounding blocks (passed separately)."""
    conversation = []
    for m in state.get("messages", []):
        role = "User" if getattr(m, "type", "") == "human" else "Assistant"
        content = str(getattr(m, "content", ""))
        if content.startswith("[Legal Codebook]") or content.startswith(
            "[Evidence attached]"
        ) or content.startswith("[Scene Context]"):
            continue
        conversation.append(f"{role}: {content}")
    return "\n".join(conversation)


def _deterministic_fallback(state: SQLAgentState) -> str:
    """No-LLM template covering legal and/or scene grounding."""
    lines = []
    legal_refs: list = state.get("legal_references") or []
    if legal_refs:
        lines += ["## Legal Reference", ""]
        for r in legal_refs:
            if r.get("source") == "codebook-missing":
                lines.append(
                    f"- **{r['act']} Section {r['section']}** — not in the local "
                    f"codebook. Verify via [Indian Kanoon]({r.get('kanoon_url', '')})."
                )
                continue
            bail = "Bailable" if r.get("bailable") else "Non-bailable"
            cog = "Cognizable" if r.get("cognizable") else "Non-cognizable"
            equiv = ""
            if r.get("bns_equivalent"):
                equiv = f" (BNS equivalent: {r['bns_equivalent']})"
            elif r.get("ipc_equivalent"):
                equiv = f" (IPC equivalent: {r['ipc_equivalent']})"
            lines.append(f"### {r['act']} Section {r['section']}{equiv} — {r['title']}")
            lines.append("")
            lines.append(str(r.get("plain_language", "")))
            lines.append("")
            lines.append(f"- **Punishment:** {r.get('punishment', '—')}")
            lines.append(f"- **Bailability:** {bail} · **Cognizability:** {cog}")
            lines.append("")
    scene_cards: dict = state.get("scene_cards") or {}
    if scene_cards and scene_cards.get("pin"):
        from services.scene_service import build_scene_context

        lines += ["## Scene Intel", ""]
        lines.append(build_scene_context(scene_cards))
        lines.append("")
    return "\n".join(lines).strip()


def chat_node(state: SQLAgentState):
    # Grounded answers — the codebook and/or scene workup answer the turn
    # without a crime-database query.
    legal_refs: list = state.get("legal_references") or []
    legal_context: str = state.get("legal_context") or ""
    scene_cards: dict = state.get("scene_cards") or {}
    scene_context: str = state.get("scene_context") or ""

    if legal_refs or legal_context or scene_cards or scene_context:
        system_prompt = """You are an investigative analyst for Karnataka State Police (KSP).

Answer the user's question using ONLY the grounded references supplied
below (Legal Codebook and/or Scene Intel radius workup). For legal
sections state: Act + section + title, plain-language meaning, punishment
range, and bailability/cognizability, with IPC↔BNS equivalents where
given. For scene questions state the exact nearby counts: FIRs by type,
covering stations, repeat offenders, POIs.

Rules:
- Cite the exact reference values — never invent punishment, bailability,
  or nearby counts.
- If a legal reference is marked NOT in the local codebook, answer from
  statute knowledge but explicitly flag it as needing verification via
  IndiaCode / Indian Kanoon, with the link provided.
- If the scene pin was enabled but no workup is supplied (no pin dropped),
  do NOT invent nearby counts — ask the user to drop the pin on the map.
- Keep it concise (150-250 words), valid GitHub Markdown, no follow-up
  questions section (those are generated separately).
- Never add file links or an "Evidence Referenced" section."""

        evidence_context = state.get("evidence_context") or ""
        evidence_block = f"\nUploaded Evidence:\n{evidence_context}\n" if evidence_context else ""
        legal_block = f"\nLegal Codebook:\n{legal_context}\n" if legal_context else ""
        scene_block = f"\nScene Intel:\n{scene_context}\n" if scene_context else ""

        try:
            answer = llm.generate(
                system_prompt=system_prompt,
                user_prompt=(
                    f"Conversation:\n{_visible_conversation(state)}\n"
                    f"{evidence_block}{legal_block}{scene_block}\n"
                    "Answer the latest user question now."
                ),
            ).strip()
            if not answer:
                raise ValueError("empty grounded answer")
            return {
                "messages": [AIMessage(content=answer)],
                "follow_up_questions": [],
                "response": answer,
            }
        except Exception as e:
            print("Error during grounded chat generation:", e)
            # Fall through to the deterministic template below.

        fallback = _deterministic_fallback(state)
        if not fallback:
            fallback = (
                "I couldn't ground this question in the available references. "
                "Please try again."
            )
        return {
            "messages": [AIMessage(content=fallback)],
            "follow_up_questions": [],
            "response": fallback,
        }

    response = "I'm sorry, I can only help with questions related to KSP Crime data. How can I assist you with that?"

    # Even for non-crime-data turns, acknowledge FileStore-backed evidence.
    # No file list/links here — the files are shown on the user bubble and
    # in the analysis workspace.
    evidence_files: list = state.get("evidence_files") or []
    if evidence_files:
        response = (
            "I can only analyse KSP crime data, so tell me what "
            "you'd like me to cross-reference against the crime database "
            "(e.g. matching FIRs, sections, stations, or time windows)."
        )

    return {
        "messages": [
            AIMessage(content=response)
        ],
        "follow_up_questions": [],
        "response": response
    }
