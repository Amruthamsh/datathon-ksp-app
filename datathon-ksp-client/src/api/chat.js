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

export async function generateResponse(
  token,
  userQuery,
  conversationId = null,
  language = "en",
) {
  const res = await fetch(`${BASE}/chat/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth-Token": token,
    },
    body: JSON.stringify({
      user_query: userQuery,
      conversation_id: conversationId,
      language,
    }),
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
