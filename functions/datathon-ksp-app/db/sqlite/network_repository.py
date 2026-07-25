from typing import Optional
from datetime import datetime, timedelta
from collections import Counter, defaultdict

from db.sqlite.sqlite import get_connection


class NetworkRepository:

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------
    def search(self, q: str):
        with get_connection() as conn:
            people = conn.execute(
                """
                SELECT DISTINCT a.AccusedName AS name,
                   COUNT(DISTINCT a.CaseMasterID) AS case_count,
                   'person' AS type
                FROM Accused a
                WHERE a.AccusedName LIKE ?
                GROUP BY a.AccusedName
                ORDER BY case_count DESC
                LIMIT 20
                """,
                (f"%{q}%",),
            ).fetchall()

            cases = conn.execute(
                """
                SELECT cm.CaseMasterID AS id,
                       cm.CrimeNo AS label,
                       'case' AS type
                FROM CaseMaster cm
                WHERE cm.CrimeNo LIKE ?
                LIMIT 20
                """,
                (f"%{q}%",),
            ).fetchall()

            stations = conn.execute(
                """
                SELECT u.UnitID AS id,
                       u.UnitName AS label,
                       'station' AS type
                FROM Unit u
                WHERE u.UnitName LIKE ?
                LIMIT 10
                """,
                (f"%{q}%",),
            ).fetchall()

            return {
                "people": [dict(r) for r in people],
                "cases": [dict(r) for r in cases],
                "stations": [dict(r) for r in stations],
            }

    # ------------------------------------------------------------------
    # Person Profile
    # ------------------------------------------------------------------
    def get_person_profile(self, person_name: str):
        with get_connection() as conn:
            cases = conn.execute(
                """
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
                ORDER BY cm.CrimeRegisteredDate DESC
                """,
                (person_name,),
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
                """
                SELECT COUNT(DISTINCT ar.ArrestSurrenderID) AS cnt
                FROM Accused a
                JOIN ArrestSurrender ar ON a.AccusedMasterID = ar.AccusedMasterID
                WHERE a.AccusedName = ?
                """,
                (person_name,),
            ).fetchone()["cnt"]

            most_common_crime = crime_counter.most_common(1)[0][0] if crime_counter else "Unknown"

            network_score = min(100, fir_count * 8 + len(station_ids) * 5 + len(district_names) * 3 + arrest_count * 4)
            if recent_count > 0:
                network_score = min(100, network_score + 15)

            rank_pct = "Top 5%" if network_score >= 80 else "Top 15%" if network_score >= 60 else "Top 30%" if network_score >= 40 else "Moderate"

            associates = conn.execute(
                """
                SELECT a2.AccusedName AS name,
                       COUNT(DISTINCT a2.CaseMasterID) AS shared_firs
                FROM Accused a1
                JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                WHERE a1.AccusedName = ?
                  AND a2.AccusedName != ?
                  AND a2.AccusedName IS NOT NULL
                GROUP BY a2.AccusedName
                ORDER BY shared_firs DESC
                LIMIT 20
                """,
                (person_name, person_name),
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
    def get_person_graph(self, person_name: str, depth: int = 1):
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
                """
                SELECT DISTINCT cm.CaseMasterID, cm.CrimeNo, ch.CrimeGroupName,
                       u.UnitName, d.DistrictName
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
                LEFT JOIN District d ON u.DistrictID = d.DistrictID
                WHERE a.AccusedName = ?
                ORDER BY cm.CrimeRegisteredDate DESC
                LIMIT 30
                """,
                (person_name,),
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
    def get_associates(self, person_name: str):
        with get_connection() as conn:
            rows = conn.execute(
                """
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
                GROUP BY a2.AccusedName
                ORDER BY shared_firs DESC
                LIMIT 50
                """,
                (person_name, person_name),
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Timeline
    # ------------------------------------------------------------------
    def get_timeline(self, person_name: str):
        with get_connection() as conn:
            events = []

            fir_events = conn.execute(
                """
                SELECT cm.CrimeRegisteredDate AS event_date,
                       'FIR Registered' AS event_type,
                       cm.CrimeNo AS ref,
                       ch.CrimeGroupName AS detail
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE a.AccusedName = ?
                  AND cm.CrimeRegisteredDate IS NOT NULL
                """,
                (person_name,),
            ).fetchall()
            for e in fir_events:
                events.append({
                    "date": e["event_date"],
                    "type": "FIR",
                    "title": f"FIR Registered - {e['ref']}",
                    "detail": e["detail"] or "",
                })

            arrest_events = conn.execute(
                """
                SELECT ar.ArrestSurrenderDate AS event_date,
                       cm.CrimeNo AS ref
                FROM Accused a
                JOIN ArrestSurrender ar ON a.AccusedMasterID = ar.AccusedMasterID
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName = ?
                  AND ar.ArrestSurrenderDate IS NOT NULL
                """,
                (person_name,),
            ).fetchall()
            for e in arrest_events:
                events.append({
                    "date": e["event_date"],
                    "type": "Arrest",
                    "title": f"Arrested - {e['ref']}",
                    "detail": "",
                })

            chargesheet_events = conn.execute(
                """
                SELECT cs.csdate AS event_date,
                       cm.CrimeNo AS ref
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN ChargesheetDetails cs ON cm.CaseMasterID = cs.CaseMasterID
                WHERE a.AccusedName = ?
                  AND cs.csdate IS NOT NULL
                """,
                (person_name,),
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
    def get_analytics(self, person_name: str):
        with get_connection() as conn:
            fir_count = conn.execute(
                "SELECT COUNT(*) AS cnt FROM Accused WHERE AccusedName = ?",
                (person_name,),
            ).fetchone()["cnt"]

            arrest_count = conn.execute(
                """
                SELECT COUNT(DISTINCT ar.ArrestSurrenderID) AS cnt
                FROM Accused a
                JOIN ArrestSurrender ar ON a.AccusedMasterID = ar.AccusedMasterID
                WHERE a.AccusedName = ?
                """,
                (person_name,),
            ).fetchone()["cnt"]

            stations = conn.execute(
                """
                SELECT COUNT(DISTINCT cm.PoliceStationID) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName = ?
                """,
                (person_name,),
            ).fetchone()["cnt"]

            districts = conn.execute(
                """
                SELECT COUNT(DISTINCT u.DistrictID) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE a.AccusedName = ?
                """,
                (person_name,),
            ).fetchone()["cnt"]

            years_active = conn.execute(
                """
                SELECT COUNT(DISTINCT strftime('%Y', cm.CrimeRegisteredDate)) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName = ? AND cm.CrimeRegisteredDate IS NOT NULL
                """,
                (person_name,),
            ).fetchone()["cnt"]

            crime_types = conn.execute(
                """
                SELECT ch.CrimeGroupName, COUNT(*) AS cnt
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE a.AccusedName = ?
                GROUP BY ch.CrimeGroupName
                ORDER BY cnt DESC
                """,
                (person_name,),
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
    def get_communities(self):
        with get_connection() as conn:
            co_accused_pairs = conn.execute(
                """
                SELECT a1.AccusedName AS name1, a2.AccusedName AS name2,
                       COUNT(DISTINCT a1.CaseMasterID) AS weight
                FROM Accused a1
                JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                WHERE a1.AccusedName < a2.AccusedName
                  AND a1.AccusedName IS NOT NULL
                  AND a2.AccusedName IS NOT NULL
                GROUP BY a1.AccusedName, a2.AccusedName
                HAVING weight >= 2
                ORDER BY weight DESC
                """,
            ).fetchall()

            pairs = [(r["name1"], r["name2"], r["weight"]) for r in co_accused_pairs]

            adj = defaultdict(set)
            for n1, n2, _ in pairs:
                adj[n1].add(n2)
                adj[n2].add(n1)

            all_names = set()
            for n1, n2, _ in pairs:
                all_names.add(n1)
                all_names.add(n2)

            visited = set()
            communities = []

            for name in all_names:
                if name in visited:
                    continue
                stack = [name]
                component = set()
                while stack:
                    cur = stack.pop()
                    if cur in visited:
                        continue
                    visited.add(cur)
                    component.add(cur)
                    for neighbor in adj[cur]:
                        if neighbor not in visited:
                            stack.append(neighbor)
                if len(component) >= 2:
                    communities.append(list(component))

            result = []
            for comp in communities:
                member_count = len(comp)
                fir_counts = []
                station_set = set()
                for m in comp:
                    row = conn.execute(
                        "SELECT COUNT(*) AS cnt FROM Accused WHERE AccusedName = ?",
                        (m,),
                    ).fetchone()
                    fir_counts.append(row["cnt"])
                    station_rows = conn.execute(
                        """
                        SELECT DISTINCT cm.PoliceStationID
                        FROM Accused a
                        JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                        WHERE a.AccusedName = ?
                        """,
                        (m,),
                    ).fetchall()
                    for sr in station_rows:
                        station_set.add(sr["PoliceStationID"])

                result.append({
                    "members": comp,
                    "member_count": member_count,
                    "total_firs": sum(fir_counts),
                    "stations_covered": len(station_set),
                    "risk": "Very High" if member_count >= 10 or sum(fir_counts) >= 30
                            else "High" if member_count >= 5 or sum(fir_counts) >= 15
                            else "Medium",
                })

            result.sort(key=lambda x: x["total_firs"], reverse=True)
            return result

    # ------------------------------------------------------------------
    # Bridge Individuals (degree centrality approximation)
    # ------------------------------------------------------------------
    def get_bridge_individuals(self, limit: int = 20):
        with get_connection() as conn:
            rows = conn.execute(
                """
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
                GROUP BY a.AccusedName
                HAVING fir_count >= 2
                ORDER BY unique_associates DESC, fir_count DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Summary / Landing Page stats
    # ------------------------------------------------------------------
    def get_summary(self):
        with get_connection() as conn:
            repeat_offenders = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM (
                    SELECT AccusedName
                    FROM Accused
                    WHERE AccusedName IS NOT NULL
                    GROUP BY AccusedName
                    HAVING COUNT(DISTINCT CaseMasterID) > 1
                )
                """
            ).fetchone()["cnt"]

            criminal_groups = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM (
                    SELECT a1.AccusedName
                    FROM Accused a1
                    JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                    WHERE a1.AccusedName < a2.AccusedName
                    GROUP BY a1.AccusedName, a2.AccusedName
                    HAVING COUNT(DISTINCT a1.CaseMasterID) >= 2
                )
                """
            ).fetchone()["cnt"]

            high_risk = conn.execute(
                """
                SELECT COUNT(*) AS cnt
                FROM (
                    SELECT AccusedName
                    FROM Accused
                    WHERE AccusedName IS NOT NULL
                    GROUP BY AccusedName
                    HAVING COUNT(DISTINCT CaseMasterID) >= 5
                )
                """
            ).fetchone()["cnt"]

            return {
                "repeat_offenders": repeat_offenders,
                "criminal_groups": criminal_groups // 2,
                "bridge_individuals": 0,
                "high_risk_networks": high_risk,
            }
