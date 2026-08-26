from typing import Optional

from db.sqlite.sqlite import get_connection


class SQLiteInvestigationRepository:
    def get_user_employee_id(self, kgid: str) -> Optional[int]:
        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT EmployeeID
                FROM Employee
                WHERE KGID = ?
                """,
                (kgid,),
            ).fetchone()

            return row["EmployeeID"] if row else None

    # ------------------------------------------------------------------
    # Dashboard Summary
    # ------------------------------------------------------------------
    def get_summary(self, employee_id: int):

        with get_connection() as conn:

            assigned = conn.execute(
                """
                SELECT COUNT(*) cnt
                FROM CaseMaster
                WHERE PolicePersonID = ?
                """,
                (employee_id,),
            ).fetchone()["cnt"]

            chargesheet_pending = conn.execute(
                """
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                LEFT JOIN ChargesheetDetails cs
                    ON cm.CaseMasterID = cs.CaseMasterID
                WHERE
                    cm.PolicePersonID = ?
                    AND cs.CSID IS NULL
                """,
                (employee_id,),
            ).fetchone()["cnt"]

            arrest_pending = conn.execute(
                """
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                LEFT JOIN ArrestSurrender ars
                    ON cm.CaseMasterID = ars.CaseMasterID
                WHERE
                    cm.PolicePersonID = ?
                    AND ars.ArrestSurrenderID IS NULL
                """,
                (employee_id,),
            ).fetchone()["cnt"]

            repeat_offenders = conn.execute(
                """
                SELECT COUNT(*) cnt
                FROM (

                    SELECT a.PersonID

                    FROM Accused a

                    INNER JOIN CaseMaster cm
                    ON cm.CaseMasterID = a.CaseMasterID

                    WHERE cm.PolicePersonID = ?

                    GROUP BY a.PersonID

                    HAVING COUNT(DISTINCT a.CaseMasterID) > 1

                )
                """,
                (employee_id,),
            ).fetchone()["cnt"]

            review_today = conn.execute(
                """
                SELECT COUNT(*) cnt
                FROM CaseMaster
                WHERE
                    PolicePersonID = ?
                    AND julianday('now') - julianday(CrimeRegisteredDate) >= 30
                """,
                (employee_id,),
            ).fetchone()["cnt"]

            return {
                "assigned": assigned,
                "chargesheet_pending": chargesheet_pending,
                "repeat_offenders": repeat_offenders,
                "arrests_pending": arrest_pending,
                "review_today": review_today,
            }

    # ------------------------------------------------------------------
    # Filters
    # ------------------------------------------------------------------

    def get_filter_values(self):

        with get_connection() as conn:

            status = conn.execute(
                """
                SELECT
                    CaseStatusID,
                    CaseStatusName
                FROM CaseStatusMaster
                ORDER BY CaseStatusName
                """
            ).fetchall()

            gravity = conn.execute(
                """
                SELECT
                    GravityOffenceID,
                    LookupValue
                FROM GravityOffence
                ORDER BY LookupValue
                """
            ).fetchall()

            districts = conn.execute(
                """
                SELECT
                    DistrictID,
                    DistrictName
                FROM District
                ORDER BY DistrictName
                """
            ).fetchall()

            stations = conn.execute(
                """
                SELECT
                    UnitID,
                    UnitName
                FROM Unit
                ORDER BY UnitName
                """
            ).fetchall()

            crime_heads = conn.execute(
                """
                SELECT
                    CrimeHeadID,
                    CrimeGroupName
                FROM CrimeHead
                ORDER BY CrimeGroupName
                """
            ).fetchall()

            return {
                "status": [dict(r) for r in status],
                "gravity": [dict(r) for r in gravity],
                "districts": [dict(r) for r in districts],
                "stations": [dict(r) for r in stations],
                "crime_heads": [dict(r) for r in crime_heads],
            }

    # ------------------------------------------------------------------
    # Investigation Table
    # ------------------------------------------------------------------

    def get_investigations(
        self,
        employee_id,
        page,
        page_size,
        status=None,
        gravity=None,
        station=None,
        district=None,
        crime_head=None,
        search=None,
        sort="priority",
    ):

        with get_connection() as conn:

            sql = """
            SELECT

                cm.CaseMasterID,
                cm.CrimeNo,

                u.UnitName AS Station,

                d.DistrictName,

                csm.CaseStatusName,

                go.LookupValue AS Gravity,

                ch.CrimeGroupName,

                csh.CrimeHeadName,

                TRIM(e.FirstName) AS AssignedOfficer,

                cm.CrimeRegisteredDate,

                julianday('now') - julianday(cm.CrimeRegisteredDate)
                    AS AgeDays,

                (
                    SELECT COUNT(*)
                    FROM Accused a2
                    WHERE a2.CaseMasterID = cm.CaseMasterID
                ) AS AccusedCount,

                (
                    SELECT COUNT(*)
                    FROM Victim v
                    WHERE v.CaseMasterID = cm.CaseMasterID
                ) AS VictimCount
                
            FROM CaseMaster cm

            LEFT JOIN Unit u
                ON cm.PoliceStationID=u.UnitID

            LEFT JOIN District d
                ON u.DistrictID=d.DistrictID

            LEFT JOIN GravityOffence go
                ON cm.GravityOffenceID=go.GravityOffenceID

            LEFT JOIN CrimeHead ch
                ON cm.CrimeMajorHeadID=ch.CrimeHeadID

            LEFT JOIN CrimeSubHead csh
                ON cm.CrimeMinorHeadID=csh.CrimeSubHeadID

            LEFT JOIN Employee e
                ON cm.PolicePersonID=e.EmployeeID

            LEFT JOIN CaseStatusMaster csm
                ON cm.CaseStatusID=csm.CaseStatusID

            WHERE cm.PolicePersonID = ?
            """

            params = [employee_id]

            if status:
                sql += " AND csm.CaseStatusName = ?"
                params.append(status)

            if gravity:
                sql += " AND go.LookupValue = ?"
                params.append(gravity)

            if station:
                sql += " AND u.UnitID = ?"
                params.append(station)

            if district:
                sql += " AND d.DistrictID = ?"
                params.append(district)

            if crime_head:
                sql += " AND ch.CrimeHeadID = ?"
                params.append(crime_head)

            if search:
                sql += """
                AND (
                    cm.CrimeNo LIKE ?
                    OR u.UnitName LIKE ?
                )
                """
                params.extend([f"%{search}%", f"%{search}%"])

            sql += """
            ORDER BY cm.CrimeRegisteredDate DESC
            LIMIT ?
            OFFSET ?
            """

            params.extend([
                page_size,
                (page - 1) * page_size,
            ])

            rows = conn.execute(sql, params).fetchall()

            data = []

            for row in rows:

                item = dict(row)

                age = int(item["AgeDays"])

                if item["Gravity"] == "Heinous":
                    priority = "CRITICAL"
                elif age > 30:
                    priority = "HIGH"
                elif age > 15:
                    priority = "MEDIUM"
                else:
                    priority = "LOW"

                item["Priority"] = priority

                data.append(item)

            return data

    # ------------------------------------------------------------------
    # Right Panel
    # ------------------------------------------------------------------

    def get_case_details(self, case_id):

        with get_connection() as conn:

            row = conn.execute(
                """
                SELECT

                    cm.*,

                    u.UnitName,

                    d.DistrictName,

                    go.LookupValue AS Gravity,

                    ch.CrimeGroupName,

                    csh.CrimeHeadName,

                    csm.CaseStatusName,

                    e.FirstName,

                    CAST(julianday('now') - julianday(cm.CrimeRegisteredDate) AS INTEGER)
                        AS AgeDays

                FROM CaseMaster cm

                LEFT JOIN Unit u
                    ON cm.PoliceStationID=u.UnitID

                LEFT JOIN District d
                    ON u.DistrictID=d.DistrictID

                LEFT JOIN GravityOffence go
                    ON cm.GravityOffenceID=go.GravityOffenceID

                LEFT JOIN CrimeHead ch
                    ON cm.CrimeMajorHeadID=ch.CrimeHeadID

                LEFT JOIN CrimeSubHead csh
                    ON cm.CrimeMinorHeadID=csh.CrimeSubHeadID

                LEFT JOIN CaseStatusMaster csm
                    ON cm.CaseStatusID=csm.CaseStatusID

                LEFT JOIN Employee e
                    ON cm.PolicePersonID=e.EmployeeID

                WHERE cm.CaseMasterID = ?
                """,
                (case_id,),
            ).fetchone()

            result = dict(row) if row else None

            if result:
                age = int(result["AgeDays"])
                gravity = result.get("Gravity", "")

                if gravity == "Heinous":
                    priority = "CRITICAL"
                elif age > 30:
                    priority = "HIGH"
                elif age > 15:
                    priority = "MEDIUM"
                else:
                    priority = "LOW"

                result["Priority"] = priority

                reasons = []
                if gravity == "Heinous" and result.get("CrimeGroupName"):
                    reasons.append(
                        f"Classified as {gravity} offence under {result['CrimeGroupName']}"
                    )
                if age > 30:
                    months = age // 30
                    days = age % 30
                    reasons.append(
                        f"Case age ({months} month{'s' if months > 1 else ''}, {days} day{'s' if days != 1 else ''}) exceeds 30-day threshold"
                    )
                elif age > 15:
                    reasons.append(
                        f"Case age ({age} days) exceeds 15-day threshold"
                    )
                if not reasons:
                    reasons.append("Routine case — standard priority assigned")

                result["priority_reasons"] = reasons

            return result

    # ------------------------------------------------------------------
    # Intelligence
    # ------------------------------------------------------------------

    def get_case_intelligence(self, case_id):

        with get_connection() as conn:

            victim_rows = conn.execute(
                """
                SELECT
                    VictimMasterID,
                    VictimName,
                    AgeYear,
                    GenderID,
                    VictimPolice
                FROM Victim
                WHERE CaseMasterID=?
                """,
                (case_id,),
            ).fetchall()

            accused_rows = conn.execute(
                """
                SELECT
                    AccusedMasterID,
                    AccusedName,
                    AgeYear,
                    GenderID,
                    PersonID
                FROM Accused
                WHERE CaseMasterID=?
                """,
                (case_id,),
            ).fetchall()

            acts = conn.execute(
                """
                SELECT
                    ActID,
                    SectionID
                FROM ActSectionAssociation
                WHERE CaseMasterID=?
                """,
                (case_id,),
            ).fetchall()

            return {
                "victim_count": len(victim_rows),
                "accused_count": len(accused_rows),
                "victims": [dict(r) for r in victim_rows],
                "accused": [dict(r) for r in accused_rows],
                "acts": [dict(r) for r in acts],
            }

    # ------------------------------------------------------------------
    # Similar Cases
    # ------------------------------------------------------------------
    def get_similar_cases(self, case_id: int):
        with get_connection() as conn:
            # First, quickly get the current case values to inject as query parameters
            current = conn.execute(
                """
                SELECT
                    cm.CaseMasterID,
                    cm.CrimeMajorHeadID,
                    cm.CrimeMinorHeadID,
                    cm.GravityOffenceID,
                    cm.PoliceStationID,
                    u.DistrictID
                FROM CaseMaster cm
                LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
                WHERE cm.CaseMasterID = ?
                """,
                (case_id,),
            ).fetchone()

            if not current:
                return []

            sql = """
            WITH MatchingAccused AS (
                -- Pre-count shared accused persons between target case and all other cases
                SELECT c_acc.CaseMasterID, COUNT(*) as shared_count
                FROM Accused c_acc
                INNER JOIN Accused target_acc 
                    ON c_acc.PersonID = target_acc.PersonID
                WHERE target_acc.CaseMasterID = ? 
                  AND c_acc.CaseMasterID <> ?
                  AND c_acc.PersonID IS NOT NULL
                GROUP BY c_acc.CaseMasterID
            ),
            MatchingActs AS (
                -- Pre-count matching Act/Sections between target case and all other cases
                SELECT c_act.CaseMasterID, COUNT(*) as match_count
                FROM ActSectionAssociation c_act
                INNER JOIN ActSectionAssociation target_act 
                    ON c_act.ActID = target_act.ActID 
                   AND c_act.SectionID = target_act.SectionID
                WHERE target_act.CaseMasterID = ? 
                  AND c_act.CaseMasterID <> ?
                GROUP BY c_act.CaseMasterID
            )
            SELECT 
                cm.CaseMasterID,
                cm.CrimeNo,
                cm.CrimeMajorHeadID,
                cm.CrimeMinorHeadID,
                cm.GravityOffenceID,
                cm.PoliceStationID,
                u.UnitName,
                d.DistrictID,
                d.DistrictName,
                ch.CrimeGroupName,
                csh.CrimeHeadName,
                go.LookupValue AS Gravity,
                
                -- Dynamic score calculations matching your specific logic weights
                (
                    (CASE WHEN cm.CrimeMajorHeadID = ? THEN 40 ELSE 0 END) +
                    (CASE WHEN cm.CrimeMinorHeadID = ? THEN 20 ELSE 0 END) +
                    (CASE WHEN cm.GravityOffenceID = ? THEN 10 ELSE 0 END) +
                    (CASE WHEN d.DistrictID = ? THEN 5 ELSE 0 END) +
                    (CASE WHEN cm.PoliceStationID = ? THEN 5 ELSE 0 END) +
                    (CASE WHEN ma.shared_count > 0 THEN 30 ELSE 0 END) +
                    (COALESCE(mact.match_count, 0) * 15)
                ) AS similarity_score,
                
                COALESCE(ma.shared_count, 0) as shared_accused_count,
                COALESCE(mact.match_count, 0) as shared_act_count

            FROM CaseMaster cm
            LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN District d ON u.DistrictID = d.DistrictID
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            LEFT JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
            LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
            LEFT JOIN MatchingAccused ma ON cm.CaseMasterID = ma.CaseMasterID
            LEFT JOIN MatchingActs mact ON cm.CaseMasterID = mact.CaseMasterID
            
            WHERE cm.CaseMasterID <> ?
              -- Filter out records with a similarity score of 0
              AND similarity_score > 0
              
            ORDER BY similarity_score DESC
            LIMIT 5
            """
            
            # Inject parameters sequentially matching the positions above
            params = [
                case_id, case_id, # CTEs
                case_id, case_id, # CTEs
                current["CrimeMajorHeadID"],
                current["CrimeMinorHeadID"],
                current["GravityOffenceID"],
                current["DistrictID"],
                current["PoliceStationID"],
                case_id           # Where clause restriction
            ]
            
            rows = conn.execute(sql, params).fetchall()
            results = []
            
            # Formulate human-readable reason strings and categorical ranking labels in Python
            for row in rows:
                item = dict(row)
                score = item["similarity_score"]
                reasons = []
                
                if item["CrimeMajorHeadID"] == current["CrimeMajorHeadID"]:
                    reasons.append(f"Same Crime Head ({item['CrimeGroupName']})")
                if item["CrimeMinorHeadID"] == current["CrimeMinorHeadID"]:
                    reasons.append(f"Same Crime Sub Head ({item['CrimeHeadName']})")
                if item["GravityOffenceID"] == current["GravityOffenceID"]:
                    reasons.append(f"Same Gravity ({item['Gravity']})")
                if item["DistrictID"] == current["DistrictID"]:
                    reasons.append(f"Occurred in the same district ({item['DistrictName']})")
                if item["PoliceStationID"] == current["PoliceStationID"]:
                    reasons.append(f"Registered at the same Police Station ({item['UnitName']})")
                if item["shared_accused_count"] > 0:
                    reasons.append(f"Shares {item['shared_accused_count']} accused with this case")
                if item["shared_act_count"] > 0:
                    reasons.append(f"Matching Act/Section counts: {item['shared_act_count']}")
                
                # Assign labels matching the baseline thresholds
                if score >= 90:
                    item["similarity"] = "Very High"
                elif score >= 60:
                    item["similarity"] = "High"
                elif score >= 35:
                    item["similarity"] = "Medium"
                else:
                    item["similarity"] = "Low"
                    
                item["reasons"] = reasons
                results.append(item)
                
            return results