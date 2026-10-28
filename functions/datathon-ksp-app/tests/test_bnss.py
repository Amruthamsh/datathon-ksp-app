"""BNSS statutory-clock engine (services/bnss_service.py)."""
from db.sqlite.sqlite import get_connection
from services import bnss_service as bnss


def _clocks(where=""):
    with get_connection() as conn:
        return [dict(r) for r in conn.execute(f"SELECT * FROM ({bnss.clocks_sql()}) {where}")]


def test_limits_follow_offence_punishment():
    rows = _clocks("WHERE rule = 'default_bail'")
    assert rows
    for r in rows:
        expected = 90 if r["crime"] in bnss.NINETY_DAY_OFFENCES else 60
        assert r["limit_days"] == expected


def test_bands_match_days_left():
    for r in _clocks("LIMIT 2000"):
        if r["days_left"] < 0:
            assert r["band"] == "breached"
        elif r["days_left"] <= bnss.CRITICAL_DAYS:
            assert r["band"] == "critical"


def test_sexual_offence_clock_only_for_sexual_offences():
    assert {r["crime"] for r in _clocks("WHERE rule = 'sexual_offence'")} == {"Sexual Assault"}


def test_compliance_shape_and_consistency():
    data = bnss.get_compliance({"level": "all"})
    bail = next(r for r in data["rules"] if r["id"] == "default_bail")
    assert data["headline"]["bail_critical"] == bail["counts"]["critical"]
    assert all(r["counts"] is None for r in data["rules"] if not r["live"])
    assert 0 < data["headline"]["on_time_rate"] < 100
    # Expiring cases are critical and ranked by accused network reach.
    reach = [e["reach"] for e in data["expiring"]]
    assert reach == sorted(reach, reverse=True)
    assert all(0 <= e["days_left"] <= bnss.CRITICAL_DAYS for e in data["expiring"])


def test_overdue_count_matches_queue_filter():
    from db.sqlite.sqlite_investigation_repository import SQLiteInvestigationRepository

    with get_connection() as conn:
        n = bnss.count_overdue(conn, {"level": "all"})
    out = SQLiteInvestigationRepository().get_investigations(
        employee_id=1, page=1, page_size=5, scope={"level": "all"}, only_overdue=True
    )
    assert out["total"] == n
    assert all(row["Bnss"] for row in out["data"])


def test_case_clocks_have_deadlines():
    row = _clocks("WHERE rule = 'default_bail' LIMIT 1")[0]
    clocks = bnss.get_case_clocks(row["CaseMasterID"])
    assert any(c["rule"] == "default_bail" and c["deadline"] for c in clocks)
