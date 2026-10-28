import db.dependencies as db_dependencies

from agents.sql_query_db.functions.sql_guard import validate_sql
from agents.sql_query_db.functions.sql_scope import apply_scope
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

    # Jurisdiction is binding, not advisory: rewrite every case-table
    # reference to the officer's scope before it runs.
    scoped_sql, scope_info = apply_scope(state["sql_query"], state.get("scope") or {})
    scope_info = {
        **scope_info,
        "label": state.get("scope_label") or "",
        "executed_sql": scoped_sql if scope_info["applied"] else None,
    }

    metadata_repo = db_dependencies.get_metadata_repository()

    try:
        result = metadata_repo.execute_sql(scoped_sql)

        print("SQL Result:", result)

        return {
            "sql_result": result,
            "sql_guard": guard,
            "sql_scope": scope_info,
            "error": None,
        }

    except Exception as e:
        print("Error executing SQL query:", str(e))
        return {
            "sql_result": [],
            "sql_guard": guard,
            "sql_scope": scope_info,
            "error": str(e),
        }
