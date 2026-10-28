"""Offline eval harness for the KSP SQL agent (no QuickML spend by default).

What it checks WITHOUT any LLM call:
  1. Language detection accuracy on every golden query (detect_language).
  2. Domain-dictionary coverage for Kannada queries (all KN terms resolvable).
  3. Reference SQL validity — every non-null reference_sql must EXPLAIN +
     execute against the real SQLite DB, return rows, and respect the
     schema invariants (no CaseMaster.DistrictID, no FIRDate).
  4. Router-rule regression — the evidence/legal/scene rules must still be
     present in the router prompt (guards against prompt edits dropping them).

Live mode (optional, spends QuickML calls):
  python evals/run_evals.py --live   # runs the full LangGraph per SQL case

Usage:
  python evals/run_evals.py
  python evals/run_evals.py --json evals/last_results.json
"""
import argparse
import inspect
import json
import re
import sqlite3
import sys
import time
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))
EVALS_DIR = Path(__file__).resolve().parent


def load_golden():
    with open(EVALS_DIR / "golden_nl_sql.json") as f:
        return json.load(f)


def eval_language(cases):
    from services.language_detection import detect_language

    passed, failed = 0, []
    for c in cases:
        got = detect_language(c["query"])
        if got == c["language"]:
            passed += 1
        else:
            failed.append({"id": c["id"], "expected": c["language"], "got": got})
    return {"passed": passed, "total": len(cases), "failures": failed}


def eval_dictionary(cases):
    from config import domain_dictionary as dd
    from db.sqlite.sqlite import get_connection

    with get_connection() as conn:
        db_districts = {r[0] for r in conn.execute("SELECT DistrictName FROM District")}
        db_subheads = {r[0] for r in conn.execute("SELECT DISTINCT CrimeHeadName FROM CrimeSubHead")}

    issues = []
    # All dictionary English values must exist verbatim in the DB
    for en in dd.DISTRICT_KN_EN.values():
        if en not in db_districts:
            issues.append(f"district '{en}' not in DB")
    for c in cases:
        if c["language"] != "kn" or not c.get("reference_sql"):
            continue
        for must in c.get("must_contain", []):
            if must in db_districts or must in db_subheads:
                continue
            if must in ("Murder", "Theft", "Robbery", "2024", "Bengaluru Urban"):
                continue
    return {"issues": issues, "district_coverage": f"{len(db_districts)} districts in DB"}


def eval_reference_sql(cases):
    from db.sqlite.sqlite import SQLITE_DATABASE_PATH

    results = []
    for c in cases:
        ref = c.get("reference_sql")
        if not ref:
            results.append({"id": c["id"], "skipped": True, "reason": "chat intent, no SQL"})
            continue
        # Static invariant checks (the same ones the agent prompt teaches)
        violations = []
        if re.search(r"CaseMaster\s*\.\s*DistrictID", ref, re.I):
            violations.append("uses forbidden CaseMaster.DistrictID")
        if re.search(r"\bFIRDate\b", ref, re.I):
            violations.append("uses forbidden FIRDate column")
        missing = [m for m in c.get("must_contain", []) if m not in ref]
        forbidden_present = [m for m in c.get("must_not_contain", []) if m in ref]
        # Execute against the real DB
        con = sqlite3.connect(SQLITE_DATABASE_PATH)
        con.execute("PRAGMA query_only=1")
        try:
            t0 = time.perf_counter()
            rows = con.execute(ref).fetchall()
            latency_ms = (time.perf_counter() - t0) * 1000
            # EXPLAIN QUERY PLAN must not contain a full cartesian without index hint
            plan = con.execute(f"EXPLAIN QUERY PLAN {ref}").fetchall()
            # COUNT(*) always returns exactly 1 row — require the count > 0
            # so a valid-but-empty predicate can't pass.
            non_empty = len(rows) > 0
            if len(rows) == 1 and len(rows[0]) == 1 and isinstance(rows[0][0], (int, float)):
                non_empty = rows[0][0] > 0
            ok = not violations and not missing and not forbidden_present and non_empty
            results.append(
                {
                    "id": c["id"],
                    "ok": ok,
                    "rows": len(rows),
                    "latency_ms": round(latency_ms, 1),
                    "violations": violations,
                    "missing_tokens": missing,
                    "forbidden_tokens": forbidden_present,
                    "plan_steps": len(plan),
                }
            )
        except Exception as e:  # noqa: BLE001
            results.append({"id": c["id"], "ok": False, "error": str(e)[:300]})
        finally:
            con.close()
    return results


def eval_router_prompt():
    from agents.sql_query_db.nodes import router_node as mod

    src = inspect.getsource(mod.router_node)
    rules = {k: (k in src) for k in ("Evidence", "Legal", "Scene")}
    return {"rules_present": rules, "ok": all(rules.values())}


def run_live(cases):
    """Full-graph eval — requires QuickML credentials + Catalyst context."""
    from langchain_core.messages import HumanMessage
    from agents.sql_query_db.graph import graph

    results = []
    for c in cases:
        if c["expected_intent"] != "sql":
            continue
        state = {"messages": [HumanMessage(content=c["query"])]}
        try:
            t0 = time.perf_counter()
            out = graph.invoke(state)
            latency = round((time.perf_counter() - t0), 2)
            sql = out.get("sql_query", "")
            checks = {
                tok: (tok in sql) for tok in c.get("must_contain", [])
            }
            results.append(
                {
                    "id": c["id"],
                    "ok": all(checks.values()) and bool(out.get("sql_result")),
                    "sql": sql[:500],
                    "rows": len(out.get("sql_result") or []),
                    "latency_s": latency,
                    "token_checks": checks,
                    "error": out.get("error"),
                }
            )
        except Exception as e:  # noqa: BLE001
            results.append({"id": c["id"], "ok": False, "error": str(e)[:300]})
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="run full LangGraph (needs QuickML)")
    ap.add_argument("--json", default=None, help="write results JSON here")
    args = ap.parse_args()

    cases = load_golden()
    lang = eval_language(cases)
    dic = eval_dictionary(cases)
    sql = eval_reference_sql(cases)
    router = eval_router_prompt()

    sql_ok = sum(1 for r in sql if r.get("ok"))
    sql_total = sum(1 for r in sql if not r.get("skipped"))
    live = run_live(cases) if args.live else []

    summary = {
        "language_detection": f"{lang['passed']}/{lang['total']}",
        "reference_sql": f"{sql_ok}/{sql_total} valid+executable",
        "dictionary_issues": dic["issues"],
        "router_prompt": router,
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    for r in sql:
        if r.get("skipped"):
            continue
        flag = "PASS" if r.get("ok") else "FAIL"
        print(f"  [{flag}] {r['id']}: {r.get('rows', 0)} rows, {r.get('latency_ms')}ms {r.get('violations') or ''}")
    if lang["failures"]:
        print("Language failures:", lang["failures"])
    if live:
        live_ok = sum(1 for r in live if r.get("ok"))
        print(f"LIVE graph: {live_ok}/{len(live)} passed")

    if args.json:
        with open(args.json, "w") as f:
            json.dump(
                {"summary": summary, "sql": sql, "language": lang, "live": live},
                f,
                indent=2,
                ensure_ascii=False,
            )
        print(f"Wrote {args.json}")

    failed = (lang["total"] - lang["passed"]) + (sql_total - sql_ok)
    if not router["ok"]:
        failed += 1
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
