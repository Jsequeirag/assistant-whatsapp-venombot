const Settings = require("../models/Settings");
const { DEFAULT_TZ } = require("../config");

const SLEEP_START = 20;
const SLEEP_END = 8;

function normalizeTimeZone(tz) {
  const value = (tz || "").trim();
  if (!value) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

function hourInTimeZone(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    return Number.isFinite(h) ? h : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

function isInSleepHours(timeZone) {
  const h = hourInTimeZone(timeZone || DEFAULT_TZ);
  return h >= SLEEP_START || h < SLEEP_END;
}

let testModeEnabled = false;

async function getOrCreateSettings() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  const next = !!s.testMode?.enabled;
  if (next && !testModeEnabled) {
    console.warn("🧪 Ambiente de pruebas activo — Aria responde en el chat con vos mismo.");
  }
  testModeEnabled = next;
  return s;
}

function isTestModeEnabled() {
  return testModeEnabled;
}

/**
 * Estado de presencia para el saludo inicial. DND tiene prioridad sobre Sleep.
 * Auto-asistir es independiente (capa de conversación), no entra acá.
 * @returns {Promise<{ status: "dnd"|"sleep"|"available", reason: string }>}
 */
async function getPresence() {
  const s = await getOrCreateSettings();
  if (s.dnd.active) return { status: "dnd", reason: s.dnd.reason };
  const tz = normalizeTimeZone(s.timezone) || DEFAULT_TZ;
  if (s.sleep.active && isInSleepHours(tz)) return { status: "sleep", reason: s.sleep.reason };
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
      baseUrl: s.groq?.baseUrl || "",
      voiceModel: s.groq?.voiceModel || "whisper-large-v3-turbo",
    },
    retention: { days: s.retention?.days ?? 30 },
    timezone: normalizeTimeZone(s.timezone) || DEFAULT_TZ,
    testMode: { enabled: !!s.testMode?.enabled },
  };
}

/** Config cruda del proveedor (apiKey real) — solo para uso interno (llm.service / arranque). */
async function getGroqConfig() {
  const s = await getOrCreateSettings();
  return {
    apiKey: s.groq?.apiKey || "",
    model: s.groq?.model || "",
    baseUrl: s.groq?.baseUrl || "",
    voiceModel: s.groq?.voiceModel || "whisper-large-v3-turbo",
  };
}

async function updateGroq({ apiKey, model, baseUrl, voiceModel }) {
  await getOrCreateSettings();
  const update = {};
  if (apiKey !== undefined) update["groq.apiKey"] = apiKey;
  if (model !== undefined && model) update["groq.model"] = model;
  if (baseUrl !== undefined) update["groq.baseUrl"] = baseUrl;
  if (voiceModel !== undefined && voiceModel) update["groq.voiceModel"] = voiceModel;
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

async function updateSleep({ active, reason, timezone }) {
  await getOrCreateSettings();
  const update = {};
  if (active !== undefined) {
    update["sleep.active"] = active;
    if (!active) update["sleep.respondedContacts"] = [];
  }
  if (reason !== undefined) update["sleep.reason"] = reason;
  if (timezone !== undefined) {
    const tz = normalizeTimeZone(timezone);
    if (tz) update.timezone = tz;
  }
  if (Object.keys(update).length) await Settings.updateOne({}, { $set: update });
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

async function updateRetention({ days }) {
  if (days === undefined) return;
  // Clamp a un entero >= 0 (0 = nunca borrar).
  const n = Math.max(0, Math.floor(Number(days) || 0));
  await getOrCreateSettings();
  await Settings.updateOne({}, { $set: { "retention.days": n } });
}

async function updateTestMode({ enabled }) {
  if (enabled === undefined) return;
  await getOrCreateSettings();
  testModeEnabled = !!enabled;
  await Settings.updateOne({}, { $set: { "testMode.enabled": testModeEnabled } });
  if (testModeEnabled) {
    console.warn("🧪 Ambiente de pruebas ON — escribite a vos mismo en WhatsApp y Aria responde.");
  } else {
    console.log("🧪 Ambiente de pruebas OFF");
  }
}

/** Días de retención configurados (0 = deshabilitado). */
async function getRetentionDays() {
  const s = await getOrCreateSettings();
  return s.retention?.days ?? 30;
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
  updateRetention,
  updateTestMode,
  isTestModeEnabled,
  getRetentionDays,
  normalizeTimeZone,
};
