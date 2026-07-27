"""
Locust performance test suite for Datathon KSP App API.

Covers all SQLite-backed endpoints across:
  - Health            (unauthenticated baseline)
  - Investigations    (authenticated, 6 endpoints)
  - Crime Map         (authenticated, 18 endpoints)
  - Network           (authenticated, 9 endpoints)

Auth/Reports/Chat endpoints are excluded — they require Catalyst SDK
which is unavailable in local dev (python main.py).

Usage:
    locust -f locustfile.py --host http://localhost:8000

    # Run a specific scenario:
    locust -f locustfile.py --host http://localhost:8000 \
        --set-list=smoke

    # Or via the runner script:
    bash run_perf_test.sh --scenario spike

Scenarios:
    smoke       – 5 users, 30s, validate all endpoints respond
    baseline    – 20 users, 60s, steady-state throughput
    spike       – ramps to 100 users over 60s, then drops back
    soak        – 30 users, 5 minutes, sustained load
"""

import os
import sys
import random
import json
from pathlib import Path
from typing import Any

from locust import HttpUser, task, between, events, LoadTestShape

# ---------------------------------------------------------------------------
# Load the SAME .env the backend uses so the SECRET_KEY matches
# ---------------------------------------------------------------------------
from dotenv import load_dotenv

_backend_env = Path(__file__).resolve().parent.parent / "functions" / "datathon-ksp-app" / ".env"
load_dotenv(_backend_env)

# ---------------------------------------------------------------------------
# Token generation (mirrors auth/security.py so we don't need Catalyst)
# ---------------------------------------------------------------------------
from itsdangerous import URLSafeTimedSerializer

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
TOKEN_SALT = "ksp-auth-token"


def _make_token(kgid: str, rank: str = "Inspector") -> str:
    payload = {"sub": kgid, "rank": rank, "iat": "2025-01-01T00:00:00Z"}
    return URLSafeTimedSerializer(SECRET_KEY, salt=TOKEN_SALT).dumps(payload)


# Pre-generated tokens for synthetic officers in the SQLite DB
TEST_KGIDS = [f"KGID{i:08d}" for i in range(1, 21)]  # KGID00000001 .. 20

# Realistic person names from the synthetic data for network lookups
SAMPLE_PERSON_NAMES = [
    "Rajesh Kumar", "Suresh Babu", "Mahesh Sharma", "Venkatesh Naik",
    "Ravi Shankar", "Prakash Raj", "Sunil Patel", "Ganesh Iyer",
    "Manoj Singh", "Anil Kumar", "Vijay Sharma", "Deepak Reddy",
    "Sandeep Gowda", "Ramesh Nair", "Kiran Bhat", "Sanjay Mishra",
    "Ashok Menon", "Naveen Hegde", "Prasad Kulkarni", "Vikram Rao",
]

# Realistic search queries for network search
SAMPLE_SEARCH_QUERIES = [
    "Rajesh", "theft", "Bangalore", "murder", "Kumar",
    "fraud", "Mysore", "robbery", "Sharma", "assault",
]


# ---------------------------------------------------------------------------
# Response validation helpers
# ---------------------------------------------------------------------------
def _assert_success(response, endpoint_name: str):
    """Validate response is 2xx and has standard envelope."""
    if response.status_code >= 500:
        response.failure(f"{endpoint_name}: server error {response.status_code}")
        return
    if response.status_code == 401:
        response.failure(f"{endpoint_name}: auth failed (401)")
        return
    if response.status_code != 200:
        response.failure(f"{endpoint_name}: unexpected status {response.status_code}")
        return
    try:
        body = response.json()
        if body.get("status") != "success":
            response.failure(f"{endpoint_name}: status field is '{body.get('status')}'")
    except (json.JSONDecodeError, KeyError):
        response.failure(f"{endpoint_name}: invalid JSON response")


# ---------------------------------------------------------------------------
# Custom shape: spike scenario
# ---------------------------------------------------------------------------
class SpikeShape(LoadTestShape):
    """
    Spike test: ramp to 100 users over 30s, hold 30s, drop to 10, hold 30s.
    Activate with: locust -f locustfile.py --set-list=spike
    """

    def tick(self):
        run_time = self.get_run_time()
        if run_time < 30:
            # Ramp up
            return (int(run_time / 30 * 100) + 1, 5)
        if run_time < 60:
            # Hold at peak
            return (100, 10)
        if run_time < 90:
            # Drop and hold
            return (10, 2)
        return None


