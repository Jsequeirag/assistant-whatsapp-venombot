const BASE = import.meta.env.VITE_API_URL || "";

async function request(method, path, body) {
  const headers = body !== undefined ? { "Content-Type": "application/json" } : {};
  const token = (import.meta.env.VITE_ARIA_TOKEN || "").trim();
  if (token) headers["X-Aria-Token"] = token;

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${method} ${path} → ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  // Recados — siempre trae todos, se filtra en el cliente
  getRecados: () => request("GET", "/recados"),
  markRecado: (id, read) => request("PATCH", `/recados/${id}/read`, { read }),

  // Settings
  getSettings: () => request("GET", "/settings"),
  updateDnd: ({ active, reason }) => request("PATCH", "/settings/dnd", { active, reason }),
  updateSleep: ({ active, reason, timezone }) => request("PATCH", "/settings/sleep", { active, reason, timezone }),
  updateAutoAssist: (data) => request("PATCH", "/settings/auto-assist", data),
  updateIdentity: (data) => request("PATCH", "/settings/identity", data),
  updateGroq: (data) => request("PATCH", "/settings/groq", data),
  getGroqModels: () => request("GET", "/settings/groq/models"),
  updateRetention: (days) => request("PATCH", "/settings/retention", { days }),
  updateTestMode: (enabled) => request("PATCH", "/settings/test-mode", { enabled }),

  // Auditoría de servicios
  getAudit: () => request("GET", "/audit"),
  runAuditCheck: () => request("POST", "/audit/check"),

  // WhatsApp (QR / sesión)
  getWhatsappStatus: () => request("GET", "/whatsapp/status"),
  restartWhatsapp: () => request("POST", "/whatsapp/restart"),

  // Contacts
  getContacts: () => request("GET", "/contacts"),
  createContact: (data) => request("POST", "/contacts", data),
  updateContact: (contactId, data) => request("PATCH", `/contacts/${encodeURIComponent(contactId)}`, data),
  deleteContact: (contactId) => request("DELETE", `/contacts/${encodeURIComponent(contactId)}`),
  // Conversaciones (Fase 5)
  getContactsWithMessages: () => request("GET", "/contacts/messages-summary"),
  getMessages: (contactId) => request("GET", `/contacts/${encodeURIComponent(contactId)}/messages`),
  reply: (contactId, text) => request("POST", `/contacts/${encodeURIComponent(contactId)}/reply`, { text }),
  replyFile: (contactId, base64, filename, mimetype, caption) =>
    request("POST", `/contacts/${encodeURIComponent(contactId)}/reply-file`, { base64, filename, mimetype, caption }),
};
