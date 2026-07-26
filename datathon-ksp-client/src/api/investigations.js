import { API_BASE } from "../config";

const BASE = `${API_BASE}/server/datathon-ksp-app`;

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

/**
 * Helper function to build query strings, filtering out undefined/null/empty parameters
 */
function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, value);
    }
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export async function getSummary(token) {
  const res = await fetch(`${BASE}/investigations/summary`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

export async function getFilters(token) {
  const res = await fetch(`${BASE}/investigations/filters`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

export async function getInvestigations(token, params = {}) {
  const queryParams = {
    page: params.page ?? 1,
    page_size: params.pageSize ?? params.page_size ?? 25,
    status_filter: params.statusFilter ?? params.status_filter,
    gravity: params.gravity,
    station: params.station,
    district: params.district,
    crime_head: params.crimeHead ?? params.crime_head,
    search: params.search,
    sort: params.sort ?? "priority",
  };

  const queryString = buildQueryString(queryParams);

  const res = await fetch(`${BASE}/investigations/${queryString}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

export async function getCaseDetails(token, caseId) {
  const res = await fetch(`${BASE}/investigations/${caseId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

export async function getCaseIntel(token, caseId) {
  const res = await fetch(`${BASE}/investigations/${caseId}/intel`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}

export async function getSimilarCases(token, caseId) {
  const res = await fetch(`${BASE}/investigations/${caseId}/similar`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return handleResponse(res);
}
