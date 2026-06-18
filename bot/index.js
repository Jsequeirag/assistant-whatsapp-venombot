/**
 * Asistente de WhatsApp: auto-responde cuando estás ausente (horario configurado)
 * o cuando activás el modo "No molestar" desde tu propio teléfono.
 *
 * Cómo controlarlo (escribí estos comandos en CUALQUIER chat desde tu teléfono,
 * lo más cómodo es tu propio chat "Mensajes contigo mismo"):
 *   /dnd on      → activa No molestar indefinido
 *   /dnd 2h      → activa No molestar por 2 horas (también /dnd 30m)
 *   /dnd off     → desactiva No molestar
 *   /status      → muestra el estado actual
 */
const venom = require("../dist"); // librería venom ya compilada (corré "npm run build" antes)
const config = require("./config");
const { awayStatus, setDnd } = require("./scheduler");

// Cooldown por contacto: chatId -> timestamp de la última auto-respuesta
const lastReply = new Map();

// Convierte "2h" / "30m" a milisegundos (o null si no hay duración)
function parseDuration(text) {
  const m = text.match(/(\d+)\s*(h|m)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return m[2].toLowerCase() === "h" ? n * 3_600_000 : n * 60_000;
}

// Maneja comandos que VOS escribís (mensajes fromMe). Devuelve true si era un comando.
async function handleCommand(client, msg) {
  const text = (msg.body || "").trim();
  if (!text.startsWith(config.commandPrefix)) return false;

  const cmd = text.slice(config.commandPrefix.length).toLowerCase();
  const replyTo = msg.to; // el chat donde escribiste el comando

  if (cmd.startsWith("dnd")) {
    if (cmd.includes("off")) {
      setDnd(null);
      await client.sendText(replyTo, "✅ Modo *No molestar* desactivado. Vuelvo a responder normal.");
    } else {
      const dur = parseDuration(cmd);
      if (dur) {
        setDnd(dur);
        const mins = Math.round(dur / 60_000);
        await client.sendText(replyTo, `🔕 *No molestar* activado por ${mins} min.`);
      } else {
        setDnd("forever");
        await client.sendText(replyTo, "🔕 *No molestar* activado. Apagalo con /dnd off.");
      }
    }
    return true;
  }

  if (cmd.startsWith("status")) {
    const st = awayStatus(config);
    await client.sendText(
      replyTo,
      `📊 Estado: *${st.reason}* — ${st.away ? "respondiendo en automático" : "disponible"}.`
    );
    return true;
  }

  return false;
}

// Maneja mensajes ENTRANTES (de otras personas) → auto-respuesta si estás ausente
async function onIncoming(client, msg) {
  if (config.ignoreGroups && msg.isGroupMsg) return;

  const status = awayStatus(config);
  if (!status.away) return; // estás disponible → no auto-respondemos

  // Respetar el cooldown para no spamear al mismo contacto
  const now = Date.now();
  const last = lastReply.get(msg.from) || 0;
  if (now - last < config.cooldownMinutes * 60_000) return;
  lastReply.set(msg.from, now);

  try {
    await client.sendText(msg.from, status.message);
    console.log(`🤖 Auto-respuesta (${status.reason}) → ${msg.from}`);
  } catch (e) {
    console.error("Error enviando auto-respuesta:", e.message);
  }
}

venom
  .create({
    session: config.session,
    browser: config.browser,
    headless: config.headless,
    logQR: true,
  })
  .then((client) => {
    console.log("✅ Asistente conectado. Escuchando mensajes...");
    console.log("   Controlalo con: /dnd on | /dnd 2h | /dnd off | /status");

    // Mensajes de otras personas → candidatos a auto-respuesta
    client.onMessage((msg) => onIncoming(client, msg));

    // Tus propios mensajes → detectar comandos
    client.onAnyMessage((msg) => {
      if (msg.fromMe) handleCommand(client, msg).catch(() => {});
    });
  })
  .catch((err) => {
    console.error("❌ No se pudo iniciar el asistente:", err);
    process.exit(1);
  });
