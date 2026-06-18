const { Schema, model } = require("mongoose");

const recadoSchema = new Schema(
  {
    contactId: { type: String, required: true },
    contactName: { type: String, default: "" },
    content: { type: String, required: true }, // interpretación/resumen de la IA
    originalContent: { type: String, default: "" }, // mensaje original del contacto
    priority: { type: String, enum: ["alta", "media", "baja"], default: "media" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model("Recado", recadoSchema);
