/**
 * Decide si el bot debe responder automáticamente:
 *  - por una ventana horaria configurada (ej. mientras dormís), o
 *  - porque activaste el modo "No molestar" (DND) a mano.
 *
 * El estado de DND se guarda en bot/state.json para sobrevivir reinicios.
 */
const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, "state.json");

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { dndUntil: null }; // null = apagado | "forever" | timestamp(ms)
  }
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error("No se pudo guardar el estado DND:", e.message);
  }
}

let state = loadState();

// "HH:MM" -> minutos desde la medianoche
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// ¿La hora actual cae dentro de [start, end]? (soporta cruzar la medianoche)
function inWindow(now, startMin, endMin) {
  const cur = now.getHours() * 60 + now.getMinutes();
  if (startMin <= endMin) return cur >= startMin && cur < endMin;
  // La ventana cruza la medianoche (ej. 23:00 → 07:00)
  return cur >= startMin || cur < endMin;
}

// Devuelve la ventana horaria activa (o null)
function activeSchedule(config, now = new Date()) {
  for (const s of config.schedules || []) {
    if (s.days && !s.days.includes(now.getDay())) continue;
    if (inWindow(now, toMinutes(s.start), toMinutes(s.end))) return s;
  }
  return null;
}

// ¿Está activo el modo No molestar? (limpia el estado si ya expiró)
function dndActive(now = Date.now()) {
  if (!state.dndUntil) return false;
  if (state.dndUntil === "forever") return true;
  if (now < state.dndUntil) return true;
  state.dndUntil = null; // expiró
  saveState();
  return false;
}

/**
 * Estado actual del bot.
 * @returns {{ away: boolean, message: string|null, reason: string }}
 */
function awayStatus(config) {
  const now = new Date();
  if (dndActive(now.getTime())) {
    return { away: true, message: config.dndMessage, reason: "No molestar" };
  }
  const sched = activeSchedule(config, now);
  if (sched) {
    return { away: true, message: sched.message, reason: sched.name };
  }
  return { away: false, message: null, reason: "Disponible" };
}

/**
 * Cambia el modo No molestar.
 * @param {null|"forever"|number} duration  null = apagar, "forever" = indefinido, número = ms desde ahora
 */
function setDnd(duration) {
  if (duration === null) state.dndUntil = null;
  else if (duration === "forever") state.dndUntil = "forever";
  else state.dndUntil = Date.now() + duration;
  saveState();
  return state.dndUntil;
}

module.exports = { awayStatus, setDnd, activeSchedule, dndActive };
