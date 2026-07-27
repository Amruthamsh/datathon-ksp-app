"""Language detection node.

Detects whether the user's query is in Kannada or English
and stores the result in state.
"""

from services.language_detection import detect_language
from agents.sql_query_db.state import SQLAgentState


def language_detection_node(state: SQLAgentState) -> dict:
    """Detect the language of the user's latest query."""
    messages = state.get("messages", [])
    if not messages:
        return {"language": "en", "original_query": "", "translated_query": ""}

    last_message = messages[-1]
    query = last_message.content if hasattr(last_message, "content") else str(last_message)

    lang = detect_language(query)

    return {
        "language": lang,
        "original_query": query,
        "translated_query": query if lang == "en" else "",
    }
