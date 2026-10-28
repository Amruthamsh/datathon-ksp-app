"""SQL-execution guard tests — read-only enforcement + happy path."""
import pytest

from db.sqlite.sqlite import get_connection
from db.sqlite.sqlite_metadata_repository import SQLiteMetadataRepository


def test_select_returns_dict_rows():
    repo = SQLiteMetadataRepository()
    rows = repo.execute_sql("SELECT DistrictName FROM District LIMIT 3")
    assert len(rows) == 3
    assert "DistrictName" in rows[0]


def test_canonical_district_join_pattern_works():
    """The exact join the agent prompt teaches must return rows."""
    repo = SQLiteMetadataRepository()
    rows = repo.execute_sql(
        """
        SELECT d.DistrictName, COUNT(*) AS CrimeCount
        FROM CaseMaster cm
        JOIN Unit u ON cm.PoliceStationID = u.UnitID
        JOIN District d ON u.DistrictID = d.DistrictID
        GROUP BY d.DistrictName ORDER BY CrimeCount DESC LIMIT 5
        """
    )
    assert len(rows) == 5
    assert rows[0]["CrimeCount"] >= rows[-1]["CrimeCount"]


def test_crime_type_join_pattern_works():
    repo = SQLiteMetadataRepository()
    rows = repo.execute_sql(
        """
        SELECT COUNT(*) AS MurderCount FROM CaseMaster cm
        JOIN CrimeSubHead csh ON cm.CrimeMinorHeadID = csh.CrimeSubHeadID
        WHERE csh.CrimeHeadName = 'Murder'
        """
    )
    assert rows[0]["MurderCount"] > 0


def test_write_is_blocked_by_query_only_pragma():
    """Connections are read-only (query_only=ON); writes must fail."""
    with get_connection() as conn:
        with pytest.raises(Exception):
            conn.execute("CREATE TABLE __evil (id INTEGER)")


def test_distinct_values_helper_shape():
    repo = SQLiteMetadataRepository()
    out = repo.get_distinct_values("District", "DistrictName", limit=5)
    assert set(out) == {"values", "total", "truncated"}
    assert out["total"] == 31
    assert out["truncated"] is True


# ── Static guard (agents/sql_query_db/functions/sql_guard.py) ──
from agents.sql_query_db.functions.sql_guard import validate_sql  # noqa: E402


@pytest.mark.parametrize("sql", [
    "SELECT COUNT(*) FROM CaseMaster",
    "WITH x AS (SELECT 1 AS n) SELECT n FROM x;",
    "SELECT * FROM Victim WHERE VictimName = 'Drop; delete'",
])
def test_guard_allows_reads(sql):
    assert validate_sql(sql)["passed"] is True


@pytest.mark.parametrize("sql", [
    "DROP TABLE CaseMaster",
    "SELECT 1; DELETE FROM CaseMaster",
    "PRAGMA query_only = OFF",
    "ATTACH DATABASE 'x.db' AS x",
    "",
])
def test_guard_blocks_writes(sql):
    v = validate_sql(sql)
    assert v["passed"] is False
    assert v["reason"].startswith("Blocked")


def test_guard_reports_tables():
    v = validate_sql("SELECT * FROM CaseMaster cm JOIN Unit u ON u.UnitID = cm.PoliceStationID")
    assert v["tables"] == ["CaseMaster", "Unit"]


# ── Jurisdiction enforcement (agents/sql_query_db/functions/sql_scope.py) ──
from agents.sql_query_db.functions.sql_scope import apply_scope  # noqa: E402

_DISTRICT = {"level": "district", "district_id": 5}


def _run(sql):
    return SQLiteMetadataRepository().execute_sql(sql)


def test_scope_limits_district_rollup_to_own_district():
    sql = (
        "SELECT d.DistrictName, COUNT(*) AS n FROM CaseMaster cm "
        "JOIN Unit u ON cm.PoliceStationID = u.UnitID "
        "JOIN District d ON u.DistrictID = d.DistrictID GROUP BY d.DistrictName"
    )
    scoped, info = apply_scope(sql, _DISTRICT)
    assert info["applied"] and info["tables"] == ["CaseMaster"]
    assert {r["DistrictName"] for r in _run(scoped)} == {"Bengaluru Urban"}


def test_scope_blocks_other_district_question():
    sql = (
        "SELECT COUNT(*) AS n FROM CaseMaster cm JOIN Unit u ON cm.PoliceStationID = u.UnitID "
        "JOIN District d ON u.DistrictID = d.DistrictID WHERE d.DistrictName = 'Mysuru'"
    )
    scoped, _ = apply_scope(sql, _DISTRICT)
    assert _run(sql)[0]["n"] > 0
    assert _run(scoped)[0]["n"] == 0


@pytest.mark.parametrize("sql", [
    "SELECT COUNT(*) AS n FROM Accused WHERE AgeYear < 18",
    "SELECT COUNT(*) AS n FROM Victim v",
    "WITH x AS (SELECT CaseMasterID FROM CaseMaster) SELECT COUNT(*) AS n FROM x",
])
def test_scope_covers_child_tables_and_ctes(sql):
    scoped, info = apply_scope(sql, _DISTRICT)
    assert info["applied"]
    assert _run(scoped)[0]["n"] < _run(sql)[0]["n"]


def test_statewide_scope_is_untouched():
    sql = "SELECT COUNT(*) FROM CaseMaster"
    assert apply_scope(sql, {"level": "all"}) == (sql, {"applied": False, "tables": [], "level": "all"})


def test_scope_without_identity_denies():
    scoped, _ = apply_scope("SELECT COUNT(*) AS n FROM CaseMaster", {"level": "self"})
    assert _run(scoped)[0]["n"] == 0
