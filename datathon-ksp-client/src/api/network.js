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

export async function getNetworkSummary(token) {
  const res = await fetch(`${BASE}/network/summary`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function searchNetwork(token, q) {
  const res = await fetch(
    `${BASE}/network/search?q=${encodeURIComponent(q)}`,
    { headers: { "X-Auth-Token": token } },
  );
  return handleResponse(res);
}

export async function getPersonProfile(token, personName) {
  const res = await fetch(
    `${BASE}/network/person/${encodeURIComponent(personName)}/profile`,
    { headers: { "X-Auth-Token": token } },
  );
  return handleResponse(res);
}

export async function getPersonGraph(token, personName, depth = 1) {
  const res = await fetch(
    `${BASE}/network/person/${encodeURIComponent(personName)}/graph?depth=${depth}`,
    { headers: { "X-Auth-Token": token } },
  );
  return handleResponse(res);
}

export async function getPersonAssociates(token, personName) {
  const res = await fetch(
    `${BASE}/network/person/${encodeURIComponent(personName)}/associates`,
    { headers: { "X-Auth-Token": token } },
  );
  return handleResponse(res);
}

export async function getPersonTimeline(token, personName) {
  const res = await fetch(
    `${BASE}/network/person/${encodeURIComponent(personName)}/timeline`,
    { headers: { "X-Auth-Token": token } },
  );
  return handleResponse(res);
}

export async function getPersonAnalytics(token, personName) {
  const res = await fetch(
    `${BASE}/network/person/${encodeURIComponent(personName)}/analytics`,
    { headers: { "X-Auth-Token": token } },
  );
  return handleResponse(res);
}

export async function getCommunities(token) {
  const res = await fetch(`${BASE}/network/communities`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getBridgeIndividuals(token, limit = 20) {
  const res = await fetch(`${BASE}/network/bridge-individuals?limit=${limit}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}
