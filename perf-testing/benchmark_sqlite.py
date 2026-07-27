#!/usr/bin/env python3
"""
SQLite Query Benchmark for KSP FIR Database.

Profiles the raw SQL query performance of the FIR database independently
of the HTTP layer. Tests the same queries the backend repositories execute,
measuring latency across different query patterns and data volumes.

Usage:
    python3 benchmark_sqlite.py [--db PATH] [--iterations N] [--output FILE]

Results are printed to stdout as a formatted table and optionally written
to a JSON file for CI integration.
"""

import argparse
import json
import os
import statistics
import sys
import time
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DEFAULT_DB = Path(__file__).resolve().parent.parent / "functions" / "datathon-ksp-app" / "fir_system.db"
DEFAULT_ITERATIONS = 100

# SLO thresholds (ms) — queries exceeding these are flagged
SLO_THRESHOLDS = {
    "simple_select": 50,
    "aggregate": 100,
    "join_heavy": 200,
    "full_scan": 500,
    "complex_analytics": 300,
}


# ---------------------------------------------------------------------------
# Benchmark queries — mirrors actual repository SQL
# ---------------------------------------------------------------------------
@dataclass
class BenchmarkQuery:
    name: str
    category: str
    sql: str
    params: tuple = ()
    description: str = ""


