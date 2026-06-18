/**
 * Estado de modos y lógica de decisión.
 * Fase 1: in-memory. Fase 2: migrar a Settings model en MongoDB.
 *
 * Prioridad: DND (máxima) → Sleep → Auto-asistir → Silencio
 */

// ─── Estado en memoria (TODO Fase 2: reemplazar con MongoDB Settings) ─────────
let settings = {
  dnd: {
    active: false,
    reason: "",
    prompt: "Hola 👋 En este momento no puedo atender. Te escribo cuando pueda.",
    respondedContacts: new Set(), // contactIds que ya recibieron respuesta en este periodo DND
  },
  sleep: {
    active: false,
    prompt: "Hola 👋 Estoy descansando (20:00–08:00). Te respondo mañana.",
    respondedContacts: new Set(),
  },
  autoAssist: {
    globalEnabled: false,
  },
};

// Horario sleep configurable
const SLEEP_START = 20; // 20:00
const SLEEP_END = 8;    // 08:00

function isInSleepHours() {
  const h = new Date().getHours();
  return h >= SLEEP_START || h < SLEEP_END;
}

/**
 * Modo activo para una solicitud entrante.
 * @returns {"dnd"|"sleep"|"auto-assist"|"none"}
 */
function getActiveMode() {
  if (settings.dnd.active) return "dnd";
  if (settings.sleep.active && isInSleepHours()) return "sleep";
  if (settings.autoAssist.globalEnabled) return "auto-assist";
  return "none";
}

/**
 * ¿Ya se respondió a este contacto en el periodo actual de DND/sleep?
 */
function hasResponded(mode, contactId) {
  if (mode === "dnd") return settings.dnd.respondedContacts.has(contactId);
  if (mode === "sleep") return settings.sleep.respondedContacts.has(contactId);
  return false;
}

function markResponded(mode, contactId) {
  if (mode === "dnd") settings.dnd.respondedContacts.add(contactId);
  if (mode === "sleep") settings.sleep.respondedContacts.add(contactId);
}

/**
 * Al desactivar DND/sleep se limpia la lista de "ya respondí",
 * así el siguiente periodo empieza de cero.
 */
function clearRespondedContacts(mode) {
  if (mode === "dnd") settings.dnd.respondedContacts.clear();
  if (mode === "sleep") settings.sleep.respondedContacts.clear();
}

function getPrompt(mode) {
  if (mode === "dnd") return settings.dnd.prompt;
  if (mode === "sleep") return settings.sleep.prompt;
  return null;
}

// ─── Getters/setters usados por settings.controller ───────────────────────────

function getSettings() {
  return {
    dnd: {
      active: settings.dnd.active,
      reason: settings.dnd.reason,
      prompt: settings.dnd.prompt,
    },
    sleep: {
      active: settings.sleep.active,
      prompt: settings.sleep.prompt,
    },
    autoAssist: {
      globalEnabled: settings.autoAssist.globalEnabled,
    },
  };
}

function updateDnd({ active, reason, prompt }) {
  if (active !== undefined) {
    if (!active) clearRespondedContacts("dnd");
    settings.dnd.active = active;
  }
  if (reason !== undefined) settings.dnd.reason = reason;
  if (prompt !== undefined) settings.dnd.prompt = prompt;
}

function updateSleep({ active, prompt }) {
  if (active !== undefined) {
    if (!active) clearRespondedContacts("sleep");
    settings.sleep.active = active;
  }
  if (prompt !== undefined) settings.sleep.prompt = prompt;
}

function updateAutoAssist({ globalEnabled }) {
  if (globalEnabled !== undefined) settings.autoAssist.globalEnabled = globalEnabled;
}

module.exports = {
  getActiveMode,
  hasResponded,
  markResponded,
  getPrompt,
  getSettings,
  updateDnd,
  updateSleep,
  updateAutoAssist,
};
