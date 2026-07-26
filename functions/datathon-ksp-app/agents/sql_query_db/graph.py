from langgraph.graph import StateGraph, END

from agents.sql_query_db.state import SQLAgentState
from agents.sql_query_db.nodes.planner_node import planner_node
from agents.sql_query_db.nodes.fetch_values_node import fetch_values_node
from agents.sql_query_db.nodes.generate_sql_node import generate_sql_node
from agents.sql_query_db.nodes.execute_sql_node import execute_sql_node
from agents.sql_query_db.nodes.response_node import response_node
from agents.sql_query_db.nodes.router_node import router_node
from agents.sql_query_db.nodes.chat_node import chat_node
from agents.sql_query_db.functions.routing import route_after_router
from agents.sql_query_db.nodes.chart_node import chart_node
from agents.sql_query_db.nodes.finalize_node import finalize_node
from agents.sql_query_db.nodes.language_detection_node import language_detection_node
from agents.sql_query_db.nodes.translate_query_node import translate_query_node
from agents.sql_query_db.nodes.translate_response_node import translate_response_node

builder = StateGraph(SQLAgentState)

# Language pipeline (new)
builder.add_node("language_detection", language_detection_node)
builder.add_node("translate_query", translate_query_node)

# Existing nodes
builder.add_node("router", router_node)
builder.add_node("planner", planner_node)
builder.add_node("fetch_column_values", fetch_values_node)
builder.add_node("generate_sql", generate_sql_node)
builder.add_node("execute_sql", execute_sql_node)
builder.add_node("response", response_node)
builder.add_node("chat", chat_node)
builder.add_node("chart", chart_node)
builder.add_node("finalize", finalize_node)

# Response localization (new)
builder.add_node("translate_response", translate_response_node)

# Flow: detect language -> translate query -> route -> process -> localize response
builder.set_entry_point("language_detection")
builder.add_edge("language_detection", "translate_query")
builder.add_edge("translate_query", "router")

builder.add_conditional_edges(
    "router",
    route_after_router,
    {
        "planner": "planner",
        "chat": "chat",
    },
)
builder.add_edge("planner", "fetch_column_values")
builder.add_edge("fetch_column_values", "generate_sql")
builder.add_edge("generate_sql", "execute_sql")
builder.add_edge("execute_sql", "response")
builder.add_edge("execute_sql", "chart")

builder.add_edge("response", "finalize")
builder.add_edge("chart", "finalize")
builder.add_edge("chat", "finalize")

builder.add_edge("finalize", "translate_response")
builder.add_edge("translate_response", END)

graph = builder.compile()
