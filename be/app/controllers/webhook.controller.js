const modeService = require("../services/mode.service");
const contactService = require("../services/contact.service");
const recadoService = require("../services/recado.service");
const messageService = require("../services/message.service");
const llmService = require("../services/llm.service");

const IGNORED_SENDERS = ["status@broadcast", "broadcast"];
// Sufijos de chats que NO son conversaciones 1-a-1 con personas.
const IGNORED_SUFFIXES = ["@g.us", "@broadcast", "@newsletter"];

// IDs propios del bot/host. WhatsApp puede entregar NUESTROS propios mensajes con
// formato @c.us o @lid (multi-dispositivo); juntamos todas las variantes conocidas
// para nunca responderse a sí mismo (causaba loops + "Chat not found" en @lid).
const SELF_IDS = new Set();
let HOST_ID = null;

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

/**
 * ¿El mensaje lo envió el propio bot/host? Robusto ante @c.us y @lid.
 * WhatsApp codifica "fromMe" en el id serializado ("true_<chat>_<hash>"), aunque
 * el flag de nivel superior `msg.fromMe` a veces no venga en mensajes @lid.
 * Cuando confirma que es propio, aprende el id (para filtrar también el @lid del host).
 */
function isSelfMessage(msg) {
  const from = msg.from || "";
  if (msg.fromMe === true) { registerSelfId(from); return true; }
  const serialized = typeof msg.id === "string" ? msg.id : msg.id?._serialized;
  if (typeof serialized === "string" && serialized.startsWith("true_")) { registerSelfId(from); return true; }
  if (msg.id && typeof msg.id === "object" && msg.id.fromMe === true) { registerSelfId(from); return true; }
  return SELF_IDS.has(from);
}

/**
 * Envía un texto y registra el resultado. Si falla (ej. destino @lid no enviable),
 * lo deja visible en consola en vez de romper el flujo silenciosamente.
 */
