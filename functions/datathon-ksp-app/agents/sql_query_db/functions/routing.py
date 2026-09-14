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


def route_after_router(state: SQLAgentState):
    print("Routing based on intent:", state["intent"])
    if state["intent"] == "sql":
        return "planner"

    if state.get("evidence_files"):
        text = f"{state.get('original_query', '')} {state.get('translated_query', '')}"
        if _DOC_REF.search(text):
            print("Routing override: evidence-attached query -> planner")
            return "planner"

    return "chat"