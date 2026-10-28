"""Row-level jurisdiction enforcement for LLM-generated SQL.

The model is told the officer's jurisdiction, but that is advisory. This
module makes it binding: every reference to a case-bearing table is replaced
by a subquery filtered to the officer's scope before execution, so a query
about another district simply has no rows to read.

    FROM CaseMaster cm
 -> FROM (SELECT * FROM CaseMaster WHERE PoliceStationID IN (...)) AS cm

Lookup tables (District, Unit, CrimeSubHead, ...) are left alone — they hold
names, not case data.
"""

import re

# Tables whose rows belong to a case, and how each one reaches CaseMaster.
_CASE_TABLE = "CaseMaster"
_CHILD_TABLES = (
    "Accused",
    "Victim",
    "ArrestSurrender",
    "ChargesheetDetails",
    "ComplainantDetails",
    "ActSectionAssociation",
)

# Words that can follow a table name but are not an alias.
_NOT_ALIAS = {
    "where", "on", "join", "inner", "left", "right", "full", "outer", "cross",
    "natural", "group", "order", "limit", "having", "union", "using", "window",
    "except", "intersect", "as",
}

_REF_RE = re.compile(
    r"\b(FROM|JOIN)\s+(" + "|".join([_CASE_TABLE, *_CHILD_TABLES]) + r")\b"
    r"(?:\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*))?",
    re.I,
)


def _case_condition(scope: dict) -> str | None:
    level = (scope or {}).get("level", "self")
    if level == "all":
        return None
    if level == "district" and scope.get("district_id") is not None:
        return f"PoliceStationID IN (SELECT UnitID FROM Unit WHERE DistrictID = {int(scope['district_id'])})"
    if level == "unit" and scope.get("unit_id") is not None:
        return f"PoliceStationID = {int(scope['unit_id'])}"
    if scope.get("employee_id") is not None:
        return f"PolicePersonID = {int(scope['employee_id'])}"
    return "1 = 0"  # no identity to scope on: deny rather than leak


def apply_scope(sql: str, scope: dict) -> tuple[str, dict]:
    """Return (scoped_sql, info). info = {applied, tables, level}."""
    cond = _case_condition(scope)
    if cond is None:
        return sql, {"applied": False, "tables": [], "level": "all"}

    canonical = {t.lower(): t for t in (_CASE_TABLE, *_CHILD_TABLES)}
    touched: list[str] = []

    def repl(m: re.Match) -> str:
        keyword, table, alias = m.group(1), canonical[m.group(2).lower()], m.group(3)
        trailing = ""
        if alias and alias.lower() in _NOT_ALIAS:
            # Not an alias (e.g. "FROM Accused WHERE ..."): keep the word.
            trailing, alias = f" {m.group(3)}", None
        if table == _CASE_TABLE:
            inner = f"SELECT * FROM {_CASE_TABLE} WHERE {cond}"
        else:
            inner = (
                f"SELECT * FROM {table} WHERE CaseMasterID IN "
                f"(SELECT CaseMasterID FROM {_CASE_TABLE} WHERE {cond})"
            )
        touched.append(table)
        return f"{keyword} ({inner}) AS {alias or table}{trailing}"

    scoped = _REF_RE.sub(repl, sql)
    return scoped, {
        "applied": bool(touched),
        "tables": sorted(set(touched)),
        "level": scope.get("level"),
    }
