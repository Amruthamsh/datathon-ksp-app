"""Golden-dataset evals as pytest — offline, no LLM calls.

Runs the same checks as evals/run_evals.py (language accuracy,
reference-SQL execution, router-prompt regression) inside the normal
`pytest tests/` flow. Use run_evals.py --live for full-graph evals.
"""
import json
import re
import sqlite3
from pathlib import Path

from services.language_detection import detect_language

GOLDEN = json.loads((Path(__file__).parent.parent / "evals" / "golden_nl_sql.json").read_text())


def test_golden_language_detection():
    failures = [
        c["id"] for c in GOLDEN if detect_language(c["query"]) != c["language"]
    ]
    assert not failures, f"language misdetected: {failures}"


def test_golden_reference_sql_executes():
    from db.sqlite.sqlite import SQLITE_DATABASE_PATH

    failures = []
    for c in GOLDEN:
        ref = c.get("reference_sql")
        if not ref:
            continue
        if re.search(r"CaseMaster\s*\.\s*DistrictID", ref, re.I):
            failures.append((c["id"], "forbidden CaseMaster.DistrictID"))
            continue
        if re.search(r"\bFIRDate\b", ref, re.I):
            failures.append((c["id"], "forbidden FIRDate"))
            continue
        missing = [m for m in c.get("must_contain", []) if m not in ref]
        if missing:
            failures.append((c["id"], f"missing tokens {missing}"))
            continue
        con = sqlite3.connect(SQLITE_DATABASE_PATH)
        try:
            con.execute("PRAGMA query_only=1")
            rows = con.execute(ref).fetchall()
            empty = len(rows) == 0 or (
                len(rows) == 1
                and len(rows[0]) == 1
                and isinstance(rows[0][0], (int, float))
                and rows[0][0] == 0
            )
            if empty:
                failures.append((c["id"], "reference SQL returned no rows"))
        except Exception as e:  # noqa: BLE001
            failures.append((c["id"], str(e)[:200]))
        finally:
            con.close()
    assert not failures, f"golden SQL failures: {failures}"


def test_router_prompt_keeps_edge_rules():
    import inspect

    from agents.sql_query_db.nodes import router_node as mod

    src = inspect.getsource(mod.router_node)
    for rule in ("Evidence", "Legal", "Scene"):
        assert rule in src, f"router prompt lost the {rule} rule"
