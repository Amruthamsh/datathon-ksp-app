import json

from llm.catalyst_llm_service import catalyst_llm_service as llm
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

Evidence rule: if the conversation contains an "[Evidence attached]" block
for THIS turn and the latest user message refers to the attachment
("analyze/summarize/extract/read this", "this document/image/proforma/file",
"matching FIRs", or any substantive non-greeting request), the document must
be analyzed against the crime database — return {"intent":"sql"}.
Only a pure greeting with no task (e.g. just "hi" + file) is "chat".
"""

    response = llm.generate(
        system_prompt=system_prompt,
        user_prompt=conversation,
    )

    response = response.strip()
    if response.startswith("```"):
        response = response.replace("```json", "").replace("```", "").strip()

    intent = json.loads(response)["intent"]

    return {
        "intent": intent
    }