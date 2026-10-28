import { API_BASE as BASE } from "./config";

async function getJson(token, path) {
  const res = await fetch(`${BASE}${path}`, { headers: { "X-Auth-Token": token } });
  if (res.status === 401) {
    window.dispatchEvent(new Event("session-expired"));
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data;
}

export const getOfficerSupervision = (token) => getJson(token, "/supervision/officers");

export const getCrossBorder = (token, limit = 12) => getJson(token, `/network/cross-border?limit=${limit}`);
