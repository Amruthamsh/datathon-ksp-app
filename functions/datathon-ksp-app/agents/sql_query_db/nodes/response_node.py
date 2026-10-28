import json
import re

from pydantic import BaseModel, Field, ValidationError
from langchain_core.messages import AIMessage, HumanMessage

from llm.catalyst_llm_service import catalyst_llm_service as llm
from agents.sql_query_db.state import SQLAgentState


class AnalysisResponse(BaseModel):
    answer: str = Field(
        description="Detailed analysis in Markdown. Must NOT contain follow-up questions."
    )
    follow_up_questions: list[str] = Field(
        description="Exactly 3 follow-up questions."
    )


def _extract_questions(answer: str):
    """
    If the LLM mistakenly includes a Follow-up Questions section inside
    the markdown answer, extract it and remove it from the answer.
    """

    pattern = re.compile(
        r"##\s*Follow[- ]?up Questions\s*(.*)",
        re.IGNORECASE | re.DOTALL,
    )

    match = pattern.search(answer)

    if not match:
        return answer.strip(), []

    section = match.group(1)

    questions = []

    for line in section.splitlines():
        line = line.strip()

        if not line:
            continue

        line = re.sub(r"^[-*]\s*", "", line)
        line = re.sub(r"^\d+\.\s*", "", line)

        if line:
            questions.append(line)

    cleaned_answer = answer[: match.start()].rstrip()

    return cleaned_answer, questions[:3]


def _parse_analysis_response(raw: str) -> tuple[str, list[str]]:
    """Tolerantly parse the LLM's analysis JSON.

    The model sometimes returns only {"answer": ...} with the follow-up
    questions embedded as a markdown section, wraps the JSON in prose/fences,
    or emits minor JSON flaws. All of those previously raised ValidationError
    and failed the whole turn — recover instead.
    """
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.replace("```json", "").replace("```", "").strip()
    # Tolerate prose around the JSON payload.
    m = re.search(r"\{.*\}", text, flags=re.S)
    candidate = m.group(0) if m else text
    data = None
    try:
        data = json.loads(candidate)
    except Exception:
        data = None
    if not isinstance(data, dict):
        # Last resort: treat the whole output as the answer body and mine it
        # for an embedded questions section.
        answer, questions = _extract_questions(text)
        return answer, questions[:3]
    answer = str(data.get("answer") or "").strip()
    followups = data.get("follow_up_questions") or []
    if isinstance(followups, str):
        followups = [followups]
    followups = [str(q).strip() for q in followups if str(q).strip()]
    # Safety net if model ignored instructions and embedded the questions.
    extracted_answer, extracted_questions = _extract_questions(answer)
    answer = extracted_answer
    if not followups:
        followups = extracted_questions
    return answer, followups[:3]


