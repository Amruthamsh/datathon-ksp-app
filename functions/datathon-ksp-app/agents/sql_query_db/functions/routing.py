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


_DOMAIN_TERMS: list[str] | None = None


def _domain_terms() -> list[str]:
    """Crime types, districts and case statuses (English + Kannada) from the
    domain dictionary — lowercase, longest first."""
    global _DOMAIN_TERMS
    if _DOMAIN_TERMS is None:
        from config import domain_dictionary as dd

        terms = set()
        for table in (dd.CRIME_HEAD_KN_EN, dd.CRIME_SUBHEAD_KN_EN, dd.DISTRICT_KN_EN, dd.CASE_STATUS_KN_EN):
            for kn, en in table.items():
                terms.add(kn.lower())
                terms.add(en.lower())
        _DOMAIN_TERMS = sorted((t for t in terms if len(t) >= 4), key=len, reverse=True)
    return _DOMAIN_TERMS


def _mentions_crime_data(text: str) -> bool:
    low = text.lower()
    return bool(_DB_REF.search(text)) or any(t in low for t in _domain_terms())


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

    text = f"{state.get('original_query', '')} {state.get('translated_query', '')}"
    if state.get("evidence_files"):
        if _DOC_REF.search(text):
            print("Routing override: evidence-attached query -> planner")
            return "planner"

    # Safety net: the LLM classifier sometimes labels real crime questions
    # (often Kannada or source-hinted ones) as chat, which ends in a refusal.
    # Ungrounded questions naming a crime type, district or status go to the DB.
    if not state.get("legal_references") and not state.get("scene_cards"):
        if _mentions_crime_data(text):
            print("Routing override: crime-domain query labelled chat -> planner")
            return "planner"

    return "chat"