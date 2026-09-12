import { API_BASE as BASE } from "./config";

async function handleResponse(res) {
  if (res.status === 401) {
    let detail = "";
    try {
      const data = await res.json();
      detail = data?.detail || "";
    } catch {
      detail = "";
    }
    // Only treat expired/invalid sessions as a global logout.
    // A wrong current-password attempt also returns 401 but must NOT log out.
    if (/session|expired|invalid|token/i.test(detail)) {
      localStorage.removeItem("ksp_auth_token");
      localStorage.removeItem("ksp_auth_officer");
      window.dispatchEvent(new Event("session-expired"));
    }
    throw new Error(detail || "Unauthorized");
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") detail = data.detail;
      else if (Array.isArray(data?.detail)) {
        detail = data.detail
          .map((d) => (typeof d === "string" ? d : d?.msg || ""))
          .filter(Boolean)
          .join("; ");
      } else if (data?.message) detail = data.message;
    } catch {
      // keep default detail
    }
    throw new Error(detail);
  }

  return res.json();
}

export async function changePassword(token, currentPassword, newPassword) {
  const res = await fetch(`${BASE}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  return handleResponse(res);
}
