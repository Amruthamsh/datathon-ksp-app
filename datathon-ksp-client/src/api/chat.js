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
  // Active Scene Pin (maps to legacy location flags for backend compat)
  if (context.useScenePin ?? context.useLocation) {
    const loc = context.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      ctxHints.push(
        `[Scene pin: lat ${loc.lat.toFixed(4)}, lng ${loc.lng.toFixed(4)}, radius ${loc.radiusKm ?? 0.5}km — crime history + POIs within radius]`,
      );
    } else {
      ctxHints.push(
        `[Scene pin: enabled, radius ${loc?.radiusKm ?? 0.5}km — no coords dropped yet]`,
      );
    }
  }
  // Legal Codebook
  if (context.useCodebook) {
    ctxHints.push(
      "[Legal Codebook: resolve IPC / BNS / NDPS / POCSO section — bailability, punishment, plain-language meaning]",
    );
  }
  // OSINT Lookup (maps to legacy web flag for backend compat).
  // Entities (name / vehicle / phone / location) are picked up dynamically
  // from the user query — scoped to Karnataka/India news (last 2y),
  // eCourts public records, and general web. No social-media scraping.
  if (context.useOsint ?? context.useWeb) {
    ctxHints.push(
      "[OSINT Lookup: extract person / vehicle / phone / location entities from the query — search Karnataka/India news coverage (last 2 years: Deccan Herald, Prajavani, Vijaya Karnataka, TOI-KA, NDTV, The Hindu), eCourts public records, and general web]",
    );
  }
  // Crime Database is always the authoritative source
  if (ctxHints.length) enrichedQuery += `\n\n${ctxHints.join(" ")}`;

  formData.append("user_query", enrichedQuery);
  formData.append("language", language);
  if (conversationId) formData.append("conversation_id", conversationId);
  // Forward raw context flags (legacy + investigator-framed) for backend use
  const locOn = context.useScenePin ?? context.useLocation;
  const webOn = context.useOsint ?? context.useWeb;
  if (locOn) formData.append("use_location", "true");
  if (context.location?.lat != null)
    formData.append("location_lat", String(context.location.lat));
  if (context.location?.lng != null)
    formData.append("location_lng", String(context.location.lng));
  if (context.location?.radiusKm != null)
    formData.append("location_radius_km", String(context.location.radiusKm));
  if (webOn) formData.append("use_web", "true");
  if (context.useCodebook) formData.append("use_codebook", "true");
  if (context.useOsint) formData.append("use_osint", "true");
  if (context.useScenePin) formData.append("use_scene_pin", "true");
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
