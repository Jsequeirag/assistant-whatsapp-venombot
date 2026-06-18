const mongoose = require("mongoose");
const ServiceAudit = require("../models/ServiceAudit");
const llmService = require("./llm.service");

// Cache en memoria del estado actual (para responder sin pegarle a Mongo en cada GET).
// La verdad persistente vive en Mongo: 1 documento por servicio (upsert, sin historial).
const _state = {};

/** Actualiza el estado de un servicio: cache en memoria + upsert en Mongo (best-effort). */
async function _set({ service, status, message = "", latencyMs = 0, phase = "manual" }) {
  const doc = { service, status, message, latencyMs, phase, checkedAt: new Date() };
  _state[service] = doc;
  try {
    await ServiceAudit.findOneAndUpdate(
      { service },
      { status, message, latencyMs, phase },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    console.error(`No se pudo persistir auditoría de ${service}:`, e.message);
  }
  return doc;
}

/** Carga el último estado guardado desde Mongo a la cache (al arrancar). */
async function loadFromDb() {
  try {
    const docs = await ServiceAudit.find().lean();
    for (const d of docs) {
      _state[d.service] = {
        service: d.service,
        status: d.status,
        message: d.message,
        latencyMs: d.latencyMs,
        phase: d.phase,
        checkedAt: d.updatedAt,
      };
    }
  } catch {
    /* best-effort */
  }
}

/** Verifica MongoDB según el estado de la conexión Mongoose. */
function checkMongo(phase = "manual") {
  const t = Date.now();
  const connected = mongoose.connection.readyState === 1;
  return _set({
    service: "mongodb",
    status: connected ? "ok" : "error",
    message: connected ? `Conectado a ${mongoose.connection.host}` : "Sin conexión",
    latencyMs: Date.now() - t,
    phase,
  });
}

/** Verifica Groq enviando un "hola" y esperando respuesta del modelo. */
async function checkGroq(phase = "manual") {
  const t = Date.now();
  try {
    const reply = await llmService.generateResponse(
      "Eres un verificador de salud. Responde solo con la palabra: hola",
      [],
      "hola"
    );
    const ok = typeof reply === "string" && reply.trim().length > 0;
    return _set({
      service: "groq",
      status: ok ? "ok" : "error",
      message: ok ? `Respuesta: "${reply.slice(0, 60)}"` : "Respuesta vacía",
      latencyMs: Date.now() - t,
      phase,
    });
  } catch (e) {
    return _set({
      service: "groq",
      status: "error",
      message: (e?.message || String(e)).slice(0, 200),
      latencyMs: Date.now() - t,
      phase,
    });
  }
}

/** Registra el estado de WhatsApp/VenomBot. */
function recordWhatsApp(status, message, phase = "startup") {
  return _set({ service: "whatsapp", status, message, latencyMs: 0, phase });
}

/** Corre los chequeos (Mongo + Groq) y devuelve el estado actualizado. */
async function runChecks(phase = "manual") {
  const mongo = await checkMongo(phase);
  const groq = await checkGroq(phase);
  return [mongo, groq];
}

/** Estado actual de todos los servicios conocidos. */
function getCurrent() {
  return Object.values(_state);
}

module.exports = {
  loadFromDb,
  checkMongo,
  checkGroq,
  recordWhatsApp,
  runChecks,
  getCurrent,
};
