"""Investigating-officer supervision for district and station command.

Who is investigating the open cases, at what rank, how loaded each officer
is, and where cases are sliding toward BNSS limits. Reassignment output is a
*suggestion* for the supervising officer to act on — nothing is changed.
"""

from db.sqlite.sqlite import get_connection
from db.sqlite.sqlite_investigation_repository import SQLiteInvestigationRepository
from services import bnss_service as bnss

# Rank.Hierarchy: 7 Inspector, 8 Sub-Inspector, 9 ASI, 10 Head Constable,
# 11 Police Constable. Investigation is normally led by an SI or above;
# Head Constables / Constables are flagged.
IO_RANK_MAX = 9
SUPERVISORY = (7, 8)


def get_officer_supervision(scope: dict) -> dict:
    scope_sql, params = SQLiteInvestigationRepository._scope_clause(scope, "cm")

    with get_connection() as conn:
        officers = [dict(r) for r in conn.execute(
            f"""
            SELECT e.EmployeeID, TRIM(e.FirstName) AS name, r.RankName AS rank, r.Hierarchy AS hierarchy,
                   u.UnitID AS unit_id, u.UnitName AS station, u.DistrictID AS district_id,
                   COUNT(*) AS open_cases,
                   SUM(NOT EXISTS (SELECT 1 FROM ChargesheetDetails cs WHERE cs.CaseMasterID = cm.CaseMasterID)) AS no_chargesheet
            FROM CaseMaster cm
            JOIN Employee e ON e.EmployeeID = cm.PolicePersonID
            JOIN Rank r ON r.RankID = e.RankID
            JOIN Unit u ON u.UnitID = cm.PoliceStationID
            WHERE cm.CaseStatusID = 1 {scope_sql}
            GROUP BY e.EmployeeID, u.UnitID
            """,
            params,
        )]

        # Default-bail exposure per IO (adults in custody, no chargesheet).
        bail = {}
        for r in conn.execute(
            f"""
            SELECT cm.PolicePersonID AS emp, k.band, COUNT(*) AS n
            FROM ({bnss.clocks_sql(scope_sql)}) k
            JOIN CaseMaster cm ON cm.CaseMasterID = k.CaseMasterID
            WHERE k.rule = 'default_bail' AND k.band IN ('breached', 'critical')
            GROUP BY cm.PolicePersonID, k.band
            """,
            params,
        ):
            bail.setdefault(r["emp"], {})[r["band"]] = r["n"]

        # Officers who could take cases over: SIs / Inspectors posted in scope,
        # with their current open load (zero if they hold no cases).
        candidates = [dict(r) for r in conn.execute(
            f"""
            SELECT e.EmployeeID, TRIM(e.FirstName) AS name, r.RankName AS rank, e.UnitID AS unit_id,
                   u.UnitName AS station, u.DistrictID AS district_id,
                   (SELECT COUNT(*) FROM CaseMaster c2 WHERE c2.PolicePersonID = e.EmployeeID AND c2.CaseStatusID = 1) AS load
            FROM Employee e
            JOIN Rank r ON r.RankID = e.RankID
            JOIN Unit u ON u.UnitID = e.UnitID
            WHERE r.Hierarchy IN ({",".join(map(str, SUPERVISORY))})
              AND e.UnitID IN (
                  SELECT DISTINCT cm.PoliceStationID FROM CaseMaster cm WHERE 1 = 1 {scope_sql}
              )
            """,
            params,
        )]

    total_open = sum(o["open_cases"] for o in officers)
    for o in officers:
        b = bail.get(o["EmployeeID"], {})
        o["bail_breached"] = b.get("breached", 0)
        o["bail_critical"] = b.get("critical", 0)
        o["below_rank"] = (o["hierarchy"] or 99) > IO_RANK_MAX

    below = [o for o in officers if o["below_rank"]]
    si_plus = [o for o in officers if (o["hierarchy"] or 99) in SUPERVISORY]

    # Suggestions: move an under-ranked IO's pending cases to the least-loaded
    # SI/Inspector at the same station (else in the same district). Load is
    # updated as suggestions are made so one officer isn't swamped.
    load = {c["EmployeeID"]: c["load"] for c in candidates}
    suggestions = []
    for o in sorted(below, key=lambda x: (-(x["bail_breached"] + x["bail_critical"]), -x["no_chargesheet"])):
        if not o["no_chargesheet"]:
            continue
        pool = [c for c in candidates if c["unit_id"] == o["unit_id"]] or [
            c for c in candidates if c["district_id"] == o["district_id"]
        ]
        if not pool:
            continue
        target = min(pool, key=lambda c: load[c["EmployeeID"]])
        suggestions.append({
            "from": {"name": o["name"], "rank": o["rank"], "station": o["station"]},
            "cases": o["no_chargesheet"],
            "bail_exposure": o["bail_breached"] + o["bail_critical"],
            "to": {"name": target["name"], "rank": target["rank"], "station": target["station"],
                   "load": target["load"]},
            "same_station": target["unit_id"] == o["unit_id"],
        })
        load[target["EmployeeID"]] += o["no_chargesheet"]
        if len(suggestions) >= 8:
            break

    officers.sort(key=lambda o: (-(o["bail_breached"] + o["bail_critical"]), not o["below_rank"], -o["open_cases"]))
    return {
        "as_of": bnss.data_as_of(),
        "summary": {
            "open_cases": total_open,
            "officers": len(officers),
            "below_rank_cases": sum(o["open_cases"] for o in below),
            "below_rank_share": round(100.0 * sum(o["open_cases"] for o in below) / total_open, 1) if total_open else 0,
            "si_plus_cases": sum(o["open_cases"] for o in si_plus),
            "bail_exposed_officers": sum(1 for o in officers if o["bail_breached"] or o["bail_critical"]),
        },
        "officers": [
            {k: o[k] for k in ("name", "rank", "hierarchy", "station", "open_cases", "no_chargesheet",
                               "bail_breached", "bail_critical", "below_rank")}
            for o in officers[:40]
        ],
        "suggestions": suggestions,
    }
