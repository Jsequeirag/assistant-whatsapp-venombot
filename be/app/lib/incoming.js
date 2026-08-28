const IGNORED_SENDERS = ["status@broadcast", "broadcast"];
const IGNORED_SUFFIXES = ["@g.us", "@broadcast", "@newsletter"];

const MEDIA_LABELS = {
  image: "(el contacto envió una imagen)",
  sticker: "(el contacto envió un sticker)",
  video: "(el contacto envió un video)",
  gif: "(el contacto envió un GIF)",
  ptt: "(el contacto envió un audio)",
  audio: "(el contacto envió un audio)",
  document: "(el contacto envió un documento)",
  location: "(el contacto compartió una ubicación)",
  vcard: "(el contacto compartió un contacto)",
};

const SELF_IDS = new Set();
let HOST_ID = null;
const _recentOutgoing = [];
const ECHO_TTL_MS = 60 * 1000;
const ECHO_WINDOW_MS = 4000;

function resetSelfIds() {
  SELF_IDS.clear();
  HOST_ID = null;
  _recentOutgoing.length = 0;
}

function registerSelfId(id) {
  if (id && typeof id === "string" && !SELF_IDS.has(id)) {
    SELF_IDS.add(id);
    console.log(`🤖 ID propio registrado: ${id}`);
  }
}

function setHostId(id) {
  HOST_ID = id;
  registerSelfId(id);
}

function getHostId() {
  return HOST_ID;
}

function isHostChat(chatId) {
  const id = typeof chatId === "string" ? chatId : "";
  if (!id) return false;
  return SELF_IDS.has(id) || (HOST_ID && id === HOST_ID);
}

/** ¿El mensaje lo envió el propio bot/host? Robusto ante @c.us y @lid. */
function isSelfMessage(msg) {
  const from = msg.from || "";
  if (msg.fromMe === true) return true;
  const serialized = typeof msg.id === "string" ? msg.id : msg.id?._serialized;
  if (typeof serialized === "string" && serialized.startsWith("true_")) return true;
  if (msg.id && typeof msg.id === "object" && msg.id.fromMe === true) return true;
  return SELF_IDS.has(from);
}

function pruneOutgoing(now = Date.now()) {
  while (_recentOutgoing.length && now - _recentOutgoing[0].at > ECHO_TTL_MS) {
    _recentOutgoing.shift();
  }
}

/** Marca un texto que Aria acaba de mandar, para no re-procesarlo como si lo hubieras escrito vos. */
function rememberOutgoing(contactId, text) {
  const t = String(text || "").trim();
  _recentOutgoing.push({ contactId: contactId || "", text: t, at: Date.now() });
  pruneOutgoing();
}

function isOutgoingEcho(contactId, text) {
  const now = Date.now();
  pruneOutgoing(now);
  const t = String(text || "").trim();
  const exact = _recentOutgoing.findIndex((x) => x.contactId === contactId && x.text === t && t);
  if (exact >= 0) {
    _recentOutgoing.splice(exact, 1);
    return true;
  }
  return _recentOutgoing.some((x) => x.contactId === contactId && now - x.at < ECHO_WINDOW_MS);
}

function getMessageTimeMs(msg) {
  const raw = typeof msg.t === "number" ? msg.t : msg.timestamp;
  if (typeof raw !== "number" || raw <= 0) return null;
  return raw > 1e12 ? raw : raw * 1000;
}

function getMessageText(msg) {
  const isText = !msg.type || msg.type === "chat";
  if (isText && msg.body?.trim()) return msg.body.trim();
  if (msg.caption?.trim()) return msg.caption.trim();
  if (msg.type && MEDIA_LABELS[msg.type]) return MEDIA_LABELS[msg.type];
  if (msg.isMedia && msg.type !== "chat") return "(el contacto envió un archivo multimedia)";
  return null;
}

function extractPhoneNumber(msg, contactId) {
  const candidates = [
    msg.sender?.id?._serialized,
    typeof msg.sender?.id === "string" ? msg.sender.id : null,
    msg.sender?.wid?._serialized,
    typeof msg.sender?.wid === "string" ? msg.sender.wid : null,
    msg.sender?.phone,
    msg.author,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@c.us")) {
      const digits = c.replace(/@.+$/, "").replace(/\D/g, "");
      if (digits) return digits;
    }
  }
  if (typeof contactId === "string" && contactId.endsWith("@c.us")) {
    const digits = contactId.replace(/@.+$/, "").replace(/\D/g, "");
    if (digits) return digits;
  }
  return null;
}

/**
 * Motivo para descartar el mensaje, o null si hay que procesarlo.
 * `allowSelf`: ambiente de pruebas — deja pasar el chat "Tú" (tu propio número).
 */
function dropReason(msg, { allowSelf } = {}) {
  const from = msg.from || "";
  if (msg.isGroupMsg) return "group";
  if (IGNORED_SUFFIXES.some((s) => from.endsWith(s))) return "suffix";
  if (IGNORED_SENDERS.includes(from)) return "sender";
  if (isSelfMessage(msg)) {
    const ownChat = isHostChat(from) || isHostChat(msg.to || "");
    if (!allowSelf || !ownChat) return "self";
    if (isOutgoingEcho(from, getMessageText(msg) || "")) return "echo";
  }
  if (!getMessageText(msg)) return "empty";
  return null;
}

/**
 * DND/Sleep saludan una vez; auto-asistir conversa; si no, silencio (igual se clasifica recado).
 * @returns {{ greetingTracked: boolean, willGreet: boolean, silence: boolean }}
 */
function decideTurn({ status, globalAssist, alreadyGreeted, recadoCompleted }) {
  const greetingTracked = status === "dnd" || status === "sleep";
  const willGreet = greetingTracked && !alreadyGreeted;
  const silence =
    (status === "available" && !globalAssist) ||
    (!willGreet && !globalAssist) ||
    (!willGreet && globalAssist && recadoCompleted);
  return { greetingTracked, willGreet, silence };
}

/**
 * Presencia: DND gana a Sleep; Sleep solo en horario 20–08.
 * `hour` es 0–23 en la TZ del dueño.
 */
function resolvePresence({ dndActive, dndReason, sleepActive, sleepReason, hour }) {
  if (dndActive) return { status: "dnd", reason: dndReason || "" };
  if (sleepActive && (hour >= 20 || hour < 8)) return { status: "sleep", reason: sleepReason || "" };
  return { status: "available", reason: "" };
}

module.exports = {
  IGNORED_SENDERS,
  IGNORED_SUFFIXES,
  MEDIA_LABELS,
  resetSelfIds,
  registerSelfId,
  setHostId,
  getHostId,
  isSelfMessage,
  isHostChat,
  rememberOutgoing,
  isOutgoingEcho,
  getMessageTimeMs,
  getMessageText,
  extractPhoneNumber,
  dropReason,
  decideTurn,
  resolvePresence,
};
