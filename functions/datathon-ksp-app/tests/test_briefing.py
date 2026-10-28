"""Command Briefing endpoint — shape + scope behaviour."""
from db.sqlite.briefing_repository import get_briefing


def test_briefing_endpoint_shape(api_client):
    r = api_client.get("/briefing")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["hotspot_level"] == "district"
    assert data["kpis"]["firs_window"] > 0
    assert len(data["hotspots"]) > 0
    assert len(data["monthly"]) >= 12


def test_briefing_district_scope_is_narrower():
    state = get_briefing({"level": "all"})
    district = get_briefing({"level": "district", "district_id": 1})
    assert district["hotspot_level"] == "station"
    assert district["kpis"]["total_firs"] < state["kpis"]["total_firs"]


def test_briefing_denies_scope_without_identity():
    out = get_briefing({"level": "self"})
    assert out["as_of"] is None
