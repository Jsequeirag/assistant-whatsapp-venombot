const modeService = require("../services/mode.service");
const contactService = require("../services/contact.service");
const recadoService = require("../services/recado.service");
const messageService = require("../services/message.service");
const llmService = require("../services/llm.service");
const incoming = require("../lib/incoming");

const {
  MEDIA_LABELS,
  registerSelfId,
  setHostId,
  getMessageTimeMs,
  getMessageText,
  extractPhoneNumber,
  decideTurn,
} = incoming;

// Una cola por contacto: dos mensajes seguidos no pueden saludar / clasificar en paralelo.
const _contactQueues = new Map();

function enqueueByContact(contactId, task) {
  const key = contactId || "_unknown";
  const prev = _contactQueues.get(key) || Promise.resolve();
  const next = prev
    .then(task, task)
    .catch((err) => console.error("Error procesando mensaje:", err?.message || err));
  _contactQueues.set(key, next);
  next.finally(() => {
    if (_contactQueues.get(key) === next) _contactQueues.delete(key);
  });
  return next;
}

/** Tope de binario persistido en Mongo (BSON máx. 16 MB; dejamos holgura). */
const MAX_MEDIA_BYTES = 3.5 * 1024 * 1024;

/**
 * Envía un texto y registra el resultado. Si falla (ej. destino @lid no enviable),
 * lo deja visible en consola en vez de romper el flujo silenciosamente.
 */
