import json

from langchain_core.messages import AIMessage, HumanMessage

from llm.catalyst_llm_service import catalyst_llm_service as llm
from agents.sql_query_db.state import SQLAgentState


def response_node(state: SQLAgentState):
    """
    Generates a deep natural language analysis and suggested follow-up questions.
    """

    markdown_guidance = """
Write a thorough analytical response in markdown. Structure it as follows:

**Opening statement** — one or two sentences directly answering the question with the headline number or finding.

## Key Findings

- Lead with the most significant value, pattern, or outlier — make it bold.
- Compare the top entries: what is the gap between #1 and #2? Is it large or negligible?
- Call out any surprising, unexpected, or counterintuitive data points.
- Note any category that is disproportionately high or low relative to others.
- If percentages or ratios are present, highlight what they reveal.

## Trend & Pattern Analysis

Describe any patterns visible in the data:
- Temporal patterns (peak hours, months, days of week)
- Geographic concentration (which districts, stations dominate)
- Demographic patterns (age, gender, religion distributions)
- Correlation hints (do two variables move together?)

## Interpretation & Implications

Explain what the data suggests in plain language:
- What might be driving the numbers?
- Are there any actionable insights for law enforcement?
- What caveats should the reader keep in mind (e.g., population differences, reporting bias)?

Keep the tone analytical and concise. Avoid restating the question. Use **bold** for key numbers and category names.
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

    conversation = "\n".join(conversation)

    if state.get("error"):

        prompt = f"""
You are a data analyst working with Karnataka State Police crime data.

Conversation

{conversation}

SQL Query that was attempted

{state['sql_query']}

Error returned

{state['error']}

Explain what went wrong in simple terms and suggest how the user could rephrase their question.

Return ONLY valid JSON:

{{
    "answer": "...",
    "follow_up_questions": []
}}
"""

    else:

        result_preview = json.dumps(state['sql_result'][:100], indent=2)
        row_count = len(state['sql_result'])

        prompt = f"""
You are a senior data analyst working with Karnataka State Police (KSP) crime data.

Conversation

{conversation}

SQL Query

{state['sql_query']}

Query Result ({row_count} rows total, showing up to 100)

{result_preview}

Answer the user's latest question with depth and precision.

{markdown_guidance}

Then suggest 2-3 high-value follow-up questions that would help the user explore the data further.
Follow-up questions should be specific (reference actual categories, districts, or values from the result),
actionable for a crime analyst, and diverse (don't ask the same type of question twice).

Return ONLY valid JSON:

{{
    "answer": "...",
    "follow_up_questions": [
        "...",
        "...",
    ]
}}
"""

    try:
        response = llm.generate(
            system_prompt="You are a senior data analyst specialising in law enforcement data. Always respond with valid JSON only.",
            user_prompt=prompt,
        )
    except Exception as e:
        print("Error during LLM.generate (response):", str(e))
        raise

    response = response.strip()
    if response.startswith("```"):
        response = response.replace("```json", "").replace("```", "").strip()

    response = json.loads(response)

    return {
        "response": response["answer"],
        "follow_up_questions": response.get("follow_up_questions", []),
        "messages": [
            AIMessage(content=response["answer"])
        ],
    }
