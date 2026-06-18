const Contact = require("../models/Contact");

// Historial de conversación y estado de recado: in-memory (ephemeral por diseño)
const sessionState = new Map();

async function getOrCreate(contactId, pushName) {
  const number = contactId.replace(/@.+$/, "");
  const contact = await Contact.findOneAndUpdate(
    { contactId },
    { $setOnInsert: { contactId, number, name: pushName || number } },
    { upsert: true, new: true }
  );
  // Actualizar nombre si llegó uno nuevo y el guardado está vacío
  if (pushName && !contact.name) {
    contact.name = pushName;
    await contact.save();
  }
  return contact;
}

async function getAll() {
  return Contact.find().lean();
}

async function getById(contactId) {
  return Contact.findOne({ contactId }).lean();
}

async function setAutoAssist(contactId, enabled) {
  return Contact.findOneAndUpdate({ contactId }, { autoAssist: enabled }, { new: true });
}

async function create(number, name) {
  const clean = number.replace(/\D/g, "");
  const contactId = `${clean}@c.us`;
  return Contact.findOneAndUpdate(
    { contactId },
    { $setOnInsert: { contactId, number: clean, name: name || clean } },
    { upsert: true, new: true }
  );
}

async function update(contactId, { name }) {
  return Contact.findOneAndUpdate(
    { contactId },
    { ...(name !== undefined && { name }) },
    { new: true }
  );
}

async function remove(contactId) {
  return Contact.findOneAndDelete({ contactId });
}

// ─── Estado de sesión (in-memory) ────────────────────────────────────────────

function newSession() {
  return { recadoCompleted: false, conversationHistory: [], greetedOnce: false, lastActivityAt: 0 };
}

function getSession(contactId) {
  if (!sessionState.has(contactId)) {
    sessionState.set(contactId, newSession());
  }
  return sessionState.get(contactId);
}

/** Reinicia la sesión: el contacto vuelve a ser tratado como si escribiera por primera vez. */
function resetSession(contactId) {
  sessionState.set(contactId, newSession());
}

/** Marca actividad reciente del contacto (para el reset por inactividad). */
function touchSession(contactId) {
  getSession(contactId).lastActivityAt = Date.now();
}

/** ¿Pasaron más de `ttlMs` desde la última actividad del contacto? */
function isSessionExpired(contactId, ttlMs) {
  const { lastActivityAt } = getSession(contactId);
  return lastActivityAt > 0 && Date.now() - lastActivityAt > ttlMs;
}

function addToHistory(contactId, role, content) {
  const session = getSession(contactId);
  session.conversationHistory.push({ role, content });
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
  create,
  update,
  remove,
  getSession,
  resetSession,
  touchSession,
  isSessionExpired,
  addToHistory,
  markRecadoCompleted,
  isRecadoCompleted,
};
