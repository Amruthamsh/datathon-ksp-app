"""SQLite contract tests — guard the schema assumptions the SQL agent depends on.

The generate_sql system prompt hard-codes three invariants:
  1. CaseMaster has NO DistrictID (join via Unit -> District)
  2. CaseMaster has NO FIRDate (date col is CrimeRegisteredDate)
  3. Crime type lives in CrimeSubHead.CrimeHeadName, not CaseCategory
These tests fail loudly if a data reload breaks them.
"""
from db.sqlite.sqlite import SQLITE_DATABASE_PATH, get_connection
from db.sqlite.sqlite_metadata_repository import SQLiteMetadataRepository


def _columns(table: str) -> set[str]:
    with get_connection() as conn:
        return {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def test_database_file_exists():
    import os

    assert os.path.isfile(SQLITE_DATABASE_PATH), SQLITE_DATABASE_PATH


def test_core_tables_present():
    repo = SQLiteMetadataRepository()
    schemas = repo.get_schemas()
    for required in (
        "CaseMaster",
        "District",
        "Unit",
        "CrimeHead",
        "CrimeSubHead",
        "Employee",
        "Rank",
        "Accused",
        "Victim",
    ):
        assert required in schemas, f"missing table {required}"


def test_casemaster_has_no_districtid_or_firdate():
    cols = _columns("CaseMaster")
    assert "DistrictID" not in cols, "agent prompt assumes no CaseMaster.DistrictID"
    assert "FIRDate" not in cols, "agent prompt assumes date col is CrimeRegisteredDate"
    assert "CrimeRegisteredDate" in cols
    assert "PoliceStationID" in cols
    assert "CrimeMinorHeadID" in cols


def test_district_coverage_is_31():
    with get_connection() as conn:
        n = conn.execute("SELECT COUNT(*) FROM District").fetchone()[0]
    assert n == 31, f"expected 31 districts, got {n}"


def test_casemaster_has_rows_and_valid_dates():
    with get_connection() as conn:
        n = conn.execute("SELECT COUNT(*) FROM CaseMaster").fetchone()[0]
        bad_dates = conn.execute(
            "SELECT COUNT(*) FROM CaseMaster "
            "WHERE CrimeRegisteredDate IS NULL OR CrimeRegisteredDate < '2020-01-01'"
        ).fetchone()[0]
    assert n > 10_000, f"expected 50k FIRs, got {n}"
    assert bad_dates == 0, f"{bad_dates} rows with missing/implausible dates"


def test_unit_district_join_integrity():
    """Every CaseMaster must resolve to a District via Unit."""
    with get_connection() as conn:
        orphan = conn.execute(
            """
            SELECT COUNT(*) FROM CaseMaster cm
            LEFT JOIN Unit u ON cm.PoliceStationID = u.UnitID
            WHERE u.UnitID IS NULL
            """
        ).fetchone()[0]
    assert orphan == 0, f"{orphan} cases with no Unit join"


def test_crime_subhead_has_murder():
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM CrimeSubHead WHERE CrimeHeadName = 'Murder'"
        ).fetchone()[0]
    assert row >= 1


def test_coordinates_within_karnataka_bbox():
    """Lat 11.5-18.5, lng 74-78.6 — flags the known out-of-state drift (TODO #9)."""
    with get_connection() as conn:
        total, outside = conn.execute(
            """
            SELECT COUNT(*),
                   SUM(CASE WHEN latitude < 11.5 OR latitude > 18.5
                             OR longitude < 74.0 OR longitude > 78.6
                            THEN 1 ELSE 0 END)
            FROM CaseMaster WHERE latitude IS NOT NULL
            """
        ).fetchone()
    assert total > 0
    drift_pct = (outside or 0) / total
    assert drift_pct < 0.05, f"{drift_pct:.1%} of cases outside Karnataka bbox"
