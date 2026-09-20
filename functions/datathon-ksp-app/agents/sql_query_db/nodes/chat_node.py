from langchain_core.messages import AIMessage

from agents.sql_query_db.state import SQLAgentState
from llm.catalyst_llm_service import catalyst_llm_service as llm


def chat_node(state: SQLAgentState):
    # Legal Reference answers — the codebook block grounds the response.
    # No crime-database query is needed for pure section lookups.
    legal_refs: list = state.get("legal_references") or []
    legal_context: str = state.get("legal_context") or ""
    if legal_refs or legal_context:
        system_prompt = """You are a Legal Reference assistant for Karnataka State Police (KSP) investigators.

Answer the user's section-lookup question using ONLY the Legal Codebook
references supplied below. For each section state: Act + section + title,
plain-language meaning, punishment range, and bailability/cognizability.
Mention IPC↔BNS equivalents where given.

Rules:
- Cite the exact codebook values — never invent punishment or bailability.
- If a reference is marked NOT in the local codebook, answer from statute
- knowledge but explicitly flag it as needing verification via IndiaCode /
- Indian Kanoon, with the link provided.
- Keep it concise (150-250 words), valid GitHub Markdown, no follow-up
- questions section (those are generated separately).
- Never add file links or an "Evidence Referenced" section."""

        conversation = []
        for m in state.get("messages", []):
            role = "User" if getattr(m, "type", "") == "human" else "Assistant"
            # Skip the injected grounding blocks in the visible transcript —
            # they are passed separately as the codebook context.
            content = str(getattr(m, "content", ""))
            if content.startswith("[Legal Codebook]") or content.startswith("[Evidence attached]"):
                continue
            conversation.append(f"{role}: {content}")
        conversation_str = "\n".join(conversation)
        evidence_context = state.get("evidence_context") or ""
        evidence_block = f"\nUploaded Evidence:\n{evidence_context}\n" if evidence_context else ""

        try:
            answer = llm.generate(
                system_prompt=system_prompt,
                user_prompt=(
                    f"Conversation:\n{conversation_str}\n"
                    f"{evidence_block}\nLegal Codebook:\n{legal_context}\n\n"
                    "Answer the latest user question now."
                ),
            ).strip()
            if not answer:
                raise ValueError("empty legal answer")
            return {
                "messages": [AIMessage(content=answer)],
                "follow_up_questions": [],
                "response": answer,
            }
        except Exception as e:
            print("Error during legal chat generation:", e)
            # Fall through to the deterministic template below.

        # Deterministic fallback — no LLM needed for in-codebook sections.
        lines = ["## Legal Reference", ""]
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
        fallback = "\n".join(lines).strip()
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
