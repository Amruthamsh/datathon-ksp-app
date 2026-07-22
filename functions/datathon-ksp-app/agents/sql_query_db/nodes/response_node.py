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

        prompt = f"""
Conversation:

{conversation_str}

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

Return valid JSON only.
"""

    try:

        response = llm.generate(
            system_prompt=system_prompt,
            user_prompt=prompt,
        )

        response = response.strip()

        if response.startswith("```"):
            response = (
                response.replace("```json", "")
                .replace("```", "")
                .strip()
            )

        parsed = AnalysisResponse.model_validate_json(response)

        answer = parsed.answer.strip()
        followups = parsed.follow_up_questions

        # Safety net if model ignored instructions
        extracted_answer, extracted_questions = _extract_questions(answer)

        answer = extracted_answer

        if not followups:
            followups = extracted_questions

        if len(followups) > 3:
            followups = followups[:3]

        return {
            "response": answer,
            "follow_up_questions": followups,
            "messages": [
                AIMessage(content=answer)
            ],
        }

    except ValidationError as e:
        print("Failed to validate structured output:")
        print(e)
        print(response)
        raise

    except Exception as e:
        print("Error during response generation:")
        print(e)
        raise