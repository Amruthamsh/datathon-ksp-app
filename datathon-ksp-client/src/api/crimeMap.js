import { API_BASE as BASE } from "./config";

async function handleResponse(res) {
  if (res.status === 401) {
    localStorage.removeItem("ksp_auth_token");
    localStorage.removeItem("ksp_auth_officer");
    window.dispatchEvent(new Event("session-expired"));
    throw new Error("Session expired");
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

function buildQueryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, value);
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function getSummary(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/summary${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getFilters(token) {
  const res = await fetch(`${BASE}/crime-map/filters`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getHeatmap(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/heatmap${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getClusters(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/clusters${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getDistrictSummary(token) {
  const res = await fetch(`${BASE}/crime-map/district-summary`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getHotspotDetail(token, lat, lng) {
  const qs = buildQueryString({ lat, lng });
  const res = await fetch(`${BASE}/crime-map/hotspot${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getTimeline(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/timeline-range${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getRepeatOffenders(token) {
  const res = await fetch(`${BASE}/crime-map/repeat-offenders`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getEmergingHotspots(token) {
  const res = await fetch(`${BASE}/crime-map/emerging-hotspots`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getDistribution(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/distribution${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getEmerging(token) {
  const res = await fetch(`${BASE}/crime-map/emerging`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getPatrolRecommendations(token) {
  const res = await fetch(`${BASE}/crime-map/patrol-recommendations`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getNetworkOverlay(token) {
  const res = await fetch(`${BASE}/crime-map/network-overlay`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getRepeatOffenderZones(token) {
  const res = await fetch(`${BASE}/crime-map/repeat-offender-zones`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getHeatmapTrends(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/heatmap-trends${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getCrimes(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/crimes${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getCrimesLight(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/crimes-light${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getCrimeDetail(token, caseId) {
  const res = await fetch(`${BASE}/crime-map/crime/${caseId}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getDistrictRisk(token) {
  const res = await fetch(`${BASE}/crime-map/district-risk`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getClusterIntel(token, lat, lng, params = {}) {
  const qs = buildQueryString({ lat, lng, ...params });
  const res = await fetch(`${BASE}/crime-map/cluster-intel${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getPatrolPlan(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/patrol-plan${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getPreventionPlan(token, params = {}) {
  const qs = buildQueryString(params);
  const res = await fetch(`${BASE}/crime-map/prevention-plan${qs}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getNetworkOverlayEnhanced(token) {
  const res = await fetch(`${BASE}/crime-map/network-overlay-enhanced`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}