BENCHMARK_QUERIES: list[BenchmarkQuery] = [
    # ── Simple selects ────────────────────────────────────────────────
    BenchmarkQuery(
        name="employee_lookup",
        category="simple_select",
        sql="SELECT EmployeeID FROM Employee WHERE KGID = ?",
        params=("KGID00000001",),
        description="PK lookup by KGID",
    ),
    BenchmarkQuery(
        name="district_list",
        category="simple_select",
        sql="SELECT DistrictID, DistrictName FROM District ORDER BY DistrictName",
        description="Full district list (31 rows)",
    ),
    BenchmarkQuery(
        name="crime_head_list",
        category="simple_select",
        sql="SELECT CrimeHeadID, CrimeGroupName FROM CrimeHead",
        description="Crime head categories",
    ),
    BenchmarkQuery(
        name="unit_by_district",
        category="simple_select",
        sql="SELECT UnitID, UnitName FROM Unit WHERE DistrictID = ?",
        params=(1,),
        description="Police stations in a district",
    ),

    # ── Aggregations ─────────────────────────────────────────────────
    BenchmarkQuery(
        name="total_case_count",
        category="aggregate",
        sql="SELECT COUNT(*) AS cnt FROM CaseMaster",
        description="Total case count",
    ),
    BenchmarkQuery(
        name="cases_by_crime_head",
        category="aggregate",
        sql="""
            SELECT ch.CrimeGroupName, COUNT(*) AS cnt
            FROM CaseMaster cm
            JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            GROUP BY ch.CrimeGroupName
            ORDER BY cnt DESC
        """,
        description="Case distribution by crime head",
    ),
    BenchmarkQuery(
        name="cases_by_district",
        category="aggregate",
        sql="""
            SELECT d.DistrictName, COUNT(*) AS cnt
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            JOIN District d ON u.DistrictID = d.DistrictID
            GROUP BY d.DistrictName
            ORDER BY cnt DESC
        """,
        description="Case distribution by district",
    ),
    BenchmarkQuery(
        name="monthly_case_counts",
        category="aggregate",
        sql="""
            SELECT strftime('%Y-%m', cm.CrimeRegisteredDate) AS month, COUNT(*) AS cnt
            FROM CaseMaster cm
            GROUP BY month
            ORDER BY month DESC
            LIMIT 24
        """,
        description="Monthly case volume for trend chart",
    ),

    # ── Investigation queries ────────────────────────────────────────
    BenchmarkQuery(
        name="investigation_list",
        category="join_heavy",
        sql="""
            SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate,
                   ch.CrimeGroupName, go.LookupValue AS Gravity,
                   u.UnitName AS Station, d.DistrictName,
                   e.Name AS OfficerName
            FROM CaseMaster cm
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
            LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN District d ON u.DistrictID = d.DistrictID
            LEFT JOIN Employee e ON cm.PolicePersonID = e.EmployeeID
            ORDER BY cm.CrimeRegisteredDate DESC
            LIMIT 25 OFFSET 0
        """,
        description="Paginated investigation list with joins",
    ),
    BenchmarkQuery(
        name="case_detail",
        category="join_heavy",
        sql="""
            SELECT cm.*, ch.CrimeGroupName, go.LookupValue AS Gravity,
                   u.UnitName AS Station, d.DistrictName
            FROM CaseMaster cm
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
            LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN District d ON u.DistrictID = d.DistrictID
            WHERE cm.CaseMasterID = ?
        """,
        params=(100,),
        description="Single case detail with all joins",
    ),
    BenchmarkQuery(
        name="similar_cases",
        category="join_heavy",
        sql="""
            SELECT cm2.CaseMasterID, cm2.CrimeNo,
                   COUNT(DISTINCT a2.AccusedName) AS shared_accused
            FROM CaseMaster cm1
            JOIN Accused a1 ON cm1.CaseMasterID = a1.CaseMasterID
            JOIN Accused a2 ON a1.AccusedName = a2.AccusedName
            JOIN CaseMaster cm2 ON a2.CaseMasterID = cm2.CaseMasterID
            WHERE cm1.CaseMasterID = ? AND cm2.CaseMasterID != cm1.CaseMasterID
            GROUP BY cm2.CaseMasterID
            ORDER BY shared_accused DESC
            LIMIT 10
        """,
        params=(100,),
        description="Find cases with shared accused",
    ),
    BenchmarkQuery(
        name="chargesheet_pending_count",
        category="aggregate",
        sql="""
            SELECT COUNT(*) AS cnt
            FROM CaseMaster cm
            LEFT JOIN ChargesheetDetails cs ON cm.CaseMasterID = cs.CaseMasterID
            WHERE cs.CSID IS NULL
        """,
        description="Pending chargesheet count",
    ),
    BenchmarkQuery(
        name="repeat_offender_count",
        category="aggregate",
        sql="""
            SELECT COUNT(*) AS cnt FROM (
                SELECT a.PersonID
                FROM Accused a
                GROUP BY a.PersonID
                HAVING COUNT(DISTINCT a.CaseMasterID) > 1
            )
        """,
        description="Number of repeat offenders",
    ),

    # ── Crime map queries ────────────────────────────────────────────
    BenchmarkQuery(
        name="heatmap_points",
        category="complex_analytics",
        sql="""
            SELECT cm.Latitude AS lat, cm.Longitude AS lng,
                   ch.CrimeGroupName AS crime_type
            FROM CaseMaster cm
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            WHERE cm.Latitude IS NOT NULL
              AND cm.Longitude IS NOT NULL
            LIMIT 5000
        """,
        description="Heatmap point data",
    ),
    BenchmarkQuery(
        name="district_crime_summary",
        category="complex_analytics",
        sql="""
            SELECT d.DistrictName,
                   COUNT(*) AS total_cases,
                   SUM(CASE WHEN cm.CaseStatusID = 1 THEN 1 ELSE 0 END) AS open_cases,
                   SUM(CASE WHEN cm.CaseStatusID = 2 THEN 1 ELSE 0 END) AS closed_cases
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            JOIN District d ON u.DistrictID = d.DistrictID
            GROUP BY d.DistrictName
            ORDER BY total_cases DESC
        """,
        description="District-level case summary",
    ),
    BenchmarkQuery(
        name="cluster_detection",
        category="complex_analytics",
        sql="""
            SELECT cm.Latitude AS lat, cm.Longitude AS lng,
                   COUNT(*) AS incident_count,
                   GROUP_CONCAT(DISTINCT ch.CrimeGroupName) AS crime_types
            FROM CaseMaster cm
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            WHERE cm.Latitude IS NOT NULL
              AND cm.Longitude IS NOT NULL
            GROUP BY ROUND(cm.Latitude, 2), ROUND(cm.Longitude, 2)
            HAVING incident_count >= 3
            ORDER BY incident_count DESC
            LIMIT 50
        """,
        description="DBSCAN-style cluster detection",
    ),
    BenchmarkQuery(
        name="repeat_offender_zones",
        category="complex_analytics",
        sql="""
            SELECT d.DistrictName, a.AccusedName,
                   COUNT(DISTINCT a.CaseMasterID) AS fir_count
            FROM Accused a
            JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            JOIN District d ON u.DistrictID = d.DistrictID
            GROUP BY d.DistrictName, a.AccusedName
            HAVING fir_count >= 3
            ORDER BY fir_count DESC
            LIMIT 50
        """,
        description="Repeat offenders by district",
    ),
    BenchmarkQuery(
        name="patrol_recommendations",
        category="complex_analytics",
        sql="""
            SELECT u.UnitName AS station, d.DistrictName,
                   COUNT(*) AS recent_cases,
                   COUNT(DISTINCT a.AccusedName) AS unique_offenders
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            JOIN District d ON u.DistrictID = d.DistrictID
            LEFT JOIN Accused a ON cm.CaseMasterID = a.CaseMasterID
            WHERE cm.CrimeRegisteredDate >= date('now', '-30 days')
            GROUP BY u.UnitName, d.DistrictName
            ORDER BY recent_cases DESC
            LIMIT 20
        """,
        description="Patrol priority stations (last 30 days)",
    ),

    # ── Network queries ──────────────────────────────────────────────
    BenchmarkQuery(
        name="network_search",
        category="join_heavy",
        sql="""
            SELECT DISTINCT a.AccusedName AS name,
               COUNT(DISTINCT a.CaseMasterID) AS case_count
            FROM Accused a
            WHERE a.AccusedName LIKE ?
            GROUP BY a.AccusedName
            ORDER BY case_count DESC
            LIMIT 20
        """,
        params=("%Rajesh%",),
        description="Person search by name",
    ),
    BenchmarkQuery(
        name="person_profile",
        category="join_heavy",
        sql="""
            SELECT cm.CaseMasterID, cm.CrimeNo, cm.CrimeRegisteredDate,
                   ch.CrimeGroupName, go.LookupValue AS Gravity,
                   u.UnitName AS Station, d.DistrictName
            FROM Accused a
            JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
            LEFT JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            LEFT JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
            LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
            LEFT JOIN District d ON u.DistrictID = d.DistrictID
            WHERE a.AccusedName = ?
            ORDER BY cm.CrimeRegisteredDate DESC
        """,
        params=("Rajesh Kumar",),
        description="Full person profile with case history",
    ),
    BenchmarkQuery(
        name="person_graph",
        category="complex_analytics",
        sql="""
            SELECT a2.AccusedName AS target,
                   COUNT(DISTINCT a2.CaseMasterID) AS shared_firs
            FROM Accused a1
            JOIN Accused a2 ON a1.CaseMasterID = a2.CaseMasterID
            WHERE a1.AccusedName = ? AND a2.AccusedName != ?
            GROUP BY a2.AccusedName
            ORDER BY shared_firs DESC
            LIMIT 50
        """,
        params=("Rajesh Kumar", "Rajesh Kumar"),
        description="Criminal network graph edges",
    ),
    BenchmarkQuery(
        name="bridge_individuals",
        category="complex_analytics",
        sql="""
            SELECT a.AccusedName,
                   COUNT(DISTINCT a.CaseMasterID) AS fir_count,
                   COUNT(DISTINCT cm.PoliceStationID) AS station_count
            FROM Accused a
            JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
            GROUP BY a.AccusedName
            HAVING fir_count >= 3
            ORDER BY (fir_count * station_count) DESC
            LIMIT 20
        """,
        description="Bridge individuals (cross-station offenders)",
    ),
    BenchmarkQuery(
        name="community_detection",
        category="full_scan",
        sql="""
            SELECT a.AccusedName, COUNT(DISTINCT a.CaseMasterID) AS fir_count
            FROM Accused a
            GROUP BY a.AccusedName
            HAVING fir_count >= 2
            ORDER BY fir_count DESC
        """,
        description="All repeat offenders for community graph",
    ),

    # ── Full table scans / heavy ─────────────────────────────────────
    BenchmarkQuery(
        name="all_accused_with_cases",
        category="full_scan",
        sql="""
            SELECT a.AccusedName, a.PersonID,
                   COUNT(DISTINCT a.CaseMasterID) AS fir_count,
                   MIN(cm.CrimeRegisteredDate) AS first_seen,
                   MAX(cm.CrimeRegisteredDate) AS last_seen
            FROM Accused a
            JOIN CaseMaster cm ON a.CaseMasterID = cm.CaseMasterID
            GROUP BY a.AccusedName
            ORDER BY fir_count DESC
            LIMIT 100
        """,
        description="Top 100 repeat offenders with date range",
    ),
    BenchmarkQuery(
        name="cross_table_complex",
        category="full_scan",
        sql="""
            SELECT d.DistrictName, ch.CrimeGroupName,
                   go.LookupValue AS Gravity,
                   COUNT(*) AS case_count,
                   COUNT(DISTINCT a.AccusedName) AS unique_accused,
                   COUNT(DISTINCT v.VictimName) AS unique_victims
            FROM CaseMaster cm
            JOIN Unit u ON cm.PoliceStationID = u.UnitID
            JOIN District d ON u.DistrictID = d.DistrictID
            JOIN CrimeHead ch ON cm.CrimeMajorHeadID = ch.CrimeHeadID
            JOIN GravityOffence go ON cm.GravityOffenceID = go.GravityOffenceID
            LEFT JOIN Accused a ON cm.CaseMasterID = a.CaseMasterID
            LEFT JOIN Victim v ON cm.CaseMasterID = v.CaseMasterID
            GROUP BY d.DistrictName, ch.CrimeGroupName, go.LookupValue
            ORDER BY case_count DESC
        """,
        description="Heavy cross-table aggregation (district × crime × gravity)",
    ),
]


