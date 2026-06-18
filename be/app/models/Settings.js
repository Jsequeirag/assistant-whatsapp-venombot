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
  groq: {
    apiKey: { type: String, default: "" },
    model: { type: String, default: "qwen/qwen3-32b" },
  },
  // Retención de datos: recados y mensajes más viejos que `days` se borran (ahorro de espacio).
  // 0 = nunca borrar (deshabilitado).
  retention: {
    days: { type: Number, default: 30 },
  },
});

module.exports = model("Settings", settingsSchema);
