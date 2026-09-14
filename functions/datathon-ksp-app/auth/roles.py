# auth/roles.py — central RBAC for KSP.
#
# 11 police ranks (Rank.Hierarchy 1-11) collapse into 4 access tiers:
#   STATE_COMMAND    (1-4): DGP, ADGP, IGP, DIG      -> statewide
#   DISTRICT_COMMAND (5-6): SP, DySP                 -> own district
#   STATION_COMMAND  (7-8): Inspector, Sub-Inspector -> own station/unit (+ own cases)
#   FIELD_FORCE      (9-11): ASI, Head Constable, Police Constable -> own assigned cases only
#
# Rationale: mirrors actual KSP command structure (state HQ / district SP office /
# circle-station / beat-constabulary) instead of 11 one-off roles.

from __future__ import annotations

STATE_COMMAND = "state_command"
DISTRICT_COMMAND = "district_command"
STATION_COMMAND = "station_command"
FIELD_FORCE = "field_force"

TIER_ORDER = [STATE_COMMAND, DISTRICT_COMMAND, STATION_COMMAND, FIELD_FORCE]

TIER_LABELS = {
    STATE_COMMAND: "State Command",
    DISTRICT_COMMAND: "District Command",
    STATION_COMMAND: "Station Command",
    FIELD_FORCE: "Field Force",
}

# Hierarchy (1 = highest) -> tier
def tier_from_hierarchy(hierarchy: int | None) -> str:
    try:
        h = int(hierarchy)
    except (TypeError, ValueError):
        return FIELD_FORCE
    if 1 <= h <= 4:
        return STATE_COMMAND
    if 5 <= h <= 6:
        return DISTRICT_COMMAND
    if 7 <= h <= 8:
        return STATION_COMMAND
    return FIELD_FORCE


# Fallback when only a rank *name* is available (e.g. token payload, no DB row yet).
_RANK_NAME_TO_HIERARCHY = {
    "director general of police": 1,
    "additional director general of police": 2,
    "inspector general of police": 3,
    "deputy inspector general of police": 4,
    "superintendent of police": 5,
    "deputy superintendent of police": 6,
    "dysp": 6,
    "inspector": 7,
    "sub-inspector": 8,
    "sub inspector": 8,
    "assistant sub-inspector": 9,
    "assistant sub inspector": 9,
    "asi": 9,
    "head constable": 10,
    "police constable": 11,
    "constable": 11,
}


def tier_from_rank_name(rank_name: str | None) -> str:
    if not rank_name:
        return FIELD_FORCE
    v = str(rank_name).strip().lower()
    # exact match first, then substring match (handles "DySP", "SI", "HC", ...)
    if v in _RANK_NAME_TO_HIERARCHY:
        return tier_from_hierarchy(_RANK_NAME_TO_HIERARCHY[v])
    for name, h in _RANK_NAME_TO_HIERARCHY.items():
        if len(name) > 3 and name in v:
            return tier_from_hierarchy(h)
    if v in ("sp", "si", "hc", "pc"):
        return tier_from_hierarchy({"sp": 5, "si": 8, "hc": 10, "pc": 11}[v])
    return FIELD_FORCE


def scope_level_for_tier(tier: str) -> str:
    """Map tier -> case-visibility level used by repositories."""
    return {
        STATE_COMMAND: "all",
        DISTRICT_COMMAND: "district",
        STATION_COMMAND: "unit",
        FIELD_FORCE: "self",
    }.get(tier, "self")


def can_view_crime_map(tier: str) -> bool:
    """Crime Intelligence Map is a whole-feature gate: command tiers only."""
    return tier in (STATE_COMMAND, DISTRICT_COMMAND)


def can_view_networks_bulk(tier: str) -> bool:
    """Bulk network endpoints (communities / bridge-individuals) are command + station only."""
    return tier in (STATE_COMMAND, DISTRICT_COMMAND, STATION_COMMAND)


def build_scope(
    tier: str,
    employee_id: int | None,
    district_id: int | None,
    unit_id: int | None,
) -> dict:
    return {
        "tier": tier,
        "level": scope_level_for_tier(tier),
        "employee_id": employee_id,
        "district_id": district_id,
        "unit_id": unit_id,
    }


def case_in_scope(scope: dict, case: dict | None) -> bool:
    """Row-level guard for single-case detail endpoints."""
    if not case:
        return False
    level = (scope or {}).get("level", "self")
    if level == "all":
        return True
    if level == "district":
        # repositories expose DistrictID (similar/intel) or DistrictName; prefer IDs when present
        return case.get("DistrictID") == scope.get("district_id") if "DistrictID" in case else True
    if level == "unit":
        if "PoliceStationID" in case:
            return case.get("PoliceStationID") == scope.get("unit_id")
        return True
    # self: must be the assigned officer
    emp = scope.get("employee_id")
    for key in ("PolicePersonID", "PolicePersonId", "assigned_employee_id", "EmployeeID"):
        if key in case and case[key] is not None:
            return case.get(key) == emp
    return True  # no ownership column selected -> let list-level filter decide
