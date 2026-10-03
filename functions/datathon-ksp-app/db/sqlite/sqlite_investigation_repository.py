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

    def get_officer_scope(self, kgid: str) -> dict | None:
        """Employee + posting context used for RBAC scoping. See auth/roles.py."""
        from auth.roles import build_scope, tier_from_hierarchy

        with get_connection() as conn:
            row = conn.execute(
                """
                SELECT e.EmployeeID AS employee_id,
                       e.DistrictID AS district_id,
                       e.UnitID AS unit_id,
                       e.RankID AS rank_id,
                       r.Hierarchy AS hierarchy
                FROM Employee e
                LEFT JOIN Rank r ON r.RankID = e.RankID
                WHERE e.KGID = ?
                """,
                (kgid,),
            ).fetchone()
            if not row:
                return None
            d = dict(row)
            tier = tier_from_hierarchy(d.get("hierarchy"))
            return build_scope(tier, d.get("employee_id"), d.get("district_id"), d.get("unit_id"))

    @staticmethod
    def _scope_clause(scope: dict | None, alias: str = "cm") -> tuple[str, list]:
        """Translate an RBAC scope into (SQL fragment, params).

        Levels: all (no filter), district (via Unit join), unit (station),
        self (assigned officer only — legacy behaviour).
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
        # self / fallback
        if scope.get("employee_id") is not None:
            return (f" AND {alias}.PolicePersonID = ?", [scope["employee_id"]])
        # No identity to scope on — deny by default rather than leak.
        return (" AND 1 = 0", [])

    # ------------------------------------------------------------------
    # Dashboard Summary
    # ------------------------------------------------------------------
    def get_summary(self, employee_id: int, scope: dict | None = None):
        # Legacy callers pass only employee_id -> preserve "own cases" behaviour.
        if scope is None:
            scope = {"level": "self", "employee_id": employee_id}
        elif scope.get("employee_id") is None:
            scope = {**scope, "employee_id": employee_id}

        with get_connection() as conn:
            scope_sql, scope_params = self._scope_clause(scope, "cm")

            assigned = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                WHERE 1 = 1
                {scope_sql}
                """,
                scope_params,
            ).fetchone()["cnt"]

            chargesheet_pending = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                LEFT JOIN ChargesheetDetails cs
                    ON cm.CaseMasterID = cs.CaseMasterID
                WHERE cs.CSID IS NULL
                {scope_sql}
                """,
                scope_params,
            ).fetchone()["cnt"]

            arrest_pending = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                LEFT JOIN ArrestSurrender ars
                    ON cm.CaseMasterID = ars.CaseMasterID
                WHERE ars.ArrestSurrenderID IS NULL
                {scope_sql}
                """,
                scope_params,
            ).fetchone()["cnt"]

            repeat_offenders = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM (
                    SELECT a.PersonID
                    FROM Accused a
                    INNER JOIN CaseMaster cm
                    ON cm.CaseMasterID = a.CaseMasterID
                    WHERE 1 = 1
                    {scope_sql}
                    GROUP BY a.PersonID
                    HAVING COUNT(DISTINCT a.CaseMasterID) > 1
                )
                """,
                scope_params,
            ).fetchone()["cnt"]

            review_today = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                WHERE julianday('now') - julianday(CrimeRegisteredDate) >= 30
                {scope_sql}
                """,
                scope_params,
            ).fetchone()["cnt"]

            chargesheet_overdue = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                LEFT JOIN ChargesheetDetails cs
                    ON cm.CaseMasterID = cs.CaseMasterID
                LEFT JOIN GravityOffence go
                    ON cm.GravityOffenceID = go.GravityOffenceID
                WHERE cs.CSID IS NULL
                  AND (julianday('now') - julianday(cm.CrimeRegisteredDate)) >
                      CASE WHEN go.LookupValue = 'Heinous' THEN 90 ELSE 60 END
                {scope_sql}
                """,
                scope_params,
            ).fetchone()["cnt"]

            critical = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                LEFT JOIN GravityOffence go
                    ON cm.GravityOffenceID = go.GravityOffenceID
                WHERE go.LookupValue = 'Heinous'
                {scope_sql}
                """,
                scope_params,
            ).fetchone()["cnt"]

            under_investigation = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                LEFT JOIN CaseStatusMaster csm
                    ON cm.CaseStatusID = csm.CaseStatusID
                WHERE csm.CaseStatusName = 'Under Investigation'
                {scope_sql}
                """,
                scope_params,
            ).fetchone()["cnt"]

            pending_trial = conn.execute(
                f"""
                SELECT COUNT(*) cnt
                FROM CaseMaster cm
                LEFT JOIN CaseStatusMaster csm
                    ON cm.CaseStatusID = csm.CaseStatusID
                WHERE csm.CaseStatusName = 'Pending Trial'
                {scope_sql}
                """,
                scope_params,
            ).fetchone()["cnt"]

            return {
                "assigned": assigned,
                "chargesheet_pending": chargesheet_pending,
                "chargesheet_overdue": chargesheet_overdue,
                "critical": critical,
                "under_investigation": under_investigation,
                "pending_trial": pending_trial,
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

    @staticmethod
    def _id_or_name(value, id_col: str, name_col: str) -> tuple[str, list]:
        """Dropdowns send display names; accept a numeric ID or a name."""
        s = str(value).strip()
        if s.isdigit():
            return (f" AND {id_col} = ?", [int(s)])
        return (f" AND {name_col} = ?", [s])

    def _list_conditions(
        self,
        scope: dict | None,
        status=None,
        gravity=None,
        station=None,
        district=None,
        crime_head=None,
        officer=None,
        search=None,
        only_overdue=False,
        only_chargesheet_pending=False,
        only_arrest_pending=False,
        only_under_investigation=False,
        only_pending_trial=False,
    ) -> tuple[str, list]:
        """Shared WHERE fragment (after 'WHERE 1 = 1') for COUNT + SELECT."""
        scope_sql, scope_params = self._scope_clause(scope, "cm")
        conds = [scope_sql.lstrip(" ")] if scope_sql else []
        # strip leading AND -> normalize: _scope_clause returns " AND ..."
        conds = [c[4:] if c.startswith("AND ") else c for c in conds]
        params: list = list(scope_params)

        def add(fragment: str, values: list):
            conds.append(fragment)
            params.extend(values)

        if status:
            add("csm.CaseStatusName = ?", [status])
        if gravity:
            add("go.LookupValue = ?", [gravity])
        if station:
            frag, vals = self._id_or_name(station, "u.UnitID", "u.UnitName")
            add(frag[5:], vals)
        if district:
            frag, vals = self._id_or_name(district, "d.DistrictID", "d.DistrictName")
            add(frag[5:], vals)
        if crime_head:
            frag, vals = self._id_or_name(crime_head, "ch.CrimeHeadID", "ch.CrimeGroupName")
            add(frag[5:], vals)
        if officer:
            add("TRIM(e.FirstName) = ?", [str(officer).strip()])
        if only_chargesheet_pending or only_overdue:
            add(
                "NOT EXISTS (SELECT 1 FROM ChargesheetDetails cs"
                " WHERE cs.CaseMasterID = cm.CaseMasterID)",
                [],
            )
        if only_overdue:
            add(
                "(julianday('now') - julianday(cm.CrimeRegisteredDate)) >"
                " CASE WHEN go.LookupValue = 'Heinous' THEN 90 ELSE 60 END",
                [],
            )
        if only_arrest_pending:
            add(
                "NOT EXISTS (SELECT 1 FROM ArrestSurrender ars"
                " WHERE ars.CaseMasterID = cm.CaseMasterID)",
                [],
            )
        if only_under_investigation:
            add("csm.CaseStatusName = ?", ["Under Investigation"])
        if only_pending_trial:
            add("csm.CaseStatusName = ?", ["Pending Trial"])
        if search:
            like = f"%{search}%"
            add(
                "(cm.CrimeNo LIKE ? OR u.UnitName LIKE ?"
                " OR d.DistrictName LIKE ? OR TRIM(e.FirstName) LIKE ?"
                " OR ch.CrimeGroupName LIKE ? OR csh.CrimeHeadName LIKE ?)",
                [like] * 6,
            )

        where = "".join(f" AND {c}" for c in conds)
        return where, params

    _LIST_JOINS = """
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
    """

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
        scope: dict | None = None,
        officer=None,
        only_overdue=False,
        only_chargesheet_pending=False,
        only_arrest_pending=False,
        only_under_investigation=False,
        only_pending_trial=False,
        sort_dir="desc",
    ):
        if scope is None:
            scope = {"level": "self", "employee_id": employee_id}
        elif scope.get("employee_id") is None:
            scope = {**scope, "employee_id": employee_id}

        with get_connection() as conn:
            where, params = self._list_conditions(
                scope,
                status=status,
                gravity=gravity,
                station=station,
                district=district,
                crime_head=crime_head,
                officer=officer,
                search=search,
                only_overdue=only_overdue,
                only_chargesheet_pending=only_chargesheet_pending,
                only_arrest_pending=only_arrest_pending,
                only_under_investigation=only_under_investigation,
                only_pending_trial=only_pending_trial,
            )

            total = conn.execute(
                f"SELECT COUNT(*) cnt {self._LIST_JOINS} WHERE 1 = 1{where}",
                params,
            ).fetchone()["cnt"]

            descending = str(sort_dir).lower() != "asc"
            if sort in ("date", "date_desc", "date_asc"):
                direction = "ASC" if sort == "date_asc" else "DESC"
                order_by = f"ORDER BY cm.CrimeRegisteredDate {direction}"
            else:  # priority: Heinous first, then oldest — most urgent on top
                if descending:
                    order_by = (
                        "ORDER BY CASE WHEN go.LookupValue = 'Heinous' THEN 0 ELSE 1 END ASC,"
                        " cm.CrimeRegisteredDate ASC"
                    )
                else:
                    order_by = (
                        "ORDER BY CASE WHEN go.LookupValue = 'Heinous' THEN 0 ELSE 1 END DESC,"
                        " cm.CrimeRegisteredDate DESC"
                    )

            sql = f"""
            SELECT

                cm.CaseMasterID,
                cm.CrimeNo,
                cm.PoliceStationID,
                cm.PolicePersonID,
                d.DistrictID,

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
                ) AS VictimCount,

                EXISTS (
                    SELECT 1 FROM ChargesheetDetails cs
                    WHERE cs.CaseMasterID = cm.CaseMasterID
                ) AS HasChargesheet,

                EXISTS (
                    SELECT 1 FROM ArrestSurrender ars
                    WHERE ars.CaseMasterID = cm.CaseMasterID
                ) AS HasArrest

            {self._LIST_JOINS}
            WHERE 1 = 1{where}
            {order_by}
            LIMIT ?
            OFFSET ?
            """

            params = list(params)
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

            return {"data": data, "total": total}

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
                    u.DistrictID,

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