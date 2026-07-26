"""Query translation node.

Translates Kannada user queries to canonical English before SQL generation.
If the query is already in English, this is a no-op.
"""

from langchain_core.messages import HumanMessage

from agents.sql_query_db.state import SQLAgentState
from services.translation_service import translate_query_kn_to_en
from llm.llm_service import LLMService


def _get_llm() -> LLMService:
    """Lazy import to avoid circular dependency."""
    from llm.catalyst_llm_service import catalyst_llm_service
    return catalyst_llm_service


def translate_query_node(state: SQLAgentState) -> dict:
    """Translate Kannada query to English if language is 'kn'."""
    language = state.get("language", "en")
    original_query = state.get("original_query", "")

    if language == "en" or not original_query:
        return {"translated_query": original_query}

    llm = _get_llm()
    translated = translate_query_kn_to_en(original_query, llm)

    # Replace the last message content with the translated query
    # so downstream nodes see English
    messages = list(state.get("messages", []))
    if messages:
        last_msg = messages[-1]
        messages[-1] = HumanMessage(content=translated)

    return {
        "translated_query": translated,
        "messages": messages,
    }
