"""Scene Intel node — runs after legal lookup, before the router.

Deterministic behaviour (no LLM call):

- If the turn carries a scene pin (``use_scene_pin`` with valid coords),
  run the radius workup (crime history, repeat offenders, POIs) via
  ``services.scene_service``.
- Emits ``scene_cards`` (structured data for the analysis workspace) and
  ``scene_context`` (compact citable block for downstream LLM prompts).
- Appends a ``[Scene Context]`` HumanMessage so router / response / chat
  nodes see the grounding without prompt changes.
- Pin enabled but no coords dropped: emits nothing — downstream prompts
  are told not to invent geography (see response/chat nodes).
"""

from langchain_core.messages import HumanMessage

from agents.sql_query_db.state import SQLAgentState
from services.scene_service import (
    build_scene_context,
    get_scene_intel,
    valid_coords,
)


def scene_node(state: SQLAgentState):
    if not state.get("use_scene_pin"):
        return {"scene_cards": {}, "scene_context": ""}

    lat = state.get("scene_lat")
    lng = state.get("scene_lng")
    radius = state.get("scene_radius_km") or 10.0

    if not valid_coords(lat, lng):
        # Pin toggled but no pin dropped — nothing to query. The router
        # prompt / response prompt handle this as "ask the user to drop
        # the pin" rather than hallucinating nearby counts.
        return {"scene_cards": {}, "scene_context": ""}

    try:
        cards = get_scene_intel(lat, lng, radius)
    except Exception as e:
        print(f"Scene intel lookup failed (non-fatal): {e}")
        return {"scene_cards": {}, "scene_context": ""}

    if not cards:
        return {"scene_cards": {}, "scene_context": ""}

    context = build_scene_context(cards)
    return {
        "scene_cards": cards,
        "scene_context": context,
        "messages": [HumanMessage(content=f"[Scene Context]\n{context}")],
    }
