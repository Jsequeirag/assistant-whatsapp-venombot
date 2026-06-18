/**
 * Gestión de contactos.
 * Fase 1: in-memory. Fase 2: migrar a Contact model en MongoDB.
 */
const { v4: uuidv4 } = require("crypto");

// TODO Fase 2: reemplazar con Contact model
// Map<contactId, Contact>
const contacts = new Map();

// Estado de auto-asistir por conversación (no persiste entre reinicios)
// Map<contactId, { recadoCompleted: boolean, conversationHistory: [] }>
const sessionState = new Map();

function _normalizeId(phoneOrId) {
  // VenomBot envía IDs como "5491112345678@c.us" o similar
  return phoneOrId;
}

/**
 * Obtiene un contacto existente o lo crea con los datos mínimos.
 */
function getOrCreate(contactId, pushName) {
  if (!contacts.has(contactId)) {
    contacts.set(contactId, {
      id: contactId,
      number: contactId.replace(/@.+$/, ""),
      name: pushName || contactId.replace(/@.+$/, ""),
      autoAssist: false, // TODO Fase 2: default false en schema
    });
  } else if (pushName && !contacts.get(contactId).name) {
    contacts.get(contactId).name = pushName;
  }
  return contacts.get(contactId);
}

function getAll() {
  return [...contacts.values()];
}

function getById(contactId) {
  return contacts.get(contactId) || null;
}

function setAutoAssist(contactId, enabled) {
  const c = contacts.get(contactId);
  if (!c) return null;
  c.autoAssist = enabled;
  return c;
}

// ─── Estado de sesión de auto-asistir ─────────────────────────────────────────

function getSession(contactId) {
  if (!sessionState.has(contactId)) {
    sessionState.set(contactId, { recadoCompleted: false, conversationHistory: [] });
  }
  return sessionState.get(contactId);
}

function addToHistory(contactId, role, content) {
  const session = getSession(contactId);
  session.conversationHistory.push({ role, content });
  // Mantener historial razonable (últimos 20 turnos)
  if (session.conversationHistory.length > 20) {
    session.conversationHistory = session.conversationHistory.slice(-20);
  }
}

function markRecadoCompleted(contactId) {
  getSession(contactId).recadoCompleted = true;
}

function isRecadoCompleted(contactId) {
  return getSession(contactId).recadoCompleted;
}

module.exports = {
  getOrCreate,
  getAll,
  getById,
  setAutoAssist,
  getSession,
  addToHistory,
  markRecadoCompleted,
  isRecadoCompleted,
};
