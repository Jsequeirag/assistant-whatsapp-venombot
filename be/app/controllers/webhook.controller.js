const modeService = require("../services/mode.service");
const contactService = require("../services/contact.service");
const recadoService = require("../services/recado.service");
const llmService = require("../services/llm.service");

const IGNORED_SENDERS = ["status@broadcast", "broadcast"];
// Sufijos de chats que NO son conversaciones 1-a-1 con personas.
const IGNORED_SUFFIXES = ["@g.us", "@broadcast", "@newsletter"];

// Número propio del bot (host). Se setea al conectar; nunca respondemos a nosotros mismos.
let HOST_ID = null;
function setHostId(id) {
  HOST_ID = id;
  if (id) console.log(`🤖 Número del bot (host): ${id}`);
}

/**
 * Envía un texto y registra el resultado. Si falla (ej. destino @lid no enviable),
 * lo deja visible en consola en vez de romper el flujo silenciosamente.
 */
async function safeSend(client, contactId, text, label) {
  try {
    await client.sendText(contactId, text);
    return true;
  } catch (err) {
    console.error(`❌ Falló envío [${label}] a ${contactId}: ${err?.message || err}`);
    return false;
  }
}

// Reset por inactividad: si el contacto pasa este tiempo sin escribir, su sesión
// se reinicia y se lo trata como si escribiera por primera vez (re-saluda).
const SESSION_RESET_MS = 20 * 60 * 1000; // 20 minutos

// Solo procesar mensajes que llegaron después de que el bot arrancó.
// WhatsApp Web dispara el evento de mensaje también para el historial que carga
// al sincronizar; sin este corte, el bot respondería a mensajes de hace meses.
const BOT_START_TIME_MS = Date.now();

/**
 * Devuelve el tiempo del mensaje en ms, o null si no se puede determinar.
 * WhatsApp Web serializa el timestamp en el campo `t` (segundos).
 * Mantenemos fallback a `timestamp` por si alguna versión lo expone así.
 */
function getMessageTimeMs(msg) {
  const raw = typeof msg.t === "number" ? msg.t : msg.timestamp;
  if (typeof raw !== "number" || raw <= 0) return null;
  return raw > 1e12 ? raw : raw * 1000; // normalizar a ms
}

// Descripción legible para mensajes sin texto (medios).
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

/**
 * Texto a procesar. Para mensajes de texto usa el cuerpo; para medios usa el
 * caption o una etiqueta (NUNCA el body, que en imágenes puede traer base64).
 * Devuelve null si no hay nada procesable.
 */
function getMessageText(msg) {
  const isText = !msg.type || msg.type === "chat";
  if (isText && msg.body?.trim()) return msg.body.trim();
  if (msg.caption?.trim()) return msg.caption.trim();
  if (msg.type && msg.type !== "chat") {
    return MEDIA_LABELS[msg.type] || "(el contacto envió un archivo multimedia)";
  }
  if (msg.isMedia) return "(el contacto envió un archivo multimedia)";
  if (msg.body?.trim()) return msg.body.trim();
  return null;
}

