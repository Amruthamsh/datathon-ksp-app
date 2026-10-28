"""Station Command — the SHO / Inspector morning workspace.

One call that answers the three questions a station house officer starts the
day with:

1. What must move today?   -> action_queue (BNSS clocks first, then gravity)
2. Who is carrying it?     -> io (officer workload + reassignment suggestions)
3. What does the local picture look like? -> crime mix, co-accused clusters,
   and a deterministic beat/prevention playbook.

Everything is scoped to the caller's police station through the same RBAC
scope clause used by the briefing, queue and compliance board.
"""

from __future__ import annotations

from db.sqlite.briefing_repository import get_briefing
from db.sqlite.network_repository import NetworkRepository
from db.sqlite.sqlite import get_connection
from db.sqlite.sqlite_investigation_repository import SQLiteInvestigationRepository
from services import bnss_service as bnss
from services import prevention_plan_service
from services.bnss_service import get_compliance
from services.supervision_service import get_officer_supervision

ACTION_LIMIT = 8
CLUSTER_LIMIT = 4
REPEAT_LIMIT = 5


def _pct(cur: int, prev: int) -> float | None:
    if not prev:
        return None
    return round((cur - prev) * 100.0 / prev, 1)


def _station_identity(scope: dict) -> dict:
    unit_id = (scope or {}).get("unit_id")
    district_id = (scope or {}).get("district_id")
    with get_connection() as conn:
        row = None
        if unit_id is not None:
            row = conn.execute(
                """
                SELECT u.UnitID AS unit_id, u.UnitName AS name,
                       u.DistrictID AS district_id, d.DistrictName AS district
                FROM Unit u
                LEFT JOIN District d ON d.DistrictID = u.DistrictID
                WHERE u.UnitID = ?
                """,
                [unit_id],
            ).fetchone()
        if row is None and district_id is not None:
            row = conn.execute(
                """
                SELECT u.UnitID AS unit_id, u.UnitName AS name,
                       u.DistrictID AS district_id, d.DistrictName AS district
                FROM Unit u
                LEFT JOIN District d ON d.DistrictID = u.DistrictID
                WHERE u.DistrictID = ?
                ORDER BY u.UnitID
                LIMIT 1
                """,
                [district_id],
            ).fetchone()
    return dict(row) if row else {"unit_id": unit_id, "name": "", "district_id": district_id, "district": ""}


