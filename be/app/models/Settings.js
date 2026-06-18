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
});

module.exports = model("Settings", settingsSchema);
