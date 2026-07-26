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

export async function saveReport(token, report) {
  const res = await fetch(`${BASE}/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    },
    body: JSON.stringify(report),
  });

  return handleResponse(res);
}

export async function listReports(token) {
  const res = await fetch(`${BASE}/reports`, {
    headers: {
      "X-Auth-Token": token,
    },
  });

  return handleResponse(res);
}

export async function getReport(token, reportId) {
  const res = await fetch(`${BASE}/reports/${reportId}`, {
    headers: {
      "X-Auth-Token": token,
    },
  });

  return handleResponse(res);
}

export async function deleteReport(token, reportId) {
  const res = await fetch(`${BASE}/reports/${reportId}`, {
    method: "DELETE",
    headers: {
      "X-Auth-Token": token,
    },
  });

  return handleResponse(res);
}

export async function executeReportQuery(sqlQuery, token) {
  const response = await fetch(`${BASE}/reports/execute-query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    },
    body: JSON.stringify({ sql_query: sqlQuery }),
  });

  if (!response.ok) {
    throw new Error("Query execution failed");
  }

  return await response.json();
}
