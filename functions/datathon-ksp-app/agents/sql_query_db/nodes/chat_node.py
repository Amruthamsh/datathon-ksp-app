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

    # Ungrounded small talk / capability questions: answer conversationally
    # and steer back to what CrimeLens can do — never a flat refusal.
    evidence_files: list = state.get("evidence_files") or []
    try:
        response = llm.generate(
            system_prompt=CAPABILITY_PROMPT,
            user_prompt=(
                f"Conversation:\n{_visible_conversation(state)}\n"
                + ("\n(The officer attached evidence files this turn.)\n" if evidence_files else "")
                + "\nReply to the latest message now."
            ),
        ).strip()
        if not response:
            raise ValueError("empty chat reply")
    except Exception as e:
        print("Error during conversational reply:", e)
        response = CAPABILITY_FALLBACK

    return {
        "messages": [
            AIMessage(content=response)
        ],
        "follow_up_questions": list(CAPABILITY_FOLLOW_UPS),
        "response": response
    }


CAPABILITY_PROMPT = """You are KSP CrimeLens, the crime-intelligence assistant of the
Karnataka State Police. Reply briefly (under 120 words, GitHub Markdown) to
greetings, thanks, or questions about what you can do. If the message is
unrelated to policing, say politely in one sentence that you focus on KSP
crime intelligence, then offer 2-3 concrete things to ask. Never claim to
have run a query.

What you can do (mention only what is relevant):
- Answer questions over ~50,000 KSP FIRs: trends, hotspots, districts,
  stations, crime types, accused, victims, arrests, chargesheets, BNSS
  deadlines — always showing the SQL and an audit trail.
- Evidence Desk: read attached FIRs, panchnamas, CDRs, PM reports.
- Legal Reference: IPC/BNS/NDPS/POCSO/IT Act sections — punishment,
  bailability, cognizability.
- Location Query: drop a pin for crime history, repeat offenders and
  nearby POIs within 10 km.
- Works in English and Kannada, by text or voice; conversations export
  to PDF."""

CAPABILITY_FALLBACK = (
    "I'm KSP CrimeLens. I can analyse ~50,000 KSP FIRs — trends, hotspots, "
    "accused networks and BNSS deadlines — read attached evidence, look up "
    "IPC/BNS sections, and profile any location within 10 km. Every answer "
    "shows the SQL it ran. Try one of the questions below."
)

CAPABILITY_FOLLOW_UPS = (
    "Which 5 districts recorded the most FIRs in the last 90 days?",
    "How many heinous cases are past the BNSS 90-day chargesheet deadline?",
    "Show the monthly trend of robbery cases across Karnataka this year",
)
