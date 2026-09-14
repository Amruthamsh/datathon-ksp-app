// RBAC tiers (mirrors backend auth/roles.py):
//   state_command    — DGP / ADGP / IGP / DIG        (Hierarchy 1-4, statewide)
//   district_command — SP / DySP                     (Hierarchy 5-6, own district)
//   station_command  — Inspector / Sub-Inspector     (Hierarchy 7-8, own station)
//   field_force      — ASI / HC / PC                 (Hierarchy 9-11, own cases only)

export const TIERS = {
  STATE: "state_command",
  DISTRICT: "district_command",
  STATION: "station_command",
  FIELD: "field_force",
};

function normalizeRank(officer) {
  if (!officer) return "";
  // Backend /auth/me returns { officer: { rank } }; enriched user may also carry tier/hierarchy.
  if (officer.tier) return officer.tier;
  const raw = String(
    officer.rank || officer.designation || officer.Designation || officer.role || officer.Role || ""
  ).trim();
  return raw;
}

export function getOfficerTier(officer) {
  if (officer?.tier) return officer.tier;
  if (typeof officer?.hierarchy === "number") {
    const h = officer.hierarchy;
    if (h >= 1 && h <= 4) return TIERS.STATE;
    if (h >= 5 && h <= 6) return TIERS.DISTRICT;
    if (h >= 7 && h <= 8) return TIERS.STATION;
    return TIERS.FIELD;
  }
  const v = normalizeRank(officer).toLowerCase();
  if (
    v.includes("director general") ||
    v.includes("inspector general") ||
    v.includes("deputy inspector general") ||
    v === "dgp" || v === "adgp" || v === "igp" || v === "dig"
  ) return TIERS.STATE;
  if (v.includes("superintendent") || v.includes("dysp") || v.includes("deputy") || v === "sp") {
    // "deputy" alone could be DySP (district) — station ranks never use "deputy"
    return TIERS.DISTRICT;
  }
  if (
    (v.includes("inspector") && !v.includes("sub") && !v.includes("assistant")) ||
    v === "inspector" ||
    v.includes("sub-inspector") || v.includes("sub inspector") || v === "si"
  ) return TIERS.STATION;
  return TIERS.FIELD;
}

export function canViewCrimeMap(officerOrTier) {
  const tier = typeof officerOrTier === "string" ? officerOrTier : getOfficerTier(officerOrTier);
  return tier === TIERS.STATE || tier === TIERS.DISTRICT;
}

export function scopeLabel(tier) {
  switch (tier) {
    case TIERS.STATE: return "All cases statewide";
    case TIERS.DISTRICT: return "All cases in your district";
    case TIERS.STATION: return "All cases in your station";
    default: return "Only your assigned cases";
  }
}

// ── legacy helpers (kept for InvestigationWorkspace) ──
export function getOfficerRank(officer) {
  if (!officer) return "SI";
  const raw = String(
    officer.rank || officer.designation || officer.Designation || officer.role || officer.Role || ""
  ).trim();
  const v = raw.toLowerCase();
  if (v.includes("director general") || v.includes("additional director") || v === "dgp" || v === "adgp") return "DGP";
  if (v.includes("inspector general") || v === "igp") return "IGP";
  if (v.includes("deputy inspector general") || v === "dig") return "DIG";
  if (v.includes("dysp") || v.includes("deputy")) return "DySP";
  if (v === "sp" || v.includes("superintendent")) return "SP";
  if (v.includes("inspector") && !v.includes("sub")) return "Inspector";
  if (v.includes("sub-inspector") || v === "si" || v.includes("sub inspector")) return "SI";
  if (v.includes("asi") || v.includes("assistant sub")) return "ASI";
  if (v.includes("head constable") || v === "hc" || v.includes("constable")) return "HC";
  return "SI";
}

export function isSupervisorRank(rank) {
  return rank === "Inspector" || rank === "DySP" || rank === "SP" || rank === "DGP" || rank === "IGP" || rank === "DIG";
}
export function isFieldRank(rank) {
  return rank === "ASI" || rank === "HC";
}
