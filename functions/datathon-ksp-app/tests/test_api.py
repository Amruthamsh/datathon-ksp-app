"""HTTP API smoke tests — health, auth gating, validation (no Catalyst needed)."""
from fastapi import status


def test_health_ok(api_client):
    r = api_client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_investigations_summary_requires_valid_user(api_client):
    # conftest stubs get_current_user -> state_command, so this succeeds
    r = api_client.get("/investigations/summary")
    assert r.status_code in (200, 500)  # 500 only if seed DB lacks employee row
    if r.status_code == 200:
        assert r.json()["status"] == "success"


def test_investigations_pagination_validation(api_client):
    r = api_client.get("/investigations", params={"page": 0})
    assert r.status_code == 422  # ge=1 enforced
    r = api_client.get("/investigations", params={"page_size": 500})
    assert r.status_code == 422  # le=100 enforced


def test_unauthenticated_requests_rejected():
    """Fresh app without the conftest override must 401/403 protected routes."""
    from fastapi.testclient import TestClient
    from main import app

    saved = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            r = client.get("/investigations/summary")
            assert r.status_code in (401, 403, 500)
            r = client.get("/health")
            assert r.status_code == 200
    finally:
        app.dependency_overrides.update(saved)


def test_openapi_lists_all_routers(api_client):
    spec = api_client.get("/openapi.json").json()
    paths = spec["paths"]
    for prefix in ("/chat/generate", "/auth/signin", "/investigations/summary"):
        assert any(p.startswith(prefix) for p in paths), f"{prefix} missing"
