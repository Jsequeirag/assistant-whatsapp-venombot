const Contact = require("../models/Contact");

// Historial de conversación y estado de recado: in-memory (ephemeral por diseño)
const sessionState = new Map();

/** Genera la URL de avatar DiceBear a partir del nombre (seed determinístico). */
function dicebearUrl(seed) {
  const s = (seed || "default").trim();
  return `https://api.dicebear.com/10.x/bottts-neutral/svg?seed=${encodeURIComponent(s)}`;
}

async function getOrCreate(contactId, pushName) {
  const number = contactId.replace(/@.+$/, "");
  const nameForInsert = pushName || number;
  const contact = await Contact.findOneAndUpdate(
    { contactId },
    { $setOnInsert: { contactId, number, name: nameForInsert, avatarUrl: dicebearUrl(nameForInsert) } },
    { upsert: true, new: true }
  );
  // Actualizar nombre si llegó uno nuevo y el guardado está vacío
  if (pushName && !contact.name) {
    contact.name = pushName;
    contact.avatarUrl = dicebearUrl(pushName);
    await contact.save();
  }
  // Retrocompatibilidad: contactos existentes sin avatarUrl
  if (!contact.avatarUrl) {
    contact.avatarUrl = dicebearUrl(contact.name || number);
    await Contact.updateOne({ contactId }, { avatarUrl: contact.avatarUrl });
  }
  return contact;
}

async function getAll() {
  return Contact.find().lean();
}

async function getById(contactId) {
  return Contact.findOne({ contactId }).lean();
}


async function create(number, name) {
  const clean = number.replace(/\D/g, "");
  const contactId = `${clean}@c.us`;
  const displayName = name || clean;
  return Contact.findOneAndUpdate(
    { contactId },
    { $setOnInsert: { contactId, number: clean, name: displayName, avatarUrl: dicebearUrl(displayName) } },
    { upsert: true, new: true }
  );
}

async function update(contactId, { name }) {
  const changes = {};
  if (name !== undefined) {
    changes.name = name;
    changes.avatarUrl = dicebearUrl(name); // re-genera con el nuevo nombre
  }
  return Contact.findOneAndUpdate({ contactId }, changes, { new: true });
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
