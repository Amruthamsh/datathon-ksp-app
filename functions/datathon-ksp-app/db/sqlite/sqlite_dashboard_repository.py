from typing import Optional
from db.sqlite.sqlite import get_connection

class SQLiteDashboardRepository:
    def get_user_employee_id(self, kgid: str) -> Optional[int]:
        """Fetches the employee_id for a given KGID."""
        with get_connection() as conn:
            row = conn.execute("SELECT EmployeeID FROM Employee WHERE KGID = ?", (kgid,)).fetchone()
            return row["EmployeeID"] if row else None
        
    def get_investigation_pipeline(self, employee_id: int, limit: int = 15) -> dict:
        """Fetches cases and their REAL linked entities/network connections."""
        with get_connection() as conn:
            # 1. Fetch Real Stats (Active Cases, Heinous Offenses)
            stats_row = conn.execute("""
                SELECT 
                    COUNT(c.CaseMasterID) AS active,
                    SUM(CASE WHEN g.LookupValue LIKE '%Heinous%' THEN 1 ELSE 0 END) AS heinous
                FROM CaseMaster c
                LEFT JOIN ChargesheetDetails cs ON c.CaseMasterID = cs.CaseMasterID
                LEFT JOIN GravityOffence g ON c.GravityOffenceID = g.GravityOffenceID
                WHERE c.PolicePersonID = ? AND cs.CSID IS NULL
            """, (employee_id,)).fetchone()
            
            # 2. Fetch the Base Cases
            case_rows = conn.execute("""
                SELECT 
                    c.CaseMasterID AS id,
                    ch.CrimeGroupName AS offense,
                    u.UnitName AS desk,
                    csm.CaseStatusName AS status,
                    g.LookupValue AS gravity,
                    c.CrimeRegisteredDate AS updated_at
                FROM CaseMaster c
                JOIN CrimeHead ch ON c.CrimeMajorHeadID = ch.CrimeHeadID
                JOIN Unit u ON c.PoliceStationID = u.UnitID
                JOIN CaseStatusMaster csm ON c.CaseStatusID = csm.CaseStatusID
                LEFT JOIN GravityOffence g ON c.GravityOffenceID = g.GravityOffenceID
                LEFT JOIN ChargesheetDetails cs ON c.CaseMasterID = cs.CaseMasterID
                WHERE c.PolicePersonID = ? AND cs.CSID IS NULL 
                ORDER BY c.CrimeRegisteredDate DESC
                LIMIT ?
            """, (employee_id, limit)).fetchall()
            
            cases = [dict(r) for r in case_rows]
            total_entities_tracked = 0
            network_links_found = 0
            
            # 3. Fetch Real Linked Entities & Network Graph (Repeat Offenders)
            if cases:
                case_ids = [c["id"] for c in cases]
                placeholders = ",".join("?" for _ in case_ids)

                # Get Accused and cross-reference their PersonID across the entire DB to find network links
                accused_rows = conn.execute(f"""
                    SELECT 
                        a.CaseMasterID, 
                        a.AccusedName, 
                        a.PersonID,
                        (SELECT COUNT(DISTINCT a2.CaseMasterID) 
                         FROM Accused a2 
                         WHERE a2.PersonID = a.PersonID 
                         AND a2.PersonID IS NOT NULL 
                         AND a2.PersonID != '' 
                         AND a2.CaseMasterID != a.CaseMasterID) as linked_cases_count
                    FROM Accused a
                    WHERE a.CaseMasterID IN ({placeholders})
                """, case_ids).fetchall()

                # Get Victims
                victim_rows = conn.execute(f"""
                    SELECT CaseMasterID, VictimName 
                    FROM Victim 
                    WHERE CaseMasterID IN ({placeholders})
                """, case_ids).fetchall()

                # Attach entities to their respective cases
                for case in cases:
                    case["entities"] = []
                    
                    # Attach Accused & Network Links
                    for acc in accused_rows:
                        if acc["CaseMasterID"] == case["id"]:
                            links = acc["linked_cases_count"]
                            case["entities"].append({
                                "type": "Accused",
                                "name": acc["AccusedName"] or "Unknown",
                                "network_links": links
                            })
                            total_entities_tracked += 1
                            if links > 0:
                                network_links_found += links

                    # Attach Victims
                    for vic in victim_rows:
                        if vic["CaseMasterID"] == case["id"]:
                            case["entities"].append({
                                "type": "Victim",
                                "name": vic["VictimName"] or "Unknown",
                                "network_links": 0
                            })
                            total_entities_tracked += 1
                            
            return {
                "stats": {
                    "active": stats_row["active"] if stats_row and stats_row["active"] else 0,
                    "heinous": stats_row["heinous"] if stats_row and stats_row["heinous"] else 0,
                    "total_entities": total_entities_tracked,
                    "network_links": network_links_found
                },
                "cases": cases
            }