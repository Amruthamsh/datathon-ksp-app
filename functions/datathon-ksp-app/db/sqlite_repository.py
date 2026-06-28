from db.repository import EmployeeRepository
from db.sqlite import get_connection


class SQLiteEmployeeRepository(EmployeeRepository):

    def get_employees(self, page: int, page_size: int):

        offset = (page - 1) * page_size

        with get_connection() as conn:

            total = conn.execute(
                "SELECT COUNT(*) FROM Employee"
            ).fetchone()[0]

            rows = conn.execute(
                """
                SELECT *
                FROM Employee
                LIMIT ?
                OFFSET ?
                """,
                (page_size, offset),
            ).fetchall()

            return {
                "page": page,
                "page_size": page_size,
                "total": total,
                "rows": [dict(r) for r in rows],
            }