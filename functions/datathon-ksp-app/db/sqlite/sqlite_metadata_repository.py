from db.sqlite.sqlite import get_connection

class SQLiteMetadataRepository():
    def get_schemas(self):
        with get_connection() as conn:
            rows = conn.execute("""
                SELECT name, sql
                FROM sqlite_master
                WHERE type='table'
                AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            """).fetchall()

            return {
                row["name"]: row["sql"]
                for row in rows
            }

    def get_distinct_values(
        self,
        table_name: str,
        column_name: str,
        limit: int = 20,
    ):
        with get_connection() as conn:

            total = conn.execute(
                f"""
                SELECT COUNT(DISTINCT {column_name})
                FROM {table_name}
                """
            ).fetchone()[0]

            rows = conn.execute(
                f"""
                SELECT DISTINCT {column_name}
                FROM {table_name}
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

            return {
                "values": [r[0] for r in rows],
                "total": total,
                "truncated": total > limit,
            }

    def execute_sql(self, query):
        with get_connection() as conn:
            rows = conn.execute(query).fetchall()
            return [dict(r) for r in rows]