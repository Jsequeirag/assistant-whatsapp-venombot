const Settings = require("../models/Settings");

const SLEEP_START = 20;
const SLEEP_END = 8;

function isInSleepHours() {
  const h = new Date().getHours();
  return h >= SLEEP_START || h < SLEEP_END;
}

async function getOrCreateSettings() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
}

/**
 * Estado de presencia para el saludo inicial. DND tiene prioridad sobre Sleep.
 * Auto-asistir es independiente (capa de conversación), no entra acá.
 * @returns {Promise<{ status: "dnd"|"sleep"|"available", reason: string }>}
 */
async function getPresence() {
  const s = await getOrCreateSettings();
  if (s.dnd.active) return { status: "dnd", reason: s.dnd.reason };
  if (s.sleep.active && isInSleepHours()) return { status: "sleep", reason: s.sleep.reason };
  return { status: "available", reason: "" };
}

async function hasResponded(mode, contactId) {
  const s = await getOrCreateSettings();
  if (mode === "dnd") return s.dnd.respondedContacts.includes(contactId);
  if (mode === "sleep") return s.sleep.respondedContacts.includes(contactId);
  return false;
}

async function markResponded(mode, contactId) {
  const field =
    mode === "dnd" ? "dnd.respondedContacts" : "sleep.respondedContacts";
  await Settings.updateOne({}, { $addToSet: { [field]: contactId } });
}

/** Quita al contacto de las listas de "ya saludado" de DND y Sleep (para re-saludarlo). */
async function clearRespondedContact(contactId) {
  await Settings.updateOne(
    {},
    { $pull: { "dnd.respondedContacts": contactId, "sleep.respondedContacts": contactId } }
  );
}

/** Enmascara una API key para mostrarla sin exponerla. */
function maskKey(k) {
  if (!k) return "";
  return k.length <= 8 ? "••••" : `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

async function getSettings() {
  const s = await getOrCreateSettings();
  return {
    dnd: { active: s.dnd.active, reason: s.dnd.reason },
    sleep: { active: s.sleep.active, reason: s.sleep.reason },
    autoAssist: { globalEnabled: s.autoAssist.globalEnabled },
    identity: { ownerName: s.identity.ownerName, assistantName: s.identity.assistantName },
    groq: {
      model: s.groq?.model || "",
      hasKey: !!s.groq?.apiKey,
      keyMasked: maskKey(s.groq?.apiKey),
    },
  };
}

/** Config cruda de Groq (apiKey real) — solo para uso interno (llm.service / arranque). */
async function getGroqConfig() {
  const s = await getOrCreateSettings();
  return { apiKey: s.groq?.apiKey || "", model: s.groq?.model || "" };
}

async function updateGroq({ apiKey, model }) {
  await getOrCreateSettings();
  const update = {};
  if (apiKey !== undefined) update["groq.apiKey"] = apiKey;
  if (model !== undefined && model) update["groq.model"] = model;
  if (Object.keys(update).length) await Settings.updateOne({}, { $set: update });
}

async function updateDnd({ active, reason }) {
  await getOrCreateSettings();
  const update = {};
  if (active !== undefined) {
    update["dnd.active"] = active;
    if (!active) update["dnd.respondedContacts"] = [];
  }
  if (reason !== undefined) update["dnd.reason"] = reason;
  await Settings.updateOne({}, { $set: update });
}

async function updateSleep({ active, reason }) {
  await getOrCreateSettings();
  const update = {};
  if (active !== undefined) {
    update["sleep.active"] = active;
    if (!active) update["sleep.respondedContacts"] = [];
  }
  if (reason !== undefined) update["sleep.reason"] = reason;
  await Settings.updateOne({}, { $set: update });
}

async function updateAutoAssist({ globalEnabled }) {
  if (globalEnabled === undefined) return;
  await getOrCreateSettings();
  await Settings.updateOne({}, { $set: { "autoAssist.globalEnabled": globalEnabled } });
}

async function updateIdentity({ ownerName, assistantName }) {
  await getOrCreateSettings();
  const update = {};
  if (ownerName !== undefined) update["identity.ownerName"] = ownerName;
  if (assistantName !== undefined) update["identity.assistantName"] = assistantName;
  if (Object.keys(update).length) await Settings.updateOne({}, { $set: update });
}

module.exports = {
  getPresence,
  getGroqConfig,
  updateGroq,
  hasResponded,
  clearRespondedContact,
  markResponded,
  getSettings,
  updateDnd,
  updateSleep,
  updateAutoAssist,
  updateIdentity,
};
