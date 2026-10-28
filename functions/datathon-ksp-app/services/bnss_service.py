"""BNSS 2023 statutory clocks — one engine for the briefing, investigation
queue, case workspace and compliance board.

Every clock is anchored to the latest FIR on record (the corpus is a static
snapshot). Rules whose start event isn't captured in the FIR data are listed
in the rulebook but marked ``live: False`` with the missing field, so the UI
never shows an invented status.
"""

from db.sqlite.sqlite import get_connection
from db.sqlite.sqlite_investigation_repository import SQLiteInvestigationRepository

# Offences punishable with death, life or 10+ years -> 90-day limit
# (s.187(3)(a) BNSS). Everything else -> 60 days. Mapped by crime type, not
# the synthetic gravity flag, so the limit always has a statutory basis.
NINETY_DAY_OFFENCES = {
    "Murder": "BNS 103 — death or life imprisonment",
    "Attempt to Murder": "BNS 109 — up to life imprisonment",
    "Sexual Assault": "BNS 64 — 10 years to life",
}

CRITICAL_DAYS = 15
ADULT_AGE = 18  # Juvenile Justice (Care and Protection of Children) Act, 2015

RULEBOOK = [
    {
        "id": "default_bail",
        "stage": "Chargesheet before default bail",
        "provision": "BNSS §187(3) · §193",
        "limit": "90 days (death / life / 10+ yrs) · 60 days (others)",
        "clock": "From first arrest of an accused",
        "response": "Counts down per case; at 15 days the case is CRITICAL and the SP is alerted. Past the limit the accused can claim default bail.",
        "live": True,
    },
    {
        "id": "sexual_offence",
        "stage": "Sexual offence investigation",
        "provision": "BNSS §193(2)",
        "limit": "2 months",
        "clock": "From FIR registration (BNS 64–68, 70, 71 · POCSO)",
        "response": "Priority HIGH HEINOUS; tracks the 60-day completion window.",
        "live": True,
    },
    {
        "id": "victim_update",
        "stage": "Victim progress update",
        "provision": "BNSS §193(3)(ii)",
        "limit": "90 days",
        "clock": "From FIR registration",
        "response": "Computes the due date for every case with a victim and drafts the update in Kannada / English.",
        "live": True,
        "note": "Due dates are live; dispatch confirmation needs the CCTNS victim-communication log.",
    },
    {
        "id": "preliminary_enquiry",
        "stage": "Preliminary enquiry",
        "provision": "BNSS §173(3)",
        "limit": "14 days",
        "clock": "From complaint (offences punishable 3–7 yrs)",
        "response": "Flags unverified complaints to the SHO before FIR registration.",
        "live": False,
        "missing": "Complaint receipt date (CCTNS petition register)",
    },
    {
        "id": "medical_report",
        "stage": "Rape medical report",
        "provision": "BNSS §184(6)",
        "limit": "7 days",
        "clock": "From medical examination",
        "response": "Tracks pending hospital reports; reminds the IO desk.",
        "live": False,
        "missing": "Medical examination & report dates",
    },
    {
        "id": "further_investigation",
        "stage": "Further investigation",
        "provision": "BNSS §193(9) proviso",
        "limit": "90 days",
        "clock": "From court permission",
        "response": "Alerts the IO when a court extension is required.",
        "live": False,
        "missing": "Court order date for further investigation",
    },
]


def _ninety_case_sql(col: str) -> str:
    names = ", ".join(f"'{n}'" for n in NINETY_DAY_OFFENCES)
    return f"CASE WHEN {col} IN ({names}) THEN 90 ELSE 60 END"


