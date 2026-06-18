const { Schema, model } = require("mongoose");

// Un único documento por servicio (upsert). No acumula historial:
// siempre refleja el último chequeo de la sesión/validación actual.
const serviceAuditSchema = new Schema(
  {
    service: { type: String, required: true, unique: true }, // "groq" | "mongodb" | "whatsapp"
    status: { type: String, enum: ["ok", "error"], required: true },
    message: { type: String, default: "" },
    latencyMs: { type: Number, default: 0 },
    phase: { type: String, default: "startup" }, // startup | manual | scheduled | runtime
  },
  { timestamps: true } // updatedAt = momento del último chequeo
);

module.exports = model("ServiceAudit", serviceAuditSchema);
