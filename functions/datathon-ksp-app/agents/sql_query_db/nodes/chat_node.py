from langchain_core.messages import AIMessage
from agents.sql_query_db.state import SQLAgentState

def chat_node(state: SQLAgentState):

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