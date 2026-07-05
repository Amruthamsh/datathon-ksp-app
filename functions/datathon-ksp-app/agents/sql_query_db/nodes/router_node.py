import json

from llm.groq_service import groq_service
from agents.sql_query_db.state import SQLAgentState


def router_node(state: SQLAgentState):

    conversation = []

    for message in state["messages"]:
        role = (
            "User"
            if message.type == "human"
            else "Assistant"
        )
        conversation.append(f"{role}: {message.content}")

    conversation = "\n".join(conversation)

    system_prompt = """
You are an intent classifier.

Determine whether the latest user message requires querying the Crime Database.

Return ONLY JSON.

Examples

Greeting:
{
    "intent":"chat"
}

Small talk:
{
    "intent":"chat"
}

General conversation:
{
    "intent":"chat"
}

Database question:
{
    "intent":"sql"
}
"""

    response = groq_service.generate(
        system_prompt=system_prompt,
        user_prompt=conversation,
    )

    intent = json.loads(response)["intent"]

    return {
        "intent": intent
    }