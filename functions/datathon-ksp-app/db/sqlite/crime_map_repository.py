from typing import Optional
from datetime import datetime, timedelta
from collections import Counter, defaultdict

from db.sqlite.sqlite import get_connection

# Approximate centroids for Karnataka districts (lat, lng)
# Used for map rendering when crime lat/lng data doesn't align with district geography
_KARNATAKA_DISTRICT_CENTERS = {
    "Bagalkot": (16.18, 75.70),
    "Ballari": (15.14, 76.92),
    "Belagavi": (15.86, 74.50),
    "Bengaluru Rural": (13.24, 77.70),
    "Bengaluru Urban": (12.97, 77.59),
    "Bidar": (17.91, 77.33),
    "Chamarajanagar": (11.92, 76.94),
    "Chikballapur": (13.44, 77.73),
    "Chikkamagaluru": (13.32, 75.78),
    "Chitradurga": (14.23, 76.40),
    "Dakshina Kannada": (12.87, 75.21),
    "Davanagere": (14.47, 75.92),
    "Dharwad": (15.46, 75.01),
    "Gadag": (15.43, 75.63),
    "Hassan": (13.01, 76.10),
    "Haveri": (14.80, 75.40),
    "Kalaburagi": (17.33, 76.83),
    "Kodagu": (12.34, 75.81),
    "Kolar": (13.14, 78.13),
    "Koppal": (15.35, 76.27),
    "Mandya": (12.52, 76.90),
    "Mysuru": (12.30, 76.64),
    "Raichur": (16.21, 77.37),
    "Ramanagara": (12.72, 77.28),
    "Shivamogga": (13.93, 75.57),
    "Tumakuru": (13.34, 77.10),
    "Udupi": (13.34, 74.74),
    "Uttara Kannada": (14.79, 74.59),
    "Vijayanagara": (15.21, 76.46),
    "Vijayapura": (16.83, 75.71),
    "Yadgir": (16.77, 77.14),
}


