const Message = require("../models/Message");

/** Guarda un turno de la conversación (entrante o saliente). Nunca rompe el flujo del bot. */
async function save({ contactId, contactName, role, content, via }) {
  return Message.create({ contactId, contactName, role, content, via });
}

/** Devuelve el historial de un contacto en orden cronológico (más antiguo primero). */
async function getByContact(contactId, { limit = 200 } = {}) {
  return Message.find({ contactId }).sort({ createdAt: 1 }).limit(limit).lean();
}

module.exports = { save, getByContact };
