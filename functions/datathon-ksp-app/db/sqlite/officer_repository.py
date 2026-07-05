from __future__ import annotations

import sqlite3
from datetime import date
from db.sqlite.sqlite import get_connection


class SQLiteOfficerRepository:
    def verify_officer(self, kgid: str, dob: date) -> dict | None:
        with get_connection() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """
                SELECT
                    e.KGID AS kgid,
                    TRIM(e.FirstName) AS full_name,
                    r.RankName AS rank,
                    d.DistrictName AS district
                FROM Employee e
                LEFT JOIN Rank r ON r.RankID = e.RankID
                LEFT JOIN District d ON d.DistrictID = e.DistrictID
                WHERE e.KGID = ?
                  AND e.EmployeeDOB = ?
                """,
                (kgid, dob.isoformat()),
            ).fetchone()

            return dict(row) if row else None