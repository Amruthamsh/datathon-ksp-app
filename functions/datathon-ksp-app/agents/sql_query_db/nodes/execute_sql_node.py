import db.dependencies as db_dependencies

from agents.sql_query_db.state import SQLAgentState


def execute_sql_node(state: SQLAgentState):
    """
    Executes the generated SQL query.
    """
    print("Executing SQL Query:", state["sql_query"])

    metadata_repo = db_dependencies.get_metadata_repository()

    try:
        result = metadata_repo.execute_sql(state["sql_query"])

        print("SQL Result:", result)

        return {
            "sql_result": result,
            "error": None,
        }

    except Exception as e:
        print("Error executing SQL query:", str(e))
        return {
            "sql_result": [],
            "error": str(e),
        }