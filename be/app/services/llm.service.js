const OpenAILib = require("openai");
const OpenAI = OpenAILib.OpenAI || OpenAILib;
const { toFile } = OpenAILib;
const { LLM_API_KEY, LLM_MODEL, LLM_VOICE_MODEL, GROQ_OPENAI_BASE } = require("../config");

// Cliente OpenAI-compatible (Chat Completions + /audio/transcriptions).
// Cualquier proveedor que hable ese contrato sirve: Groq, OpenAI, OpenRouter, xAI, local.
// Key / modelo / baseUrl se gestionan desde el FE y Mongo; se siembran desde .env.
let _apiKey = LLM_API_KEY || "";
let _model = LLM_MODEL || "qwen/qwen3-32b";
let _baseUrl = ""; // vacío = Groq OpenAI-compat (GROQ_OPENAI_BASE)
let _voiceModel = LLM_VOICE_MODEL || "whisper-large-v3-turbo";
let _client = null;

/** Normaliza la URL al contrato OpenAI: .../v1, sin slash final. Vacío → Groq. */
function resolveBaseUrl(url) {
  let raw = (url || "").trim().replace(/\/+$/, "");
  if (!raw) return GROQ_OPENAI_BASE;
  try {
    const u = new URL(raw);
    if (u.hostname === "api.groq.com" && (u.pathname === "" || u.pathname === "/")) {
      return GROQ_OPENAI_BASE;
    }
  } catch {
    /* URL inválida: se deja y el SDK fallará al llamar */
  }
  return raw;
}

/** Actualiza key/modelo/baseUrl en caliente. Recrea el cliente si cambia la key o la URL. */
function configure({ apiKey, model, baseUrl, voiceModel } = {}) {
  const keyChanged = apiKey !== undefined && apiKey !== _apiKey;
  const urlChanged = baseUrl !== undefined && baseUrl !== _baseUrl;
  if (keyChanged) { _apiKey = apiKey || ""; _client = null; }
  if (urlChanged) { _baseUrl = baseUrl || ""; _client = null; }
  if (model) _model = model;
  if (voiceModel) _voiceModel = voiceModel;
}

function hasKey() {
  return !!_apiKey;
}

function getModel() {
  return _model;
}

function getBaseUrl() {
  return resolveBaseUrl(_baseUrl);
}

function getClient() {
  if (!_apiKey) throw new Error("API key no configurada");
  if (!_client) {
    _client = new OpenAI({
      apiKey: _apiKey,
      baseURL: getBaseUrl(),
      timeout: 30000,
      maxRetries: 2,
    });
  }
  return _client;
}

/** True si el proveedor activo es Groq (params extra tipo reasoning_effort). */
function isGroqProvider() {
  return getBaseUrl().includes("groq.com");
}

// Modelos que NO son de chat (audio, TTS, moderación) → se excluyen del dropdown.
const NON_CHAT_MODEL = /whisper|orpheus|guard|safeguard|tts/i;

/** Lista modelos de chat vía GET /v1/models (contrato OpenAI). */
async function listModels() {
  const res = await getClient().models.list();
  return (res.data || [])
    .filter((m) => m.active !== false && m.id && !NON_CHAT_MODEL.test(m.id))
    .map((m) => m.id)
    .sort();
}

