const Contact = require("../models/Contact");
const Message = require("../models/Message");
const Recado = require("../models/Recado");
const mediaService = require("./media.service");
const { dicebearUrl, localAvatarUrl, extractProfilePicUrl, picFromSender } = require("../lib/avatar");

// Historial LLM: Map en RAM (rápido). Se hidrata desde Mongo al primer acceso
// (reinicio de proceso) si el último mensaje es reciente. El panel ya persistía.
const sessionState = new Map();
const HISTORY_LIMIT = 20;
const SESSION_IDLE_MS = 20 * 60 * 1000;
const _avatarJobs = new Map();

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
      if (sibling.avatarSource !== "whatsapp") {
        sibling.avatarUrl = dicebearUrl(name);
        sibling.avatarSource = "dicebear";
      }
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
      {
        $setOnInsert: {
          contactId,
          number,
          name: nameForInsert,
          avatarUrl: dicebearUrl(nameForInsert),
          avatarSource: "dicebear",
          avatarResolved: false,
        },
      },
      { upsert: true, new: true }
    );
  }

  const changes = {};
  if (number && contact.number !== number) changes.number = number;
  if (pushName && !contact.name) {
    changes.name = pushName;
    if (contact.avatarSource !== "whatsapp") {
      changes.avatarUrl = dicebearUrl(pushName);
      changes.avatarSource = "dicebear";
    }
  }
  if (!contact.avatarUrl) {
    changes.avatarUrl = dicebearUrl(contact.name || number);
    if (contact.avatarSource !== "whatsapp") changes.avatarSource = "dicebear";
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
      if (existing.avatarSource !== "whatsapp") {
        existing.avatarUrl = dicebearUrl(displayName);
        existing.avatarSource = "dicebear";
      }
      await existing.save();
    }
    return existing;
  }
  const contactId = `${clean}@c.us`;
  return Contact.findOneAndUpdate(
    { contactId },
    {
      $setOnInsert: {
        contactId,
        number: clean,
        name: displayName,
        avatarUrl: dicebearUrl(displayName),
        avatarSource: "dicebear",
        avatarResolved: false,
      },
    },
    { upsert: true, new: true }
  );
}

async function update(contactId, { name }) {
  const changes = {};
  if (name !== undefined) {
    changes.name = name;
    const current = await Contact.findOne({ contactId }).select("avatarSource").lean();
    if (!current || current.avatarSource !== "whatsapp") {
      changes.avatarUrl = dicebearUrl(name);
      changes.avatarSource = "dicebear";
    }
  }
  return Contact.findOneAndUpdate({ contactId }, changes, { new: true });
}

async function remove(contactId) {
  const contact = await Contact.findOne({ contactId });
  if (!contact) return null;
  const siblings = contact.number
    ? await Contact.find({ $or: [{ contactId }, { number: contact.number }] }).select("contactId avatarPath").lean()
    : [{ contactId, avatarPath: contact.avatarPath }];
  const ids = siblings.map((c) => c.contactId);
  const mediaDocs = await Message.find({
    contactId: { $in: ids },
    mediaPath: { $exists: true, $nin: [null, ""] },
  })
    .select("mediaPath")
    .lean();
  await mediaService.removeMany([
    ...mediaDocs.map((m) => m.mediaPath),
    ...siblings.map((c) => c.avatarPath),
  ]);
  await Promise.all([
    Contact.deleteMany({ contactId: { $in: ids } }),
    Message.deleteMany({ contactId: { $in: ids } }),
    Recado.deleteMany({ contactId: { $in: ids } }),
  ]);
  for (const id of ids) dropSession(id);
  return contact;
}

async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/")) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) return null;
    return { buffer, mimeType: mime };
  } catch {
    return null;
  }
}