def _action_queue(scope: dict, limit: int = ACTION_LIMIT) -> list[dict]:
    """Open cases ranked by the nearest hard BNSS clock, then heinous gravity.

    Cases without a live clock stay in the list (a pending chargesheet with no
    arrest is still an SHO action) and sort after clocked cases.
    """
    scope_sql, params = SQLiteInvestigationRepository._scope_clause(scope, "cm")
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            WITH scoped AS (
                SELECT cm.CaseMasterID
                FROM CaseMaster cm
                WHERE cm.CaseStatusID = 1 {scope_sql}
            ),
            clocks AS (
                SELECT * FROM ({bnss.clocks_sql("")})
                WHERE CaseMasterID IN (SELECT CaseMasterID FROM scoped)
                  AND rule IN ('default_bail', 'sexual_offence')
            ),
            nearest AS (
                SELECT CaseMasterID, rule, band, days_left,
                       ROW_NUMBER() OVER (
                           PARTITION BY CaseMasterID
                           ORDER BY CASE band
                                      WHEN 'breached' THEN 0
                                      WHEN 'critical' THEN 1
                                      WHEN 'warning' THEN 2
                                      ELSE 3
                                    END,
                                    days_left
                       ) AS rn
                FROM clocks
            )
            SELECT
                cm.CaseMasterID,
                cm.CrimeNo,
                csh.CrimeHeadName AS crime,
                go.LookupValue AS gravity,
                csm.CaseStatusName AS status,
                substr(cm.CrimeRegisteredDate, 1, 10) AS registered,
                CAST(
                    julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster))
                    - julianday(cm.CrimeRegisteredDate) AS INTEGER
                ) AS age_days,
                TRIM(e.FirstName) AS officer,
                u.UnitName AS station,
                d.DistrictName AS district,
                (SELECT COUNT(*) FROM Accused a WHERE a.CaseMasterID = cm.CaseMasterID) AS accused_count,
                EXISTS (
                    SELECT 1 FROM ChargesheetDetails cs WHERE cs.CaseMasterID = cm.CaseMasterID
                ) AS has_chargesheet,
                EXISTS (
                    SELECT 1 FROM ArrestSurrender ars WHERE ars.CaseMasterID = cm.CaseMasterID
                ) AS has_arrest,
                n.rule AS bnss_rule,
                n.band AS bnss_band,
                n.days_left AS bnss_days_left
            FROM scoped s
            JOIN CaseMaster cm ON cm.CaseMasterID = s.CaseMasterID
            JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
            LEFT JOIN GravityOffence go ON go.GravityOffenceID = cm.GravityOffenceID
            LEFT JOIN CaseStatusMaster csm ON csm.CaseStatusID = cm.CaseStatusID
            LEFT JOIN Employee e ON e.EmployeeID = cm.PolicePersonID
            JOIN Unit u ON u.UnitID = cm.PoliceStationID
            JOIN District d ON d.DistrictID = u.DistrictID
            LEFT JOIN nearest n ON n.CaseMasterID = cm.CaseMasterID AND n.rn = 1
            ORDER BY
                CASE n.band
                    WHEN 'breached' THEN 0
                    WHEN 'critical' THEN 1
                    WHEN 'warning' THEN 2
                    WHEN 'on_track' THEN 3
                    ELSE 4
                END,
                CASE WHEN go.LookupValue = 'Heinous' THEN 0 ELSE 1 END,
                cm.CrimeRegisteredDate ASC
            LIMIT ?
            """,
            params + [limit],
        ).fetchall()
    return [dict(r) for r in rows]


def _repeat_offenders(scope: dict, limit: int = REPEAT_LIMIT) -> list[dict]:
    """Accused named in more than one FIR at this station (name-matched)."""
    scope_sql, params = SQLiteInvestigationRepository._scope_clause(scope, "cm")
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                a.AccusedName AS name,
                COUNT(DISTINCT a.CaseMasterID) AS case_count,
                SUM(CASE WHEN cm.CaseStatusID = 1 THEN 1 ELSE 0 END) AS open_cases,
                MAX(cm.CrimeRegisteredDate) AS last_case,
                GROUP_CONCAT(DISTINCT csh.CrimeHeadName) AS crimes
            FROM Accused a
            JOIN CaseMaster cm ON cm.CaseMasterID = a.CaseMasterID
            JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
            WHERE a.AccusedName IS NOT NULL {scope_sql}
            GROUP BY a.AccusedName
            HAVING COUNT(DISTINCT a.CaseMasterID) > 1
            ORDER BY open_cases DESC, case_count DESC, a.AccusedName
            LIMIT ?
            """,
            params + [limit],
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["crimes"] = sorted({c for c in (d.get("crimes") or "").split(",") if c})
        out.append(d)
    return out


