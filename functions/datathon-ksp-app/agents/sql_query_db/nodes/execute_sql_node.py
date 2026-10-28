import db.dependencies as db_dependencies

from agents.sql_query_db.functions.sql_guard import validate_sql
from agents.sql_query_db.state import SQLAgentState


def execute_sql_node(state: SQLAgentState):
    """
    Validates the generated SQL query, then executes it read-only.
    """
    print("Executing SQL Query:", state["sql_query"])

    guard = validate_sql(state["sql_query"])
    if not guard["passed"]:
        print("SQL guard blocked query:", guard["reason"])
        return {
            "sql_result": [],
            "sql_guard": guard,
            "error": guard["reason"],
        }

    metadata_repo = db_dependencies.get_metadata_repository()

    try:
        result = metadata_repo.execute_sql(state["sql_query"])

        print("SQL Result:", result)

        return {
            "sql_result": result,
            "sql_guard": guard,
            "error": None,
        }

    except Exception as e:
        print("Error executing SQL query:", str(e))
        return {
            "sql_result": [],
            "sql_guard": guard,
            "error": str(e),
        }
