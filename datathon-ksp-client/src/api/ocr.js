import { API_BASE as BASE } from "./config";

async function handleResponse(res) {
  if (res.status === 401) {
    localStorage.removeItem("ksp_auth_token");
    localStorage.removeItem("ksp_auth_officer");
    window.dispatchEvent(new Event("session-expired"));
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function analyzeDocumentImage(token, file, { caseHint = "", language = "en" } = {}) {
  const form = new FormData();
  form.append("file", file);
  form.append("case_hint", caseHint);
  form.append("language", language);
  const res = await fetch(`${BASE}/ocr/analyze`, {
    method: "POST",
    headers: { "X-Auth-Token": token },
    body: form,
  });
  return handleResponse(res);
}
