"""Response localization node.

Translates English analysis responses, follow-up questions,
and chart metadata to Kannada when the user's language is 'kn'.
"""

import logging
from langchain_core.messages import AIMessage

from agents.sql_query_db.state import SQLAgentState
from services.translation_service import (
    build_translation_prompt,
    translate_chart_terms_en_to_kn,
)
from llm.llm_service import LLMService

logger = logging.getLogger("fastapi_function")


def _get_llm() -> LLMService:
    """Lazy import to avoid circular dependency."""
    from llm.catalyst_llm_service import catalyst_llm_service
    return catalyst_llm_service


def translate_response_node(state: SQLAgentState) -> dict:
    """Translate response, follow-ups, and charts to Kannada if needed."""
    language = state.get("language", "en")

    if language == "en":
        return {}

    llm = _get_llm()
    updates: dict = {}

    response = state.get("response", "")
    follow_ups = state.get("follow_up_questions", [])

    # Combine response + follow-ups into a single translation call
    # to avoid truncation from multiple LLM calls
    if response:
        try:
            combined = response
            if follow_ups:
                combined += "\n\n---FOLLOW_UPS---\n" + "\n".join(
                    f"- {q}" for q in follow_ups
                )

            system_prompt, user_prompt = build_translation_prompt(
                combined, "en_to_kn", "kn"
            )
            # Add instruction to handle the separator
            system_prompt += (
                "\n\nIMPORTANT: The text contains a separator '---FOLLOW_UPS---' "
                "followed by follow-up questions. Translate everything, keeping "
                "the separator line intact on its own line."
            )
            translated = llm.generate(
                user_prompt=user_prompt, system_prompt=system_prompt
            )

            # Split back into response and follow-ups
            if "---FOLLOW_UPS---" in translated:
                parts = translated.split("---FOLLOW_UPS---")
                translated_response = parts[0].strip()
                follow_ups_text = parts[1].strip()
                translated_lines = [
                    line.lstrip("- ").strip()
                    for line in follow_ups_text.split("\n")
                    if line.strip().startswith("-")
                ]
                if len(translated_lines) == len(follow_ups):
                    updates["follow_up_questions"] = translated_lines
            else:
                translated_response = translated.strip()

            updates["response"] = translated_response
        except Exception as e:
            logger.warning(f"Translation failed, keeping English response: {e}")
            # Fall through — English response stays in state

    # Translate chart titles (lightweight dict lookup, no LLM)
    charts = state.get("charts", [])
    if charts:
        updates["charts"] = translate_chart_terms_en_to_kn(charts)

    # Update the last AI message in state
    if "response" in updates:
        messages = list(state.get("messages", []))
        if messages and isinstance(messages[-1], AIMessage):
            messages[-1] = AIMessage(content=updates["response"])
            updates["messages"] = messages

    return updates
