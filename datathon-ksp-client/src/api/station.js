import { API_BASE as BASE } from "./config";

export async function getStationOverview(token) {
  const res = await fetch(`${BASE}/station/overview`, {
    headers: { "X-Auth-Token": token },
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event("session-expired"));
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return body.data;
}