def _playbook(scope: dict, station: dict) -> dict | None:
    """Deterministic prevention plan for the station's top crime type.

    No LLM here: the SHO needs a fast, repeatable beat plan, and the
    heuristic template is the same fallback used by the map planner.
    """
    scope_sql, params = SQLiteInvestigationRepository._scope_clause(scope, "cm")

    with get_connection() as conn:
        # Pick the crime that actually needs attention now: most FIRs in the
        # last 30 days, with 90-day volume as the tie-break.
        top = conn.execute(
            f"""
            SELECT csh.CrimeHeadName AS name,
                   SUM(CASE WHEN julianday(cm.CrimeRegisteredDate)
                            > julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 30
                            THEN 1 ELSE 0 END) AS cur30,
                   SUM(CASE WHEN julianday(cm.CrimeRegisteredDate)
                            > julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 90
                            THEN 1 ELSE 0 END) AS cur90
            FROM CaseMaster cm
            JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
            WHERE 1 = 1 {scope_sql}
            GROUP BY csh.CrimeHeadName
            ORDER BY cur30 DESC, cur90 DESC, csh.CrimeHeadName
            LIMIT 1
            """,
            params,
        ).fetchone()

        if not top or not top["name"]:
            return None
        crime = top["name"]

        stats_row = conn.execute(
            f"""
            SELECT
                SUM(CASE WHEN julianday(cm.CrimeRegisteredDate)
                         > julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 30
                         THEN 1 ELSE 0 END) AS cur,
                SUM(CASE WHEN julianday(cm.CrimeRegisteredDate)
                         <= julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 30
                         AND julianday(cm.CrimeRegisteredDate)
                         > julianday((SELECT MAX(CrimeRegisteredDate) FROM CaseMaster)) - 60
                         THEN 1 ELSE 0 END) AS prev
            FROM CaseMaster cm
            JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
            WHERE csh.CrimeHeadName = ? {scope_sql}
            """,
            [crime] + params,
        ).fetchone()

        peak = conn.execute(
            f"""
            SELECT strftime('%H', COALESCE(cm.IncidentFromDate, cm.CrimeRegisteredDate)) AS h,
                   COUNT(*) AS n
            FROM CaseMaster cm
            JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
            WHERE csh.CrimeHeadName = ? {scope_sql}
            GROUP BY h
            ORDER BY n DESC
            LIMIT 1
            """,
            [crime] + params,
        ).fetchone()

    cur = (stats_row["cur"] or 0) if stats_row else 0
    prev = (stats_row["prev"] or 0) if stats_row else 0
    peak_time = None
    if peak and peak["h"] is not None:
        hour = int(peak["h"])
        start = (hour // 4) * 4
        peak_time = f"{start:02d}:00–{(start + 4) % 24:02d}:00"

    stats = {
        "total_30d": cur,
        "prev_30d": prev,
        "change_pct": _pct(cur, prev) or 0,
        "peak_time": peak_time or "N/A",
        "top_stations": [{"station": station.get("name") or "Station", "count": cur}],
        "repeat_offenders": 0,
    }
    plan = prevention_plan_service.generate_prevention_plan(
        stats,
        station.get("district") or "",
        crime,
        time_range=peak_time or "peak hours",
        catalyst_app=None,
    )
    return {
        "crime_label": plan.get("crime_label", crime),
        "deployment_type": plan.get("deployment_type"),
        "threat_summary": plan.get("threat_summary"),
        "why_this_deployment": plan.get("why_this_deployment"),
        "immediate_actions": (plan.get("immediate_actions") or [])[:4],
        "preventive_measures": (plan.get("preventive_measures") or [])[:3],
        "resource_allocation": plan.get("resource_allocation") or {},
        "metrics_to_track": (plan.get("metrics_to_track") or [])[:3],
        "physical_patrol_note": plan.get("physical_patrol_note"),
        "stats": stats,
    }


def get_station_overview(scope: dict) -> dict:
    scope = scope or {}
    station = _station_identity(scope)
    briefing = get_briefing(scope)
    compliance = get_compliance(scope)
    supervision = get_officer_supervision(scope)
    clusters = NetworkRepository().get_communities(scope=scope, limit=CLUSTER_LIMIT)

    return {
        "as_of": briefing.get("as_of"),
        "window_days": briefing.get("window_days", 90),
        "station": station,
        "kpis": briefing.get("kpis") or {},
        "hotspots": briefing.get("hotspots") or [],
        "monthly": briefing.get("monthly") or [],
        "top_rising": briefing.get("top_rising"),
        "women": briefing.get("women") or {},
        "action_queue": _action_queue(scope),
        "repeat_offenders": _repeat_offenders(scope),
        "clusters": clusters,
        "io": {
            "summary": supervision.get("summary") or {},
            "officers": (supervision.get("officers") or [])[:4],
            "suggestions": (supervision.get("suggestions") or [])[:2],
        },
        "compliance": {
            "headline": compliance.get("headline") or {},
            "critical_days": compliance.get("critical_days", bnss.CRITICAL_DAYS),
            "expiring": (compliance.get("expiring") or [])[:4],
        },
        "playbook": _playbook(scope, station),
    }
