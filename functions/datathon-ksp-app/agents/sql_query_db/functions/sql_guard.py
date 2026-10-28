"""Static read-only guard for LLM-generated SQL.

Runs before every execution. The SQLite connection is already
query_only=ON; this is the second, explainable layer — its verdict is
returned to the client and rendered in the audit trail.
"""

import re

_FORBIDDEN = (
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "REPLACE",
    "TRUNCATE", "ATTACH", "DETACH", "PRAGMA", "VACUUM", "REINDEX", "GRANT",
    "REVOKE", "EXEC", "EXECUTE", "MERGE", "UPSERT",
)
_FORBIDDEN_RE = re.compile(r"\b(" + "|".join(_FORBIDDEN) + r")\b", re.I)
_TABLE_RE = re.compile(r"\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)", re.I)


def _strip_literals_and_comments(sql: str) -> str:
    """Blank out string literals and comments so keywords inside them
    (e.g. a victim named 'Drop') never trigger a false block."""
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"'(?:''|[^'])*'", "''", sql)
    sql = re.sub(r'"(?:""|[^"])*"', '""', sql)
    return sql


def validate_sql(sql: str) -> dict:
    """Return {passed, checks[], tables[], reason}. Never raises."""
    checks = []
    raw = (sql or "").strip()
    body = _strip_literals_and_comments(raw).strip().rstrip(";").strip()

    def check(name: str, ok: bool):
        checks.append({"name": name, "passed": bool(ok)})
        return ok

    ok = check("Non-empty query", bool(body))
    ok = check("Single statement", ok and ";" not in body) and ok
    ok = check(
        "Read-only (SELECT / WITH)",
        ok and re.match(r"^(SELECT|WITH)\b", body, re.I) is not None,
    ) and ok
    hit = _FORBIDDEN_RE.search(body) if body else None
    ok = check("No mutating keywords", hit is None) and ok

    tables = sorted({t for t in _TABLE_RE.findall(body)})
    reason = None
    if not ok:
        failed = next(c["name"] for c in checks if not c["passed"])
        reason = f"Blocked: {failed}" + (f" ({hit.group(1).upper()})" if hit else "")

    return {"passed": ok, "checks": checks, "tables": tables, "reason": reason}
