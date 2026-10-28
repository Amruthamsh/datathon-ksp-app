"""Cross-border offenders: accused in the caller's jurisdiction who also
appear in FIRs elsewhere.

Privacy by design: for other districts only the district name and FIR count
are returned — never case details. Coordination happens SP-to-SP.
"""

import math

from db.sqlite.sqlite import get_connection
from db.sqlite.sqlite_investigation_repository import SQLiteInvestigationRepository
from db.sqlite.crime_map_repository import _KARNATAKA_DISTRICT_CENTERS

# District centres closer than this (degrees, ~70 km) are treated as
# neighbours — an approximation until real adjacency data is wired in.
NEIGHBOUR_DEG = 0.65

# Repeat offenders only: a single FIR in each of two districts is as likely
# to be two different people sharing a name (matching is by name).
MIN_FIRS = 3


def _near(a: str, b: str) -> bool:
    ca, cb = _KARNATAKA_DISTRICT_CENTERS.get(a), _KARNATAKA_DISTRICT_CENTERS.get(b)
    return bool(ca and cb) and math.dist(ca, cb) <= NEIGHBOUR_DEG


def get_cross_border(scope: dict, limit: int = 15) -> dict:
    scope_sql, params = SQLiteInvestigationRepository._scope_clause(scope, "cm")
    with get_connection() as conn:
        home = conn.execute(
            f"""
            SELECT d.DistrictName FROM CaseMaster cm
            JOIN Unit u ON u.UnitID = cm.PoliceStationID JOIN District d ON d.DistrictID = u.DistrictID
            WHERE 1 = 1 {scope_sql} GROUP BY d.DistrictName ORDER BY COUNT(*) DESC LIMIT 1
            """,
            params,
        ).fetchone()
        home = home[0] if home else None

        rows = conn.execute(
            f"""
            WITH mine AS (
                SELECT DISTINCT a.AccusedName FROM Accused a
                JOIN CaseMaster cm ON cm.CaseMasterID = a.CaseMasterID
                WHERE a.AccusedName IS NOT NULL {scope_sql}
            )
            SELECT a.AccusedName AS name, d.DistrictName AS district,
                   COUNT(DISTINCT a.CaseMasterID) AS firs
            FROM Accused a
            JOIN CaseMaster cm ON cm.CaseMasterID = a.CaseMasterID
            JOIN Unit u ON u.UnitID = cm.PoliceStationID
            JOIN District d ON d.DistrictID = u.DistrictID
            WHERE a.AccusedName IN (SELECT AccusedName FROM mine)
            GROUP BY a.AccusedName, d.DistrictName
            """,
            params,
        ).fetchall()

    people: dict[str, dict] = {}
    for r in rows:
        p = people.setdefault(r["name"], {"name": r["name"], "firs_here": 0, "elsewhere": []})
        if r["district"] == home:
            p["firs_here"] += r["firs"]
        else:
            p["elsewhere"].append({"district": r["district"], "firs": r["firs"], "nearby": _near(home, r["district"])})

    out = []
    for p in people.values():
        if not p["elsewhere"]:
            continue
        if p["firs_here"] + sum(e["firs"] for e in p["elsewhere"]) < MIN_FIRS:
            continue
        p["elsewhere"].sort(key=lambda e: (not e["nearby"], -e["firs"], e["district"]))
        p["districts"] = 1 + len(p["elsewhere"])
        p["firs_total"] = p["firs_here"] + sum(e["firs"] for e in p["elsewhere"])
        p["nearby"] = [e["district"] for e in p["elsewhere"] if e["nearby"]]
        out.append(p)

    # Offenders working the border first (a neighbouring SP can act today),
    # then by how many districts they reach.
    out.sort(key=lambda p: (-len(p["nearby"]), -p["districts"], -p["firs_total"], p["name"]))
    return {
        "home": home,
        "min_firs": MIN_FIRS,
        "total": len(out),
        "with_neighbours": sum(1 for p in out if p["nearby"]),
        "people": out[:limit],
    }