# ---------------------------------------------------------------------------
# Benchmark runner
# ---------------------------------------------------------------------------
@dataclass
class BenchmarkResult:
    name: str
    category: str
    description: str
    iterations: int
    times_ms: list[float] = field(default_factory=list)
    avg_ms: float = 0.0
    median_ms: float = 0.0
    p90_ms: float = 0.0
    p95_ms: float = 0.0
    p99_ms: float = 0.0
    min_ms: float = 0.0
    max_ms: float = 0.0
    total_ms: float = 0.0
    row_count: int = 0
    slo_pass: bool = True
    slo_threshold_ms: float = 0.0


def _percentile(data: list[float], p: float) -> float:
    """Calculate the p-th percentile of a sorted list."""
    if not data:
        return 0.0
    k = (len(data) - 1) * (p / 100)
    f = int(k)
    c = f + 1
    if c >= len(data):
        return data[-1]
    return data[f] + (k - f) * (data[c] - data[f])


def run_benchmark(db_path: Path, iterations: int) -> list[BenchmarkResult]:
    """Execute all benchmark queries and collect timing statistics."""
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    # Warm up — run each query once to populate cache
    print("Warming up cache...")
    for bq in BENCHMARK_QUERIES:
        try:
            conn.execute(bq.sql, bq.params)
        except sqlite3.Error as e:
            print(f"  WARNING: {bq.name} failed during warmup: {e}", file=sys.stderr)

    results = []

    for i, bq in enumerate(BENCHMARK_QUERIES, 1):
        sys.stdout.write(f"\r  [{i:2d}/{len(BENCHMARK_QUERIES)}] Benchmarking: {bq.name:40s}")
        sys.stdout.flush()

        times = []
        row_count = 0

        for _ in range(iterations):
            start = time.perf_counter()
            try:
                cursor = conn.execute(bq.sql, bq.params)
                rows = cursor.fetchall()
                row_count = len(rows)
            except sqlite3.Error as e:
                print(f"\n  ERROR: {bq.name} failed: {e}", file=sys.stderr)
                times.append(float("inf"))
                continue
            elapsed = (time.perf_counter() - start) * 1000  # ms
            times.append(elapsed)

        times.sort()
        slo_key = bq.category
        slo_ms = SLO_THRESHOLDS.get(slo_key, 500)

        result = BenchmarkResult(
            name=bq.name,
            category=bq.category,
            description=bq.description,
            iterations=iterations,
            times_ms=times,
            avg_ms=statistics.mean(times),
            median_ms=statistics.median(times),
            p90_ms=_percentile(times, 90),
            p95_ms=_percentile(times, 95),
            p99_ms=_percentile(times, 99),
            min_ms=min(times),
            max_ms=max(times),
            total_ms=sum(times),
            row_count=row_count,
            slo_pass=_percentile(times, 95) <= slo_ms,
            slo_threshold_ms=slo_ms,
        )
        results.append(result)

    conn.close()
    print()
    return results


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------
def _color(text: str, code: str) -> str:
    """ANSI color wrapper."""
    if not sys.stdout.isatty():
        return text
    return f"\033[{code}m{text}\033[0m"


