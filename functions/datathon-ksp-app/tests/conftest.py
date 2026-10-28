"""Shared pytest fixtures for the KSP backend test suite.

Run from functions/datathon-ksp-app:
    python -m pytest tests/ -v
"""
import os
import sys
from pathlib import Path

# Ensure `import services...`, `import auth...` resolve when pytest
# rootdir is functions/datathon-ksp-app.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Point at the bundled SQLite DB unless the caller overrides it.
os.environ.setdefault("SQLITE_DATABASE_PATH", str(BACKEND_ROOT / "fir_system.db"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def backend_root():
    return BACKEND_ROOT


@pytest.fixture(scope="session")
def api_client():
    """FastAPI TestClient with auth + Catalyst deps stubbed out.

    SQLite-backed routes (investigations, crime-map, network) run for
    real; Catalyst-only routes (chat persistence, user store) are
    stubbed so tests stay offline.
    """
    from main import app
    from auth.dependencies import get_current_user

    async def _fake_user():
        return {
            "kgid": "TESTKGID01",
            "rank": "Inspector",
            "scope": {
                "tier": "state_command",
                "level": "all",
                "employee_id": 1,
                "district_id": 1,
                "unit_id": 1,
            },
        }

    app.dependency_overrides[get_current_user] = _fake_user
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client
    app.dependency_overrides.clear()