# ---------------------------------------------------------------------------
# Authenticated user base
# ---------------------------------------------------------------------------
class _AuthenticatedUser(HttpUser):
    abstract = True

    def on_start(self):
        self._kgid = random.choice(TEST_KGIDS)
        self._token = _make_token(self._kgid)
        self._headers = {"Authorization": f"Bearer {self._token}"}


# ---------------------------------------------------------------------------
# Health User – unauthenticated baseline
# ---------------------------------------------------------------------------
class HealthUser(HttpUser):
    weight = 1
    wait_time = between(0.5, 2)

    @task(10)
    def health_check(self):
        with self.client.get("/health", name="/health", catch_response=True) as resp:
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Health check failed: {resp.status_code}")


# ---------------------------------------------------------------------------
# Investigations User – all investigation endpoints
# ---------------------------------------------------------------------------
class InvestigationsUser(_AuthenticatedUser):
    weight = 3
    wait_time = between(1, 4)

    @task(4)
    def list_investigations(self):
        page = random.randint(1, 5)
        self.client.get(
            f"/investigations/?page={page}&page_size=25",
            headers=self._headers,
            name="/investigations/?page=[n]&page_size=25",
        )

    @task(2)
    def summary(self):
        self.client.get(
            "/investigations/summary",
            headers=self._headers,
            name="/investigations/summary",
        )

    @task(1)
    def filters(self):
        self.client.get(
            "/investigations/filters",
            headers=self._headers,
            name="/investigations/filters",
        )

    @task(2)
    def case_detail(self):
        case_id = random.randint(1, 500)
        self.client.get(
            f"/investigations/{case_id}",
            headers=self._headers,
            name="/investigations/[case_id]",
        )

    @task(1)
    def case_intel(self):
        case_id = random.randint(1, 500)
        self.client.get(
            f"/investigations/{case_id}/intel",
            headers=self._headers,
            name="/investigations/[case_id]/intel",
        )

    @task(1)
    def similar_cases(self):
        case_id = random.randint(1, 500)
        self.client.get(
            f"/investigations/{case_id}/similar",
            headers=self._headers,
            name="/investigations/[case_id]/similar",
        )


# ---------------------------------------------------------------------------
# Crime Map User – all crime map endpoints
# ---------------------------------------------------------------------------
class CrimeMapUser(_AuthenticatedUser):
    weight = 3
    wait_time = between(1, 3)

    @task(3)
    def summary(self):
        self.client.get(
            "/crime-map/summary",
            headers=self._headers,
            name="/crime-map/summary",
        )

    @task(2)
    def filters(self):
        self.client.get(
            "/crime-map/filters",
            headers=self._headers,
            name="/crime-map/filters",
        )

    @task(4)
    def heatmap(self):
        self.client.get(
            "/crime-map/heatmap",
            headers=self._headers,
            name="/crime-map/heatmap",
        )

    @task(3)
    def clusters(self):
        self.client.get(
            "/crime-map/clusters",
            headers=self._headers,
            name="/crime-map/clusters",
        )

    @task(2)
    def district_summary(self):
        self.client.get(
            "/crime-map/district-summary",
            headers=self._headers,
            name="/crime-map/district-summary",
        )

    @task(1)
    def timeline(self):
        self.client.get(
            "/crime-map/timeline",
            headers=self._headers,
            name="/crime-map/timeline",
        )

    @task(1)
    def distribution(self):
        group_by = random.choice(["district", "station", "crime_head"])
        self.client.get(
            f"/crime-map/distribution?group_by={group_by}",
            headers=self._headers,
            name="/crime-map/distribution?group_by=[dim]",
        )

    @task(1)
    def hotspot_detail(self):
        lat = 12.9 + random.uniform(-0.5, 0.5)
        lng = 77.5 + random.uniform(-0.5, 0.5)
        self.client.get(
            f"/crime-map/hotspot?lat={lat:.4f}&lng={lng:.4f}",
            headers=self._headers,
            name="/crime-map/hotspot?lat=[f]&lng=[f]",
        )

    @task(1)
    def repeat_offenders(self):
        self.client.get(
            "/crime-map/repeat-offenders",
            headers=self._headers,
            name="/crime-map/repeat-offenders",
        )

    @task(1)
    def emerging_hotspots(self):
        self.client.get(
            "/crime-map/emerging-hotspots",
            headers=self._headers,
            name="/crime-map/emerging-hotspots",
        )

    @task(1)
    def repeat_offender_zones(self):
        self.client.get(
            "/crime-map/repeat-offender-zones",
            headers=self._headers,
            name="/crime-map/repeat-offender-zones",
        )

    @task(1)
    def patrol_recommendations(self):
        self.client.get(
            "/crime-map/patrol-recommendations",
            headers=self._headers,
            name="/crime-map/patrol-recommendations",
        )

    @task(1)
    def network_overlay(self):
        self.client.get(
            "/crime-map/network-overlay",
            headers=self._headers,
            name="/crime-map/network-overlay",
        )

    @task(1)
    def heatmap_trends(self):
        self.client.get(
            "/crime-map/heatmap-trends",
            headers=self._headers,
            name="/crime-map/heatmap-trends",
        )

    @task(2)
    def district_risk(self):
        self.client.get(
            "/crime-map/district-risk",
            headers=self._headers,
            name="/crime-map/district-risk",
        )

    @task(1)
    def cluster_intel(self):
        lat = 12.9 + random.uniform(-0.5, 0.5)
        lng = 77.5 + random.uniform(-0.5, 0.5)
        self.client.get(
            f"/crime-map/cluster-intel?lat={lat:.4f}&lng={lng:.4f}",
            headers=self._headers,
            name="/crime-map/cluster-intel?lat=[f]&lng=[f]",
        )

    @task(2)
    def patrol_plan(self):
        time_range = random.choice(["morning", "afternoon", "evening", "night"])
        units = random.randint(3, 12)
        self.client.get(
            f"/crime-map/patrol-plan?time_range={time_range}&units={units}",
            headers=self._headers,
            name="/crime-map/patrol-plan?time_range=[t]&units=[n]",
        )

    @task(1)
    def network_overlay_enhanced(self):
        self.client.get(
            "/crime-map/network-overlay-enhanced",
            headers=self._headers,
            name="/crime-map/network-overlay-enhanced",
        )


