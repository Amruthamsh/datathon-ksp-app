from typing import Optional
from datetime import datetime, timedelta
from collections import Counter

from db.sqlite.sqlite import get_connection


class NetworkRepository:

    @staticmethod
    def _scope_filter(scope: dict | None, alias: str = "cm") -> tuple[str, list]:
        """RBAC filter on CaseMaster (mirror of investigations repo).

        all -> no filter; district -> stations in officer's district;
        unit -> officer's station; self -> cases assigned to officer.
        """
        if not scope:
            return "", []
        level = scope.get("level", "self")
        if level == "all":
            return "", []
        if level == "district" and scope.get("district_id") is not None:
            return (
                f" AND {alias}.PoliceStationID IN "
                "(SELECT UnitID FROM Unit WHERE DistrictID = ?)",
                [scope["district_id"]],
            )
        if level == "unit" and scope.get("unit_id") is not None:
            return (f" AND {alias}.PoliceStationID = ?", [scope["unit_id"]])
        if scope.get("employee_id") is not None:
            return (f" AND {alias}.PolicePersonID = ?", [scope["employee_id"]])
        return (" AND 1 = 0", [])

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------
    def search(self, q: str, scope: dict | None = None):
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            people = conn.execute(
                f"""
                SELECT DISTINCT a.AccusedName AS name,
                   COUNT(DISTINCT a.CaseMasterID) AS case_count,
                   'person' AS type
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName LIKE ?
                {scope_sql}
                GROUP BY a.AccusedName
                ORDER BY case_count DESC
                LIMIT 20
                """,
                ([f"%{q}%"] + scope_params),
            ).fetchall()

            cases = conn.execute(
                f"""
                SELECT cm.CaseMasterID AS id,
                       cm.CrimeNo AS label,
                       'case' AS type
                FROM CaseMaster cm
                WHERE cm.CrimeNo LIKE ?
                {scope_sql}
                LIMIT 20
                """,
                ([f"%{q}%"] + scope_params),
            ).fetchall()

            level = (scope or {}).get("level", "self") if scope else "all"
            if level == "all":
                station_sql, station_params = "", []
            elif level == "district" and (scope or {}).get("district_id") is not None:
                station_sql, station_params = " AND u.DistrictID = ?", [scope["district_id"]]
            elif level == "unit" and (scope or {}).get("unit_id") is not None:
                station_sql, station_params = " AND u.UnitID = ?", [scope["unit_id"]]
            elif (scope or {}).get("employee_id") is not None:
                station_sql, station_params = (
                    " AND EXISTS (SELECT 1 FROM CaseMaster cm2"
                    " WHERE cm2.PoliceStationID = u.UnitID AND cm2.PolicePersonID = ?)",
                    [scope["employee_id"]],
                )
            else:
                station_sql, station_params = " AND 1 = 0", []
            stations = conn.execute(
                f"""
                SELECT u.UnitID AS id,
                       u.UnitName AS label,
                       'station' AS type
                FROM Unit u
                WHERE u.UnitName LIKE ?
                {station_sql}
                LIMIT 10
                """,
                ([f"%{q}%"] + station_params),
            ).fetchall()

            return {
                "people": [dict(r) for r in people],
                "cases": [dict(r) for r in cases],
                "stations": [dict(r) for r in stations],
            }

    # ------------------------------------------------------------------
    # Person Profile
    # ------------------------------------------------------------------
    def get_person_profile(self, person_name: str, scope: dict | None = None):
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            cases = conn.execute(
                f"""
                SELECT cm.CaseMasterID,
                       cm.CrimeNo,
                       cm.CrimeRegisteredDate,
                       ch.CrimeGroupName,
                       go.LookupValue AS Gravity,
                       u.UnitName AS Station,
                       d.DistrictName
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
                LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                WHERE a.AccusedName = ?
                {scope_sql}
                ORDER BY cm.CrimeRegisteredDate DESC
                """,
                ([person_name] + scope_params),
            ).fetchall()
            case_list = [dict(r) for r in cases]

            fir_count = len(case_list)
            station_ids = set()
            district_names = set()
            crime_counter = Counter()
            recent_count = 0
            ninety_days_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
            sixty_days_ago = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")

            for c in case_list:
                station_ids.add(c["Station"])
                district_names.add(c["DistrictName"])
                crime_counter[c["CrimeGroupName"]] += 1
                if c["CrimeRegisteredDate"] and c["CrimeRegisteredDate"] >= ninety_days_ago:
                    recent_count += 1

            sixty_day_count = sum(
                1 for c in case_list
                if c["CrimeRegisteredDate"] and c["CrimeRegisteredDate"] >= sixty_days_ago
            )

            arrest_count = conn.execute(
                f"""
                SELECT COUNT(DISTINCT ar.ArrestSurrenderID) AS cnt
                FROM Accused a
                JOIN ArrestSurrender ar ON a.AccusedMasterID = ar.AccusedMasterID
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName = ?
                {scope_sql}
                """,
                ([person_name] + scope_params),
            ).fetchone()["cnt"]

            most_common_crime = crime_counter.most_common(1)[0][0] if crime_counter else "Unknown"

            network_score = min(100, fir_count * 8 + len(station_ids) * 5 + len(district_names) * 3 + arrest_count * 4)
            if recent_count > 0:
                network_score = min(100, network_score + 15)

            rank_pct = "Top 5%" if network_score >= 80 else "Top 15%" if network_score >= 60 else "Top 30%" if network_score >= 40 else "Moderate"

            associates = conn.execute(
                f"""
                SELECT a2.AccusedName AS name,
                       COUNT(DISTINCT a2.CaseMasterID) AS shared_firs
                FROM Accused a1
                JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                JOIN CaseMaster cm ON a1.CaseMasterID = cm.CaseMasterID
                WHERE a1.AccusedName = ?
                  AND a2.AccusedName != ?
                  AND a2.AccusedName IS NOT NULL
                {scope_sql}
                GROUP BY a2.AccusedName
                ORDER BY shared_firs DESC
                LIMIT 20
                """,
                ([person_name, person_name] + scope_params),
            ).fetchall()

            return {
                "person": {
                    "name": person_name,
                    "fir_count": fir_count,
                    "arrest_count": arrest_count,
                    "station_count": len(station_ids),
                    "district_count": len(district_names),
                    "most_common_crime": most_common_crime,
                    "recent_activity_60d": sixty_day_count,
                    "recent_activity_90d": recent_count,
                    "network_score": network_score,
                    "network_rank": rank_pct,
                    "known_associates": len(associates),
                    "stations": list(station_ids),
                    "districts": list(district_names),
                },
                "recent_firs": case_list[:10],
                "associates": [dict(r) for r in associates],
            }

    # ------------------------------------------------------------------
    # Person Graph (nodes + edges for Cytoscape)
    # ------------------------------------------------------------------
    def get_person_graph(self, person_name: str, depth: int = 1, scope: dict | None = None):
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            nodes = {}
            edges = []
            added = set()
            edge_keys = set()

            def add_node(nid, label, ntype, details=""):
                if nid not in added:
                    nodes[nid] = {"data": {"id": nid, "label": label, "type": ntype, "details": details}}
                    added.add(nid)

            def add_edge(eid, source, target, label, rel_type):
                if eid not in edge_keys:
                    edges.append({"data": {"id": eid, "source": source, "target": target, "label": label, "relType": rel_type, "lineStyle": "solid" if rel_type != "semantic" else "dotted"}})
                    edge_keys.add(eid)

            person_id = f"person_{person_name.replace(' ', '_')}"
            add_node(person_id, person_name, "accused", "Primary Subject")

            cases = conn.execute(
                f"""
                SELECT DISTINCT cm.CaseMasterID, cm.CrimeNo, ch.CrimeGroupName,
                       u.UnitName, d.DistrictName
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                WHERE a.AccusedName = ?
                {scope_sql}
                ORDER BY cm.CrimeRegisteredDate DESC
                LIMIT 30
                """,
                ([person_name] + scope_params),
            ).fetchall()

            for c in cases:
                cid = f"case_{c['CaseMasterID']}"
                add_node(cid, c["CrimeNo"], "case", c["CrimeGroupName"] or "FIR")
                add_edge(f"e_{person_id}_{cid}", person_id, cid, "Accused In", "person")

                station_key = f"station_{c['UnitName']}"
                add_node(station_key, c["UnitName"], "station", c["DistrictName"] or "")
                add_edge(f"e_{cid}_{station_key}", cid, station_key, "Jurisdiction", "station")

            if depth > 0:
                for c in cases:
                    cid = f"case_{c['CaseMasterID']}"
                    co_accused = conn.execute(
                        """
                        SELECT a.AccusedName, a.AccusedMasterID
                        FROM Accused a
                        WHERE a.CaseMasterID = ? AND a.AccusedName != ? AND a.AccusedName IS NOT NULL
                        LIMIT 10
                        """,
                        (c["CaseMasterID"], person_name),
                    ).fetchall()
                    for co in co_accused:
                        co_name = co["AccusedName"]
                        co_id = f"person_{co_name.replace(' ', '_')}"
                        add_node(co_id, co_name, "accused", "Co-Accused")
                        add_edge(f"e_{cid}_{co_id}", cid, co_id, "Accused In", "person")
                        add_edge(f"e_{person_id}_{co_id}_shared", person_id, co_id, "Co-Accused", "semantic")

            return {"nodes": list(nodes.values()), "edges": edges}

    # ------------------------------------------------------------------
    # Associates
    # ------------------------------------------------------------------
    def get_associates(self, person_name: str, scope: dict | None = None):
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT a2.AccusedName AS name,
                       COUNT(DISTINCT a2.CaseMasterID) AS shared_firs,
                       COUNT(DISTINCT ar.ArrestSurrenderID) AS shared_arrests,
                       COUNT(DISTINCT cm.PoliceStationID) AS stations,
                       MAX(cm.CrimeRegisteredDate) AS last_seen
                FROM Accused a1
                JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                JOIN CaseMaster cm ON a1.CaseMasterID = cm.CaseMasterID
                LEFT JOIN ArrestSurrender ar ON a2.AccusedMasterID = ar.AccusedMasterID
                WHERE a1.AccusedName = ?
                  AND a2.AccusedName != ?
                  AND a2.AccusedName IS NOT NULL
                {scope_sql}
                GROUP BY a2.AccusedName
                ORDER BY shared_firs DESC
                LIMIT 50
                """,
                ([person_name, person_name] + scope_params),
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Timeline
    # ------------------------------------------------------------------
    def get_timeline(self, person_name: str, scope: dict | None = None):
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            events = []

            fir_events = conn.execute(
                f"""
                SELECT cm.CrimeRegisteredDate AS event_date,
                       'FIR Registered' AS event_type,
                       cm.CrimeNo AS ref,
                       ch.CrimeGroupName AS detail
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE a.AccusedName = ?
                  AND cm.CrimeRegisteredDate IS NOT NULL
                {scope_sql}
                """,
                ([person_name] + scope_params),
            ).fetchall()
            for e in fir_events:
                events.append({
                    "date": e["event_date"],
                    "type": "FIR",
                    "title": f"FIR Registered - {e['ref']}",
                    "detail": e["detail"] or "",
                })

            arrest_events = conn.execute(
                f"""
                SELECT ar.ArrestSurrenderDate AS event_date,
                       cm.CrimeNo AS ref
                FROM Accused a
                JOIN ArrestSurrender ar ON a.AccusedMasterID = ar.AccusedMasterID
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName = ?
                  AND ar.ArrestSurrenderDate IS NOT NULL
                {scope_sql}
                """,
                ([person_name] + scope_params),
            ).fetchall()
            for e in arrest_events:
                events.append({
                    "date": e["event_date"],
                    "type": "Arrest",
                    "title": f"Arrested - {e['ref']}",
                    "detail": "",
                })

            chargesheet_events = conn.execute(
                f"""
                SELECT cs.csdate AS event_date,
                       cm.CrimeNo AS ref
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN ChargesheetDetails cs ON cm.CaseMasterID = cs.CaseMasterID
                WHERE a.AccusedName = ?
                  AND cs.csdate IS NOT NULL
                {scope_sql}
                """,
                ([person_name] + scope_params),
            ).fetchall()
            for e in chargesheet_events:
                events.append({
                    "date": e["event_date"],
                    "type": "Chargesheet",
                    "title": f"Chargesheet Filed - {e['ref']}",
                    "detail": "",
                })

            events.sort(key=lambda x: x["date"] or "")
            return events

    # ------------------------------------------------------------------
    # Analytics
    # ------------------------------------------------------------------
    def get_analytics(self, person_name: str, scope: dict | None = None):
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            fir_count = conn.execute(
                f"""SELECT COUNT(*) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE AccusedName = ?
                {scope_sql}""",
                ([person_name] + scope_params),
            ).fetchone()["cnt"]

            arrest_count = conn.execute(
                f"""
                SELECT COUNT(DISTINCT ar.ArrestSurrenderID) AS cnt
                FROM Accused a
                JOIN ArrestSurrender ar ON a.AccusedMasterID = ar.AccusedMasterID
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName = ?
                {scope_sql}
                """,
                ([person_name] + scope_params),
            ).fetchone()["cnt"]

            stations = conn.execute(
                f"""
                SELECT COUNT(DISTINCT cm.PoliceStationID) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName = ?
                {scope_sql}
                """,
                ([person_name] + scope_params),
            ).fetchone()["cnt"]

            districts = conn.execute(
                f"""
                SELECT COUNT(DISTINCT u.DistrictID) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE a.AccusedName = ?
                {scope_sql}
                """,
                ([person_name] + scope_params),
            ).fetchone()["cnt"]

            years_active = conn.execute(
                f"""
                SELECT COUNT(DISTINCT strftime('%Y', cm.CrimeRegisteredDate)) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName = ? AND cm.CrimeRegisteredDate IS NOT NULL
                {scope_sql}
                """,
                ([person_name] + scope_params),
            ).fetchone()["cnt"]

            crime_types = conn.execute(
                f"""
                SELECT ch.CrimeGroupName, COUNT(*) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE a.AccusedName = ?
                {scope_sql}
                GROUP BY ch.CrimeGroupName
                ORDER BY cnt DESC
                """,
                ([person_name] + scope_params),
            ).fetchall()

            return {
                "fir_count": fir_count,
                "arrest_count": arrest_count,
                "station_count": stations,
                "district_count": districts,
                "active_years": years_active,
                "crime_types": [dict(r) for r in crime_types],
            }

    # ------------------------------------------------------------------
    # Networks (Connected Components)
    # ------------------------------------------------------------------
    def get_communities(self, scope: dict | None = None, limit: int = 100):
        """Co-offending groups: sets of accused charged in the same FIR.

        The previous repeat-pair formulation (same name-pair co-occurring in
        2+ FIRs) yields zero groups on realistic data where accused names
        rarely repeat across cases, leaving the Criminal Groups /
        High-Risk Networks views permanently empty. A per-case co-accused
        set is the atomic co-offending cluster; groups are ranked by total
        FIR volume across members so the most active clusters surface first.

        Return shape is unchanged: members / member_count / total_firs /
        stations_covered / risk. Only the top `limit` groups are enriched
        and returned (callers render a handful of rows/cards).
        """
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            # 1) Co-accused sets per in-scope case (2+ accused).
            rows = conn.execute(
                f"""
                SELECT cm.CaseMasterID AS cid,
                       GROUP_CONCAT(a.AccusedName, char(31)) AS names
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName IS NOT NULL
                {scope_sql}
                GROUP BY cm.CaseMasterID
                HAVING COUNT(*) >= 2
                """,
                scope_params,
            ).fetchall()
            if not rows:
                return []

            # 2) Scoped FIR volume per accused name (single aggregate).
            fir_counts = {
                r["name"]: r["c"]
                for r in conn.execute(
                    f"""
                    SELECT a.AccusedName AS name,
                           COUNT(DISTINCT a.CaseMasterID) AS c
                    FROM Accused a
                    JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                    WHERE a.AccusedName IS NOT NULL
                    {scope_sql}
                    GROUP BY a.AccusedName
                    """,
                    scope_params,
                ).fetchall()
            }

            groups = []
            for r in rows:
                members = (r["names"] or "").split(chr(31))
                members = [m for m in members if m]
                if len(members) < 2:
                    continue
                groups.append({
                    "cid": r["cid"],
                    "members": members,
                    "member_count": len(members),
                    "total_firs": sum(fir_counts.get(m, 0) for m in members),
                })
            # Most active clusters first; deterministic tie-breaks.
            groups.sort(
                key=lambda g: (-g["total_firs"], -g["member_count"], g["cid"]),
            )
            top = groups[:limit]
            if not top:
                return []

            # 3) Stations covered per top group (one batched lookup).
            member_names = list({m for g in top for m in g["members"]})
            station_map: dict[str, set] = {}
            for i in range(0, len(member_names), 500):
                chunk = member_names[i:i + 500]
                placeholders = ",".join("?" * len(chunk))
                for nr in conn.execute(
                    f"""
                    SELECT a.AccusedName AS name,
                           cm.PoliceStationID AS st
                    FROM Accused a
                    JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                    WHERE a.AccusedName IN ({placeholders})
                    {scope_sql}
                    GROUP BY a.AccusedName, cm.PoliceStationID
                    """,
                    (chunk + scope_params),
                ).fetchall():
                    station_map.setdefault(nr["name"], set()).add(nr["st"])

            result = []
            for g in top:
                stations: set = set()
                for m in g["members"]:
                    stations |= station_map.get(m, set())
                mc, tf = g["member_count"], g["total_firs"]
                result.append({
                    "members": g["members"],
                    "member_count": mc,
                    "total_firs": tf,
                    "stations_covered": len(stations),
                    "risk": "Very High" if mc >= 10 or tf >= 30
                            else "High" if mc >= 5 or tf >= 15
                            else "Medium",
                })
            return result

    # ------------------------------------------------------------------
    # Bridge Individuals (degree centrality approximation)
    # ------------------------------------------------------------------
    def get_bridge_individuals(self, limit: int = 20, scope: dict | None = None):
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            rows = conn.execute(
                f"""
                SELECT a.AccusedName AS name,
                       COUNT(DISTINCT a.CaseMasterID) AS fir_count,
                       COUNT(DISTINCT a2.AccusedName) AS unique_associates,
                       COUNT(DISTINCT cm.PoliceStationID) AS stations_covered,
                       COUNT(DISTINCT u.DistrictID) AS districts_covered
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN Accused a2 ON a.CaseMasterID = a2.CaseMasterID
                    AND a2.AccusedName != a.AccusedName
                    AND a2.AccusedName IS NOT NULL
                WHERE a.AccusedName IS NOT NULL
                {scope_sql}
                GROUP BY a.AccusedName
                HAVING fir_count >= 2
                ORDER BY unique_associates DESC, fir_count DESC
                LIMIT ?
                """,
                (scope_params + [limit]),
            ).fetchall()

            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Summary / Landing Page stats
    # ------------------------------------------------------------------
    def get_summary(self, scope: dict | None = None):
        scope_sql, scope_params = self._scope_filter(scope, "cm")
        with get_connection() as conn:
            repeat_offenders = conn.execute(
                f"""
                SELECT COUNT(*) AS cnt
                FROM (
                    SELECT a.AccusedName
                    FROM Accused a
                    JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                    WHERE a.AccusedName IS NOT NULL
                    {scope_sql}
                    GROUP BY a.AccusedName
                    HAVING COUNT(DISTINCT a.CaseMasterID) > 1
                )
                """,
                scope_params,
            ).fetchone()["cnt"]

            criminal_groups = conn.execute(
                f"""
                SELECT COUNT(*) AS cnt
                FROM (
                    SELECT a1.AccusedName
                    FROM Accused a1
                    JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                    JOIN CaseMaster cm ON a1.CaseMasterID = cm.CaseMasterID
                    WHERE a1.AccusedName < a2.AccusedName
                    {scope_sql}
                    GROUP BY a1.AccusedName, a2.AccusedName
                    HAVING COUNT(DISTINCT a1.CaseMasterID) >= 2
                )
                """,
                scope_params,
            ).fetchone()["cnt"]

            high_risk = conn.execute(
                f"""
                SELECT COUNT(*) AS cnt
                FROM (
                    SELECT a.AccusedName
                    FROM Accused a
                    JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                    WHERE a.AccusedName IS NOT NULL
                    {scope_sql}
                    GROUP BY a.AccusedName
                    HAVING COUNT(DISTINCT a.CaseMasterID) >= 5
                )
                """,
                scope_params,
            ).fetchone()["cnt"]

            return {
                "repeat_offenders": repeat_offenders,
                "criminal_groups": criminal_groups // 2,
                "bridge_individuals": 0,
                "high_risk_networks": high_risk,
            }
