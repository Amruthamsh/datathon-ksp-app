from langgraph.graph import StateGraph, END

from .state import SQLAgentState
from .nodes import (
    planner_node,
    fetch_values_node,
    generate_sql_node,
    execute_sql_node,
    response_node,
)

builder = StateGraph(SQLAgentState)

builder.add_node("planner", planner_node)
builder.add_node("fetch_column_values", fetch_values_node)
builder.add_node("generate_sql", generate_sql_node)
builder.add_node("execute_sql", execute_sql_node)
builder.add_node("response", response_node)

builder.set_entry_point("planner")

builder.add_edge("planner", "fetch_column_values")
builder.add_edge("fetch_column_values", "generate_sql")
builder.add_edge("generate_sql", "execute_sql")
builder.add_edge("execute_sql", "response")
builder.add_edge("response", END)

graph = builder.compile()