def _slo_badge(passed: bool) -> str:
    if passed:
        return _color("  PASS", "32")
    return _color("  FAIL", "31")


def print_results(results: list[BenchmarkResult]):
    """Print a formatted table to stdout."""
    print()
    print("=" * 120)
    print("  KSP FIR Database — SQLite Query Benchmark Results")
    print("=" * 120)
    print()

    # Group by category
    categories = {}
    for r in results:
        categories.setdefault(r.category, []).append(r)

    category_order = ["simple_select", "aggregate", "join_heavy", "complex_analytics", "full_scan"]
    category_labels = {
        "simple_select": "Simple Selects (SLO: 50ms P95)",
        "aggregate": "Aggregations (SLO: 100ms P95)",
        "join_heavy": "Join-Heavy (SLO: 200ms P95)",
        "complex_analytics": "Complex Analytics (SLO: 300ms P95)",
        "full_scan": "Full Table Scans (SLO: 500ms P95)",
    }

    total_pass = 0
    total_fail = 0

    for cat in category_order:
        cat_results = categories.get(cat, [])
        if not cat_results:
            continue

        label = category_labels.get(cat, cat)
        print(f"  {label}")
        print("  " + "-" * 116)
        print(f"  {'Query':<42s} {'Avg':>8s} {'Med':>8s} {'P90':>8s} {'P95':>8s} {'P99':>8s} {'Min':>8s} {'Max':>8s} {'Rows':>7s} {'SLO':>6s}")
        print("  " + "-" * 116)

        for r in sorted(cat_results, key=lambda x: x.avg_ms, reverse=True):
            print(
                f"  {r.name:<42s} "
                f"{r.avg_ms:>7.1f}ms "
                f"{r.median_ms:>7.1f}ms "
                f"{r.p90_ms:>7.1f}ms "
                f"{r.p95_ms:>7.1f}ms "
                f"{r.p99_ms:>7.1f}ms "
                f"{r.min_ms:>7.1f}ms "
                f"{r.max_ms:>7.1f}ms "
                f"{r.row_count:>6d} "
                f"{_slo_badge(r.slo_pass)}"
            )
            if r.slo_pass:
                total_pass += 1
            else:
                total_fail += 1

        print()

    # Summary
    total = total_pass + total_fail
    print("=" * 120)
    print(f"  Summary: {_color(str(total_pass), '32')} passed / {_color(str(total_fail), '31')} failed / {total} total")
    print(f"  SLO breach threshold: 95th percentile exceeds category target")
    print("=" * 120)
    print()

    if total_fail > 0:
        print("  Queries exceeding SLO:")
        for r in results:
            if not r.slo_pass:
                print(f"    - {r.name}: P95 = {r.p95_ms:.1f}ms (threshold: {r.slo_threshold_ms:.0f}ms)")
        print()


