const { GoogleGenAI } = require("@google/genai");
const { GEMINI_API_KEY, GEMINI_MODEL } = require("../config");

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * Genera una respuesta streaming y devuelve el texto completo.
 * @param {string} systemPrompt
 * @param {{ role: "user"|"model", content: string }[]} history
 * @param {string} newMessage
 * @returns {Promise<string>}
 */
async function generateResponse(systemPrompt, history, newMessage) {
  const contents = [
    ...history.map((h) => ({
      role: h.role,
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: newMessage }] },
  ];

  let text = "";
  const stream = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    config: {
      systemInstruction: systemPrompt,
      thinkingConfig: { thinkingBudget: 0 },
    },
    contents,
  });

  for await (const chunk of stream) {
    text += chunk.text || "";
  }
  return text.trim();
}

/**
 * Clasifica si un mensaje (dentro de una conversación) es un recado.
 * Devuelve { isRecado: boolean, summary: string|null }
 */
async function classifyRecado(contactName, conversationHistory, newMessage) {
  const prompt = `Eres un clasificador de mensajes de WhatsApp.
Tu tarea: determinar si el siguiente mensaje (en el contexto de la conversación) es un RECADO.

Un RECADO es un mensaje donde la persona deja información importante que requiere atención posterior:
una solicitud, aviso, dato de contacto, pregunta específica, tarea, o cualquier mensaje relevante
que el dueño del teléfono necesita saber.

NO es recado: saludos solos ("hola", "¿estás?"), respuestas a mensajes automáticos, confirmaciones vacías.

Responde ÚNICAMENTE con JSON válido, sin markdown:
{ "isRecado": true/false, "summary": "resumen en una línea o null si no es recado" }`;

  const contents = [
    ...conversationHistory.map((h) => ({
      role: h.role,
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: `Mensaje de ${contactName}: ${newMessage}` }] },
  ];

  let raw = "";
  const stream = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    config: {
      systemInstruction: prompt,
      thinkingConfig: { thinkingBudget: 0 },
    },
    contents,
  });
  for await (const chunk of stream) raw += chunk.text || "";

  try {
    return JSON.parse(raw.trim());
  } catch {
    return { isRecado: false, summary: null };
  }
}

/**
 * Detecta si la persona ya dejó su recado durante la conversación de auto-asistir.
 * Devuelve true cuando la IA considera que el objetivo de la llamada ya fue comunicado.
 */
async function detectRecadoCompleted(conversationHistory) {
  if (conversationHistory.length < 2) return false;

  const prompt = `Eres un analizador de conversaciones de WhatsApp.
Determina si la persona que escribe ya COMPLETÓ su recado (ya comunicó lo que necesitaba decir).
Responde ÚNICAMENTE con JSON: { "completed": true/false }`;

  const contents = conversationHistory.map((h) => ({
    role: h.role,
    parts: [{ text: h.content }],
  }));

  let raw = "";
  const stream = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    config: { systemInstruction: prompt, thinkingConfig: { thinkingBudget: 0 } },
    contents,
  });
  for await (const chunk of stream) raw += chunk.text || "";

  try {
    return JSON.parse(raw.trim()).completed === true;
  } catch {
    return false;
  }
}

module.exports = { generateResponse, classifyRecado, detectRecadoCompleted };
