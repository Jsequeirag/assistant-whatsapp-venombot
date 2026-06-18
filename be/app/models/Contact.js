const { Schema, model } = require("mongoose");

const contactSchema = new Schema(
  {
    contactId: { type: String, required: true, unique: true }, // "5491112345678@c.us"
    number: { type: String, required: true },
    name: { type: String, default: "" },
    autoAssist: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model("Contact", contactSchema);
