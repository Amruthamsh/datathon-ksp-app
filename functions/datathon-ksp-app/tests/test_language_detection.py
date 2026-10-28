"""Language detection unit tests (offline, no LLM).

Covers services/language_detection.detect_language, the >=30% Kannada
threshold used by the LangGraph language_detection node.
"""
from services.language_detection import detect_language
from agents.sql_query_db.nodes.language_detection_node import (
    language_detection_node,
)
from langchain_core.messages import HumanMessage


def test_empty_and_blank_default_to_english():
    assert detect_language("") == "en"
    assert detect_language("   ") == "en"
    assert detect_language(None) == "en"


def test_pure_english_queries():
    assert detect_language("How many murder cases in 2024?") == "en"
    assert detect_language("Show top 10 districts by theft") == "en"


def test_pure_kannada_queries():
    assert detect_language("2024 ರಲ್ಲಿ ಕೊಲೆ ಪ್ರಕರಣಗಳು ಎಷ್ಟು?") == "kn"
    assert detect_language("ಬೆಂಗಳೂರು ನಗರದಲ್ಲಿ ಕಳ್ಳತನ ಪ್ರಕರಣಗಳು ತೋರಿಸಿ") == "kn"


def test_threshold_is_30_percent():
    # 1 Kannada char out of ~10 alpha chars (~10%) -> english
    assert detect_language("Show ಕೊಲೆ cases in Mysuru district") == "en"
    # Majority Kannada script -> kannada
    assert detect_language("ಬೆಂಗಳೂರು ನಗರದಲ್ಲಿ murder cases ಎಷ್ಟು show ಮಾಡಿ") == "kn"


def test_numbers_and_punctuation_ignored():
    assert detect_language("12345 !!! ???") == "en"
    assert detect_language("2024-01-01 ... 99") == "en"


def test_node_wraps_detection_and_preserves_query():
    state = {"messages": [HumanMessage(content="ಬೆಂಗಳೂರಿನಲ್ಲಿ ಕಳ್ಳತನ ಎಷ್ಟು?")]}
    out = language_detection_node(state)
    assert out["language"] == "kn"
    assert out["original_query"] == "ಬೆಂಗಳೂರಿನಲ್ಲಿ ಕಳ್ಳತನ ಎಷ್ಟು?"
    # Kannada path clears translated_query for the translate node to fill
    assert out["translated_query"] == ""

    state_en = {"messages": [HumanMessage(content="How many thefts?")]}
    out_en = language_detection_node(state_en)
    assert out_en["language"] == "en"
    assert out_en["translated_query"] == "How many thefts?"


def test_node_handles_empty_history():
    out = language_detection_node({"messages": []})
    assert out["language"] == "en"
    assert out["original_query"] == ""
