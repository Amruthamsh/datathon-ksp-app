"""Router / planner contract tests with the LLM stubbed out.

The router_node calls llm.generate(); we monkeypatch it so these tests
verify prompt-contract handling (markdown fences, JSON parsing, routing
table) without spending QuickML calls.
"""
import json

from langchain_core.messages import HumanMessage

import agents.sql_query_db.nodes.router_node as router_mod
from agents.sql_query_db.functions.routing import route_after_router


def _state(text: str):
    return {"messages": [HumanMessage(content=text)]}


def test_router_parses_bare_json(monkeypatch):
    monkeypatch.setattr(
        router_mod.llm, "generate", lambda **kw: '{"intent": "sql"}'
    )
    assert router_mod.router_node(_state("How many thefts?")) == {"intent": "sql"}


def test_router_strips_markdown_fence(monkeypatch):
    monkeypatch.setattr(
        router_mod.llm,
        "generate",
        lambda **kw: '```json\n{"intent": "chat"}\n```',
    )
    assert router_mod.router_node(_state("Hello!")) == {"intent": "chat"}


def test_route_after_router_table():
    assert route_after_router({"intent": "sql"}) == "planner"
    assert route_after_router({"intent": "chat"}) == "chat"


def test_router_prompt_contains_evidence_legal_scene_rules():
    """Regression guard: the special routing rules must stay in the prompt."""
    import inspect

    src = inspect.getsource(router_mod.router_node)
    for keyword in ("Evidence", "Legal", "Scene"):
        assert keyword in src, f"router prompt lost the {keyword} rule"


# ── Safety net: crime questions mislabelled "chat" must reach the DB ──
import pytest  # noqa: E402

from agents.sql_query_db.functions.routing import route_after_router  # noqa: E402


@pytest.mark.parametrize("query,expected", [
    ("ಕಲಬುರಗಿ ಜಿಲ್ಲೆಯಲ್ಲಿ ಗೃಹ ಹಿಂಸೆ ಪ್ರಕರಣಗಳು ತಿಂಗಳುವಾರು ಎಷ್ಟು?", "planner"),
    ("Robbery cases in Mysuru", "planner"),
    ("Show me pending cases in Tumakuru", "planner"),
    ("hi", "chat"),
    ("what can you do?", "chat"),
    ("What's the weather in Paris?", "chat"),
])
def test_chat_intent_safety_net(query, expected):
    state = {"intent": "chat", "original_query": query, "translated_query": ""}
    assert route_after_router(state) == expected
