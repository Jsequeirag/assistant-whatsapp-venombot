const { Groq } = require("groq-sdk");
const { GROQ_API_KEY, GROQ_MODEL } = require("../config");

// La key/modelo se gestionan desde el FE y se guardan en Mongo. Acá se cachean
// en memoria; `configure()` los actualiza (al arrancar y cuando el FE los cambia).
// Se siembran desde .env como valor inicial.
let _apiKey = GROQ_API_KEY || "";
let _model = GROQ_MODEL || "qwen/qwen3-32b";
let _client = null;

/** Actualiza key/modelo en caliente. Recrea el cliente si cambió la key. */
function configure({ apiKey, model } = {}) {
  if (apiKey !== undefined && apiKey !== _apiKey) {
    _apiKey = apiKey || "";
    _client = null; // forzar recreación
  }
  if (model) _model = model;
}

function hasKey() {
  return !!_apiKey;
}

function getModel() {
  return _model;
}

function getClient() {
  if (!_apiKey) throw new Error("Groq API key no configurada");
  if (!_client) _client = new Groq({ apiKey: _apiKey, timeout: 20000, maxRetries: 2 });
  return _client;
}

// Modelos que NO son de chat (audio, TTS, moderación) → se excluyen del dropdown.
const NON_CHAT_MODEL = /whisper|orpheus|guard|safeguard|tts/i;

/** Lista los modelos de chat disponibles en Groq para la cuenta actual. */
async function listModels() {
  const res = await getClient().models.list();
  return (res.data || [])
    .filter((m) => m.active && !NON_CHAT_MODEL.test(m.id))
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

/** Mapea el historial interno (role "model") al formato de Groq/OpenAI (role "assistant"). */
function toGroqMessages(history) {
  return history.map((h) => ({
    role: h.role === "model" ? "assistant" : "user",
    content: h.content,
  }));
}

/**
 * Llamada base a Groq (sin streaming, reasoning desactivado → respuesta limpia).
 * @returns {Promise<string>} texto sin bloques <think>
 */
async function chat(messages, { temperature = 0.6, maxTokens = 1024 } = {}) {
  const completion = await getClient().chat.completions.create({
    messages,
    model: _model,
    temperature,
    max_completion_tokens: maxTokens,
    top_p: 0.95,
    stream: false,
    reasoning_effort: "none",
  });
  return stripThink(completion.choices?.[0]?.message?.content || "");
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
    ...toGroqMessages(history),
    { role: "user", content: newMessage },
  ];
  return chat(messages, { temperature: options.temperature });
}

/**
 * Clasifica si un mensaje (en contexto) es un recado y su nivel de prioridad.
 * @returns {Promise<{ isRecado: boolean, summary: string|null, priority: "alta"|"media"|"baja" }>}
 */
async function classifyRecado(contactName, conversationHistory, newMessage) {
  const system = `Eres un clasificador de mensajes de WhatsApp.
Tu tarea: determinar si el siguiente mensaje (en el contexto de la conversación) es un RECADO,
y asignarle un nivel de PRIORIDAD.

Un RECADO es un mensaje donde la persona deja información importante que requiere atención posterior:
una solicitud, aviso, dato de contacto, pregunta específica, tarea, o cualquier mensaje relevante
que el dueño del teléfono necesita saber.

NO es recado: saludos solos ("hola", "¿estás?"), respuestas a mensajes automáticos, confirmaciones vacías.

PRIORIDAD (solo si es recado):
- "alta": urgente o sensible al tiempo — emergencias, salud, dinero, plazos para hoy/mañana,
  citas próximas, o si dice explícitamente "urgente".
- "media": requiere atención pero sin apuro — solicitudes, preguntas, coordinar algo, seguimiento.
- "baja": informativo, puede esperar — avisos FYI, agradecimientos, mensajes con algún dato menor.
Si no es recado, usá "baja".

Responde ÚNICAMENTE con JSON válido, sin markdown:
{ "isRecado": true/false, "summary": "resumen en una línea o null si no es recado", "priority": "alta|media|baja" }`;

  const messages = [
    { role: "system", content: system },
    ...toGroqMessages(conversationHistory),
    { role: "user", content: `Mensaje de ${contactName}: ${newMessage}` },
  ];

  const VALID = ["alta", "media", "baja"];
  try {
    const raw = await chat(messages, { temperature: 0 });
    const parsed = parseJsonLoose(raw);
    if (parsed && typeof parsed.isRecado === "boolean") {
      return {
        isRecado: parsed.isRecado,
        summary: parsed.summary ?? null,
        priority: VALID.includes(parsed.priority) ? parsed.priority : "media",
      };
    }
    return { isRecado: false, summary: null, priority: "baja" };
  } catch {
    return { isRecado: false, summary: null, priority: "baja" };
  }
}

/**
 * Detecta si la persona ya completó su recado durante la conversación.
 * @returns {Promise<boolean>}
 */
async function detectRecadoCompleted(conversationHistory) {
  if (conversationHistory.length < 2) return false;

  const system = `Eres un analizador de conversaciones de WhatsApp.
Determina si la persona que escribe ya COMPLETÓ su recado (ya comunicó lo que necesitaba decir).
Responde ÚNICAMENTE con JSON: { "completed": true/false }`;

  const messages = [{ role: "system", content: system }, ...toGroqMessages(conversationHistory)];

  try {
    const raw = await chat(messages, { temperature: 0 });
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

module.exports = {
  configure,
  hasKey,
  getModel,
  listModels,
  generateResponse,
  classifyRecado,
  detectRecadoCompleted,
  classifyContent,
};
