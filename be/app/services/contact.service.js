const Contact = require("../models/Contact");
const Message = require("../models/Message");
const Recado = require("../models/Recado");

// Historial de conversación y estado de recado: in-memory (ephemeral por diseño)
const sessionState = new Map();

/** Genera la URL de avatar DiceBear a partir del nombre (seed determinístico). */
function dicebearUrl(seed) {
  const s = (seed || "default").trim();
  return `https://api.dicebear.com/10.x/bottts-neutral/svg?seed=${encodeURIComponent(s)}`;
}

function digitsOf(value) {
  return String(value || "").replace(/@.+$/, "").replace(/\D/g, "");
}

function dropSession(contactId) {
  sessionState.delete(contactId);
}

/**
 * Si ya existía el mismo teléfono con otro id (@c.us vs @lid), unifica el
 * documento y mueve mensajes/recados al contactId actual (el de WhatsApp).
 */
async function adoptSibling(contactId, number, pushName) {
  if (!number) return null;
  const sibling = await Contact.findOne({
    number,
    contactId: { $ne: contactId },
  });
  if (!sibling) return null;

  const oldId = sibling.contactId;
  await Promise.all([
    Message.updateMany({ contactId: oldId }, { $set: { contactId } }),
    Recado.updateMany({ contactId: oldId }, { $set: { contactId } }),
  ]);

  const name = pushName || sibling.name;
  try {
    sibling.contactId = contactId;
    sibling.number = number;
    if (name) {
      sibling.name = name;
      if (!sibling.avatarUrl || pushName) sibling.avatarUrl = dicebearUrl(name);
    }
    await sibling.save();
    dropSession(oldId);
    console.log(`🔗 Contacto unificado ${oldId} → ${contactId}`);
    return sibling;
  } catch (e) {
    // Carrera: el contactId nuevo ya existe. Borrar el sibling viejo.
    await Contact.deleteOne({ contactId: oldId });
    dropSession(oldId);
    console.warn(`🔗 Unificación: se descartó ${oldId} (${e?.message || e})`);
    return Contact.findOne({ contactId });
  }
}

async function getOrCreate(contactId, pushName, { phoneNumber } = {}) {
  const number = digitsOf(phoneNumber) || digitsOf(contactId);
  const nameForInsert = pushName || number;

  let contact = await Contact.findOne({ contactId });
  if (!contact) {
    contact = await adoptSibling(contactId, number, pushName);
  } else if (number) {
    // @c.us y @lid del mismo teléfono: mover historial al id actual y borrar el duplicado.
    await adoptSibling(contactId, number, pushName);
    contact = (await Contact.findOne({ contactId })) || contact;
  }
  if (!contact) {
    contact = await Contact.findOneAndUpdate(
      { contactId },
      { $setOnInsert: { contactId, number, name: nameForInsert, avatarUrl: dicebearUrl(nameForInsert) } },
      { upsert: true, new: true }
    );
  }

  const changes = {};
  if (number && contact.number !== number) changes.number = number;
  if (pushName && !contact.name) {
    changes.name = pushName;
    changes.avatarUrl = dicebearUrl(pushName);
  }
  if (!contact.avatarUrl) {
    changes.avatarUrl = dicebearUrl(contact.name || number);
  }
  if (Object.keys(changes).length) {
    Object.assign(contact, changes);
    await Contact.updateOne({ contactId }, { $set: changes });
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
  const clean = digitsOf(number);
  if (!clean) return null;
  const displayName = name || clean;
  const existing = await Contact.findOne({ number: clean });
  if (existing) {
    if (name && name !== existing.name) {
      existing.name = displayName;
      existing.avatarUrl = dicebearUrl(displayName);
      await existing.save();
    }
    return existing;
  }
  const contactId = `${clean}@c.us`;
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
  const contact = await Contact.findOne({ contactId });
  if (!contact) return null;
  const ids = contact.number
    ? (await Contact.find({ $or: [{ contactId }, { number: contact.number }] }).select("contactId").lean()).map((c) => c.contactId)
    : [contactId];
  await Promise.all([
    Contact.deleteMany({ contactId: { $in: ids } }),
    Message.deleteMany({ contactId: { $in: ids } }),
    Recado.deleteMany({ contactId: { $in: ids } }),
  ]);
  for (const id of ids) dropSession(id);
  return contact;
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
  dropSession,
};
