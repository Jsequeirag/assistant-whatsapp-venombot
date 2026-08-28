const { Schema, model } = require("mongoose");

const settingsSchema = new Schema({
  dnd: {
    active: { type: Boolean, default: false },
    reason: { type: String, default: "" },
    respondedContacts: { type: [String], default: [] },
  },
  sleep: {
    active: { type: Boolean, default: false },
    reason: { type: String, default: "" },
    respondedContacts: { type: [String], default: [] },
  },
  autoAssist: {
    globalEnabled: { type: Boolean, default: false },
  },
  identity: {
    ownerName: { type: String, default: "el usuario" },
    assistantName: { type: String, default: "Ari" },
  },
  // Proveedor OpenAI-compatible (nombre histórico "groq"; el cliente habla /v1/chat/completions).
  groq: {
    apiKey: { type: String, default: "" },
    model: { type: String, default: "qwen/qwen3-32b" },
    // URL /v1 del proveedor. Vacío = Groq (https://api.groq.com/openai/v1).
    baseUrl: { type: String, default: "" },
    // POST /v1/audio/transcriptions. No todos los clones lo implementan.
    voiceModel: { type: String, default: "whisper-large-v3-turbo" },
  },
  // Retención de datos: recados y mensajes más viejos que `days` se borran (ahorro de espacio).
  // 0 = nunca borrar (deshabilitado).
  retention: {
    days: { type: Number, default: 30 },
  },
  // IANA TZ para el horario de Sleep (20:00–08:00). Independiente del reloj del VPS.
  timezone: { type: String, default: "America/Argentina/Buenos_Aires" },
  // Chat "Tú": Aria responde si te escribís a tu propio número. Off en uso normal.
  testMode: {
    enabled: { type: Boolean, default: false },
  },
});

module.exports = model("Settings", settingsSchema);
