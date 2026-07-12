import json

from langchain_core.messages import AIMessage, HumanMessage

from llm.groq_service import groq_service
from agents.sql_query_db.state import SQLAgentState


def response_node(state: SQLAgentState):
    """
    Generates a natural language response and suggested follow-up questions.
    """

    markdown_guidance = """
Write the answer in markdown.

Use this structure when it fits the data:

A clear, direct summary of the answer in 1-2 sentences.

## Key findings

- Call out the most important values, comparisons, or trends.
- Use bold text for the most important numbers or categories.
- If there are multiple rows, compare the top entries instead of listing them flatly.

## Interpretation

Explain what the numbers suggest in plain language.

Keep the tone concise but more detailed than a one-line answer.
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
Conversation

{conversation}

SQL Query

{state['sql_query']}

Error

{state['error']}

{markdown_guidance}

Return ONLY valid JSON.

{{
    "answer": "...",
    "follow_up_questions": []
}}
"""

    else:

        prompt = f"""
Conversation

{conversation}

SQL Query

{state['sql_query']}

Query Result

{state['sql_result']}

Answer the user's latest question.

{markdown_guidance}

Then suggest 4 useful follow-up questions that naturally continue the analysis.

Rules:
- Follow-up questions should be specific to the returned data.
- They should help the user explore the data further.
- Return ONLY valid JSON.

Example:

{{
    "answer": "There are **125 employees** in Bangalore.\n\n## Key findings\n\n- Bangalore has the highest count in the result set.\n- The distribution suggests a strong concentration in one location.\n\n## Interpretation\n\nThis likely indicates that Bangalore is the main center for the dataset being queried.",
    "follow_up_questions": [
        "How many are female?",
        "Which department has the most employees?",
        "What is the average salary?",
        "How many joined this year?"
    ]
}}
"""
    try:
        response = groq_service.generate(
            system_prompt="You are a helpful data analyst.",
            user_prompt=prompt,
        )
    except Exception as e:
        print("Error during GroqService.generate:", str(e))
        raise

    response = json.loads(response)

    return {
        "response": response["answer"],
        "follow_up_questions": response.get("follow_up_questions", []),
        "messages": [
            AIMessage(content=response["answer"])
        ],
    }