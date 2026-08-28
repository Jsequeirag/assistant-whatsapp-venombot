const { Schema, model } = require("mongoose");

// Historial conversacional persistente por contacto (panel + hidratación del LLM).
// contact.service mantiene un Map en RAM y lo rellena desde acá tras un restart.
const messageSchema = new Schema(
  {
    contactId: { type: String, required: true, index: true },
    contactName: { type: String, default: "" },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    // Para mensajes "assistant": "auto" = generado por la IA, "manual" = enviado desde el panel.
    via: { type: String, enum: ["auto", "manual"], default: "auto" },
    // true cuando el contenido proviene de una transcripción de audio (Whisper)
    isTranscribed: { type: Boolean, default: false },
    // Ruta relativa bajo be/media/ (p. ej. 2026/08/ab12.jpg). El binario no va en Mongo.
    mediaPath: { type: String },
    // Legado: Base64. Los mensajes nuevos no lo usan; GET /api/media migra al disco.
    mediaData: { type: String },
    mediaType: { type: String }, // mimetype limpio, ej: "image/jpeg", "image/webp", "video/mp4"
    // Clasificación IA del mensaje entrante (solo role="user"). Ausente si no fue clasificado.
    aiClassification: {
      isRecado: { type: Boolean },
      summary: { type: String },
      priority: { type: String, enum: ["alta", "media", "baja"] },
    },
  },
  { timestamps: true }
);

messageSchema.index({ contactId: 1, createdAt: 1 });

module.exports = model("Message", messageSchema);
