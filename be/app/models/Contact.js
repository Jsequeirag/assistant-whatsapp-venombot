const { Schema, model } = require("mongoose");

const contactSchema = new Schema(
  {
    contactId: { type: String, required: true, unique: true }, // "5491112345678@c.us"
    number: { type: String, required: true },
    name: { type: String, default: "" },
    avatarUrl: { type: String, default: "" }, // DiceBear o /api/contacts/:id/avatar
    avatarPath: { type: String, default: "" }, // relativo a be/media/ si viene de WhatsApp
    avatarSource: { type: String, enum: ["whatsapp", "dicebear"], default: "dicebear" },
    avatarResolved: { type: Boolean, default: false }, // ya se consultó la foto de WhatsApp
  },
  { timestamps: true }
);

contactSchema.index({ number: 1 });

module.exports = model("Contact", contactSchema);
