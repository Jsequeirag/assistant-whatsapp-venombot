const { Schema, model } = require("mongoose");

// Historial conversacional persistente por contacto (Fase 5).
// A diferencia del Map in-memory de contact.service (que da contexto al LLM),
// este modelo guarda la conversación completa para la vista de hilos del panel.
const messageSchema = new Schema(
  {
    contactId: { type: String, required: true, index: true },
    contactName: { type: String, default: "" },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    // Para mensajes "assistant": "auto" = generado por la IA, "manual" = enviado desde el panel.
    via: { type: String, enum: ["auto", "manual"], default: "auto" },
  },
  { timestamps: true }
);

messageSchema.index({ contactId: 1, createdAt: 1 });

module.exports = model("Message", messageSchema);
