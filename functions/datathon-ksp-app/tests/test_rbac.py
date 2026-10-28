"""RBAC unit tests — the 4-tier command model in auth/roles.py."""
from auth.roles import (
    DISTRICT_COMMAND,
    FIELD_FORCE,
    STATION_COMMAND,
    STATE_COMMAND,
    build_scope,
    can_view_crime_map,
    can_view_networks_bulk,
    case_in_scope,
    scope_level_for_tier,
    tier_from_hierarchy,
    tier_from_rank_name,
)


def test_tier_from_hierarchy_boundaries():
    assert tier_from_hierarchy(1) == STATE_COMMAND
    assert tier_from_hierarchy(4) == STATE_COMMAND
    assert tier_from_hierarchy(5) == DISTRICT_COMMAND
    assert tier_from_hierarchy(6) == DISTRICT_COMMAND
    assert tier_from_hierarchy(7) == STATION_COMMAND
    assert tier_from_hierarchy(8) == STATION_COMMAND
    assert tier_from_hierarchy(9) == FIELD_FORCE
    assert tier_from_hierarchy(11) == FIELD_FORCE


def test_tier_from_hierarchy_invalid_falls_back_to_field():
    assert tier_from_hierarchy(None) == FIELD_FORCE
    assert tier_from_hierarchy(0) == FIELD_FORCE
    assert tier_from_hierarchy(99) == FIELD_FORCE
    assert tier_from_hierarchy("SP") == FIELD_FORCE


def test_tier_from_rank_name():
    assert tier_from_rank_name("Director General of Police") == STATE_COMMAND
    assert tier_from_rank_name("Superintendent of Police") == DISTRICT_COMMAND
    assert tier_from_rank_name("DySP") == DISTRICT_COMMAND
    assert tier_from_rank_name("Inspector") == STATION_COMMAND
    assert tier_from_rank_name("Sub-Inspector") == STATION_COMMAND
    assert tier_from_rank_name("Police Constable") == FIELD_FORCE
    assert tier_from_rank_name("") == FIELD_FORCE
    assert tier_from_rank_name(None) == FIELD_FORCE
    assert tier_from_rank_name("SP") == DISTRICT_COMMAND
    assert tier_from_rank_name("SI") == STATION_COMMAND


def test_scope_levels_and_gates():
    assert scope_level_for_tier(STATE_COMMAND) == "all"
    assert scope_level_for_tier(DISTRICT_COMMAND) == "district"
    assert scope_level_for_tier(STATION_COMMAND) == "unit"
    assert scope_level_for_tier(FIELD_FORCE) == "self"

    assert can_view_crime_map(STATE_COMMAND)
    assert can_view_crime_map(DISTRICT_COMMAND)
    assert not can_view_crime_map(STATION_COMMAND)
    assert not can_view_crime_map(FIELD_FORCE)

    assert can_view_networks_bulk(STATE_COMMAND)
    assert can_view_networks_bulk(STATION_COMMAND)
    assert not can_view_networks_bulk(FIELD_FORCE)


def test_case_in_scope_state_sees_everything():
    scope = build_scope(STATE_COMMAND, 1, 10, 100)
    assert case_in_scope(scope, {"CaseMasterID": 5}) is True
    assert case_in_scope(scope, None) is False


def test_case_in_scope_district_matches_district_id():
    scope = build_scope(DISTRICT_COMMAND, 7, 12, 120)
    assert case_in_scope(scope, {"DistrictID": 12}) is True
    assert case_in_scope(scope, {"DistrictID": 13}) is False


def test_case_in_scope_unit_matches_station():
    scope = build_scope(STATION_COMMAND, 7, 12, 120)
    assert case_in_scope(scope, {"PoliceStationID": 120}) is True
    assert case_in_scope(scope, {"PoliceStationID": 121}) is False


def test_case_in_scope_self_requires_ownership():
    scope = build_scope(FIELD_FORCE, 42, 12, 120)
    assert case_in_scope(scope, {"PolicePersonID": 42}) is True
    assert case_in_scope(scope, {"PolicePersonID": 43}) is False
