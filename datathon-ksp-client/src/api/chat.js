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

export async function generateResponse(
  token,
  userQuery,
  conversationId = null,
  language = "en",
  files = [],
  context = {},
) {
  const formData = new FormData();
  // Enrich the query with contextual intelligence markers so the backend
  // can distinguish sources without changing the API contract.
  let enrichedQuery = userQuery;
  const ctxHints = [];
  if (context.useLocation && context.location) {
    const { lat, lng, radiusKm } = context.location;
    ctxHints.push(
      `[Location context: lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)}, radius ${radiusKm}km]`,
    );
  } else if (context.useLocation) {
    ctxHints.push(`[Location context: enabled, radius ${context.location?.radiusKm ?? 5}km]`);
  }
  if (context.useWeb) ctxHints.push("[Open Web: include public sources]");
  // Crime Database is always the authoritative source
  if (ctxHints.length) enrichedQuery += `\n\n${ctxHints.join(" ")}`;

  formData.append("user_query", enrichedQuery);
  formData.append("language", language);
  if (conversationId) formData.append("conversation_id", conversationId);
  // Forward raw context flags for future backend use
  if (context.useLocation) formData.append("use_location", "true");
  if (context.location?.lat) formData.append("location_lat", String(context.location.lat));
  if (context.location?.lng) formData.append("location_lng", String(context.location.lng));
  if (context.location?.radiusKm) formData.append("location_radius_km", String(context.location.radiusKm));
  if (context.useWeb) formData.append("use_web", "true");
  for (const file of files) {
    formData.append("files", file);
  }

  const res = await fetch(`${BASE}/chat/generate`, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
    },
    body: formData,
  });

  return handleResponse(res);
}

export async function listConversations(token) {
  const res = await fetch(`${BASE}/chat/conversations`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function getConversation(token, conversationId) {
  const res = await fetch(`${BASE}/chat/conversation/${conversationId}`, {
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function renameConversation(token, conversationId, title) {
  const res = await fetch(`${BASE}/chat/conversation/${conversationId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    },
    body: JSON.stringify({ title }),
  });
  return handleResponse(res);
}

export async function deleteConversation(token, conversationId) {
  const res = await fetch(`${BASE}/chat/conversation/${conversationId}`, {
    method: "DELETE",
    headers: { "X-Auth-Token": token },
  });
  return handleResponse(res);
}

export async function sendFeedback(token, conversationId, createdAt, feedback) {
  const res = await fetch(`${BASE}/chat/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      created_at: createdAt,
      feedback,
    }),
  });
  return handleResponse(res);
}
