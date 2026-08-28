const { Schema, model } = require("mongoose");

const contactSchema = new Schema(
  {
    contactId: { type: String, required: true, unique: true }, // "5491112345678@c.us"
    number: { type: String, required: true },
    name: { type: String, default: "" },
    avatarUrl: { type: String, default: "" }, // URL de DiceBear generada del nombre
  },
  { timestamps: true }
);

contactSchema.index({ number: 1 });

module.exports = model("Contact", contactSchema);