/** Quita bloques de razonamiento <think>...</think> (modelos tipo qwen3). */
function stripThink(text) {
  return (text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

/**
 * Parsea JSON de una respuesta del modelo de forma tolerante:
 * quita fences markdown y extrae el primer objeto {...} presente.
 * @returns {object|null}
 */
function parseJsonLoose(raw) {
  if (!raw) return null;
  let text = stripThink(raw);
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Mapea el historial interno (role "model") al formato OpenAI (role "assistant"). */
function toChatMessages(history) {
  return (history || []).map((h) => ({
    role: h.role === "model" ? "assistant" : "user",
    content: h.content,
  }));
}

const PRIORITY = ["alta", "media", "baja"];

const RECADO_RULES = `Un RECADO es un mensaje donde la persona deja información importante que requiere atención posterior:
una solicitud, aviso, dato de contacto, pregunta específica, tarea, o cualquier mensaje relevante
que el dueño del teléfono necesita saber.
NO es recado: saludos solos ("hola", "¿estás?"), respuestas a mensajes automáticos, confirmaciones vacías.
PRIORIDAD (solo si es recado):
- "alta": urgente o sensible al tiempo — emergencias, salud, dinero, plazos para hoy/mañana, citas próximas, o si dice "urgente".
- "media": requiere atención pero sin apuro — solicitudes, preguntas, coordinar, seguimiento.
- "baja": informativo, puede esperar — avisos FYI, agradecimientos, datos menores.
Si no es recado, usá "baja".`;

const CONTENT_RULES = `INAPROPIADO: lenguaje vulgar u obsceno, amenazas, violencia, acoso, contenido sexual explícito, discurso de odio o discriminación.`;

// Tope barato: evita ráfagas (spam / loops) contra la key. Whisper no cuenta.
const CHAT_WINDOW_MS = 60 * 1000;
const CHAT_MAX_PER_CONTACT = 8;
const CHAT_MAX_GLOBAL = 60;
const _chatHits = new Map();

function resetChatSlots() {
  _chatHits.clear();
}

function consumeChatSlot(contactId) {
  const now = Date.now();
  const prune = (key) => {
    const hits = (_chatHits.get(key) || []).filter((t) => now - t < CHAT_WINDOW_MS);
    _chatHits.set(key, hits);
    return hits;
  };
  const global = prune("_global");
  if (global.length >= CHAT_MAX_GLOBAL) return false;
  if (contactId) {
    const local = prune(contactId);
    if (local.length >= CHAT_MAX_PER_CONTACT) return false;
    local.push(now);
  }
  global.push(now);
  return true;
}

function supportsJsonObject() {
  const u = getBaseUrl();
  return /groq\.com|openai\.com|openrouter\.ai|api\.x\.ai/i.test(u);
}

/**
 * Llamada Chat Completions (sin streaming). En Groq, reasoning desactivado.
 * @returns {Promise<string>} texto sin bloques <think>
 */
async function chat(messages, { temperature = 0.6, maxTokens = 1024, contactId, json = false } = {}) {
  if (!consumeChatSlot(contactId)) {
    const err = new Error("LLM rate limit");
    err.code = "LLM_RATE_LIMIT";
    throw err;
  }
  const params = {
    messages,
    model: _model,
    temperature,
    max_completion_tokens: maxTokens,
    top_p: 0.95,
    stream: false,
  };
  if (isGroqProvider()) params.reasoning_effort = "none";
  if (json && supportsJsonObject()) params.response_format = { type: "json_object" };

  try {
    const completion = await getClient().chat.completions.create(params);
    return stripThink(completion.choices?.[0]?.message?.content || "");
  } catch (e) {
    if (!params.response_format) throw e;
    delete params.response_format;
    const completion = await getClient().chat.completions.create(params);
    return stripThink(completion.choices?.[0]?.message?.content || "");
  }
}

/**
 * Genera una respuesta conversacional.
 * @param {string} systemPrompt
 * @param {{ role: "user"|"model", content: string }[]} history
 * @param {string} newMessage
 * @param {{ temperature?: number }} [options]
 * @returns {Promise<string>}
 */
async function generateResponse(systemPrompt, history, newMessage, options = {}) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...toChatMessages(history),
    { role: "user", content: newMessage },
  ];
  return chat(messages, { temperature: options.temperature, contactId: options.contactId });
}

/**
 * Clasifica si un mensaje (en contexto) es un recado y su nivel de prioridad.
 * @returns {Promise<{ isRecado: boolean, summary: string|null, priority: "alta"|"media"|"baja" }>}
 */
function emptyClass() {
  return { isRecado: false, summary: null, priority: "baja", appropriate: true, contentType: null };
}

function normalizeClass(parsed) {
  const base = emptyClass();
  if (!parsed || typeof parsed !== "object") return base;
  const isRecado = parsed.isRecado === true;
  return {
    isRecado,
    summary: isRecado ? (parsed.summary || null) : null,
    priority: !isRecado ? "baja" : (PRIORITY.includes(parsed.priority) ? parsed.priority : "media"),
    appropriate: parsed.appropriate !== false,
    contentType: parsed.appropriate === false ? (parsed.contentType || parsed.type || "inapropiado") : null,
    declineReply: typeof parsed.declineReply === "string" && parsed.declineReply.trim()
      ? parsed.declineReply.trim()
      : null,
  };
}

function normalizeTurn(parsed) {
  const cls = normalizeClass(parsed);
  return {
    ...cls,
    reply: typeof parsed?.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : null,
    recadoCompleted: parsed?.recadoCompleted === true || parsed?.completed === true,
  };
}

async function classifyRecado(contactName, conversationHistory, newMessage, { contactId } = {}) {
  const system = `Eres un clasificador de mensajes de WhatsApp.
Determiná si el mensaje es un RECADO y su PRIORIDAD.
${RECADO_RULES}
Responde ÚNICAMENTE con JSON válido, sin markdown:
{ "isRecado": true/false, "summary": "resumen en una línea o null si no es recado", "priority": "alta|media|baja" }`;

  const messages = [
    { role: "system", content: system },
    ...toChatMessages(conversationHistory),
    { role: "user", content: `Mensaje de ${contactName}: ${newMessage}` },
  ];

  try {
    const raw = await chat(messages, { temperature: 0, contactId, json: true, maxTokens: 256 });
    const parsed = parseJsonLoose(raw);
    if (parsed && typeof parsed.isRecado === "boolean") {
      return {
        isRecado: parsed.isRecado,
        summary: parsed.summary ?? null,
        priority: PRIORITY.includes(parsed.priority) ? parsed.priority : "media",
      };
    }
    return { isRecado: false, summary: null, priority: "baja" };
  } catch (e) {
    if (e?.code === "LLM_RATE_LIMIT") throw e;
    return { isRecado: false, summary: null, priority: "baja" };
  }
}

/**
 * Recado + filtro de contenido en UN Chat Completions (saludo fijo: no genera el texto).
 */
async function classifyIncoming(contactName, conversationHistory, newMessage, { contactId } = {}) {
  const system = `Eres un clasificador de mensajes de WhatsApp.
Devolvé ÚNICAMENTE JSON válido:
{ "isRecado": true/false, "summary": "string o null", "priority": "alta|media|baja", "appropriate": true/false, "contentType": "string o null", "declineReply": "string o null" }

${RECADO_RULES}

${CONTENT_RULES}
Si es inapropiado: appropriate=false, contentType breve, declineReply = 1-2 oraciones naturales declinando (mismo idioma). Si es apropiado: declineReply=null.`;

  const messages = [
    { role: "system", content: system },
    ...toChatMessages(conversationHistory),
    { role: "user", content: `Mensaje de ${contactName}: ${newMessage}` },
  ];

  try {
    const raw = await chat(messages, { temperature: 0, contactId, json: true, maxTokens: 400 });
    return normalizeClass(parseJsonLoose(raw));
  } catch (e) {
    if (e?.code === "LLM_RATE_LIMIT") throw e;
    return emptyClass();
  }
}

/**
 * Un turno de respuesta: clasificación + mensaje de WhatsApp + recado completo.
 * Reemplaza classifyRecado + classifyContent + generateResponse + detectRecadoCompleted.
 */
async function replyTurn({
  contactName,
  history,
  newMessage,
  replyInstructions,
  contactId,
  wantCompleted = false,
  skipClassify = false,
  temperature = 0.6,
} = {}) {
  const classBlock = skipClassify
    ? `Clasificación fija: isRecado=false, summary=null, priority="baja", appropriate=true, contentType=null.`
    : `${RECADO_RULES}

${CONTENT_RULES}
Si appropriate=false: reply DEBE ser la declinación (breve, natural, mismo idioma). No entres en el tema.`;

  const completedBlock = wantCompleted
    ? `recadoCompleted=true solo si con este mensaje la persona YA comunicó lo que necesitaba dejar. Si sigue incompleto o es un saludo, false.`
    : `recadoCompleted=false siempre.`;

  const system = `Eres un asistente de WhatsApp. Devolvé ÚNICAMENTE JSON válido, sin markdown:
{ "isRecado": true/false, "summary": "string o null", "priority": "alta|media|baja", "appropriate": true/false, "contentType": "string o null", "reply": "mensaje de WhatsApp a enviar", "recadoCompleted": true/false }

${classBlock}
${completedBlock}

INSTRUCCIONES PARA "reply" (si appropriate=true):
${replyInstructions}

"reply" es el texto que se envía por WhatsApp: sin comillas envolventes, sin JSON dentro, sin prefijos.`;

  const messages = [
    { role: "system", content: system },
    ...toChatMessages(skipClassify ? [] : history),
    { role: "user", content: `Mensaje de ${contactName}: ${newMessage}` },
  ];

  try {
    const raw = await chat(messages, { temperature, contactId, json: true, maxTokens: 1024 });
    const turn = normalizeTurn(parseJsonLoose(raw));
    if (skipClassify) {
      turn.isRecado = false;
      turn.summary = null;
      turn.appropriate = true;
      turn.recadoCompleted = false;
    }
    return turn;
  } catch (e) {
    if (e?.code === "LLM_RATE_LIMIT") throw e;
    return { ...emptyClass(), reply: null, recadoCompleted: false };
  }
}

/**
 * Detecta si la persona ya completó su recado durante la conversación.
 * @returns {Promise<boolean>}
 */
async function detectRecadoCompleted(conversationHistory) {
  // Hace falta al menos dos turnos del contacto (4 mensajes) para no gastar Groq en el saludo.
  if (conversationHistory.length < 4) return false;

  const system = `Eres un analizador de conversaciones de WhatsApp.
Determina si la persona que escribe ya COMPLETÓ su recado (ya comunicó lo que necesitaba decir).
Responde ÚNICAMENTE con JSON: { "completed": true/false }`;

  const messages = [{ role: "system", content: system }, ...toChatMessages(conversationHistory)];

  try {
    const raw = await chat(messages, { temperature: 0, json: true, maxTokens: 128 });
    return parseJsonLoose(raw)?.completed === true;
  } catch {
    return false;
  }
}

/**
 * Determina si un mensaje contiene contenido inapropiado.
 * @returns {Promise<{ appropriate: boolean, type: string|null }>}
 */
async function classifyContent(message) {
  const system = `Eres un clasificador de contenido para mensajes de WhatsApp.
Determiná si el siguiente mensaje contiene contenido INAPROPIADO.
Considerá inapropiado: lenguaje vulgar u obsceno, amenazas, violencia, acoso, contenido sexual explícito, discurso de odio o discriminación.
Responde ÚNICAMENTE con JSON válido, sin markdown:
{ "appropriate": true/false, "type": "descripción breve si es inapropiado, null si es apropiado" }`;

  try {
    const raw = await chat(
      [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
      { temperature: 0 }
    );
    const parsed = parseJsonLoose(raw);
    return parsed && typeof parsed.appropriate === "boolean"
      ? parsed
      : { appropriate: true, type: null };
  } catch {
    return { appropriate: true, type: null };
  }
}

/**
 * Transcribe un buffer de audio vía POST /v1/audio/transcriptions (contrato OpenAI).
 * El modelo de voz es independiente del de chat. Si el proveedor no lo soporta, falla y el webhook degrada.
 * @param {Buffer} audioBuffer
 * @param {{ mimeType?: string, filename?: string }} [opts]
 * @returns {Promise<string|null>} texto transcripto, o null si falla/vacío
 */
async function transcribeAudio(audioBuffer, { mimeType = "audio/ogg", filename = "audio.ogg" } = {}) {
  const file = await toFile(audioBuffer, filename, { type: mimeType });
  const result = await getClient().audio.transcriptions.create({
    file,
    model: _voiceModel,
    response_format: "verbose_json",
  });
  return result.text?.trim() || null;
}

module.exports = {
  configure,
  hasKey,
  getModel,
  getBaseUrl,
  listModels,
  generateResponse,
  classifyRecado,
  classifyIncoming,
  replyTurn,
  detectRecadoCompleted,
  classifyContent,
  transcribeAudio,
  parseJsonLoose,
  stripThink,
  normalizeClass,
  normalizeTurn,
  consumeChatSlot,
  resetChatSlots,
  toChatMessages,
};
