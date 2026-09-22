import re

from agents.sql_query_db.state import SQLAgentState

# Safety net: the LLM classifier often labels document tasks ("analyze this
# proforma") as chat. An attachment + document-referencing query must always
# be analyzed, never refused.
_DOC_REF = re.compile(
    r"\b(this|these|attached|attachments?|documents?|images?|photos?|"
    r"pictures?|files?|scans?|proformo|proforma|analys[ei]|summar|extract|"
    r"transcri|explain|describ|details?|verify|verifying|ocr)\b",
    re.I,
)


# A pure section-lookup ("IPC 302 punishment? Is it bailable?") must be
# answered from the codebook, never sent to the SQL planner. Only queries
# that ALSO ask for database facts (counts, trends, FIRs, districts...)
# go to the planner.
_DB_REF = re.compile(
    r"\b(how many|count|trend|district|station|fir\b|firs\b|top \d+|list .*case|"
    r"compare|increase|decrease|hotspot|arrest|convict|chargesheet|charge sheet|"
    r"statistics|analytics|last (week|month|year)|this (week|month|year))\b",
    re.I,
)


# A purely local scene question ("what's around this pin?") is answered
# from the deterministic radius workup, never sent to the SQL planner.
# Only queries that ALSO reach beyond the pin radius go to the planner.
_LOCAL_ONLY = re.compile(
    r"\b(around here|nearby|near (this|the) (pin|scene|area|location)|"
    r"this area|this radius|within (the )?radius|within \d+\s*km|"
    r"is this area safe|around the pin|close by|neighbourhood|neighborhood)\b",
    re.I,
)


def route_after_router(state: SQLAgentState):
    print("Routing based on intent:", state["intent"])
    if state["intent"] == "sql":
        if state.get("legal_references"):
            text = f"{state.get('original_query', '')} {state.get('translated_query', '')}"
            if not _DB_REF.search(text) and not state.get("evidence_files"):
                print("Routing override: pure legal lookup -> chat")
                return "chat"
        if state.get("scene_cards"):
            text = f"{state.get('original_query', '')} {state.get('translated_query', '')}"
            if _LOCAL_ONLY.search(text) and not _DB_REF.search(text):
                print("Routing override: local scene question -> chat")
                return "chat"
        return "planner"

    if state.get("evidence_files"):
        text = f"{state.get('original_query', '')} {state.get('translated_query', '')}"
        if _DOC_REF.search(text):
            print("Routing override: evidence-attached query -> planner")
            return "planner"

    return "chat"