def response_node(state: SQLAgentState):
    """
    Generates a detailed markdown analysis together with follow-up questions.
    """

    system_prompt = """
You are a senior Crime Intelligence Analyst for the Karnataka State Police (KSP).

Analyze the provided crime data and produce a concise, evidence-based intelligence summary for investigators.

Return ONLY valid JSON in this format:

{
  "answer": "markdown",
  "follow_up_questions": [
    "...",
    "...",
    "..."
  ]
}

Rules:

- Return only valid JSON. Do not wrap it in markdown fences.
- "answer" must contain ONLY the analysis.
- Never include follow-up questions inside "answer".
- "follow_up_questions" must contain exactly 3 specific, actionable questions.
- Do not mention SQL, database tables, queries, or column names.

The "answer" must be valid GitHub Markdown and follow this structure:

## Executive Summary

A brief (2-3 sentence) overview that directly answers the user's question.

## Key Findings

- 3-5 bullet points highlighting the most important facts.
- Emphasize key numbers using **bold**.
- Compare leading values where meaningful.
- Mention notable outliers or concentrations.

## Analysis

Summarize any important temporal, geographic, demographic, offence-type, or behavioural patterns supported by the data.

## Operational Insights

Explain what the findings imply for investigators or police operations. Suggest priorities or areas requiring attention, but avoid unsupported speculation.

Guidelines:

- Keep the response concise (roughly 200-350 words).
- Use short paragraphs and bullet points.
- Only discuss patterns supported by the data.
- If the dataset is too small for reliable conclusions, clearly state that.
- Avoid repeating statistics.
- Write like a police intelligence analyst, not a chatbot.
- If an "Uploaded Evidence" block with a document Transcription is supplied:
  the user asked about THAT document — it is the primary subject.
  Open the answer with a "## Document Summary" section: document type,
  then the concrete fields/entities read from it (FIR/complaint numbers,
  police station, district, dates, sections, names, vehicles, phones —
  only values actually present in the transcription, never invented).
  Then cross-reference those entities against the database results
  (confirm / contradict / supplement with specific values from both).
  If the database results are generic and unrelated to the document,
  say so plainly in one line instead of presenting them as document
  insights. Mention filenames inline when referring to the document.
  Never add an "Evidence Referenced" section or file links — the files are
  shown in the analysis workspace.

Generate exactly three follow-up questions that:
- build naturally on the current findings,
- reference entities from the analysis when possible,
- encourage deeper investigation,
- are specific and actionable.
"""

    conversation = []

    for message in state["messages"]:
        if isinstance(message, HumanMessage):
            role = "User"
        elif isinstance(message, AIMessage):
            role = "Assistant"
        else:
            role = "System"

        conversation.append(f"{role}: {message.content}")

    conversation_str = "\n".join(conversation)

    if state.get("error"):

        prompt = f"""
Conversation:

{conversation_str}

Attempted SQL Query:

{state['sql_query']}

Database Error:

{state['error']}

Explain:

1. What went wrong.
2. Why it happened.
3. How the user can rephrase the question.

Return valid JSON only.
"""

    else:

        result_preview = json.dumps(
            state["sql_result"][:100],
            indent=2,
            default=str,
        )

        row_count = len(state["sql_result"])

        evidence_context = state.get("evidence_context") or ""
        evidence_block = (
            f"\nUploaded Evidence (FileStore-backed; the user can see the files "
            f"in the analysis workspace, so never add an 'Evidence Referenced' "
            f"section or file links — just mention filenames inline where "
            f"relevant):\n{evidence_context}\n"
            if evidence_context
            else ""
        )

        legal_context = state.get("legal_context") or ""
        legal_block = (
            f"\nLegal Codebook references for this turn (the investigator can "
            f"see these cards in the analysis workspace — cite their exact "
            f"punishment/bailability values inline, never invent them; do NOT "
            f"add reference links, they are shown in the workspace):\n{legal_context}\n"
            if legal_context
            else ""
        )

        scene_context = state.get("scene_context") or ""
        scene_block = (
            f"\nScene Intel radius workup for this turn (the investigator can "
            f"see these cards in the analysis workspace — cite the exact "
            f"nearby counts inline, never invent them; do NOT add links):\n{scene_context}\n"
            if scene_context
            else ""
        )

        prompt = f"""
Conversation:

{conversation_str}
{evidence_block}
{legal_block}
{scene_block}
SQL Query:

{state['sql_query']}

Returned Rows:

{row_count}

Result Preview:

{result_preview}

Generate:

1. A detailed markdown analysis.
2. Three actionable follow-up questions.

Remember:

- Follow-up questions belong ONLY inside follow_up_questions.
- Do NOT include them inside answer.
- When uploaded evidence is present: cross-reference the crime-database
  findings with the evidence excerpts, mentioning filenames inline where
  relevant.
- When Legal Codebook references are supplied: cite their exact
  punishment/bailability values for the sections asked about (one short
  inline line per section, e.g. "IPC 302 carries ... and is non-bailable").
- When a Scene Intel workup is supplied: ground area-specific claims in its
  exact counts (FIRs by type, repeat offenders, POIs). If the scene pin was
  enabled but no workup is present (no pin dropped), ask the user to drop
  the pin instead of inventing nearby counts.

Return valid JSON only.
"""

    label = state.get("scope_label")
    if label and (state.get("scope") or {}).get("level") != "all":
        prompt += (
            f"\nJurisdiction: these results cover only {label}, the officer's "
            "jurisdiction (enforced on the query). State this in the Executive "
            "Summary. If the question was about another district or station, "
            "explain that it is outside the officer's jurisdiction instead of "
            "reporting zero crime there.\n"
        )

    try:
        response = llm.generate(
            system_prompt=system_prompt,
            user_prompt=prompt,
        )

        answer, followups = _parse_analysis_response(response)
        if not answer:
            # Parser found nothing usable — preserve the raw model output
            # rather than failing the turn.
            answer = (response or "").strip()

        return {
            "response": answer,
            "follow_up_questions": followups,
            "messages": [
                AIMessage(content=answer)
            ],
        }

    except Exception as e:
        # Never fail the turn: surface whatever we can plus the error.
        print("Error during response generation:")
        print(e)
        fallback = ""
        try:
            fallback = str(response).strip()  # type: ignore[name-defined]
        except Exception:
            fallback = ""
        if not fallback:
            fallback = (
                "I encountered an error while processing your request. "
                "Please try again."
            )
        return {
            "response": fallback,
            "follow_up_questions": [],
            "error": f"Response formatting failed: {e}",
            "messages": [AIMessage(content=fallback)] if fallback else [],
        }