class _UnionFind:
    def __init__(self):
        self._parent = {}
        self._rank = {}

    def find(self, x):
        if x not in self._parent:
            self._parent[x] = x
            self._rank[x] = 0
        while self._parent[x] != x:
            self._parent[x] = self._parent[self._parent[x]]
            x = self._parent[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        if self._rank[ra] < self._rank[rb]:
            ra, rb = rb, ra
        self._parent[rb] = ra
        if self._rank[ra] == self._rank[rb]:
            self._rank[ra] += 1


_RADIUS = 0.35  # degrees (~35 km)


def _get_district_bounds(district_name: str) -> dict:
    center = _KARNATAKA_DISTRICT_CENTERS.get(district_name, (15.0, 76.0))
    return {
        "min_lat": round(center[0] - _RADIUS, 4),
        "max_lat": round(center[0] + _RADIUS, 4),
        "min_lng": round(center[1] - _RADIUS, 4),
        "max_lng": round(center[1] + _RADIUS, 4),
    }


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

            top_district_row = conn.execute(
                """
                SELECT d.DistrictName, COUNT(*) AS cnt
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                WHERE cm.CrimeRegisteredDate >= ?
                GROUP BY d.DistrictName
                ORDER BY cnt DESC
                LIMIT 1
                """,
                (thirty_days_ago,),
            ).fetchone()

            return {
                "total_crimes": total_crimes,
                "active_hotspots": recent_crimes,
                "emerging_hotspots": emerging,
                "repeat_offender_areas": repeat_offenders,
                "weather_alerts": 0,
                "today_risk": "HIGH" if emerging > 100 else "MEDIUM" if emerging > 50 else "LOW",
                "patrol_recommendations": emerging // 10 or 0,
                "highest_priority_district": {
                    "name": top_district_row["DistrictName"] if top_district_row else "N/A",
                    "crime_count": top_district_row["cnt"] if top_district_row else 0,
                    "reason": f"{top_district_row['cnt']} crimes in 30 days" if top_district_row else "",
                },
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

    # ------------------------------------------------------------------
    # Heatmap Trends  (current 30d vs previous 30d)
    # ------------------------------------------------------------------
    def get_heatmap_trends(self):
        with get_connection() as conn:
            max_date = conn.execute(
                "SELECT MAX(CrimeRegisteredDate) AS d FROM CaseMaster"
            ).fetchone()["d"]
            if not max_date:
                return []

            ref = datetime.strptime(max_date, "%Y-%m-%d")
            current_start = (ref - timedelta(days=30)).strftime("%Y-%m-%d")
            previous_start = (ref - timedelta(days=60)).strftime("%Y-%m-%d")

            rows = conn.execute(
                """
                SELECT ROUND(cm.latitude, 2) AS lat_group,
                       ROUND(cm.longitude, 2) AS lng_group,
                       SUM(CASE WHEN cm.CrimeRegisteredDate >= ? THEN 1 ELSE 0 END) AS current_count,
                       SUM(CASE WHEN cm.CrimeRegisteredDate >= ? AND cm.CrimeRegisteredDate < ? THEN 1 ELSE 0 END) AS previous_count
                FROM CaseMaster cm
                WHERE cm.latitude IS NOT NULL
                  AND cm.longitude IS NOT NULL
                  AND cm.CrimeRegisteredDate >= ?
                GROUP BY lat_group, lng_group
                HAVING current_count >= 2
                ORDER BY current_count DESC
                LIMIT 500
                """,
                (current_start, previous_start, current_start, previous_start),
            ).fetchall()

            result = []
            for r in rows:
                cur = r["current_count"]
                prev = r["previous_count"]
                change = ((cur - prev) / max(prev, 1)) * 100
                result.append({
                    "lat": r["lat_group"],
                    "lng": r["lng_group"],
                    "current_count": cur,
                    "previous_count": prev,
                    "change_pct": round(change, 1),
                })
            return result

    # ------------------------------------------------------------------
    # District Risk Summary (weighted operational risk score)
    # ------------------------------------------------------------------
    def get_district_risk_summary(self):
        with get_connection() as conn:
            max_date = conn.execute(
                "SELECT MAX(CrimeRegisteredDate) AS d FROM CaseMaster"
            ).fetchone()["d"]
            if not max_date:
                return []

            ref = datetime.strptime(max_date, "%Y-%m-%d")
            current_start = (ref - timedelta(days=30)).strftime("%Y-%m-%d")
            previous_start = (ref - timedelta(days=60)).strftime("%Y-%m-%d")

            districts = conn.execute(
                """
                SELECT d.DistrictID, d.DistrictName,
                       COUNT(*) AS crime_count
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                WHERE cm.CrimeRegisteredDate >= ?
                GROUP BY d.DistrictID
                """,
                (current_start,),
            ).fetchall()

            if not districts:
                return []

            max_crimes = max(d["crime_count"] for d in districts)

            result = []
            for d in districts:
                did = d["DistrictID"]
                crime_count = d["crime_count"]

                # Previous period count
                prev_row = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM CaseMaster cm "
                    "JOIN Unit u ON cm.PoliceStationID = u.UnitID "
                    "WHERE u.DistrictID = ? AND cm.CrimeRegisteredDate >= ? AND cm.CrimeRegisteredDate < ?",
                    (did, previous_start, current_start),
                ).fetchone()
                prev_count = prev_row["cnt"]
                change_pct = round(((crime_count - prev_count) / max(prev_count, 1)) * 100, 1)

                # Repeat offenders in district
                repeat_row = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM ("
                    "  SELECT a.AccusedName FROM Accused a "
                    "  JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID "
                    "  JOIN Unit u ON cm.PoliceStationID = u.UnitID "
                    "  WHERE u.DistrictID = ? AND a.AccusedName IS NOT NULL "
                    "  GROUP BY a.AccusedName HAVING COUNT(DISTINCT a.CaseMasterID) > 1"
                    ")",
                    (did,),
                ).fetchone()
                repeat_offenders = repeat_row["cnt"]

                # Pending investigations (cases without chargesheet)
                pending_row = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM CaseMaster cm "
                    "JOIN Unit u ON cm.PoliceStationID = u.UnitID "
                    "WHERE u.DistrictID = ? AND cm.CrimeRegisteredDate >= ? "
                    "AND cm.CaseMasterID NOT IN (SELECT DISTINCT CaseMasterID FROM ChargesheetDetails)",
                    (did, current_start),
                ).fetchone()
                pending = pending_row["cnt"]

                # Top crime head
                top_crime_row = conn.execute(
                    "SELECT ch.CrimeGroupName, COUNT(*) AS cnt "
                    "FROM CaseMaster cm "
                    "JOIN Unit u ON cm.PoliceStationID = u.UnitID "
                    "LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID "
                    "WHERE u.DistrictID = ? AND cm.CrimeRegisteredDate >= ? "
                    "GROUP BY ch.CrimeGroupName ORDER BY cnt DESC LIMIT 1",
                    (did, current_start),
                ).fetchone()
                top_crime = top_crime_row["CrimeGroupName"] if top_crime_row else "Unknown"

                # Normalize components 0-100
                crime_score = (crime_count / max(max_crimes, 1)) * 100

                max_repeat = conn.execute(
                    "SELECT MAX(repeat_count) AS m FROM ("
                    "  SELECT u.DistrictID, COUNT(*) AS repeat_count FROM ("
                    "    SELECT a.AccusedName FROM Accused a "
                    "    WHERE a.AccusedName IS NOT NULL "
                    "    GROUP BY a.AccusedName "
                    "    HAVING COUNT(DISTINCT a.CaseMasterID) > 1"
                    "  ) ro "
                    "  JOIN Accused a ON a.AccusedName = ro.AccusedName AND a.AccusedName IS NOT NULL "
                    "  JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID "
                    "  JOIN Unit u ON cm.PoliceStationID = u.UnitID "
                    "  GROUP BY u.DistrictID"
                    ")"
                ).fetchone()["m"] or 1
                repeat_score = (repeat_offenders / max_repeat) * 100

                max_pending = conn.execute(
                    "SELECT MAX(cnt) AS m FROM ("
                    "  SELECT COUNT(*) AS cnt FROM CaseMaster cm "
                    "  JOIN Unit u ON cm.PoliceStationID = u.UnitID "
                    "  WHERE cm.CrimeRegisteredDate >= ? "
                    "  AND cm.CaseMasterID NOT IN (SELECT DISTINCT CaseMasterID FROM ChargesheetDetails) "
                    "  GROUP BY u.DistrictID"
                    ")",
                    (current_start,),
                ).fetchone()["m"] or 1
                pending_score = (pending / max_pending) * 100

                trend_score = min(100, max(0, (change_pct + 50) / 100 * 100))

                risk_score = round(
                    crime_score * 0.40 +
                    repeat_score * 0.30 +
                    pending_score * 0.20 +
                    trend_score * 0.10,
                    1,
                )

                if risk_score >= 75:
                    risk_level = "CRITICAL"
                elif risk_score >= 50:
                    risk_level = "HIGH"
                elif risk_score >= 25:
                    risk_level = "MEDIUM"
                else:
                    risk_level = "LOW"

                result.append({
                    "district": d["DistrictName"],
                    "risk_score": risk_score,
                    "risk_level": risk_level,
                    "crime_count": crime_count,
                    "repeat_offenders": repeat_offenders,
                    "pending_investigations": pending,
                    "change_pct": change_pct,
                    "top_crime": top_crime,
                    "bounds": _get_district_bounds(d["DistrictName"]),
                })

            result.sort(key=lambda x: x["risk_score"], reverse=True)
            for i, r in enumerate(result):
                r["rank"] = i + 1
            return result

    # ------------------------------------------------------------------
    # Cluster Intelligence (enhanced hotspot detail)
    # ------------------------------------------------------------------
    def get_cluster_intel(self, lat: float, lng: float):
        with get_connection() as conn:
            bounds_lat = 0.05
            bounds_lng = 0.05

            cases = conn.execute(
                """
                SELECT cm.*, ch.CrimeGroupName, go.LookupValue AS Gravity,
                       u.UnitName, u.DistrictID
                FROM CaseMaster cm
                LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
                LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
                LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE cm.latitude BETWEEN ? AND ?
                  AND cm.longitude BETWEEN ? AND ?
                ORDER BY cm.CrimeRegisteredDate DESC
                """,
                (lat - bounds_lat, lat + bounds_lat, lng - bounds_lng, lng + bounds_lng),
            ).fetchall()

            case_list = [dict(c) for c in cases]

            if not case_list:
                return {
                    "crime_count": 0,
                    "dominant_crime": "N/A",
                    "repeat_offenders": 0,
                    "linked_investigations": 0,
                    "active_networks": 0,
                    "peak_time": "N/A",
                    "top_crimes": [],
                    "stations": [],
                    "risk_factors": [],
                }

            crime_counts = Counter()
            station_set = set()
            case_ids = []
            accused_names = []
            hours = []

            for c in case_list:
                if c["CrimeGroupName"]:
                    crime_counts[c["CrimeGroupName"]] += 1
                if c["UnitName"]:
                    station_set.add(c["UnitName"])
                case_ids.append(c["CaseMasterID"])
                if c["IncidentFromDate"]:
                    try:
                        h = int(c["IncidentFromDate"].split(" ")[-1].split(":")[0])
                        hours.append(h)
                    except (ValueError, IndexError):
                        pass

            # Repeat offenders
            if case_ids:
                placeholders = ",".join("?" * len(case_ids))
                repeat_row = conn.execute(
                    f"SELECT COUNT(*) AS cnt FROM ("
                    f"  SELECT AccusedName FROM Accused "
                    f"  WHERE CaseMasterID IN ({placeholders}) AND AccusedName IS NOT NULL "
                    f"  GROUP BY AccusedName HAVING COUNT(DISTINCT CaseMasterID) > 1"
                    f")",
                    case_ids,
                ).fetchone()
                repeat_offenders = repeat_row["cnt"]
            else:
                repeat_offenders = 0

            # Linked investigations (cases with chargesheet)
            if case_ids:
                linked_row = conn.execute(
                    f"SELECT COUNT(DISTINCT CaseMasterID) AS cnt FROM ChargesheetDetails "
                    f"WHERE CaseMasterID IN ({','.join('?' * len(case_ids))})",
                    case_ids,
                ).fetchone()
                linked_investigations = linked_row["cnt"]
            else:
                linked_investigations = 0

            # Active criminal networks (co-accused pairs)
            if case_ids:
                pairs = conn.execute(
                    f"SELECT a1.AccusedName, a2.AccusedName AS name2 "
                    f"FROM Accused a1 "
                    f"JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID "
                    f"WHERE a1.CaseMasterID IN ({','.join('?' * len(case_ids))}) "
                    f"AND a1.AccusedName < a2.AccusedName "
                    f"AND a1.AccusedName IS NOT NULL AND a2.AccusedName IS NOT NULL "
                    f"GROUP BY a1.AccusedName, a2.AccusedName "
                    f"HAVING COUNT(*) >= 2",
                    case_ids,
                ).fetchall()
                uf = _UnionFind()
                for p in pairs:
                    uf.union(p["AccusedName"], p["name2"])
                networks = defaultdict(set)
                all_names = set()
                for p in pairs:
                    all_names.add(p["AccusedName"])
                    all_names.add(p["name2"])
                for name in all_names:
                    root = uf.find(name)
                    networks[root].add(name)
                active_networks = sum(1 for m in networks.values() if len(m) >= 2)
            else:
                active_networks = 0

            # Peak time bucket
            peak_time = "9 PM – 2 AM"
            if hours:
                hour_counts = Counter(hours)
                morning = sum(hour_counts.get(h, 0) for h in range(6, 12))
                afternoon = sum(hour_counts.get(h, 0) for h in range(12, 17))
                evening = sum(hour_counts.get(h, 0) for h in range(17, 21))
                night = sum(hour_counts.get(h, 0) for h in list(range(21, 24)) + list(range(0, 6)))
                buckets = {"6 AM – 12 PM": morning, "12 PM – 5 PM": afternoon, "5 PM – 9 PM": evening, "9 PM – 2 AM": night}
                peak_time = max(buckets, key=buckets.get)

            top_crimes = [{"CrimeGroupName": k, "cnt": v} for k, v in crime_counts.most_common(5)]
            dominant_crime = top_crimes[0]["CrimeGroupName"] if top_crimes else "Unknown"

            # Crime trend
            max_date_row = conn.execute("SELECT MAX(CrimeRegisteredDate) AS d FROM CaseMaster").fetchone()
            if max_date_row["d"]:
                ref = datetime.strptime(max_date_row["d"], "%Y-%m-%d")
                cs = (ref - timedelta(days=30)).strftime("%Y-%m-%d")
                ps = (ref - timedelta(days=60)).strftime("%Y-%m-%d")
                cur_area = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM CaseMaster "
                    "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? "
                    "AND CrimeRegisteredDate >= ?",
                    (lat - bounds_lat, lat + bounds_lat, lng - bounds_lng, lng + bounds_lng, cs),
                ).fetchone()["cnt"]
                prev_area = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM CaseMaster "
                    "WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ? "
                    "AND CrimeRegisteredDate >= ? AND CrimeRegisteredDate < ?",
                    (lat - bounds_lat, lat + bounds_lat, lng - bounds_lng, lng + bounds_lng, ps, cs),
                ).fetchone()["cnt"]
                area_change = cur_area - prev_area
            else:
                area_change = 0

            risk_factors = []
            if repeat_offenders > 0:
                risk_factors.append(f"+{repeat_offenders} Repeat offenders")
            if linked_investigations > 0:
                risk_factors.append(f"+{linked_investigations} Linked investigations")
            if active_networks > 0:
                risk_factors.append(f"+{active_networks} Active criminal networks")
            if area_change > 0:
                risk_factors.append(f"+{area_change} Crime increase vs previous period")
            night_count = sum(1 for h in hours if h >= 21 or h < 6) if hours else 0
            if night_count > 0:
                risk_factors.append(f"+{night_count} Night-time offences")

            return {
                "crime_count": len(case_list),
                "dominant_crime": dominant_crime,
                "repeat_offenders": repeat_offenders,
                "linked_investigations": linked_investigations,
                "active_networks": active_networks,
                "peak_time": peak_time,
                "top_crimes": top_crimes,
                "stations": [{"id": s, "name": s} for s in station_set],
                "risk_factors": risk_factors,
            }

    # ------------------------------------------------------------------
    # Patrol Plan (parameterized)
    # ------------------------------------------------------------------
    def get_patrol_plan(self, time_range="night", units=6, crime_focus=None, area=None):
        with get_connection() as conn:
            max_date = conn.execute(
                "SELECT MAX(CrimeRegisteredDate) AS d FROM CaseMaster"
            ).fetchone()["d"]
            if not max_date:
                return []

            ref = datetime.strptime(max_date, "%Y-%m-%d")
            current_start = (ref - timedelta(days=30)).strftime("%Y-%m-%d")

            # Map time_range to hour buckets
            time_ranges = {
                "morning": list(range(6, 12)),
                "afternoon": list(range(12, 17)),
                "evening": list(range(17, 21)),
                "night": list(range(21, 24)) + list(range(0, 6)),
            }
            hours = time_ranges.get(time_range, list(range(21, 24)) + list(range(0, 6)))

            hour_conditions = " OR ".join(
                [f"CAST(substr(cm.IncidentFromDate, 12, 2) AS INTEGER) = {h}" for h in hours]
            )

            sql = f"""
                SELECT u.UnitName AS station,
                       d.DistrictName AS district,
                       COUNT(DISTINCT cm.CaseMasterID) AS crime_density,
                       COUNT(DISTINCT a.AccusedName) AS repeat_offenders,
                       SUM(CASE WHEN go.LookupValue = 'Heinous' THEN 1 ELSE 0 END) AS gravity_score,
                       AVG(cm.latitude) AS avg_lat,
                       AVG(cm.longitude) AS avg_lng
                FROM CaseMaster cm
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                LEFT JOIN Accused a ON cm.CaseMasterID = a.CaseMasterID
                LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
                WHERE cm.CrimeRegisteredDate >= ?
                  AND cm.latitude IS NOT NULL
            """
            params = [current_start]

            if crime_focus:
                sql += " AND cm.CrimeMajorHeadID = ?"
                params.append(crime_focus)
            if area:
                sql += " AND d.DistrictName = ?"
                params.append(area)

            sql += f"""
                GROUP BY u.UnitID
                ORDER BY crime_density DESC
                LIMIT {units * 2}
            """

            rows = conn.execute(sql, params).fetchall()

            result = []
            for i, r in enumerate(rows[:units]):
                score = (
                    r["crime_density"] * 10
                    + r["repeat_offenders"] * 15
                    + r["gravity_score"] * 20
                )
                reason = "Routine patrol coverage"
                if r["gravity_score"] > 3:
                    reason = "High gravity offence concentration"
                elif r["repeat_offenders"] > 5:
                    reason = "Repeat offender hotspot"
                elif r["crime_density"] > 20:
                    reason = "Night-time crime spike"

                result.append({
                    "station": r["station"],
                    "district": r["district"],
                    "officer_label": f"Route {i + 1}",
                    "priority_score": score,
                    "crime_density": r["crime_density"],
                    "repeat_offenders": r["repeat_offenders"],
                    "gravity_cases": r["gravity_score"],
                    "avg_lat": r["avg_lat"],
                    "avg_lng": r["avg_lng"],
                    "reason": reason,
                    "suggested_units": max(1, min(4, round(score / 100))),
                })

            result.sort(key=lambda x: x["priority_score"], reverse=True)
            return result

    # ------------------------------------------------------------------
    # Network Overlay (union-find clustering)
    # ------------------------------------------------------------------
    def get_network_overlay_enhanced(self):
        with get_connection() as conn:
            ninety_days_ago = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")

            pairs = conn.execute(
                """
                SELECT a1.AccusedName AS name1,
                       a2.AccusedName AS name2,
                       COUNT(DISTINCT a1.CaseMasterID) AS weight,
                       AVG(cm.latitude) AS avg_lat,
                       AVG(cm.longitude) AS avg_lng,
                       GROUP_CONCAT(DISTINCT d.DistrictName) AS districts
                FROM Accused a1
                JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
                JOIN CaseMaster cm ON a1.CaseMasterID = cm.CaseMasterID
                JOIN Unit u ON cm.PoliceStationID = u.UnitID
                JOIN District d ON u.DistrictID = d.DistrictID
                WHERE a1.AccusedName < a2.AccusedName
                  AND a1.AccusedName IS NOT NULL
                  AND a2.AccusedName IS NOT NULL
                  AND cm.latitude IS NOT NULL
                  AND cm.CrimeRegisteredDate >= ?
                GROUP BY a1.AccusedName, a2.AccusedName
                HAVING weight >= 1
                ORDER BY weight DESC
                LIMIT 200
                """,
                (ninety_days_ago,),
            ).fetchall()

            if not pairs:
                return []

            # Union-find to build connected components
            uf = _UnionFind()
            edge_data = {}
            for p in pairs:
                n1, n2 = p["name1"], p["name2"]
                uf.union(n1, n2)
                key = (min(n1, n2), max(n1, n2))
                edge_data[key] = {
                    "weight": p["weight"],
                    "lat": p["avg_lat"],
                    "lng": p["avg_lng"],
                    "districts": set(d for d in (p["districts"] or "").split(",") if d),
                }

            # Group members by root
            member_info = defaultdict(lambda: {"members": set(), "lats": [], "lngs": [], "total_firs": 0, "districts": set(), "member_firs": defaultdict(int)})
            all_names = set()
            for p in pairs:
                all_names.add(p["name1"])
                all_names.add(p["name2"])

            for name in all_names:
                root = uf.find(name)
                member_info[root]["members"].add(name)

            for p in pairs:
                n1, n2 = p["name1"], p["name2"]
                root = uf.find(n1)
                member_info[root]["lats"].append(p["avg_lat"])
                member_info[root]["lngs"].append(p["avg_lng"])
                member_info[root]["total_firs"] += p["weight"]
                member_info[root]["districts"].update(d for d in (p["districts"] or "").split(",") if d)
                member_info[root]["member_firs"][n1] += p["weight"]
                member_info[root]["member_firs"][n2] += p["weight"]

            result = []
            for root, info in member_info.items():
                members = info["members"]
                if len(members) < 2:
                    continue

                avg_lat = sum(info["lats"]) / len(info["lats"]) if info["lats"] else 15.3
                avg_lng = sum(info["lngs"]) / len(info["lngs"]) if info["lngs"] else 75.7

                sorted_members = sorted(
                    info["member_firs"].items(), key=lambda x: x[1], reverse=True
                )

                risk = "High" if len(members) >= 5 else "Medium" if len(members) >= 3 else "Low"

                result.append({
                    "network_name": f"Network {len(result) + 1}",
                    "member_count": len(members),
                    "total_firs": info["total_firs"],
                    "districts": sorted(info["districts"]),
                    "risk": risk,
                    "lat": round(avg_lat, 4),
                    "lng": round(avg_lng, 4),
                    "members": [{"name": n, "firs": f} for n, f in sorted_members[:10]],
                })

            result.sort(key=lambda x: x["total_firs"], reverse=True)
            for i, r in enumerate(result):
                r["network_name"] = f"Network {chr(65 + i)}" if i < 26 else f"Network {i + 1}"
            return result[:20]
