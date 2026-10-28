"""Final Report draft (services/final_report_service.py) — records only."""
import sqlite3

from services.final_report_service import OFFENCES, build_final_report


def _db():
    import os
    return sqlite3.connect(os.environ["SQLITE_DATABASE_PATH"])


def test_every_offence_type_has_a_charge_mapping():
    crimes = {r[0] for r in _db().execute("SELECT CrimeHeadName FROM CrimeSubHead")}
    assert crimes <= set(OFFENCES)


def test_charge_follows_offence_not_fir_tags():
    r = build_final_report(14888)  # cheating case tagged ARMS / NDPS / MV
    assert [(c["act"], c["section"]) for c in r["offence"]["charges"]] == [("BNS", "318(4)")]
    assert all(not s["consistent"] for s in r["offence"]["recorded_sections"])
    assert any("not supported by the offence" in f["text"] for f in r["flags"])


def test_children_are_never_charge_sheeted_with_adults():
    r = build_final_report(14888)
    charged = {a["name"] for a in r["accused"]}
    assert {j["name"] for j in r["juveniles"]} == {"Radha Shetty", "Jeremiah Chauhan"}
    assert not charged & {j["name"] for j in r["juveniles"]}
    assert all(a["age"] >= 18 for a in r["accused"])


def test_default_bail_is_per_accused_in_custody():
    r = build_final_report(14888)
    by_name = {a["name"]: a for a in r["accused"]}
    assert by_name["Urvashi Setty"]["default_bail"]["deadline"] == "2026-07-25"
    assert by_name["Ikbal Madan"]["default_bail"] is None  # never arrested
    assert by_name["Ikbal Madan"]["arrest"]["todo"]


def test_pre_reform_cases_use_ipc_and_crpc():
    cid = _db().execute(
        "SELECT CaseMasterID FROM CaseMaster WHERE IncidentFromDate < '2024-01-01' LIMIT 1"
    ).fetchone()[0]
    r = build_final_report(cid)
    assert r["law"]["substantive"] == "IPC" and r["law"]["procedure"] == "CrPC"
    assert all(c["act"] != "BNS" for c in r["offence"]["charges"])
    assert any("s.161 CrPC" in d["name"] for d in r["documents"])


def test_gaps_are_explicit_never_invented():
    r = build_final_report(14888)
    assert r["todo_count"] > 0
    assert r["header"]["report_no"]["todo"] and r["header"]["report_no"]["value"] is None
    for a in r["accused"]:
        assert a["address"]["value"] is None and a["address"]["todo"]