async function safeSend(client, contactId, text, label, contactName = "") {
  try {
    incoming.rememberOutgoing(contactId, text);
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

// Reset por inactividad: historial in-memory y "recado completo" se reinician.
// NO toca respondedContacts de DND/Sleep: esos saludos duran hasta apagar el modo.
const SESSION_RESET_MS = contactService.SESSION_IDLE_MS;

// Solo procesar mensajes que llegaron después de que el bot arrancó.
// WhatsApp Web dispara el evento de mensaje también para el historial que carga
// al sincronizar; sin este corte, el bot respondería a mensajes de hace meses.
const BOT_START_TIME_MS = Date.now();

async function processMessage(client, msg) {
  const allowSelf = modeService.isTestModeEnabled();
  if (incoming.dropReason(msg, { allowSelf })) return;

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
  const contact = await contactService.getOrCreate(contactId, pushName, {
    phoneNumber: extractPhoneNumber(msg, contactId),
  });
  contactService
    .ensureWhatsAppAvatar(contact, client, { sender: msg.sender })
    .catch((e) => console.warn(`⚠️  Avatar ${contactId}: ${e?.message || e}`));

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
  let mediaBuffer = undefined;
  let mediaType = undefined;

  if (VISUAL_TYPES.includes(msg.type)) {
    const isImgType = msg.type === "image" || msg.type === "sticker";
    const mimeHint = msg.type === "gif" ? "video/mp4" : (msg.mimetype || "image/jpeg");
    const result = await decryptWAMedia(mimeHint, { compress: isImgType });
    if (result) {
      if (result.buffer.length > MAX_MEDIA_BYTES) {
        console.warn(`🖼️  [${contact.name}] ${msg.type} no se guarda (${result.buffer.length} bytes > ${MAX_MEDIA_BYTES})`);
      } else {
        mediaBuffer = result.buffer;
        mediaType = result.mimeType;
        console.log(`🖼️  [${contact.name}] ${msg.type} descargado (${result.buffer.length} bytes)`);
      }
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

  // Sesión LLM: hidratar desde Mongo si el proceso reinició; reset si >20 min idle.
  // NO toca respondedContacts de DND/Sleep.
  await contactService.ensureSession(contactId, SESSION_RESET_MS);
  if (contactService.isSessionExpired(contactId, SESSION_RESET_MS)) {
    contactService.resetSession(contactId);
    console.log(`🔄 Sesión reiniciada para ${contact.name} (>20 min sin actividad)`);
  }
  contactService.touchSession(contactId);

  const skipClassify = messageText.startsWith("(el contacto envió");
  const session = contactService.getSession(contactId);

  const settings = await modeService.getSettings();
  const { ownerName, assistantName } = settings.identity;
  const selfTestTurn = allowSelf && incoming.isHostChat(contactId);
  const { status, reason: statusReason } = selfTestTurn
    ? { status: "available", reason: "" }
    : await modeService.getPresence();
  const globalAssist = selfTestTurn ? true : settings.autoAssist.globalEnabled;
  if (selfTestTurn) {
    console.log("🧪 Turno de prueba (chat con vos mismo) — se responde aunque auto-asistir esté off");
  }
  const alreadyGreeted =
    status === "dnd" || status === "sleep"
      ? await modeService.hasResponded(status, contactId)
      : session.greetedOnce;
  const { greetingTracked, willGreet, silence } = decideTurn({
    status,
    globalAssist,
    alreadyGreeted,
    recadoCompleted: contactService.isRecadoCompleted(contactId),
  });

  console.log(`   ↳ status=${status} | global=${globalAssist}`);

  const persistIncoming = async ({ isRecado, summary, priority }) => {
    messageService
      .save({
        contactId,
        contactName: contact.name,
        role: "user",
        content: messageText,
        isTranscribed: wasTranscribed || undefined,
        mediaBuffer: mediaBuffer || undefined,
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
      });
      console.log(`📩 Recado [${priority}] de ${contact.name}: ${(summary || messageText).slice(0, 60)}`);
    }
  };

  const emptyCls = { isRecado: false, summary: null, priority: "baja" };

  const rateLimited = (e) => e?.code === "LLM_RATE_LIMIT";

  // ─── Silencio: 0–1 llamada (solo clasificar recado). No filtro ni reply. ───
  if (silence) {
    try {
      const cls = skipClassify
        ? emptyCls
        : await llmService.classifyRecado(contact.name, session.conversationHistory, messageText, { contactId });
      await persistIncoming(cls);
    } catch (e) {
      if (rateLimited(e)) {
        console.warn(`⏱️  Rate limit LLM — se omite clasificar a ${contact.name}`);
        await persistIncoming(emptyCls);
      } else {
        await persistIncoming(emptyCls);
      }
    }
    if (status === "available" && !globalAssist) console.log(`   ↳ silencio: disponible y asistente global OFF`);
    else if (!globalAssist) console.log(`   ↳ silencio: ya saludado, sin auto-asistir`);
    else console.log(`   ↳ silencio: recado ya completado (se reinicia tras 20 min)`);
    return;
  }

  const declineFallback = alreadyGreeted
    ? `Ese tema se escapa de lo que puedo ayudarte 😅 Si querés dejarle algo a ${ownerName}, con gusto lo tomo.`
    : `Hola, soy ${assistantName}! Ese tipo de contenido no puedo manejarlo, pero si querés dejarle algo a ${ownerName}, con gusto lo tomo.`;

  const sendDecline = async (text) => {
    const sent = await safeSend(client, contactId, text, alreadyGreeted ? "decline" : "decline-greeting", contact.name);
    if (sent && !alreadyGreeted) {
      if (greetingTracked) await modeService.markResponded(status, contactId);
      session.greetedOnce = true;
    }
  };

  // ─── Saludo DND/Sleep (un mensaje por modo). 0–1 llamada. ─────────────────
  if (willGreet) {
    const greetText = isVisualMediaOnly
      ? `el contacto acaba de enviarte ${msg.type === "image" ? "una imagen" : msg.type === "sticker" ? "un sticker" : "un GIF"} sin texto adicional — saludalo brevemente y ofrecete a tomar un recado si lo necesita`
      : messageText;
    const canned = !statusReason || !statusReason.trim();

    let saved = false;
    try {
      if (canned) {
        const cls = skipClassify
          ? { ...emptyCls, appropriate: true }
          : await llmService.classifyIncoming(contact.name, session.conversationHistory, messageText, { contactId });
        await persistIncoming(cls);
        saved = true;
        if (cls.appropriate === false) {
          console.log(`🚫 Contenido inapropiado bloqueado de ${contact.name}: [${cls.contentType}]`);
          if (globalAssist) await sendDecline(cls.declineReply || declineFallback);
          return;
        }
        const greeting = defaultModeMessage(status, ownerName, assistantName);
        const sent = await safeSend(client, contactId, greeting, `saludo:${status}`, contact.name);
        if (!sent) return;
        await modeService.markResponded(status, contactId);
        session.greetedOnce = true;
        if (globalAssist) {
          contactService.addToHistory(contactId, "user", messageText);
          contactService.addToHistory(contactId, "model", greeting);
        }
        console.log(`👋 Saludo [${status}] a ${contact.name}`);
        return;
      }

      const turn = await llmService.replyTurn({
        contactName: contact.name,
        history: [],
        newMessage: greetText,
        replyInstructions: buildGreetingInstructions(status, ownerName, assistantName, statusReason, greetText),
        contactId,
        wantCompleted: false,
        skipClassify,
        temperature: 0.6,
      });
      await persistIncoming(turn);
      saved = true;
      if (turn.appropriate === false) {
        console.log(`🚫 Contenido inapropiado bloqueado de ${contact.name}: [${turn.contentType}]`);
        if (globalAssist) await sendDecline(turn.reply || declineFallback);
        return;
      }
      const greeting = turn.reply || defaultModeMessage(status, ownerName, assistantName);
      const sent = await safeSend(client, contactId, greeting, `saludo:${status}`, contact.name);
      if (!sent) return;
      await modeService.markResponded(status, contactId);
      session.greetedOnce = true;
      if (globalAssist) {
        contactService.addToHistory(contactId, "user", messageText);
        contactService.addToHistory(contactId, "model", greeting);
      }
      console.log(`👋 Saludo [${status}] a ${contact.name}`);
    } catch (e) {
      if (rateLimited(e)) console.warn(`⏱️  Rate limit LLM — sin saludo a ${contact.name}`);
      else console.error(`⚠️  Error en saludo [${status}] a ${contact.name}:`, e?.message || e);
      if (!saved) await persistIncoming(emptyCls);
    }
    return;
  }

  // ─── Auto-asistir: 1 llamada (clasificar + responder + recado completo) ────
  const isFirstAssist = !alreadyGreeted;
  const mediaDesc = msg.type === "image" ? "una imagen" : msg.type === "sticker" ? "un sticker" : "un GIF";
  const visualPrompt = `Eres ${assistantName}, asistente de ${ownerName}. El contacto acaba de enviar ${mediaDesc}.
No podés ver el contenido. Respondé con UN mensaje muy breve y natural reconociendo el envío.
NO preguntes qué hay en la imagen ni pidas que lo expliquen.
NO digas que ${ownerName} está ausente o no disponible.
${isFirstAssist ? `Presentate muy breve como ${assistantName}, el asistente de ${ownerName}. ` : ""}Ejemplos de tono: "Recibido 👍", "Perfecto, se lo hago saber a ${ownerName}.", "Anotado."
Sé natural y conciso. Mismo idioma que el contacto.`;

  let saved = false;
  try {
    const turn = await llmService.replyTurn({
      contactName: contact.name,
      history: isVisualMediaOnly ? [] : session.conversationHistory,
      newMessage: messageText,
      replyInstructions: isVisualMediaOnly
        ? visualPrompt
        : buildAutoAssistPrompt(ownerName, assistantName, isFirstAssist),
      contactId,
      wantCompleted: !isVisualMediaOnly && session.conversationHistory.length >= 2,
      skipClassify: skipClassify || isVisualMediaOnly,
      temperature: 0.6,
    });
    await persistIncoming(turn);
    saved = true;

    if (turn.appropriate === false) {
      console.log(`🚫 Contenido inapropiado bloqueado de ${contact.name}: [${turn.contentType}]`);
      if (globalAssist) await sendDecline(turn.reply || declineFallback);
      return;
    }

    if (turn.reply) {
      await safeSend(client, contactId, turn.reply, "auto-assist", contact.name);
      contactService.addToHistory(contactId, "user", messageText);
      contactService.addToHistory(contactId, "model", turn.reply);
      session.greetedOnce = true;
      console.log(`🤖 Auto-asistir: respondí a ${contact.name}`);
    }

    if (turn.recadoCompleted) {
      contactService.markRecadoCompleted(contactId);
      console.log(`✅ Recado completo detectado para ${contact.name}`);
    }
  } catch (e) {
    if (rateLimited(e)) console.warn(`⏱️  Rate limit LLM — sin auto-asistir a ${contact.name}`);
    else console.error(`⚠️  Error en auto-asistir a ${contact.name}:`, e?.message || e);
    if (!saved) await persistIncoming(emptyCls);
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
  if (mode === "assist") {
    return `${intro} ¿Deseas dejarle un recado o hay algo en lo que pueda asistirte?`;
  }
  return `${intro} En este momento ${ownerName} no se encuentra disponible. ¿Deseas dejarle un recado? Con gusto se lo haré llegar. 📝`;
}

function buildGreetingInstructions(mode, ownerName, assistantName, reason, messageText) {
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

  return `Eres ${assistantName}, el asistente personal de ${ownerName}.
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

Mensaje recibido (respondé relacionado a su contenido): "${(messageText || "").slice(0, 300)}"`;
}

function buildAutoAssistPrompt(ownerName, assistantName, isFirstMessage = false) {
  const presentation = isFirstMessage
    ? `Es el PRIMER mensaje de esta conversación. Presentate brevemente como ${assistantName}, el asistente de ${ownerName}. NO digas que ${ownerName} está ausente, ocupado o no disponible: estás atendiendo el chat de forma activa. Después de presentarte, respondé a lo que la persona escribió.`
    : `Ya te presentaste como ${assistantName} en el primer mensaje: NO vuelvas a presentarte ni repitas en cada mensaje que sos asistente; hablá con naturalidad como lo haría un asistente real.`;

  return `Eres ${assistantName}, el asistente personal de ${ownerName}. Sos ${assistantName}, NO sos ${ownerName}.
${presentation}
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

module.exports = { processMessage, setHostId, registerSelfId, enqueueByContact };