def clocks_sql(scope_sql: str = "") -> str:
    """SELECT producing one row per clock:
    CaseMasterID, rule, start_date, limit_days, days_left, band, crime,
    AccusedMasterID, accused_name, accused_age.

    Default bail (s.187(3)) is personal: one clock per *adult accused in
    custody*, from that person's own arrest. Children in conflict with law
    are dealt with by the Juvenile Justice Board, not this clock. Other
    rules are case-level (accused columns NULL)."""
    return f"""
    WITH asof AS (SELECT MAX(CrimeRegisteredDate) AS d FROM CaseMaster),
    arrest AS (
        SELECT ars.CaseMasterID, ars.AccusedMasterID, MIN(ars.ArrestSurrenderDate) AS d
        FROM ArrestSurrender ars, asof
        WHERE ars.ArrestSurrenderDate <= asof.d AND ars.AccusedMasterID IS NOT NULL
        GROUP BY ars.CaseMasterID, ars.AccusedMasterID
    ),
    open_cases AS (
        SELECT cm.CaseMasterID, cm.CrimeRegisteredDate AS fir, csh.CrimeHeadName AS crime,
               NOT EXISTS (SELECT 1 FROM ChargesheetDetails cs WHERE cs.CaseMasterID = cm.CaseMasterID) AS no_cs
        FROM CaseMaster cm
        JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
        WHERE cm.CaseStatusID = 1 {scope_sql}
    ),
    raw AS (
        SELECT o.CaseMasterID, 'default_bail' AS rule, a.d AS start_date,
               {_ninety_case_sql('o.crime')} AS limit_days, o.crime,
               ac.AccusedMasterID, ac.AccusedName AS accused_name, ac.AgeYear AS accused_age
        FROM open_cases o
        JOIN arrest a ON a.CaseMasterID = o.CaseMasterID
        JOIN Accused ac ON ac.AccusedMasterID = a.AccusedMasterID
        WHERE o.no_cs AND (ac.AgeYear IS NULL OR ac.AgeYear >= {ADULT_AGE})
        UNION ALL
        SELECT o.CaseMasterID, 'sexual_offence', o.fir, 60, o.crime, NULL, NULL, NULL
        FROM open_cases o
        -- Keyed off the offence itself: the synthetic act/section tags attach
        -- POCSO to unrelated crimes (forgery, burglary) and would mislead.
        WHERE o.no_cs AND o.crime = 'Sexual Assault'
        UNION ALL
        SELECT o.CaseMasterID, 'victim_update', o.fir, 90, o.crime, NULL, NULL, NULL
        FROM open_cases o
        WHERE EXISTS (SELECT 1 FROM Victim v WHERE v.CaseMasterID = o.CaseMasterID)
    )
    SELECT raw.CaseMasterID, raw.rule, substr(raw.start_date, 1, 10) AS start_date,
           raw.limit_days, raw.crime, raw.AccusedMasterID, raw.accused_name, raw.accused_age,
           CAST(raw.limit_days - (julianday(asof.d) - julianday(raw.start_date)) AS INTEGER) AS days_left,
           CASE
             WHEN raw.limit_days - (julianday(asof.d) - julianday(raw.start_date)) < 0 THEN 'breached'
             WHEN raw.limit_days - (julianday(asof.d) - julianday(raw.start_date)) <= {CRITICAL_DAYS} THEN 'critical'
             WHEN raw.limit_days - (julianday(asof.d) - julianday(raw.start_date)) <= raw.limit_days / 3.0 THEN 'warning'
             ELSE 'on_track'
           END AS band
    FROM raw, asof
    """


def case_ids_sql(rule: str | None, band: str | None) -> tuple[str, list]:
    """Subquery for `cm.CaseMasterID IN (...)` filters in the queue."""
    conds, params = [], []
    if rule:
        conds.append("rule = ?")
        params.append(rule)
    if band:
        conds.append("band = ?")
        params.append(band)
    where = f"WHERE {' AND '.join(conds)}" if conds else ""
    return f"SELECT CaseMasterID FROM ({clocks_sql()}) {where}", params


# "Overdue" everywhere in the app = a hard statutory limit already crossed.
OVERDUE_RULES = ("default_bail", "sexual_offence")


def overdue_ids_sql() -> str:
    rules = ", ".join(f"'{r}'" for r in OVERDUE_RULES)
    return f"SELECT CaseMasterID FROM ({clocks_sql()}) WHERE band = 'breached' AND rule IN ({rules})"


def _scope(scope: dict) -> tuple[str, list]:
    return SQLiteInvestigationRepository._scope_clause(scope, "cm")


def count_overdue(conn, scope: dict) -> int:
    scope_sql, params = _scope(scope)
    rules = ", ".join(f"'{r}'" for r in OVERDUE_RULES)
    return conn.execute(
        f"SELECT COUNT(DISTINCT CaseMasterID) FROM ({clocks_sql(scope_sql)}) "
        f"WHERE band = 'breached' AND rule IN ({rules})",
        params,
    ).fetchone()[0]


