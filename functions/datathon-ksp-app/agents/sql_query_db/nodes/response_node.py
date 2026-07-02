from langchain_core.messages import AIMessage, HumanMessage

from llm.groq_service import groq_service
from sql_query_db.state import SQLAgentState


def response_node(state: SQLAgentState):
    """
    Generates a natural language response from the SQL result.
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

The SQL query failed.

SQL

{state['sql_query']}

Error

{state['error']}

Explain the error to the user in a concise and helpful manner.
Do not mention internal implementation details.
"""

    else:
        prompt = f"""
Conversation

{conversation}

SQL Query

{state['sql_query']}

Query Result

{state['sql_result']}

Answer ONLY the user's latest question.

Rules:
- Be concise.
- Use the SQL result only.
- If the result is empty, clearly say that no matching records were found.
- Do not mention SQL unless the user explicitly asks.
"""

    answer = groq_service.generate(
        system_message="You are a helpful data assistant.",
        human_message=prompt,
    )

    return {
        "response": answer,
        "messages": [
            AIMessage(content=answer)
        ],
    }