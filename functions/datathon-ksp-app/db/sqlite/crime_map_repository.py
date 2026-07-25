from typing import Optional
from datetime import datetime, timedelta
from collections import Counter, defaultdict

from db.sqlite.sqlite import get_connection


class CrimeMapRepository:

    # ------------------------------------------------------------------
    # Summary Dashboard
    # ------------------------------------------------------------------
    def get_summary(self):
        with get_connection() as conn:
            total_crimes = conn.execute(
                "SELECT COUNT(*) AS cnt FROM CaseMaster"
            ).fetchone()["cnt"]

            thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            sixty_days_ago = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")

            recent_crimes = conn.execute(
                "SELECT COUNT(*) AS cnt FROM CaseMaster WHERE CrimeRegisteredDate >= ?",
                (thirty_days_ago,),
            ).fetchone()["cnt"]

            prev_period = conn.execute(
                "SELECT COUNT(*) AS cnt FROM CaseMaster WHERE CrimeRegisteredDate >= ? AND CrimeRegisteredDate < ?",
                (sixty_days_ago, thirty_days_ago),
            ).fetchone()["cnt"]

            emerging = max(0, recent_crimes - prev_period)

            repeat_offenders = conn.execute(
                """
                SELECT COUNT(*) AS cnt FROM (
                    SELECT AccusedName FROM Accused
                    WHERE AccusedName IS NOT NULL
                    GROUP BY AccusedName
                    HAVING COUNT(DISTINCT CaseMasterID) > 1
                )
                """
            ).fetchone()["cnt"]

            top_crime = conn.execute(
                """
                SELECT ch.CrimeGroupName, COUNT(*) AS cnt
                FROM CaseMaster cm
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                GROUP BY ch.CrimeGroupName
                ORDER BY cnt DESC
                LIMIT 1
                """
            ).fetchone()

            return {
                "total_crimes": total_crimes,
                "active_hotspots": recent_crimes,
                "emerging_hotspots": emerging,
                "repeat_offender_areas": repeat_offenders,
                "weather_alerts": 0,
                "today_risk": "HIGH" if emerging > 100 else "MEDIUM" if emerging > 50 else "LOW",
                "patrol_recommendations": emerging // 10 or 0,
            }

    # ------------------------------------------------------------------
    # Filters
    # ------------------------------------------------------------------
    def get_filters(self):
        with get_connection() as conn:
            districts = conn.execute(
                "SELECT DistrictID, DistrictName FROM District ORDER BY DistrictName"
            ).fetchall()

            stations = conn.execute(
                "SELECT UnitID, UnitName FROM Unit ORDER BY UnitName"
            ).fetchall()

            crime_heads = conn.execute(
                "SELECT CrimeHeadID, CrimeGroupName FROM CrimeHead ORDER BY CrimeGroupName"
            ).fetchall()

            gravity = conn.execute(
                "SELECT GravityOffenceID, LookupValue FROM GravityOffence ORDER BY LookupValue"
            ).fetchall()

            time_ranges = [
                {"id": "24h", "label": "Last 24 hours"},
                {"id": "7d", "label": "Last 7 days"},
                {"id": "30d", "label": "Last 30 days"},
                {"id": "90d", "label": "Last 90 days"},
            ]

            return {
                "districts": [dict(r) for r in districts],
                "stations": [dict(r) for r in stations],
                "crime_heads": [dict(r) for r in crime_heads],
                "gravity": [dict(r) for r in gravity],
                "time_ranges": time_ranges,
            }

    # ------------------------------------------------------------------
    # Heatmap
    # ------------------------------------------------------------------
    def get_heatmap(self, district=None, station=None, crime_head=None,
                    gravity=None, date_from=None, date_to=None, month=None):
        with get_connection() as conn:
            sql = """
                SELECT cm.latitude AS lat, cm.longitude AS lng,
                       COUNT(*) AS weight
                FROM CaseMaster cm
                WHERE cm.latitude IS NOT NULL AND cm.longitude IS NOT NULL
            """
            params = []

            if district:
                sql += " AND cm.PoliceStationID IN (SELECT UnitID FROM Unit WHERE DistrictID = ?)"
                params.append(district)
            if station:
                sql += " AND cm.PoliceStationID = ?"
                params.append(station)
            if crime_head:
                sql += " AND cm.CrimeMajorHeadID = ?"
                params.append(crime_head)
            if gravity:
                sql += " AND cm.GravityOffenceID = ?"
                params.append(gravity)
            if date_from:
                sql += " AND cm.CrimeRegisteredDate >= ?"
                params.append(date_from)
            if date_to:
                sql += " AND cm.CrimeRegisteredDate <= ?"
                params.append(date_to)
            if month:
                sql += " AND strftime('%Y-%m', cm.CrimeRegisteredDate) = ?"
                params.append(month)

            sql += " GROUP BY ROUND(cm.latitude, 2), ROUND(cm.longitude, 2) LIMIT 1000"

            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Clusters
    # ------------------------------------------------------------------
    def get_clusters(self, district=None, station=None, crime_head=None,
                     gravity=None, date_from=None, date_to=None, month=None):
        with get_connection() as conn:
            sql = """
                SELECT AVG(cm.latitude) AS center_lat,
                       AVG(cm.longitude) AS center_lng,
                       COUNT(*) AS crime_count,
                       ch.CrimeGroupName AS dominant_crime,
                       MAX(ch.CrimeGroupName) AS crime_type
                FROM CaseMaster cm
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                WHERE cm.latitude IS NOT NULL AND cm.longitude IS NOT NULL
            """
            params = []

            if district:
                sql += " AND cm.PoliceStationID IN (SELECT UnitID FROM Unit WHERE DistrictID = ?)"
                params.append(district)
            if station:
                sql += " AND cm.PoliceStationID = ?"
                params.append(station)
            if crime_head:
                sql += " AND cm.CrimeMajorHeadID = ?"
                params.append(crime_head)
            if gravity:
                sql += " AND cm.GravityOffenceID = ?"
                params.append(gravity)
            if date_from:
                sql += " AND cm.CrimeRegisteredDate >= ?"
                params.append(date_from)
            if date_to:
                sql += " AND cm.CrimeRegisteredDate <= ?"
                params.append(date_to)
            if month:
                sql += " AND strftime('%Y-%m', cm.CrimeRegisteredDate) = ?"
                params.append(month)

            sql += """
                GROUP BY ROUND(cm.latitude, 1), ROUND(cm.longitude, 1)
                ORDER BY crime_count DESC
                LIMIT 100
            """

            rows = conn.execute(sql, params).fetchall()
            result = []
            for r in rows:
                result.append({
                    "center": [r["center_lat"], r["center_lng"]],
                    "crime_count": r["crime_count"],
                    "dominant_crime": r["dominant_crime"] or r["crime_type"] or "Unknown",
                    "radius": min(r["crime_count"] * 0.05, 0.5),
                })
            return result

    # ------------------------------------------------------------------
    # District Summary
    # ------------------------------------------------------------------
    def get_district_summary(self):
        with get_connection() as conn:
            thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            sixty_days_ago = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")

            rows = conn.execute(
                """
                SELECT d.DistrictName AS district,
                       COUNT(*) AS cases,
                       ROUND(AVG(cm.latitude), 4) AS min_lat,
                       ROUND(AVG(cm.latitude), 4) AS max_lat,
                       ROUND(AVG(cm.longitude), 4) AS min_lng,
                       ROUND(AVG(cm.longitude), 4) AS max_lng
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                WHERE cm.CrimeRegisteredDate >= ?
                GROUP BY d.DistrictName
                """,
                (thirty_days_ago,),
            ).fetchall()

            result = []
            for r in rows:
                prev = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM CaseMaster cm "
                    "JOIN Unit u ON cm.PoliceStationID = u.UnitID "
                    "WHERE u.DistrictID = (SELECT DistrictID FROM District WHERE DistrictName = ?) "
                    "AND cm.CrimeRegisteredDate >= ? AND cm.CrimeRegisteredDate < ?",
                    (r["district"], sixty_days_ago, thirty_days_ago),
                ).fetchone()["cnt"]

                change = 0
                if prev > 0:
                    change = round((r["cases"] - prev) / prev * 100, 1)

                result.append({
                    "district": r["district"],
                    "cases": r["cases"],
                    "change": change,
                    "bounds": {
                        "min_lat": r["min_lat"] - 0.1,
                        "max_lat": r["max_lat"] + 0.1,
                        "min_lng": r["min_lng"] - 0.1,
                        "max_lng": r["max_lng"] + 0.1,
                    },
                })

            return result

    # ------------------------------------------------------------------
    # Timeline
    # ------------------------------------------------------------------
    def get_timeline(self):
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT strftime('%Y-%m', CrimeRegisteredDate) AS month,
                       COUNT(*) AS cases
                FROM CaseMaster
                WHERE CrimeRegisteredDate IS NOT NULL
                GROUP BY month
                ORDER BY month DESC
                LIMIT 12
                """
            ).fetchall()
            return [dict(r) for r in rows][::-1]

    # ------------------------------------------------------------------
    # Hotspot Detail
    # ------------------------------------------------------------------
    def get_hotspot_detail(self, lat: float, lng: float):
        with get_connection() as conn:
            bounds_lat = 0.05
            bounds_lng = 0.05

            cases = conn.execute(
                """
                SELECT cm.*, ch.CrimeGroupName, go.LookupValue AS Gravity,
                       u.UnitName
                FROM CaseMaster cm
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
                LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE cm.latitude BETWEEN ? AND ?
                  AND cm.longitude BETWEEN ? AND ?
                ORDER BY cm.CrimeRegisteredDate DESC
                LIMIT 50
                """,
                (lat - bounds_lat, lat + bounds_lat, lng - bounds_lng, lng + bounds_lng),
            ).fetchall()

            case_list = [dict(c) for c in cases]

            crime_counts = Counter()
            station_set = set()
            for c in case_list:
                if c["CrimeGroupName"]:
                    crime_counts[c["CrimeGroupName"]] += 1
                if c["UnitName"]:
                    station_set.add(c["UnitName"])

            top_crimes = [{"CrimeGroupName": k, "cnt": v} for k, v in crime_counts.most_common(5)]

            return {
                "crime_count": len(case_list),
                "peak_time": "9 PM - 2 AM",
                "top_crimes": top_crimes,
                "stations": [{"id": s, "name": s} for s in station_set],
                "recent_cases": case_list[:10],
            }

    # ------------------------------------------------------------------
    # Repeat Offenders
    # ------------------------------------------------------------------
    def get_repeat_offenders(self):
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT a.AccusedName, COUNT(DISTINCT a.CaseMasterID) AS fir_count,
                       AVG(cm.latitude) AS avg_lat,
                       AVG(cm.longitude) AS avg_lng,
                       COUNT(DISTINCT cm.PoliceStationID) AS stations,
                       MAX(cm.CrimeRegisteredDate) AS last_seen
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName IS NOT NULL AND cm.latitude IS NOT NULL
                GROUP BY a.AccusedName
                HAVING fir_count > 1
                ORDER BY fir_count DESC
                LIMIT 100
                """
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Emerging Hotspots
    # ------------------------------------------------------------------
    def get_emerging_hotspots(self):
        with get_connection() as conn:
            thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
            sixty_days_ago = (datetime.now() - timedelta(days=60)).strftime("%Y-%m-%d")

            rows = conn.execute(
                """
                SELECT ROUND(cm.latitude, 1) AS lat_group,
                       ROUND(cm.longitude, 1) AS lng_group,
                       SUM(CASE WHEN cm.CrimeRegisteredDate >= ? THEN 1 ELSE 0 END) AS recent,
                       SUM(CASE WHEN cm.CrimeRegisteredDate >= ? AND cm.CrimeRegisteredDate < ? THEN 1 ELSE 0 END) AS prev
                FROM CaseMaster cm
                WHERE cm.CrimeRegisteredDate >= ?
                  AND cm.latitude IS NOT NULL
                GROUP BY lat_group, lng_group
                HAVING recent > prev AND recent >= 3
                ORDER BY (recent - prev) DESC
                LIMIT 50
                """,
                (thirty_days_ago, sixty_days_ago, thirty_days_ago, sixty_days_ago),
            ).fetchall()

            result = []
            for r in rows:
                growth = ((r["recent"] - r["prev"]) / max(r["prev"], 1)) * 100
                result.append({
                    "lat": r["lat_group"],
                    "lng": r["lng_group"],
                    "recent_count": r["recent"],
                    "previous_count": r["prev"],
                    "growth_pct": round(growth, 1),
                })

            return result

    # ------------------------------------------------------------------
    # Repeat Offender Zones
    # ------------------------------------------------------------------
    def get_repeat_offender_zones(self):
        with get_connection() as conn:
            rows = conn.execute(
                """
                SELECT ROUND(cm.latitude, 1) AS lat_group,
                       ROUND(cm.longitude, 1) AS lng_group,
                       COUNT(DISTINCT a.AccusedName) AS offender_count,
                       COUNT(DISTINCT a.CaseMasterID) AS fir_count
                FROM Accused a
                JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
                WHERE a.AccusedName IS NOT NULL AND cm.latitude IS NOT NULL
                GROUP BY lat_group, lng_group
                HAVING offender_count >= 2
                ORDER BY fir_count DESC
                LIMIT 50
                """
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Patrol Recommendations
    # ------------------------------------------------------------------
    def get_patrol_recommendations(self):
        with get_connection() as conn:
            thirty_days_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

            rows = conn.execute(
                """
                SELECT u.UnitName AS station,
                       d.DistrictName AS district,
                       COUNT(DISTINCT cm.CaseMasterID) AS crime_density,
                       COUNT(DISTINCT a.AccusedName) AS repeat_offenders,
                       COUNT(DISTINCT cs.CSID) AS pending_investigations,
                       SUM(CASE WHEN go.LookupValue = 'Heinous' THEN 1 ELSE 0 END) AS gravity_score,
                       AVG(cm.latitude) AS avg_lat,
                       AVG(cm.longitude) AS avg_lng
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                LEFT JOIN Accused a ON cm.CaseMasterID = a.CaseMasterID
                LEFT JOIN ChargesheetDetails cs ON cm.CaseMasterID = cs.CaseMasterID
                LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
                WHERE cm.CrimeRegisteredDate >= ?
                GROUP BY u.UnitID
                ORDER BY crime_density DESC
                LIMIT 20
                """,
                (thirty_days_ago,),
            ).fetchall()

            result = []
            for r in rows:
                score = (
                    r["crime_density"] * 10
                    + r["repeat_offenders"] * 15
                    + r["pending_investigations"] * 5
                    + r["gravity_score"] * 20
                )
                result.append({
                    "station": r["station"],
                    "district": r["district"],
                    "priority_score": score,
                    "crime_density": r["crime_density"],
                    "repeat_offenders": r["repeat_offenders"],
                    "pending_investigations": r["pending_investigations"],
                    "gravity_cases": r["gravity_score"],
                    "avg_lat": r["avg_lat"],
                    "avg_lng": r["avg_lng"],
                    "peak_time": "9 PM - 2 AM",
                    "suggested_units": max(1, min(4, round(score / 100))),
                })

            result.sort(key=lambda x: x["priority_score"], reverse=True)
            return result

    # ------------------------------------------------------------------
    # Network Overlay
    # ------------------------------------------------------------------
    def get_network_overlay(self):
        with get_connection() as conn:
            thirty_days_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")

            networks = conn.execute(
                """
                SELECT a1.AccusedName AS name1,
                       a2.AccusedName AS name2,
                       COUNT(DISTINCT a1.CaseMasterID) AS weight,
                       AVG(cm.latitude) AS avg_lat,
                       AVG(cm.longitude) AS avg_lng,
                       COUNT(DISTINCT cm.PoliceStationID) AS stations
                FROM Accused a1
                JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                JOIN CaseMaster cm ON a1.CaseMasterID = cm.CaseMasterID
                WHERE a1.AccusedName < a2.AccusedName
                  AND a1.AccusedName IS NOT NULL
                  AND a2.AccusedName IS NOT NULL
                  AND cm.latitude IS NOT NULL
                  AND cm.CrimeRegisteredDate >= ?
                GROUP BY a1.AccusedName, a2.AccusedName
                HAVING weight >= 2
                ORDER BY weight DESC
                LIMIT 50
                """,
                (thirty_days_ago,),
            ).fetchall()

            groups = defaultdict(lambda: {"members": set(), "lats": [], "lngs": [], "total_firs": 0, "stations": set()})

            for r in networks:
                key = f"{min(r['name1'], r['name2'])}-{max(r['name1'], r['name2'])}"
                group_key = r["name1"]
                groups[group_key]["members"].add(r["name1"])
                groups[group_key]["members"].add(r["name2"])
                groups[group_key]["total_firs"] += r["weight"]

            result = []
            for gid, g in groups.items():
                result.append({
                    "network_name": gid,
                    "member_count": len(g["members"]),
                    "total_firs": g["total_firs"],
                    "stations_covered": len(g["stations"]),
                    "risk": "High" if len(g["members"]) >= 5 else "Medium" if len(g["members"]) >= 3 else "Low",
                })

            result.sort(key=lambda x: x["total_firs"], reverse=True)
            return result[:20]

    # ------------------------------------------------------------------
    # Distribution
    # ------------------------------------------------------------------
    def get_distribution(self, group_by="station", district=None, station=None,
                         crime_head=None, gravity=None, date_from=None, date_to=None):
        with get_connection() as conn:
            if group_by == "station":
                sql = """
                    SELECT u.UnitName AS label, COUNT(*) AS value
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                """
            elif group_by == "crime_head":
                sql = """
                    SELECT ch.CrimeGroupName AS label, COUNT(*) AS value
                    FROM CaseMaster cm
                    LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                """
            elif group_by == "gravity":
                sql = """
                    SELECT go.LookupValue AS label, COUNT(*) AS value
                    FROM CaseMaster cm
                    LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
                """
            elif group_by == "district":
                sql = """
                    SELECT d.DistrictName AS label, COUNT(*) AS value
                    FROM CaseMaster cm
                    JOIN Unit u ON cm.PoliceStationID = u.UnitID
                    JOIN District d ON u.DistrictID = d.DistrictID
                """
            else:
                return []

            sql += " WHERE 1=1"
            params = []

            if district:
                sql += " AND cm.PoliceStationID IN (SELECT UnitID FROM Unit WHERE DistrictID = ?)"
                params.append(district)
            if station:
                sql += " AND cm.PoliceStationID = ?"
                params.append(station)
            if crime_head:
                sql += " AND cm.CrimeMajorHeadID = ?"
                params.append(crime_head)
            if gravity:
                sql += " AND cm.GravityOffenceID = ?"
                params.append(gravity)
            if date_from:
                sql += " AND cm.CrimeRegisteredDate >= ?"
                params.append(date_from)
            if date_to:
                sql += " AND cm.CrimeRegisteredDate <= ?"
                params.append(date_to)

            sql += " GROUP BY label ORDER BY value DESC LIMIT 20"

            rows = conn.execute(sql, params).fetchall()
            return [dict(r) for r in rows]
