from typing import Annotated

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict, Literal

class SQLAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    intent: Literal["sql", "chat"]
    schemas: dict
    selected_tables: list[str]
    value_lookup_columns: dict[str, list[str]]
    distinct_values: dict
    sql_query: str
    sql_result: list[dict]
    error: str | None
    response: str
    follow_up_questions: list[str]
    charts: list[dict]
    language: Literal["en", "kn"]
    original_query: str
    translated_query: str
    # Evidence attached to this turn (FileStore-backed uploads from Home chat).
    # Each entry: {file_id, filename, stored_name, content_type, size_bytes,
    #              storage, folder_id, download_url, snippet}
    evidence_files: list[dict]
    evidence_context: str
    # Legal Reference (Codebook) for this turn.
    # use_codebook: investigator toggled "Legal Reference" in Home chat.
    # legal_references: structured cards rendered in the analysis workspace.
    # legal_context: compact citable block injected into LLM prompts.
    use_codebook: bool
    legal_references: list[dict]
    legal_context: str
    # Scene Intel (Location Query) for this turn.
    # use_scene_pin: investigator toggled Location Query in Home chat.
    # scene_lat/lng/radius_km: dropped pin + fixed 10 km radius.
    # scene_cards: structured workup (crime mix, repeat offenders, POIs)
    #   rendered in the analysis workspace.
    # scene_context: compact citable block injected into LLM prompts.
    use_scene_pin: bool
    scene_lat: float | None
    scene_lng: float | None
    scene_radius_km: float | None
    scene_cards: dict
    scene_context: str