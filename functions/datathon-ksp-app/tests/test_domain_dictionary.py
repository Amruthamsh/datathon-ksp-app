"""Domain-dictionary coverage — the Kannada<->English bridge for the agent."""
from config import domain_dictionary as dd


def test_crime_head_roundtrip():
    assert dd.CRIME_HEAD_KN_EN["ಕೊಲೆ".replace("ಕೊಲೆ", "ದೈಹಿಕ ಅಪರಾಧಗಳು")] == "Crimes Against Body"
    for kn, en in dd.CRIME_HEAD_KN_EN.items():
        assert dd.CRIME_HEAD_EN_KN[en] == kn


def test_all_31_districts_mapped():
    assert len(dd.DISTRICT_KN_EN) >= 31
    assert dd.DISTRICT_KN_EN["ಬೆಂಗಳೂರು ನಗರ"] == "Bengaluru Urban"
    assert dd.DISTRICT_KN_EN["ಮೈಸೂರು"] == "Mysuru"


def test_key_crime_terms_mapped():
    assert dd.CRIME_SUBHEAD_KN_EN["ಕೊಲೆ"] == "Murder"
    assert dd.CRIME_SUBHEAD_KN_EN["ಕಳ್ಳತನ"] == "Theft"
    assert dd.CRIME_SUBHEAD_KN_EN["ದರೋಡೆ"] == "Robbery"


def test_dictionary_values_match_database():
    """Every mapped district name must exist verbatim in SQLite."""
    from db.sqlite.sqlite import get_connection

    with get_connection() as conn:
        db_names = {r[0] for r in conn.execute("SELECT DistrictName FROM District")}
    missing = [en for en in dd.DISTRICT_KN_EN.values() if en not in db_names]
    assert not missing, f"dictionary names absent from DB: {missing}"
