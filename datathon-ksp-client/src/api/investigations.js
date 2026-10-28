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
      "X-Auth-Token": token,
    },
  });
  return handleResponse(res);
}

export async function getFilters(token) {
  const res = await fetch(`${BASE}/investigations/filters`, {
    headers: {
      "X-Auth-Token": token,
    },
  });
  return handleResponse(res);
}

export async function getInvestigations(token, params = {}) {
  const queryParams = {
    page: params.page ?? 1,
    page_size: params.pageSize ?? params.page_size ?? 100,
    status_filter: params.statusFilter ?? params.status_filter,
    gravity: params.gravity,
    station: params.station,
    district: params.district,
    crime_head: params.crimeHead ?? params.crime_head,
    officer: params.officer,
    search: params.search,
    sort: params.sort ?? "priority",
    sort_dir: params.sortDir ?? params.sort_dir ?? "desc",
    only_overdue: params.onlyOverdue ?? params.only_overdue ? true : undefined,
    only_chargesheet_pending:
      params.onlyChargesheetPending ?? params.only_chargesheet_pending
        ? true
        : undefined,
    only_arrest_pending:
      params.onlyArrestPending ?? params.only_arrest_pending ? true : undefined,
    only_under_investigation:
      params.onlyUnderInvestigation ?? params.only_under_investigation
        ? true
        : undefined,
    only_pending_trial:
      params.onlyPendingTrial ?? params.only_pending_trial ? true : undefined,
    bnss_rule: params.bnssRule,
    bnss_band: params.bnssBand,
  };

  const queryString = buildQueryString(queryParams);

  const res = await fetch(`${BASE}/investigations${queryString}`, {
    headers: {
      "X-Auth-Token": token,
    },
  });
  return handleResponse(res);
}

export async function getCaseDetails(token, caseId) {
  const res = await fetch(`${BASE}/investigations/${caseId}`, {
    headers: {
      "X-Auth-Token": token,
    },
  });
  return handleResponse(res);
}

export async function getCaseIntel(token, caseId) {
  const res = await fetch(`${BASE}/investigations/${caseId}/intel`, {
    headers: {
      "X-Auth-Token": token,
    },
  });
  return handleResponse(res);
}

// Deterministic Final Report (chargesheet) draft — records only, gaps flagged.
export async function getFinalReport(token, caseId) {
  const res = await fetch(`${BASE}/investigations/${caseId}/final-report`, {
    headers: {
      "X-Auth-Token": token,
    },
  });
  return handleResponse(res);
}

export async function getSimilarCases(token, caseId) {
  const res = await fetch(`${BASE}/investigations/${caseId}/similar`, {
    headers: {
      "X-Auth-Token": token,
    },
  });
  return handleResponse(res);
}

export async function getCaseBrief(token, caseId, params = {}) {
  const queryString = buildQueryString({ language: params.language });
  const res = await fetch(
    `${BASE}/investigations/${caseId}/brief${queryString}`,
    {
      headers: {
        "X-Auth-Token": token,
      },
    },
  );
  return handleResponse(res);
}
