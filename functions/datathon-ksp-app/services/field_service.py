"""Field Workbench — the assigned-case view for a field investigator.

A field officer (ASI / HC / PC) does not run a station, so this view answers a
different set of questions from the Station Command workspace:

1. What is on my plate?   -> assigned cases, open cases, arrests pending
2. What must I do today?  -> statutory clocks, chargesheets, arrests, victims
3. What is happening around my beat? -> station-level aggregates only

All case rows are filtered by the caller's RBAC scope (``level = self``); the
beat panel deliberately exposes aggregate counts only, never another officer's
case records.
"""

from __future__ import annotations

from db.sqlite.sqlite import get_connection
from db.sqlite.sqlite_investigation_repository import SQLiteInvestigationRepository
from services.bnss_service import data_as_of

CASE_LIMIT = 25
TASK_LIMIT = 8
BEAT_LIMIT = 5

_OPEN_STATUSES = {"Under Investigation", "Charge Sheeted", "Pending Trial"}


def _identity(scope: dict) -> dict:
    employee_id = (scope or {}).get("employee_id")
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT e.EmployeeID AS employee_id,
                   e.KGID AS kgid,
                   TRIM(e.FirstName) AS name,
                   r.RankName AS rank,
                   r.Hierarchy AS hierarchy,
                   u.UnitID AS unit_id,
                   u.UnitName AS station,
                   d.DistrictID AS district_id,
                   d.DistrictName AS district
            FROM Employee e
            LEFT JOIN Rank r ON r.RankID = e.RankID
            LEFT JOIN Unit u ON u.UnitID = e.UnitID
            LEFT JOIN District d ON d.DistrictID = u.DistrictID
            WHERE e.EmployeeID = ?
            """,
            [employee_id],
        ).fetchone()
    if row:
        return dict(row)
    return {
        "employee_id": employee_id,
        "kgid": "",
        "name": "",
        "rank": "",
        "hierarchy": None,
        "unit_id": (scope or {}).get("unit_id"),
        "station": "",
        "district_id": (scope or {}).get("district_id"),
        "district": "",
    }


def _pct(cur: int, prev: int) -> float | None:
    if not prev:
        return None
    return round((cur - prev) * 100.0 / prev, 1)


def _beat(scope: dict) -> dict:
    """Station-level aggregates around the officer's beat."""
    unit_id = (scope or {}).get("unit_id")
    as_of = data_as_of()

    with get_connection() as conn:
        totals = conn.execute(
            """
            SELECT COUNT(*) AS total_firs,
                   SUM(CASE WHEN cm.CaseStatusID = 1 THEN 1 ELSE 0 END) AS open_cases,
                   SUM(CASE WHEN julianday(cm.CrimeRegisteredDate)
                            > julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 30
                            THEN 1 ELSE 0 END) AS firs_30d,
                   SUM(CASE WHEN julianday(cm.CrimeRegisteredDate)
                            <= julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 30
                            AND julianday(cm.CrimeRegisteredDate)
                            > julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 60
                            THEN 1 ELSE 0 END) AS firs_prev_30d
            FROM CaseMaster cm
            WHERE cm.PoliceStationID = ?
            """,
            [unit_id],
        ).fetchone()

        top_rows = conn.execute(
            """
            SELECT csh.CrimeHeadName AS name,
                   SUM(CASE WHEN julianday(cm.CrimeRegisteredDate)
                            > julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 30
                            THEN 1 ELSE 0 END) AS firs,
                   SUM(CASE WHEN julianday(cm.CrimeRegisteredDate)
                            <= julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 30
                            AND julianday(cm.CrimeRegisteredDate)
                            > julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 60
                            THEN 1 ELSE 0 END) AS prev
            FROM CaseMaster cm
            JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
            WHERE cm.PoliceStationID = ?
            GROUP BY csh.CrimeHeadName
            HAVING firs > 0
            ORDER BY firs DESC, csh.CrimeHeadName
            LIMIT ?
            """,
            [unit_id, BEAT_LIMIT],
        ).fetchall()

    t = dict(totals) if totals else {}
    top = []
    for row in top_rows:
        d = dict(row)
        d["change_pct"] = _pct(d.get("firs") or 0, d.get("prev") or 0)
        top.append(d)

    return {
        "as_of": as_of,
        "window_days": 30,
        "total_firs": t.get("total_firs") or 0,
        "open_cases": t.get("open_cases") or 0,
        "firs_30d": t.get("firs_30d") or 0,
        "firs_prev_30d": t.get("firs_prev_30d") or 0,
        "change_pct": _pct(t.get("firs_30d") or 0, t.get("firs_prev_30d") or 0),
        "top_crimes": top,
    }


def _tasks(cases: list[dict]) -> list[dict]:
    """Turn assigned case state into a short, ranked field to-do list."""
    tasks: list[dict] = []

    def add(case: dict, kind: str, **extra):
        tasks.append(
            {
                "kind": kind,
                "case_id": case.get("CaseMasterID"),
                "crime_no": case.get("CrimeNo"),
                "crime": case.get("CrimeHeadName"),
                "status": case.get("CaseStatusName"),
                "gravity": case.get("Gravity"),
                "priority": case.get("Priority"),
                "accused_count": case.get("AccusedCount") or 0,
                "victim_count": case.get("VictimCount") or 0,
                **extra,
            }
        )

    for case in cases:
        open_case = case.get("CaseStatusName") in _OPEN_STATUSES
        clock = case.get("Bnss") or {}

        if clock.get("band") in ("breached", "critical", "warning"):
            add(
                case,
                "bnss",
                band=clock.get("band"),
                days_left=clock.get("days_left"),
                rule=clock.get("rule"),
            )
        elif open_case and not case.get("HasChargesheet"):
            add(case, "chargesheet")
        elif open_case and not case.get("HasArrest"):
            add(case, "arrest")
        elif open_case and (case.get("VictimCount") or 0) > 0:
            add(case, "victim")
        elif not open_case and case.get("Priority") in ("CRITICAL", "HIGH"):
            add(case, "review")

    band_order = {"breached": 0, "critical": 1, "warning": 2}
    kind_order = {"bnss": 0, "chargesheet": 1, "arrest": 2, "victim": 3, "review": 4}
    tasks.sort(
        key=lambda t: (
            band_order.get(t.get("band"), 3),
            kind_order.get(t.get("kind"), 9),
            0 if t.get("priority") == "CRITICAL" else 1,
            t.get("days_left") if t.get("days_left") is not None else 9999,
        )
    )
    return tasks[:TASK_LIMIT]


def get_field_overview(scope: dict) -> dict:
    scope = scope or {}
    employee_id = scope.get("employee_id")
    identity = _identity(scope)

    repo = SQLiteInvestigationRepository()
    summary = repo.get_summary(employee_id, scope=scope) if employee_id else {}
    cases = (
        repo.get_investigations(
            employee_id,
            page=1,
            page_size=CASE_LIMIT,
            scope=scope,
            sort="priority",
        )["data"]
        if employee_id
        else []
    )

    return {
        "as_of": data_as_of(),
        "window_days": 90,
        "officer": identity,
        "station": {
            "unit_id": identity.get("unit_id"),
            "name": identity.get("station"),
            "district_id": identity.get("district_id"),
            "district": identity.get("district"),
        },
        "summary": summary,
        "cases": cases,
        "tasks": _tasks(cases),
        "beat": _beat(scope),
    }
