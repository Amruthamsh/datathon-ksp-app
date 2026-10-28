"""Field Workbench overview — assigned-case scope, tasks and endpoint wiring."""
from services.field_service import get_field_overview

FIELD_SCOPE = {
    "tier": "field_force",
    "level": "self",
    "employee_id": 2705,
    "district_id": 5,
    "unit_id": 30,
}


def test_field_overview_shape_and_scope():
    data = get_field_overview(FIELD_SCOPE)

    assert data["officer"]["kgid"] == "KGID90000004"
    assert data["officer"]["name"] == "Santosh"
    assert data["station"]["unit_id"] == 30
    assert data["station"]["name"]

    assert data["cases"]
    assert all(row["PolicePersonID"] == 2705 for row in data["cases"])
    assert data["summary"]["assigned"] == len(data["cases"])

    case_ids = {row["CaseMasterID"] for row in data["cases"]}
    assert data["tasks"]
    assert all(task["case_id"] in case_ids for task in data["tasks"])

    assert data["beat"]["total_firs"] > 0
    assert data["beat"]["top_crimes"]


def test_field_scope_excludes_other_officers_cases():
    data = get_field_overview(FIELD_SCOPE)
    other = get_field_overview({**FIELD_SCOPE, "employee_id": 2704})

    field_ids = {row["CaseMasterID"] for row in data["cases"]}
    station_ids = {row["CaseMasterID"] for row in other["cases"]}
    assert not (field_ids & station_ids)


def test_field_endpoint_returns_data(api_client):
    from main import app
    from routes.field import require_field

    app.dependency_overrides[require_field] = lambda: {"scope": FIELD_SCOPE}
    try:
        r = api_client.get("/field/overview")
    finally:
        app.dependency_overrides.pop(require_field, None)

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert body["data"]["officer"]["kgid"] == "KGID90000004"
    assert body["data"]["cases"]