# ---------------------------------------------------------------------------
# Network User – all criminal network endpoints
# ---------------------------------------------------------------------------
class NetworkUser(_AuthenticatedUser):
    weight = 2
    wait_time = between(1, 4)

    @task(2)
    def summary(self):
        self.client.get(
            "/network/summary",
            headers=self._headers,
            name="/network/summary",
        )

    @task(3)
    def search(self):
        q = random.choice(SAMPLE_SEARCH_QUERIES)
        self.client.get(
            f"/network/search?q={q}",
            headers=self._headers,
            name="/network/search?q=[q]",
        )

    @task(2)
    def person_profile(self):
        name = random.choice(SAMPLE_PERSON_NAMES)
        self.client.get(
            f"/network/person/{name}/profile",
            headers=self._headers,
            name="/network/person/[name]/profile",
        )

    @task(3)
    def person_graph(self):
        name = random.choice(SAMPLE_PERSON_NAMES)
        depth = random.choice([0, 1, 1, 2])
        self.client.get(
            f"/network/person/{name}/graph?depth={depth}",
            headers=self._headers,
            name="/network/person/[name]/graph?depth=[n]",
        )

    @task(1)
    def person_associates(self):
        name = random.choice(SAMPLE_PERSON_NAMES)
        self.client.get(
            f"/network/person/{name}/associates",
            headers=self._headers,
            name="/network/person/[name]/associates",
        )

    @task(1)
    def person_timeline(self):
        name = random.choice(SAMPLE_PERSON_NAMES)
        self.client.get(
            f"/network/person/{name}/timeline",
            headers=self._headers,
            name="/network/person/[name]/timeline",
        )

    @task(1)
    def person_analytics(self):
        name = random.choice(SAMPLE_PERSON_NAMES)
        self.client.get(
            f"/network/person/{name}/analytics",
            headers=self._headers,
            name="/network/person/[name]/analytics",
        )

    @task(1)
    def communities(self):
        self.client.get(
            "/network/communities",
            headers=self._headers,
            name="/network/communities",
        )

    @task(1)
    def bridge_individuals(self):
        limit = random.choice([10, 20, 50])
        self.client.get(
            f"/network/bridge-individuals?limit={limit}",
            headers=self._headers,
            name="/network/bridge-individuals?limit=[n]",
        )