async function safeSend(client, contactId, text, label, contactName = "") {
  try {
    await client.sendText(contactId, text);
    // Persistir el saliente en el historial conversacional (Fase 5). No bloquea el envío.
    messageService
      .save({ contactId, contactName, role: "assistant", content: text, via: "auto" })
      .catch((e) => console.error(`⚠️  No se pudo persistir mensaje saliente: ${e?.message || e}`));
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
  // Solo tratamos como medio los TIPOS conocidos de medios (o isMedia explícito).
  // Cualquier otro `type` (notification, e2e_notification, gp2, call_log, ciphertext,
  // protocol, revoked, etc.) es un mensaje de SISTEMA, no un mensaje real → ignorar.
  if (msg.type && MEDIA_LABELS[msg.type]) return MEDIA_LABELS[msg.type];
  if (msg.isMedia && msg.type !== "chat") return "(el contacto envió un archivo multimedia)";
  return null;
}

async function processMessage(client, msg) {
  const from = msg.from || "";
  // Ignorar: grupos, listas de difusión, canales (newsletter), propios y sistema.
  if (msg.isGroupMsg) return;
  if (IGNORED_SUFFIXES.some((s) => from.endsWith(s))) return;
  if (isSelfMessage(msg)) return; // propios (incluye formato @lid) → nunca responderse a sí mismo
  if (IGNORED_SENDERS.includes(from)) return;

  // Texto a procesar: cuerpo, caption o descripción del medio (GIF/sticker/imagen).
  // Para ptt/audio se reemplaza más abajo con la transcripción de Whisper.
  let messageText = getMessageText(msg);
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

  // ─── Descifrado de medios de WhatsApp (compartido) ────────────────────────
  // Descarga y descifra un archivo de WA usando el browser context de Puppeteer.
  // Devuelve { buffer, mimeType } o null si falla.
  const decryptWAMedia = async (mimeHint, { compress = false } = {}) => {
    if (!client.page || !msg.directPath || !msg.mediaKey) return null;
    try {
      const rawMime = (mimeHint || msg.mimetype || "application/octet-stream").split(";")[0].trim();
      const result = await client.page.evaluate(
        async (directPath, mediaKeyB64, mimeType, compress) => {
          const CDN_BASE = "https://mmg.whatsapp.net";
          const resp = await fetch(CDN_BASE + directPath);
          if (!resp.ok) return null;
          const encData = new Uint8Array(await resp.arrayBuffer());

          // HKDF SHA-256
          const category = mimeType.split("/")[0];
          const appInfoStr =
            category === "audio" ? "WhatsApp Audio Keys" :
            category === "image" ? "WhatsApp Image Keys" :
            category === "video" ? "WhatsApp Video Keys" :
                                   "WhatsApp Document Keys";
          const info = new TextEncoder().encode(appInfoStr);
          const rawKey = Uint8Array.from(atob(mediaKeyB64), (c) => c.charCodeAt(0));
          const hkdfKey = await crypto.subtle.importKey("raw", rawKey, "HKDF", false, ["deriveBits"]);
          const expanded = new Uint8Array(
            await crypto.subtle.deriveBits(
              { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
              hkdfKey, 896
            )
          );
          const aesKey = await crypto.subtle.importKey("raw", expanded.slice(16, 48), "AES-CBC", false, ["decrypt"]);
          const decrypted = await crypto.subtle.decrypt(
            { name: "AES-CBC", iv: expanded.slice(0, 16) },
            aesKey, encData.slice(0, -10)
          );

          // Para imágenes: comprimir con Canvas antes de devolver
          if (compress && category === "image") {
            try {
              const blob = new Blob([decrypted], { type: mimeType });
              const url = URL.createObjectURL(blob);
              const img = new Image();
              await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
              URL.revokeObjectURL(url);
              const MAX = 800;
              const scale = Math.min(1, MAX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
              const canvas = document.createElement("canvas");
              canvas.width = Math.round(img.naturalWidth * scale);
              canvas.height = Math.round(img.naturalHeight * scale);
              canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
              return { b64: dataUrl.split(",")[1], mime: "image/jpeg" };
            } catch { /* si falla la compresión, devolver sin comprimir */ }
          }

          const bytes = new Uint8Array(decrypted);
          let bin = "";
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          return { b64: btoa(bin), mime: mimeType };
        },
        msg.directPath, msg.mediaKey, rawMime, compress
      );
      if (!result?.b64) return null;
      return { buffer: Buffer.from(result.b64, "base64"), mimeType: result.mime };
    } catch (e) {
      console.warn(`📥  decrypt falló [${msg.type}]: ${e?.message}`);
      return null;
    }
  };

  // ─── Medios visuales: imagen, sticker, GIF ────────────────────────────────
  const VISUAL_TYPES = ["image", "sticker", "gif"];
  let mediaData = undefined;
  let mediaType = undefined;

  if (VISUAL_TYPES.includes(msg.type)) {
    const isImgType = msg.type === "image" || msg.type === "sticker";
    const mimeHint = msg.type === "gif" ? "video/mp4" : (msg.mimetype || "image/jpeg");
    const result = await decryptWAMedia(mimeHint, { compress: isImgType });
    if (result) {
      mediaData = result.buffer.toString("base64");
      mediaType = result.mimeType;
      console.log(`🖼️  [${contact.name}] ${msg.type} descargado (${result.buffer.length} bytes)`);
    } else {
      console.warn(`🖼️  [${contact.name}] No se pudo descargar ${msg.type}`);
    }
  }

  // ─── Transcripción de voz con Whisper (ptt / audio) ───────────────────────
  const isVoiceMsg = msg.type === "ptt" || msg.type === "audio";
  if (isVoiceMsg && llmService.hasKey()) {
    const transcript = await (async () => {
      try {
        const rawMime = (msg.mimetype || "audio/ogg").split(";")[0].trim();
        const ext = rawMime.split("/")[1] || "ogg";

        const result = await decryptWAMedia(rawMime);
        if (!result?.buffer?.length) {
          console.warn(`🎙️  [${contact.name}] No se pudo obtener buffer del audio`);
          return null;
        }

        console.log(`🎙️  [${contact.name}] Buffer ${result.buffer.length} bytes → Whisper`);
        return await llmService.transcribeAudio(result.buffer, { mimeType: rawMime, filename: `audio.${ext}` });
      } catch (err) {
        console.warn(`🎙️  [${contact.name}] Transcripción fallida: ${err?.message || err}`);
        return null;
      }
    })();

    if (transcript) {
      messageText = transcript;
      console.log(`🎙️  ✅ [${contact.name}]: "${transcript.slice(0, 80)}"`);
    } else {
      console.warn(`🎙️  ❌ [${contact.name}] Sin transcripción — etiqueta genérica`);
    }
  }
  const wasTranscribed = isVoiceMsg && messageText !== MEDIA_LABELS.ptt && messageText !== MEDIA_LABELS.audio && messageText !== "(el contacto envió un archivo multimedia)";
  // Mensaje visual sin caption: la etiqueta genérica no aporta contexto conversacional.
  // Se usa para generar respuestas que no intenten "interpretar" el medio.
  const isVisualMediaOnly = VISUAL_TYPES.includes(msg.type) && messageText.startsWith("(el contacto envió");

  console.log(`💬 [${new Date().toLocaleTimeString("es")}] ${contact.name} <${contactId}>: ${messageText.slice(0, 80)}`);

  // ─── Reset por inactividad (>20 min) → tratar como primera vez ─────────────
  if (contactService.isSessionExpired(contactId, SESSION_RESET_MS)) {
    contactService.resetSession(contactId);
    await modeService.clearRespondedContact(contactId);
    console.log(`🔄 Sesión reiniciada para ${contact.name} (>20 min sin actividad)`);
  }
  contactService.touchSession(contactId);

  // ─── Clasificar si es recado (en todos los casos) ──────────────────────────
  // Se clasifica ANTES de persistir para guardar la interpretación IA con el mensaje.
  const { isRecado, summary, priority } = await llmService
    .classifyRecado(contact.name, contactService.getSession(contactId).conversationHistory, messageText)
    .catch(() => ({ isRecado: false, summary: null, priority: "baja" }));

  // Persistir el mensaje entrante con su clasificación IA. No bloquea el flujo.
  messageService
    .save({
      contactId,
      contactName: contact.name,
      role: "user",
      content: messageText,
      isTranscribed: wasTranscribed || undefined,
      mediaData: mediaData || undefined,
      mediaType: mediaType || undefined,
      aiClassification: { isRecado, summary: summary || undefined, priority: priority || undefined },
    })
    .catch((e) => console.error(`⚠️  No se pudo persistir mensaje entrante: ${e?.message || e}`));

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
  // contactAssist = el asistente global está activo (ya no hay override por contacto).
  const globalAssist = settings.autoAssist.globalEnabled;
  const contactAssist = globalAssist;

  console.log(`   ↳ status=${status} | global=${globalAssist}`);

  // ─── Estado de sesión y saludo ────────────────────────────────────────────
  // Se calcula antes del filtro de contenido para saber si es primera interacción.
  const session = contactService.getSession(contactId);
  const greetingTracked = status === "dnd" || status === "sleep";
  const alreadyGreeted = greetingTracked
    ? await modeService.hasResponded(status, contactId)
    : session.greetedOnce;

  // ─── Filtro de contenido inapropiado ──────────────────────────────────────
  const { appropriate, type: contentType } = await llmService
    .classifyContent(messageText)
    .catch(() => ({ appropriate: true, type: null }));

  if (!appropriate) {
    console.log(`🚫 Contenido inapropiado bloqueado de ${contact.name}: [${contentType}]`);
    if (contactAssist) {
      let response;
      if (!alreadyGreeted) {
        // Primera interacción: presentarse + decline en un solo mensaje natural.
        const prompt = `Eres ${assistantName}, asistente personal de ${ownerName}.
Es el PRIMER mensaje de esta persona y contiene contenido inapropiado que no podés manejar.
En UN solo mensaje: presentate brevemente de forma natural y decliná el contenido sin sonar a robot ni a sistema automático.
Si querés, invitá a dejar un recado. Tono cálido y breve. Mismo idioma que la persona. Sin emojis forzados.
Mensaje recibido: "${messageText.slice(0, 200)}"`;
        response = await llmService
          .generateResponse(prompt, [], messageText, { temperature: 0.7 })
          .catch(() => `Hola, soy ${assistantName}! Ese tipo de contenido no puedo manejarlo, pero si querés dejarle algo a ${ownerName}, con gusto lo tomo.`);
        const sent = await safeSend(client, contactId, response, "decline-greeting", contact.name);
        if (sent) {
          if (greetingTracked) await modeService.markResponded(status, contactId);
          session.greetedOnce = true;
        }
      } else {
        // Ya saludó antes: decline natural sin presentarse de nuevo.
        const prompt = `Eres ${assistantName}, el asistente personal de ${ownerName}.
La persona acaba de enviar un mensaje con contenido inapropiado que no podés manejar.
Respondé de forma MUY breve, natural y humana: sin frases robóticas, sin presentarte de nuevo, sin sonar a sistema automático.
Podés redirigir sutilmente a dejar un recado si querés, pero no es obligatorio.
Usá el mismo idioma y tono que usa la persona. Máximo 1-2 oraciones. Sin emojis forzados.
Mensaje recibido: "${messageText.slice(0, 200)}"`;
        response = await llmService
          .generateResponse(prompt, [], messageText, { temperature: 0.7 })
          .catch(() => `Ese tema se escapa de lo que puedo ayudarte 😅 Si querés dejarle algo a ${ownerName}, con gusto lo tomo.`);
        await safeSend(client, contactId, response, "decline", contact.name);
      }
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

  // ─── Primer mensaje: saludo según el estado de presencia ───────────────────
  // Saluda a TODOS una vez (con o sin auto-asistir por contacto). Valida motivo/contexto:
  // default si no hay, IA si hay. DND/Sleep registran el saludo de forma persistente
  // (se resetea al apagar el modo); "disponible" usa la sesión en memoria.

  if (!alreadyGreeted) {
    const greetMode = status === "available" ? "assist" : status;
    // Para medios sin caption: el LLM no debe intentar interpretar la imagen.
    // Se le pasa una descripción neutral del evento en lugar de la etiqueta literal.
    const greetText = isVisualMediaOnly
      ? `el contacto acaba de enviarte ${msg.type === "image" ? "una imagen" : msg.type === "sticker" ? "un sticker" : "un GIF"} sin texto adicional — saludalo brevemente y ofrecete a tomar un recado si lo necesita`
      : messageText;
    const greeting = await generateModeResponse(greetMode, ownerName, assistantName, statusReason, greetText);
    const sent = await safeSend(client, contactId, greeting, `saludo:${status}`, contact.name);
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

  const mediaDesc = msg.type === "image" ? "una imagen" : msg.type === "sticker" ? "un sticker" : "un GIF";
  const response = await llmService
    .generateResponse(
      isVisualMediaOnly
        // Para medios visuales sin caption: acuse breve y natural, sin intentar describir el contenido
        ? `Eres ${assistantName}, asistente de ${ownerName}. El contacto acaba de enviar ${mediaDesc}.
No podés ver el contenido. Respondé con UN mensaje muy breve y natural reconociendo el envío.
NO preguntes qué hay en la imagen ni pidas que lo expliquen.
Ejemplos de tono: "Recibido 👍", "Perfecto, se lo hago saber a ${ownerName}.", "Anotado."
Sé natural y conciso. Mismo idioma que el contacto.`
        : buildAutoAssistPrompt(ownerName, assistantName, false),
      isVisualMediaOnly ? [] : session.conversationHistory.slice(0, -1),
      messageText
    )
    .catch(() => null);

  if (response) {
    await safeSend(client, contactId, response, "auto-assist", contact.name);
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
  const intro = `Hola 👋 Soy ${assistantName}, el asistente de ${ownerName}.`;
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

  const systemPrompt = `Eres ${assistantName}, el asistente personal de ${ownerName}.
Generá UN mensaje de WhatsApp de bienvenida para alguien que le escribió a ${ownerName}.

Situación: ${modeContext[mode]}

El mensaje debe:
- Presentarte como "${assistantName}, el asistente de ${ownerName}". Sos ${assistantName}, NO sos ${ownerName}.
- Reconocer de forma breve y natural lo que la persona escribió y responder relacionado a eso
  (ej.: si avisa que enviará algo, agradecé y decí que tomás nota; si pregunta algo, indicá que
  le harás llegar la consulta a ${ownerName}). NO te comprometas en nombre de ${ownerName},
  NO confirmes acciones de ${ownerName} ni inventes información.
- Explicar la situación de ${ownerName} de forma natural, empática y en tercera persona
- Cerrar según el tipo de mensaje recibido:
  · Si la persona ya dejó un mensaje con contenido claro (solicitud, aviso, pregunta, recado):
    confirmá que tomaste nota y que se lo harás llegar a ${ownerName} (ej.: "Anotado, se lo hago saber a ${ownerName} en cuanto pueda."). NO le preguntes si quiere dejar un recado, ya lo dejó.
  · Si el mensaje es solo un saludo sin contenido ("hola", "¿estás?", etc.):
    invitá a dejar el recado para ${ownerName} (ej.: "Si querés dejarle algún mensaje, con gusto se lo hago llegar.")
- Sonar humano y cercano: variá el fraseo (NO uses siempre la misma plantilla) y ajustá el tono,
  la formalidad y los emojis al estilo de quien escribe (1 o 2 emojis naturales: 👋 🌙 ✈️ 🍽️ 📝 etc.)
- Ser conciso (2-3 frases), amigable y en el mismo idioma que el mensaje recibido

Si la persona pregunta directamente si sos un bot, una IA o una persona real: NO afirmes ser humano
y NO te declares un bot/IA; respondé con naturalidad que sos ${assistantName}, quien ayuda a
${ownerName} con sus mensajes, y seguí con lo que necesita.

Mensaje recibido (respondé relacionado a su contenido): "${messageText.slice(0, 300)}"
Respondé ÚNICAMENTE con el mensaje, sin comillas ni prefijos.`;

  try {
    // Temperatura media → variedad natural en el fraseo (evita plantilla repetida)
    return await llmService.generateResponse(systemPrompt, [], messageText, { temperature: 0.6 });
  } catch {
    return defaultModeMessage(mode, ownerName, assistantName);
  }
}

function buildAutoAssistPrompt(ownerName, assistantName, isFirstMessage) {
  const intro = isFirstMessage
    ? `IMPORTANTE: Es el PRIMER mensaje. Presentate así (adaptá el idioma si es necesario, usá 1 o 2 emojis naturales):
"Hola 👋 Soy ${assistantName}, el asistente de ${ownerName}. En este momento no está disponible, pero estoy aquí para ayudarte. ¿Deseas dejarle un recado o hay algo en lo que pueda asistirte?"
Luego continuá la conversación con normalidad.\n\n`
    : "";

  return `${intro}Eres ${assistantName}, el asistente personal de ${ownerName}. Sos ${assistantName}, NO sos ${ownerName}.
Ya te presentaste como ${assistantName} en el primer mensaje: NO vuelvas a presentarte ni repitas
en cada mensaje que sos asistente; hablá con naturalidad como lo haría un asistente real.
Tu objetivo: conversar de forma cálida y humana, entender qué necesita el contacto y tomar su recado.
Cuando la persona ya comunicó lo que necesitaba, cerrá con naturalidad confirmando que se lo vas a pasar
a ${ownerName} (ej: "Perfecto, le aviso a ${ownerName}." / "Anotado, se lo hago saber." / "Entendido, le dejo el mensaje.").
Mostrá empatía y respondé al contexto de lo que dice la persona. Variá el fraseo (no suenes a plantilla)
y ajustá el tono, la formalidad y los emojis al estilo de quien escribe.

TU ROL ES ACOTADO: sos el asistente personal de ${ownerName} y SOLO ayudás con cosas relacionadas a
${ownerName} (tomar recados, coordinar citas/contacto, responder sobre cómo ubicarlo o temas propios de él).
NO sos un asistente de conocimiento general. Si la persona pide algo fuera de ese rol —preguntas de
cultura general o historia, tareas escolares, trivia, definiciones, opiniones, ayuda técnica, recetas,
traducciones, etc.— NO lo respondas ni des la información. Decliná como lo haría un asistente humano:
con naturalidad, buena onda y sin sonar a robot, aclarando que eso se escapa de lo tuyo y reconduciendo
a dejar un recado para ${ownerName}.
Ejemplo: "Jaja, de eso no te sabría ayudar 😅 Yo me encargo de los mensajes de ${ownerName}. ¿Querés que le deje algún recado?"

Si el mensaje es puramente social o de saludo sin contenido concreto (ej: "hola", "¿cómo estás?", "qué tal"),
respondé de forma breve y cálida pero reconducí de inmediato al propósito: averiguar si la persona tiene
algún mensaje para ${ownerName}. NO te enganches en charla extendida ni hagas preguntas personales.
Ejemplo: "¡Hola! 😊 ¿Querés dejarle algo a ${ownerName}?"

Sé conciso. Respondé en el mismo idioma que usa la persona.
SÍ podés decir que vos le vas a avisar a ${ownerName} (eso es tu trabajo).
NO prometas acciones específicas de ${ownerName} ni inventes datos a su nombre: no digas qué va a hacer él, cuándo va a responder ni en qué plazo.
Si la persona pregunta directamente si sos un bot, una IA o una persona real: NO afirmes ser humano
y NO te declares un bot/IA; respondé con naturalidad que sos ${assistantName}, quien ayuda a ${ownerName},
y seguí con lo que necesita.
Si el mensaje contiene contenido vulgar, violento, sexual, amenazas u ofensivo, decliná educadamente
sin entrar en el tema: "Lo siento, no puedo responder a ese tipo de contenido."`;
}

module.exports = { processMessage, setHostId, registerSelfId };