def data_as_of() -> str:
    """Latest FIR date on record — the 'today' every clock is measured from."""
    with get_connection() as conn:
        return (conn.execute("SELECT MAX(CrimeRegisteredDate) FROM CaseMaster").fetchone()[0] or "")[:10]


def get_case_clocks(case_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM ({clocks_sql('AND cm.CaseMasterID = ?')}) ORDER BY days_left",
            [case_id],
        ).fetchall()
        as_of = conn.execute("SELECT MAX(CrimeRegisteredDate) FROM CaseMaster").fetchone()[0]
    book = {r["id"]: r for r in RULEBOOK}
    out = []
    for r in rows:
        d = dict(r)
        meta = book[d["rule"]]
        d.update(
            stage=meta["stage"],
            provision=meta["provision"],
            basis=NINETY_DAY_OFFENCES.get(d["crime"]) if d["rule"] == "default_bail" else None,
            deadline=_add_days(d["start_date"], d["limit_days"]),
            as_of=(as_of or "")[:10],
        )
        out.append(d)
    return out


def _add_days(date_str: str, days: int) -> str | None:
    from datetime import date, timedelta

    try:
        return (date.fromisoformat(date_str[:10]) + timedelta(days=days)).isoformat()
    except (TypeError, ValueError):
        return None