def export_json(results: list[BenchmarkResult], output_path: Path):
    """Write results to JSON for CI integration."""
    data = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "database": str(DEFAULT_DB),
        "iterations": results[0].iterations if results else 0,
        "summary": {
            "total": len(results),
            "passed": sum(1 for r in results if r.slo_pass),
            "failed": sum(1 for r in results if not r.slo_pass),
        },
        "queries": [
            {
                "name": r.name,
                "category": r.category,
                "description": r.description,
                "iterations": r.iterations,
                "avg_ms": round(r.avg_ms, 2),
                "median_ms": round(r.median_ms, 2),
                "p90_ms": round(r.p90_ms, 2),
                "p95_ms": round(r.p95_ms, 2),
                "p99_ms": round(r.p99_ms, 2),
                "min_ms": round(r.min_ms, 2),
                "max_ms": round(r.max_ms, 2),
                "row_count": r.row_count,
                "slo_pass": r.slo_pass,
                "slo_threshold_ms": r.slo_threshold_ms,
            }
            for r in results
        ],
    }

    output_path.write_text(json.dumps(data, indent=2))
    print(f"  JSON results written to: {output_path.resolve()}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Benchmark SQLite query performance for the KSP FIR database"
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB,
        help=f"Path to SQLite database (default: {DEFAULT_DB})",
    )
    parser.add_argument(
        "--iterations", "-n",
        type=int,
        default=DEFAULT_ITERATIONS,
        help=f"Iterations per query (default: {DEFAULT_ITERATIONS})",
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=None,
        help="Export results to JSON file",
    )
    args = parser.parse_args()

    print()
    print(f"  Database:   {args.db}")
    print(f"  Iterations: {args.iterations}")
    print(f"  Queries:    {len(BENCHMARK_QUERIES)}")
    print()

    results = run_benchmark(args.db, args.iterations)
    print_results(results)

    if args.output:
        export_json(results, args.output)

    # Exit code: 1 if any SLO breach
    if any(not r.slo_pass for r in results):
        sys.exit(1)


if __name__ == "__main__":
    main()
