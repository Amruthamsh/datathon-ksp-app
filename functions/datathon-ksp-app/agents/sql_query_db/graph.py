from langgraph.graph import StateGraph, END

from agents.sql_query_db.state import SQLAgentState
from agents.sql_query_db.nodes.planner_node import planner_node
from agents.sql_query_db.nodes.fetch_values_node import fetch_values_node
from agents.sql_query_db.nodes.generate_sql_node import generate_sql_node
from agents.sql_query_db.nodes.execute_sql_node import execute_sql_node
from agents.sql_query_db.nodes.response_node import response_node
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