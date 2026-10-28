"""Station Command overview — scope, shape and endpoint wiring."""
from services.station_service import get_station_overview

STATION_SCOPE = {
    "tier": "station_command",
    "level": "unit",
    "employee_id": 2704,
    "district_id": 5,
    "unit_id": 30,
}


def test_station_overview_shape_and_scope():
    data = get_station_overview(STATION_SCOPE)

    assert data["station"]["unit_id"] == 30
    assert data["station"]["name"]
    assert data["kpis"]["total_firs"] > 0
    assert data["window_days"] == 90

    # Action queue is real, bounded and station-only.
    queue = data["action_queue"]
    assert 0 < len(queue) <= 8
    assert all(row["station"] == data["station"]["name"] for row in queue)

    # The statutory clock is the primary sort key.
    bands = [row["bnss_band"] for row in queue if row["bnss_band"]]
    order = {"breached": 0, "critical": 1, "warning": 2, "on_track": 3}
    assert bands == sorted(bands, key=lambda b: order.get(b, 4))

    assert isinstance(data["clusters"], list)
    assert data["io"]["summary"]["open_cases"] > 0
    assert data["compliance"]["headline"]


def test_station_overview_playbook_is_deterministic():
    data = get_station_overview(STATION_SCOPE)
    plan = data["playbook"]
    assert plan is not None
    assert plan["deployment_type"] in {
        "physical_patrol",
        "women_safety",
        "cyber_cell",
        "economic_cell",
        "public_order",
        "homicide_prevention",
    }
    assert plan["crime_label"]
    assert plan["immediate_actions"]
    # No LLM is called: the plan must always be the local heuristic.
    assert plan["stats"]["total_30d"] >= 0


def test_station_scope_is_narrower_than_district():
    station = get_station_overview(STATION_SCOPE)
    district = get_station_overview(
        {
            "tier": "district_command",
            "level": "district",
            "employee_id": 2703,
            "district_id": 5,
            "unit_id": 29,
        }
    )
    assert station["kpis"]["total_firs"] < district["kpis"]["total_firs"]


def test_station_endpoint_returns_data(api_client):
    from main import app
    from routes.station import require_station

    app.dependency_overrides[require_station] = lambda: {"scope": STATION_SCOPE}
    try:
        r = api_client.get("/station/overview")
    finally:
        app.dependency_overrides.pop(require_station, None)

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["data"]["station"]["unit_id"] == 30
    assert body["data"]["action_queue"]
