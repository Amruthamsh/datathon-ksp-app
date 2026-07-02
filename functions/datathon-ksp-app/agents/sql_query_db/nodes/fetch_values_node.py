from agents.sql_query_db.state import SQLAgentState
import db.dependencies as db_dependencies


def fetch_values_node(state: SQLAgentState):
    """
    Fetch DISTINCT values for the columns selected by the planner.
    """

    metadata_repo = db_dependencies.get_metadata_repository()

    distinct_values = {}

    for table in state["selected_tables"]:

        distinct_values[table] = {}

        columns = state["value_lookup_columns"].get(table, [])

        for column in columns:

            distinct_values[table][column] = metadata_repo.get_distinct_values(
                table_name=table,
                column_name=column,
            )
    print("Distinct Values:", distinct_values)

    return {
        "distinct_values": distinct_values,
    }