async function fetchImageViaPage(page, url) {
  if (!page) return null;
  try {
    const result = await page.evaluate(async (picUrl) => {
      const resp = await fetch(picUrl, { redirect: "follow" });
      if (!resp.ok) return null;
      const mime = (resp.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
      if (!mime.startsWith("image/")) return null;
      const bytes = new Uint8Array(await resp.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { b64: btoa(bin), mime };
    }, url);
    if (!result?.b64) return null;
    const buffer = Buffer.from(result.b64, "base64");
    if (!buffer.length) return null;
    return { buffer, mimeType: result.mime || "image/jpeg" };
  } catch {
    return null;
  }
}

async function downloadProfilePic(client, url) {
  const fromNode = await fetchImageBuffer(url);
  if (fromNode) return fromNode;
  return fetchImageViaPage(client?.page, url);
}

async function persistWhatsAppAvatar(contact, url, client) {
  const downloaded = await downloadProfilePic(client, url);
  if (!downloaded) return false;
  const rel = await mediaService.saveAvatar(contact.contactId, downloaded.buffer, downloaded.mimeType);
  if (!rel) return false;
  const avatarUrl = localAvatarUrl(contact.contactId);
  await Contact.updateOne(
    { contactId: contact.contactId },
    {
      $set: {
        avatarUrl,
        avatarPath: rel,
        avatarSource: "whatsapp",
        avatarResolved: true,
      },
    }
  );
  contact.avatarUrl = avatarUrl;
  contact.avatarPath = rel;
  contact.avatarSource = "whatsapp";
  contact.avatarResolved = true;
  console.log(`🖼️  Foto de perfil de WhatsApp guardada para ${contact.contactId}`);
  return true;
}

async function markAvatarResolvedDicebear(contact) {
  await Contact.updateOne(
    { contactId: contact.contactId },
    { $set: { avatarResolved: true, avatarSource: contact.avatarSource === "whatsapp" ? "whatsapp" : "dicebear" } }
  );
  contact.avatarResolved = true;
  if (contact.avatarSource !== "whatsapp") contact.avatarSource = "dicebear";
  console.log(`🖼️  Sin foto de perfil de WhatsApp; se usa DiceBear para ${contact.contactId}`);
}

/**
 * Primera vez que el contacto escribe: intenta la foto de WhatsApp.
 * Si no hay (privacidad / sin foto), deja DiceBear. No bloquea el resto del turno.
 */
async function resolveWhatsAppAvatar(contact, client, { sender } = {}) {
  if (!contact?.contactId) return contact;
  if (contact.avatarResolved || contact.avatarSource === "whatsapp") return contact;

  const hinted = picFromSender(sender);
  if (hinted) {
    const ok = await persistWhatsAppAvatar(contact, hinted, client);
    if (ok) return contact;
  }

  if (!client || typeof client.getProfilePicFromServer !== "function") return contact;

  let raw;
  try {
    if (client.page) {
      raw = await client.page.evaluate(async (id) => {
        const getPic = window.WWebJS && window.WWebJS.getProfilePic;
        if (!getPic) return { __missing: true };
        const r = await getPic(id);
        if (!r) return null;
        if (typeof r === "string") return r;
        return r.eurl || r.imgFull || r.imgUrl || r.previewEurl || r.url || r.img || r.full || null;
      }, contact.contactId);
      if (raw && raw.__missing) return contact;
    } else {
      raw = await client.getProfilePicFromServer(contact.contactId);
    }
  } catch (e) {
    console.warn(`⚠️  getProfilePicFromServer ${contact.contactId}: ${e?.message || e}`);
    return contact;
  }

  const url = extractProfilePicUrl(raw);
  if (!url) {
    await markAvatarResolvedDicebear(contact);
    return contact;
  }

  const saved = await persistWhatsAppAvatar(contact, url, client);
  if (!saved) return contact;
  return contact;
}

function ensureWhatsAppAvatar(contact, client, opts) {
  const id = contact?.contactId;
  if (!id) return Promise.resolve(contact);
  if (_avatarJobs.has(id)) return _avatarJobs.get(id);
  const job = resolveWhatsAppAvatar(contact, client, opts).finally(() => {
    if (_avatarJobs.get(id) === job) _avatarJobs.delete(id);
  });
  _avatarJobs.set(id, job);
  return job;
}

// ─── Estado de sesión (in-memory + hidratación Mongo) ───────────────────────

function newSession() {
  return {
    recadoCompleted: false,
    conversationHistory: [],
    greetedOnce: false,
    lastActivityAt: 0,
    hydrated: false,
  };
}

function toLlmTurn(doc) {
  const content = (doc.content || "").trim();
  if (!content) return null;
  return {
    role: doc.role === "assistant" ? "model" : "user",
    content,
  };
}

function getSession(contactId) {
  if (!sessionState.has(contactId)) {
    sessionState.set(contactId, newSession());
  }
  return sessionState.get(contactId);
}

/**
 * Carga los últimos N mensajes de Mongo en la sesión RAM si todavía no está hidratada.
 * Si el último mensaje es más viejo que `idleMs`, deja el hilo vacío (mismo criterio
 * que el reset de 20 min) pero rellena lastActivityAt para que isSessionExpired sea cierto.
 */
async function ensureSession(contactId, idleMs = SESSION_IDLE_MS) {
  const session = getSession(contactId);
  if (session.hydrated) return session;
  session.hydrated = true;

  try {
    const rows = await Message.find({ contactId })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .select("role content createdAt")
      .lean();
    if (!rows.length) return session;

    const lastAt = rows[0].createdAt ? new Date(rows[0].createdAt).getTime() : 0;
    session.lastActivityAt = lastAt;
    if (!lastAt || (idleMs > 0 && Date.now() - lastAt > idleMs)) {
      return session;
    }

    const history = rows.reverse().map(toLlmTurn).filter(Boolean);
    session.conversationHistory = history.slice(-HISTORY_LIMIT);
    session.greetedOnce = history.some((h) => h.role === "model");
  } catch (e) {
    console.warn(`⚠️  No se pudo hidratar sesión LLM de ${contactId}: ${e?.message || e}`);
  }
  return session;
}

/** Reinicia la sesión: el contacto vuelve a ser tratado como si escribiera por primera vez. */
function resetSession(contactId) {
  const session = newSession();
  session.hydrated = true;
  sessionState.set(contactId, session);
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
  if (session.conversationHistory.length > HISTORY_LIMIT) {
    session.conversationHistory = session.conversationHistory.slice(-HISTORY_LIMIT);
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
  ensureWhatsAppAvatar,
  getSession,
  ensureSession,
  resetSession,
  touchSession,
  isSessionExpired,
  addToHistory,
  markRecadoCompleted,
  isRecadoCompleted,
  dropSession,
  SESSION_IDLE_MS,
  toLlmTurn,
};
