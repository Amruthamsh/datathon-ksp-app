export function getOfficerRank(officer) {
  if (!officer) return "SI";
  const raw = String(
    officer.rank || officer.designation || officer.Designation || officer.role || officer.Role || ""
  ).trim();
  const v = raw.toLowerCase();
  if (v.includes("dysp") || v.includes("deputy")) return "DySP";
  if (v === "sp" || v.includes("superintendent")) return "SP";
  if (v.includes("inspector") && !v.includes("sub")) return "Inspector";
  if (v.includes("sub-inspector") || v === "si" || v.includes("sub inspector")) return "SI";
  if (v.includes("asi") || v.includes("assistant sub")) return "ASI";
  if (v.includes("head constable") || v === "hc" || v.includes("constable")) return "HC";
  // numeric fallbacks if backend sends rank codes
  return "SI";
}

export function isSupervisorRank(rank) {
  return rank === "Inspector" || rank === "DySP" || rank === "SP";
}
export function isFieldRank(rank) {
  return rank === "ASI" || rank === "HC";
}
