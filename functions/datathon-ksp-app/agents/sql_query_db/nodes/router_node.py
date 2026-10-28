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

Legal rule: if the conversation contains a "[Legal Codebook]" block and the
latest user message asks a section-lookup question (section meaning,
punishment range, bailability, cognizability, IPC/BNS/NDPS/POCSO/Arms/IT
section — e.g. "What is IPC 302 punishment?"), return {"intent":"chat"}:
the codebook references already ground the answer and no crime-database
query is needed. If the same turn ALSO asks for crime statistics, trends,
or FIR counts, return {"intent":"sql"} so the database is queried and the
legal references enrich that analysis.

Scene rule: if the conversation contains a "[Scene Context]" block with a
radius workup (FIR counts, repeat offenders, POIs around a dropped pin)
and the latest user message asks about THAT area ("around here", "nearby",
"this area", "is this area safe", "what happened near the pin"), return
{"intent":"chat"}: the scene workup already grounds the answer. If the
same turn ALSO asks for district-wide statistics, trends over time, or
comparisons beyond the pin radius, return {"intent":"sql"}.
"""

    response = llm.generate(
        system_prompt=system_prompt,
        user_prompt=conversation,
    )

    response = response.strip()
    if response.startswith("```"):
        response = response.replace("```json", "").replace("```", "").strip()

    try:
        intent = json.loads(response)["intent"]
    except (ValueError, KeyError, TypeError):
        # A malformed classifier reply must not crash the turn; the database
        # path is the safe default (routing.py still catches greetings).
        print("Router returned unparseable intent, defaulting to sql:", response[:200])
        intent = "sql"
    if intent not in ("sql", "chat"):
        intent = "sql"

    return {
        "intent": intent
    }