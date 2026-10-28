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
