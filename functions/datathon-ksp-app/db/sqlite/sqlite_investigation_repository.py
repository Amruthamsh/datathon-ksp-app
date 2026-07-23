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

                    e.FirstName

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

            return dict(row) if row else None

    # ------------------------------------------------------------------
    # Intelligence
    # ------------------------------------------------------------------

    def get_case_intelligence(self, case_id):

        with get_connection() as conn:

            victims = conn.execute(
                "SELECT COUNT(*) cnt FROM Victim WHERE CaseMasterID=?",
                (case_id,),
            ).fetchone()["cnt"]

            accused = conn.execute(
                "SELECT COUNT(*) cnt FROM Accused WHERE CaseMasterID=?",
                (case_id,),
            ).fetchone()["cnt"]

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
                "victims": victims,
                "accused": accused,
                "acts": [dict(r) for r in acts],
            }

    # ------------------------------------------------------------------
    # Similar Cases
    # ------------------------------------------------------------------
    def get_similar_cases(self, case_id: int):

        with get_connection() as conn:

            # ---------------------------------------------------------
            # Current case
            # ---------------------------------------------------------

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

                LEFT JOIN Unit u
                    ON cm.PoliceStationID = u.UnitID

                WHERE cm.CaseMasterID = ?
                """,
                (case_id,),
            ).fetchone()

            if not current:
                return []

            # ---------------------------------------------------------
            # Current case Act / Sections
            # ---------------------------------------------------------

            current_sections = {
                (r["ActID"], r["SectionID"])
                for r in conn.execute(
                    """
                    SELECT
                        ActID,
                        SectionID
                    FROM ActSectionAssociation
                    WHERE CaseMasterID = ?
                    """,
                    (case_id,),
                ).fetchall()
            }

            # ---------------------------------------------------------
            # Current accused
            # ---------------------------------------------------------

            current_persons = {
                r["PersonID"]
                for r in conn.execute(
                    """
                    SELECT PersonID
                    FROM Accused
                    WHERE CaseMasterID = ?
                    AND PersonID IS NOT NULL
                    """,
                    (case_id,),
                ).fetchall()
            }

            # ---------------------------------------------------------
            # Candidate cases
            # ---------------------------------------------------------

            candidates = conn.execute(
                """
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
                    go.LookupValue AS Gravity

                FROM CaseMaster cm

                LEFT JOIN Unit u
                    ON cm.PoliceStationID = u.UnitID

                LEFT JOIN District d
                    ON u.DistrictID = d.DistrictID

                LEFT JOIN CrimeHead ch
                    ON cm.CrimeMajorHeadID = ch.CrimeHeadID

                LEFT JOIN CrimeSubHead csh
                    ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID

                LEFT JOIN GravityOffence go
                    ON cm.GravityOffenceID = go.GravityOffenceID

                WHERE cm.CaseMasterID <> ?
                """,
                (case_id,),
            ).fetchall()

            results = []

            # ---------------------------------------------------------
            # Score every candidate
            # ---------------------------------------------------------

            for row in candidates:

                row = dict(row)

                score = 0
                reasons = []

                # ---------------- Crime Head ----------------

                if row["CrimeMajorHeadID"] == current["CrimeMajorHeadID"]:
                    score += 40
                    reasons.append(
                        f"Same Crime Head ({row['CrimeGroupName']})"
                    )

                # ---------------- Crime Sub Head ----------------

                if row["CrimeMinorHeadID"] == current["CrimeMinorHeadID"]:
                    score += 20
                    reasons.append(
                        f"Same Crime Sub Head ({row['CrimeHeadName']})"
                    )

                # ---------------- Gravity ----------------

                if row["GravityOffenceID"] == current["GravityOffenceID"]:
                    score += 10
                    reasons.append(
                        f"Same Gravity ({row['Gravity']})"
                    )

                # ---------------- District ----------------

                if row["DistrictID"] == current["DistrictID"]:
                    score += 5
                    reasons.append(
                        f"Occurred in the same district ({row['DistrictName']})"
                    )

                # ---------------- Police Station ----------------

                if row["PoliceStationID"] == current["PoliceStationID"]:
                    score += 5
                    reasons.append(
                        f"Registered at the same Police Station ({row['UnitName']})"
                    )

                # ---------------- Matching Act / Sections ----------------

                candidate_sections = {
                    (r["ActID"], r["SectionID"])
                    for r in conn.execute(
                        """
                        SELECT
                            ActID,
                            SectionID
                        FROM ActSectionAssociation
                        WHERE CaseMasterID = ?
                        """,
                        (row["CaseMasterID"],),
                    ).fetchall()
                }

                matching_sections = current_sections & candidate_sections

                if matching_sections:

                    score += 15 * len(matching_sections)

                    readable = [
                        f"{act} {section}"
                        for act, section in matching_sections
                    ]

                    reasons.append(
                        "Matching Act/Section: "
                        + ", ".join(readable)
                    )

                # ---------------- Shared Accused ----------------

                candidate_persons = {
                    r["PersonID"]
                    for r in conn.execute(
                        """
                        SELECT PersonID
                        FROM Accused
                        WHERE CaseMasterID = ?
                        AND PersonID IS NOT NULL
                        """,
                        (row["CaseMasterID"],),
                    ).fetchall()
                }

                common_persons = current_persons & candidate_persons

                if common_persons:

                    score += 30

                    reasons.append(
                        f"Shares {len(common_persons)} accused with this case"
                    )

                # Ignore weak matches

                if score == 0:
                    continue

                row["similarity_score"] = score

                if score >= 90:
                    row["similarity"] = "Very High"
                elif score >= 60:
                    row["similarity"] = "High"
                elif score >= 35:
                    row["similarity"] = "Medium"
                else:
                    row["similarity"] = "Low"

                row["reasons"] = reasons

                results.append(row)

            results.sort(
                key=lambda x: x["similarity_score"],
                reverse=True,
            )

            return results[:5]