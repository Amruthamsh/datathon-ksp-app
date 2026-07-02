from agents.sql_query_db.state import SQLAgentState

def route_after_router(state: SQLAgentState):
    print("Routing based on intent:", state["intent"])
    if state["intent"] == "sql":
        return "planner"

    return "chat"