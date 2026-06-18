/**
 * Procesa cada mensaje entrante de VenomBot.
 * Aplica la lógica de modos y decide si/cómo responder.
 *
 * Flujo:
 *   DND activo → responde una vez, luego solo clasifica recado
 *   Sleep activo → responde una vez, luego solo clasifica recado
 *   Auto-asistir (global ON + contacto ON) → IA conversa hasta detectar recado completo
 *   Ninguno → silencio
 *
 * En TODOS los modos clasifica si el mensaje es recado y lo guarda.
 */
const modeService = require("../services/mode.service");
const contactService = require("../services/contact.service");
const recadoService = require("../services/recado.service");
const geminiService = require("../services/gemini.service");

/**
 * Punto de entrada llamado desde bot/index.js por cada mensaje entrante.
 * @param {import("../../dist").VenomClient} client  instancia VenomBot
 * @param {object} msg                               mensaje de WhatsApp
 */
async function processMessage(client, msg) {
  // Ignorar grupos y mensajes vacíos
  if (msg.isGroupMsg || !msg.body?.trim()) return;

  const contactId = msg.from;
  const pushName = msg.sender?.pushname || msg.sender?.name || "";
  const contact = contactService.getOrCreate(contactId, pushName);
  const messageText = msg.body.trim();

  const mode = modeService.getActiveMode();

  // ─── Clasificar si es recado (en todos los modos) ──────────────────────────
  const { isRecado, summary } = await geminiService
    .classifyRecado(contact.name, contactService.getSession(contactId).conversationHistory, messageText)
    .catch(() => ({ isRecado: false, summary: null }));

  if (isRecado) {
    recadoService.save({
      contactId,
      contactName: contact.name,
      content: summary || messageText,
      timestamp: new Date(),
    });
    console.log(`📩 Recado guardado de ${contact.name}: ${(summary || messageText).slice(0, 60)}`);
  }

  // ─── Modo DND ──────────────────────────────────────────────────────────────
  if (mode === "dnd") {
    if (!modeService.hasResponded("dnd", contactId)) {
      const response = await generateModeResponse("dnd", contact.name, messageText);
      await client.sendText(contactId, response);
      modeService.markResponded("dnd", contactId);
      console.log(`🔕 DND: respondí a ${contact.name}`);
    }
    return;
  }

  // ─── Modo Sleep ────────────────────────────────────────────────────────────
  if (mode === "sleep") {
    if (!modeService.hasResponded("sleep", contactId)) {
      const response = await generateModeResponse("sleep", contact.name, messageText);
      await client.sendText(contactId, response);
      modeService.markResponded("sleep", contactId);
      console.log(`😴 Sleep: respondí a ${contact.name}`);
    }
    return;
  }

  // ─── Modo Auto-asistir ────────────────────────────────────────────────────
  if (mode === "auto-assist") {
    if (!contact.autoAssist) return; // switch por contacto desactivado

    if (contactService.isRecadoCompleted(contactId)) return; // ya dejó su recado

    const session = contactService.getSession(contactId);
    contactService.addToHistory(contactId, "user", messageText);

    const systemPrompt = buildAutoAssistPrompt();
    const response = await geminiService
      .generateResponse(systemPrompt, session.conversationHistory.slice(0, -1), messageText)
      .catch(() => null);

    if (response) {
      await client.sendText(contactId, response);
      contactService.addToHistory(contactId, "model", response);
      console.log(`🤖 Auto-asistir: respondí a ${contact.name}`);
    }

    // Verificar si la conversación ya completó su propósito
    const completed = await geminiService
      .detectRecadoCompleted(session.conversationHistory)
      .catch(() => false);

    if (completed) {
      contactService.markRecadoCompleted(contactId);
      console.log(`✅ Recado completo detectado para ${contact.name}`);
    }
  }

  // mode === "none" → silencio total
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateModeResponse(mode, contactName, messageText) {
  const basePrompt = modeService.getPrompt(mode);
  // Le damos al modelo el prompt base del usuario como instrucción del sistema
  // y el mensaje entrante como contexto, para que pueda personalizarlo si el prompt lo indica.
  try {
    return await geminiService.generateResponse(
      `Eres un asistente que responde en nombre de tu usuario cuando está ausente.
Usa el siguiente mensaje como plantilla para tu respuesta. Puedes adaptarlo levemente
si el mensaje entrante lo justifica, pero mantené el tono y la intención:

"${basePrompt}"

Contexto: el mensaje que recibiste es: "${messageText.slice(0, 200)}"
Responde directamente (sin comillas, sin prefijos), el texto que enviarás por WhatsApp.`,
      [],
      messageText
    );
  } catch {
    // Si Gemini falla, devolvemos el prompt literal del usuario
    return basePrompt;
  }
}

function buildAutoAssistPrompt() {
  return `Eres Aria, un asistente personal de WhatsApp que atiende mensajes en nombre de tu usuario.
Tu objetivo: conversar amablemente con la persona, entender qué necesita y, cuando ya lo comunicó
claramente, cerrar la conversación con cortesía (ej: "¡Entendido! Le aviso a [usuario] en cuanto pueda.").
Sé conciso. Responde siempre en el mismo idioma que usa la persona.
No inventes información sobre el usuario ni hagas promesas específicas de tiempo.`;
}

module.exports = { processMessage };