def get_compliance(scope: dict) -> dict:
    scope_sql, params = _scope(scope)
    level = (scope or {}).get("level", "self")
    clocks = clocks_sql(scope_sql)

    with get_connection() as conn:
        as_of = conn.execute("SELECT MAX(CrimeRegisteredDate) FROM CaseMaster").fetchone()[0]

        counts = {}
        for r in conn.execute(
            f"SELECT rule, band, COUNT(*) n FROM ({clocks}) GROUP BY rule, band", params
        ):
            counts.setdefault(r["rule"], {})[r["band"]] = r["n"]

        # Historic: chargesheets filed within the limit, from first arrest.
        hist_sql = f"""
            WITH arrest AS (
                SELECT ars.CaseMasterID, MIN(ars.ArrestSurrenderDate) d
                FROM ArrestSurrender ars JOIN Accused ac ON ac.AccusedMasterID = ars.AccusedMasterID
                WHERE ac.AgeYear IS NULL OR ac.AgeYear >= {ADULT_AGE}
                GROUP BY ars.CaseMasterID
            ),
                 cs AS (SELECT CaseMasterID, MIN(csdate) d FROM ChargesheetDetails GROUP BY CaseMasterID)
            SELECT {{group}} AS name,
                   COUNT(*) AS filed,
                   SUM(julianday(cs.d) - julianday(arrest.d) <= {_ninety_case_sql('csh.CrimeHeadName')}) AS on_time
            FROM CaseMaster cm
            JOIN arrest ON arrest.CaseMasterID = cm.CaseMasterID
            JOIN cs ON cs.CaseMasterID = cm.CaseMasterID
            JOIN CrimeSubHead csh ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
            JOIN Unit u ON u.UnitID = cm.PoliceStationID
            JOIN District d ON d.DistrictID = u.DistrictID
            WHERE 1 = 1 {scope_sql}
            {{group_by}}
        """
        overall = conn.execute(hist_sql.format(group="'all'", group_by=""), params).fetchone()

        unit_expr = "d.DistrictName" if level == "all" else "u.UnitName"
        unit_hist = {
            r["name"]: r
            for r in conn.execute(hist_sql.format(group=unit_expr, group_by=f"GROUP BY {unit_expr}"), params)
        }
        unit_rows = conn.execute(
            f"""
            SELECT {unit_expr} AS name,
                   SUM(k.band = 'breached') AS breached,
                   SUM(k.band = 'critical') AS critical
            FROM ({clocks}) k
            JOIN CaseMaster cm ON cm.CaseMasterID = k.CaseMasterID
            JOIN Unit u ON u.UnitID = cm.PoliceStationID
            JOIN District d ON d.DistrictID = u.DistrictID
            WHERE k.rule = 'default_bail'
            GROUP BY {unit_expr}
            ORDER BY critical DESC, breached DESC
            """,
            params,
        ).fetchall()

        expiring = conn.execute(
            f"""
            SELECT k.CaseMasterID, k.rule, k.days_left, k.limit_days, k.start_date, k.crime,
                   k.accused_name, k.accused_age,
                   cm.CrimeNo, u.UnitName AS station, d.DistrictName AS district
            FROM ({clocks}) k
            JOIN CaseMaster cm ON cm.CaseMasterID = k.CaseMasterID
            JOIN Unit u ON u.UnitID = cm.PoliceStationID
            JOIN District d ON d.DistrictID = u.DistrictID
            WHERE k.rule IN ('default_bail', 'sexual_offence') AND k.band = 'critical'
            ORDER BY k.days_left ASC, k.CaseMasterID
            """,
            params,
        ).fetchall()

        # How far each accused's network reaches — the bridge from a deadline
        # to the Criminal Networks view. For default bail it is the person in
        # custody who matters; offenders active across districts rank first
        # because no single SP sees them whole.
        accused_by_case: dict[int, list] = {}
        ids = sorted({e["CaseMasterID"] for e in expiring})
        if ids:
            marks = ",".join("?" * len(ids))
            for a in conn.execute(
                f"""
                WITH names AS (
                    SELECT DISTINCT CaseMasterID, AccusedName FROM Accused WHERE CaseMasterID IN ({marks})
                ),
                reach AS (
                    SELECT a.AccusedName,
                           COUNT(DISTINCT a.CaseMasterID) AS firs,
                           COUNT(DISTINCT u.DistrictID) AS districts
                    FROM Accused a
                    JOIN CaseMaster c ON c.CaseMasterID = a.CaseMasterID
                    JOIN Unit u ON u.UnitID = c.PoliceStationID
                    WHERE a.AccusedName IN (SELECT AccusedName FROM names)
                    GROUP BY a.AccusedName
                )
                SELECT n.CaseMasterID, n.AccusedName AS name, r.firs, r.districts
                FROM names n JOIN reach r ON r.AccusedName = n.AccusedName
                ORDER BY r.districts DESC, r.firs DESC
                """,
                ids,
            ):
                accused_by_case.setdefault(a["CaseMasterID"], []).append(
                    {"name": a["name"], "firs": a["firs"], "districts": a["districts"]}
                )

        expiring_out = []
        for e in expiring:
            item = dict(e)
            item["deadline"] = _add_days(item["start_date"], item["limit_days"])
            case_accused = accused_by_case.get(item["CaseMasterID"], [])
            custody = None
            if item["rule"] == "default_bail":
                custody = next((a for a in case_accused if a["name"] == item["accused_name"]), None)
                if custody:
                    custody = {**custody, "age": item["accused_age"], "arrested": item["start_date"]}
            item["custody"] = custody
            item["accused"] = case_accused[:3]
            item["reach"] = (custody or {}).get("districts") or max(
                (a["districts"] for a in case_accused), default=0
            )
            expiring_out.append(item)
        expiring_out.sort(key=lambda e: (-e["reach"], e["days_left"]))
        expiring_out = expiring_out[:8]

    rules = []
    for meta in RULEBOOK:
        c = counts.get(meta["id"], {})
        rules.append({
            **meta,
            "counts": {b: c.get(b, 0) for b in ("breached", "critical", "warning", "on_track")} if meta["live"] else None,
        })

    def rate(r):
        return round(100.0 * (r["on_time"] or 0) / r["filed"], 1) if r and r["filed"] else None

    bail = counts.get("default_bail", {})
    return {
        "as_of": (as_of or "")[:10],
        "critical_days": CRITICAL_DAYS,
        "headline": {
            "bail_critical": bail.get("critical", 0),
            "bail_breached": bail.get("breached", 0),
            "sexual_breached": counts.get("sexual_offence", {}).get("breached", 0),
            "on_time_rate": rate(overall),
            "filed": overall["filed"] if overall else 0,
        },
        "unit_level": "district" if level == "all" else "station",
        "units": [
            {
                "name": r["name"],
                "breached": r["breached"] or 0,
                "critical": r["critical"] or 0,
                "on_time_rate": rate(unit_hist.get(r["name"])),
            }
            for r in unit_rows
        ],
        "rules": rules,
        "expiring": expiring_out,
    }