async function processMessage(client, msg) {
  const from = msg.from || "";
  // Ignorar: grupos, listas de difusión, canales (newsletter), propios y sistema.
  if (msg.isGroupMsg) return;
  if (IGNORED_SUFFIXES.some((s) => from.endsWith(s))) return;
  if (msg.fromMe) return;
  if (HOST_ID && from === HOST_ID) return; // no responder a nuestro propio número
  if (IGNORED_SENDERS.includes(from)) return;

  // Texto a procesar: cuerpo, caption o descripción del medio (GIF/sticker/imagen).
  const messageText = getMessageText(msg);
  if (!messageText) return; // ni texto ni medio reconocido → ignorar

  // Fail-closed: sin timestamp confiable o anterior al arranque → ignorar.
  const msgTimeMs = getMessageTimeMs(msg);
  if (msgTimeMs === null || msgTimeMs < BOT_START_TIME_MS) {
    if (msgTimeMs !== null) {
      console.log(`⏭️  Ignorado mensaje previo al arranque (${new Date(msgTimeMs).toLocaleString("es")})`);
    }
    return;
  }

  const contactId = msg.from;
  const pushName = msg.sender?.pushname || msg.sender?.name || "";
  const contact = await contactService.getOrCreate(contactId, pushName);

  const number = contactId.replace(/@.+$/, "");
  console.log(`💬 [${new Date().toLocaleTimeString("es")}] ${contact.name} <${contactId}>: ${messageText.slice(0, 80)}`);

  // ─── Reset por inactividad (>20 min) → tratar como primera vez ─────────────
  if (contactService.isSessionExpired(contactId, SESSION_RESET_MS)) {
    contactService.resetSession(contactId);
    await modeService.clearRespondedContact(contactId);
    console.log(`🔄 Sesión reiniciada para ${contact.name} (>20 min sin actividad)`);
  }
  contactService.touchSession(contactId);

  // ─── Clasificar si es recado (en todos los casos) ──────────────────────────
  const { isRecado, summary, priority } = await llmService
    .classifyRecado(contact.name, contactService.getSession(contactId).conversationHistory, messageText)
    .catch(() => ({ isRecado: false, summary: null, priority: "baja" }));

  if (isRecado) {
    await recadoService.save({
      contactId,
      contactName: contact.name,
      content: summary || messageText,
      originalContent: messageText,
      priority,
      timestamp: new Date(),
    });
    console.log(`📩 Recado [${priority}] de ${contact.name}: ${(summary || messageText).slice(0, 60)}`);
  }

  const settings = await modeService.getSettings();
  const { ownerName, assistantName } = settings.identity;

  // Estado de presencia (DND > Sleep > disponible).
  const { status, reason: statusReason } = await modeService.getPresence();
  // globalAssist = master del asistente. contactAssist = además seguir la conversación.
  const globalAssist = settings.autoAssist.globalEnabled;
  const contactAssist = globalAssist && contact.autoAssist;

  console.log(
    `   ↳ status=${status} | global=${globalAssist} | contacto.autoAssist=${contact.autoAssist} | contactAssist=${contactAssist}`
  );

  // ─── Filtro de contenido inapropiado ──────────────────────────────────────
  const { appropriate, type: contentType } = await llmService
    .classifyContent(messageText)
    .catch(() => ({ appropriate: true, type: null }));

  if (!appropriate) {
    console.log(`🚫 Contenido inapropiado bloqueado de ${contact.name}: [${contentType}]`);
    if (contactAssist) {
      const decline = `Hola, soy ${assistantName}, el asistente virtual de ${ownerName}. Lo siento, no puedo responder a ese tipo de contenido. Si deseas dejar un recado para ${ownerName}, con gusto te ayudo.`;
      await safeSend(client, contactId, decline, "decline");
    }
    return;
  }

  // ─── ¿El bot debe responder? ───────────────────────────────────────────────
  // Responde si hay presencia activa (DND/Sleep) o si el asistente global está ON.
  // Disponible + asistente global OFF = silencio total (solo se clasificó el recado).
  if (status === "available" && !globalAssist) {
    console.log(`   ↳ silencio: disponible y asistente global OFF`);
    return;
  }

  const session = contactService.getSession(contactId);

  // ─── Primer mensaje: saludo según el estado de presencia ───────────────────
  // Saluda a TODOS una vez (con o sin auto-asistir por contacto). Valida motivo/contexto:
  // default si no hay, IA si hay. DND/Sleep registran el saludo de forma persistente
  // (se resetea al apagar el modo); "disponible" usa la sesión en memoria.
  const greetingTracked = status === "dnd" || status === "sleep";
  const alreadyGreeted = greetingTracked
    ? await modeService.hasResponded(status, contactId)
    : session.greetedOnce;

  if (!alreadyGreeted) {
    const greetMode = status === "available" ? "assist" : status;
    const greeting = await generateModeResponse(greetMode, ownerName, assistantName, statusReason, messageText);
    const sent = await safeSend(client, contactId, greeting, `saludo:${status}`);
    if (!sent) return; // si no se pudo enviar, no marcamos como saludado (reintenta luego)
    if (greetingTracked) await modeService.markResponded(status, contactId);
    session.greetedOnce = true;
    // Si va a seguir conversando, el saludo entra al historial para dar contexto.
    if (contactAssist) {
      contactService.addToHistory(contactId, "user", messageText);
      contactService.addToHistory(contactId, "model", greeting);
    }
    console.log(`👋 Saludo [${status}] a ${contact.name}`);
    return;
  }

  // ─── Ya saludamos: sin auto-asistir por contacto → silencio (solo recados) ──
  if (!contactAssist) {
    console.log(`   ↳ silencio: ya saludado, contacto sin auto-asistir`);
    return;
  }
  if (contactService.isRecadoCompleted(contactId)) {
    console.log(`   ↳ silencio: recado ya completado (se reinicia tras 20 min)`);
    return;
  }

  // ─── Auto-asistir: seguir la conversación ──────────────────────────────────
  contactService.addToHistory(contactId, "user", messageText);

  const response = await llmService
    .generateResponse(
      buildAutoAssistPrompt(ownerName, assistantName, false),
      session.conversationHistory.slice(0, -1),
      messageText
    )
    .catch(() => null);

  if (response) {
    await safeSend(client, contactId, response, "auto-assist");
    contactService.addToHistory(contactId, "model", response);
    console.log(`🤖 Auto-asistir: respondí a ${contact.name}`);
  }

  const completed = await llmService
    .detectRecadoCompleted(session.conversationHistory)
    .catch(() => false);

  if (completed) {
    contactService.markRecadoCompleted(contactId);
    console.log(`✅ Recado completo detectado para ${contact.name}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mensaje fijo (default) cuando NO hay motivo/contexto configurado.
 * Consistente entre contactos, sin llamar a la IA.
 */
function defaultModeMessage(mode, ownerName, assistantName) {
  const intro = `Hola 👋 Soy ${assistantName}, el asistente virtual de ${ownerName}.`;
  if (mode === "sleep") {
    return `${intro} En este momento ${ownerName} está descansando y no se encuentra disponible. Puedes dejarle un recado y lo verá mañana a partir de las 8:00 am. 🌙`;
  }
  // dnd y assist comparten el default genérico
  return `${intro} En este momento ${ownerName} no se encuentra disponible. ¿Deseas dejarle un recado? Con gusto se lo haré llegar. 📝`;
}

async function generateModeResponse(mode, ownerName, assistantName, reason, messageText) {
  // Sin motivo/contexto → respuesta default fija (consistente, sin IA)
  if (!reason || !reason.trim()) {
    return defaultModeMessage(mode, ownerName, assistantName);
  }

  // Con motivo/contexto → la IA adapta el mensaje a ese motivo
  const modeContext = {
    dnd: `El motivo de ausencia de ${ownerName} es: "${reason}".
IMPORTANTE: NO copies el motivo textualmente. Interpretalo y redactalo en tercera persona de forma natural y empática.
Ejemplos de interpretación:
- "de viaje vuelvo a la 1pm" → "${ownerName} se encuentra de viaje y estará disponible a la 1:00 pm"
- "en reunión hasta las 3" → "${ownerName} está en una reunión y estará libre a las 3:00 pm"
- "en el baño" → "${ownerName} estará disponible en unos minutos"
- "almorzando" → "${ownerName} se encuentra almorzando en este momento"
Incluí la información de disponibilidad (hora/fecha) si está en el motivo.`,
    sleep: `El contexto de ${ownerName} es: "${reason}".
IMPORTANTE: NO copies el contexto textualmente. Interpretalo y redactalo en tercera persona de forma natural.
Mencioná que verá el mensaje mañana a partir de las 8:00 am.`,
  };

  const systemPrompt = `Eres ${assistantName}, el asistente virtual de ${ownerName}.
Generá UN mensaje de WhatsApp de bienvenida para alguien que le escribió a ${ownerName}.

Situación: ${modeContext[mode]}

El mensaje debe:
- Presentarte como "${assistantName}, el asistente virtual de ${ownerName}"
- Explicar la situación de ${ownerName} de forma natural, empática y en tercera persona
- Usar 1 o 2 emojis relevantes y naturales (👋 🌙 ✈️ 🍽️ 📝 etc.)
- Invitar a dejar un recado
- Ser conciso, amigable y en el mismo idioma que el mensaje recibido

Mensaje recibido: "${messageText.slice(0, 200)}"
Respondé ÚNICAMENTE con el mensaje, sin comillas ni prefijos.`;

  try {
    // Temperatura baja → saludo consistente (sigue siendo natural)
    return await llmService.generateResponse(systemPrompt, [], messageText, { temperature: 0.3 });
  } catch {
    return defaultModeMessage(mode, ownerName, assistantName);
  }
}

function buildAutoAssistPrompt(ownerName, assistantName, isFirstMessage) {
  const intro = isFirstMessage
    ? `IMPORTANTE: Es el PRIMER mensaje. Presentate así (adaptá el idioma si es necesario, usá 1 o 2 emojis naturales):
"Hola 👋 Soy ${assistantName}, el asistente virtual de ${ownerName}. En este momento no está disponible, pero estoy aquí para ayudarte. ¿Deseas dejarle un recado o hay algo en lo que pueda asistirte?"
Luego continuá la conversación con normalidad.\n\n`
    : "";

  return `${intro}Eres ${assistantName}, el asistente virtual de ${ownerName}. NO eres ${ownerName}.
Dejá siempre claro que eres un asistente y que ${ownerName} no está disponible ahora.
Tu objetivo: conversar amablemente, entender qué necesita el contacto y, cuando ya comunicó su recado,
cerrar con cortesía (ej: "¡Entendido! Le aviso a ${ownerName} en cuanto pueda.").
Sé conciso. Respondé en el mismo idioma que usa la persona.
No inventes información ni hagas promesas de tiempo.
Si el mensaje contiene contenido vulgar, violento, sexual, amenazas u ofensivo, decliná educadamente
sin entrar en el tema: "Lo siento, no puedo responder a ese tipo de contenido."`;
}

module.exports = { processMessage, setHostId };
