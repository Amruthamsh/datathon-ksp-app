"""Command Briefing — the first screen an officer sees after login.

Everything is scoped by the caller's RBAC scope and anchored to the latest
FIR inside that scope (not wall-clock "now"), so windows stay meaningful on
a static dataset.
"""

from db.sqlite.sqlite import get_connection
from db.sqlite.sqlite_investigation_repository import SQLiteInvestigationRepository
from services import bnss_service as bnss

WINDOW_DAYS = 90



def _pct(cur: int, prev: int) -> float | None:
    if not prev:
        return None
    return round((cur - prev) * 100.0 / prev, 1)


def get_briefing(scope: dict) -> dict:
    scope_sql, scope_params = SQLiteInvestigationRepository._scope_clause(scope, "cm")
    level = (scope or {}).get("level", "self")

    with get_connection() as conn:
        as_of = conn.execute(
            f"SELECT MAX(CrimeRegisteredDate) d FROM CaseMaster cm WHERE 1=1 {scope_sql}",
            scope_params,
        ).fetchone()["d"]
        if not as_of:
            return {"as_of": None, "window_days": WINDOW_DAYS, "kpis": {}, "hotspots": [], "rising": [], "monthly": []}

        def q(sql: str, extra: dict | None = None):
            # Named params for the window, positional ones for the scope clause
            # can't mix — inline the scope params as named ones instead.
            params = {"as_of": as_of, "w": WINDOW_DAYS, **(extra or {})}
            s = scope_sql
            for i, p in enumerate(scope_params):
                s = s.replace("?", f":s{i}", 1)
                params[f"s{i}"] = p
            return conn.execute(sql.replace("{scope}", s), params).fetchall()

        window = """
            julianday(cm.CrimeRegisteredDate) > julianday(:as_of) - :w
        """
        prev_window = """
            julianday(cm.CrimeRegisteredDate) <= julianday(:as_of) - :w
            AND julianday(cm.CrimeRegisteredDate) > julianday(:as_of) - 2 * :w
        """

        k = q(f"""
            SELECT
              SUM(CASE WHEN {window} THEN 1 ELSE 0 END) AS cur,
              SUM(CASE WHEN {prev_window} THEN 1 ELSE 0 END) AS prev,
              SUM(CASE WHEN cm.CaseStatusID = 1 THEN 1 ELSE 0 END) AS open_cases,
              COUNT(*) AS total
            FROM CaseMaster cm WHERE 1=1 {{scope}}
        """)[0]

        # BNSS clocks — same engine as the queue and compliance board.
        bail = {
            r["band"]: r["n"]
            for r in conn.execute(
                f"SELECT band, COUNT(*) n FROM ({bnss.clocks_sql(scope_sql)}) "
                "WHERE rule = 'default_bail' GROUP BY band",
                scope_params,
            )
        }
        overdue_total = bnss.count_overdue(conn, scope)

        repeat = q("""
            SELECT COUNT(*) AS n FROM (
              SELECT a.PersonID FROM Accused a
              JOIN CaseMaster cm ON cm.CaseMasterID = a.CaseMasterID
              WHERE a.PersonID IS NOT NULL {scope}
              GROUP BY a.PersonID HAVING COUNT(DISTINCT a.CaseMasterID) > 1
            )
        """)[0]["n"]

        # Hotspots one level below the caller's jurisdiction.
        if level == "all":
            group_expr, join, label = "d.DistrictName", "JOIN Unit u ON u.UnitID = cm.PoliceStationID JOIN District d ON d.DistrictID = u.DistrictID", "district"
        elif level == "district":
            group_expr, join, label = "u.UnitName", "JOIN Unit u ON u.UnitID = cm.PoliceStationID", "station"
        else:
            group_expr, join, label = "csh.CrimeHeadName", "JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID", "crime"

        hot_rows = q(f"""
            SELECT {group_expr} AS name,
                   SUM(CASE WHEN {window} THEN 1 ELSE 0 END) AS cur,
                   SUM(CASE WHEN {prev_window} THEN 1 ELSE 0 END) AS prev
            FROM CaseMaster cm {join}
            WHERE 1=1 {{scope}}
            GROUP BY {group_expr}
            ORDER BY cur DESC
            LIMIT 6
        """)

        rising_rows = q(f"""
            SELECT csh.CrimeHeadName AS name,
                   SUM(CASE WHEN {window} THEN 1 ELSE 0 END) AS cur,
                   SUM(CASE WHEN {prev_window} THEN 1 ELSE 0 END) AS prev
            FROM CaseMaster cm
            JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
            WHERE 1=1 {{scope}}
            GROUP BY csh.CrimeHeadName
            HAVING prev >= 5
            ORDER BY (cur - prev) * 1.0 / prev DESC
            LIMIT 3
        """)

        monthly = q("""
            SELECT substr(cm.CrimeRegisteredDate, 1, 7) AS month, COUNT(*) AS firs
            FROM CaseMaster cm
            WHERE cm.CrimeRegisteredDate >= date(:as_of, 'start of month', '-11 months') {scope}
            GROUP BY month ORDER BY month
        """)

    return {
        "as_of": as_of[:10],
        "window_days": WINDOW_DAYS,
        "kpis": {
            "firs_window": k["cur"] or 0,
            "firs_prev": k["prev"] or 0,
            "change_pct": _pct(k["cur"] or 0, k["prev"] or 0),
            "open_cases": k["open_cases"] or 0,
            "total_firs": k["total"] or 0,
            "chargesheet_overdue": overdue_total,
            "bail_critical": bail.get("critical", 0),
            "bail_breached": bail.get("breached", 0),
            "repeat_offenders": repeat or 0,
        },
        "hotspot_level": label,
        "hotspots": [
            {"name": r["name"], "firs": r["cur"] or 0, "change_pct": _pct(r["cur"] or 0, r["prev"] or 0)}
            for r in hot_rows
        ],
        "rising": [
            {"name": r["name"], "firs": r["cur"] or 0, "change_pct": _pct(r["cur"] or 0, r["prev"] or 0)}
            for r in rising_rows
        ],
        "monthly": [dict(r) for r in monthly],
    }
