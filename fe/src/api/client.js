const BASE = import.meta.env.VITE_API_URL || "";

async function request(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

export const api = {
  // Recados — siempre trae todos, se filtra en el cliente
  getRecados: () => request("GET", "/recados"),
  markRecado: (id, read) => request("PATCH", `/recados/${id}/read`, { read }),

  // Settings
  getSettings: () => request("GET", "/settings"),
  updateDnd: ({ active, reason }) => request("PATCH", "/settings/dnd", { active, reason }),
  updateSleep: ({ active, reason }) => request("PATCH", "/settings/sleep", { active, reason }),
  updateAutoAssist: (data) => request("PATCH", "/settings/auto-assist", data),
  updateIdentity: (data) => request("PATCH", "/settings/identity", data),
  updateGroq: (data) => request("PATCH", "/settings/groq", data),
  getGroqModels: () => request("GET", "/settings/groq/models"),
  updateRetention: (days) => request("PATCH", "/settings/retention", { days }),

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
