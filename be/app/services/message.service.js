const Message = require("../models/Message");

const MAX_MEDIA_B64 = 5 * 1024 * 1024;

/** Guarda un turno de la conversación (entrante o saliente). Nunca rompe el flujo del bot. */
async function save({ contactId, contactName, role, content, via, aiClassification, isTranscribed, mediaData, mediaType }) {
  let media = mediaData;
  let type = mediaType;
  if (media && media.length > MAX_MEDIA_B64) {
    console.warn(`⚠️  mediaData omitido (${media.length} chars) para ${contactId}`);
    media = undefined;
    type = undefined;
  }
  return Message.create({ contactId, contactName, role, content, via, aiClassification, isTranscribed, mediaData: media, mediaType: type });
}

/** Devuelve los últimos `limit` mensajes, en orden cronológico (más antiguo primero). */
async function getByContact(contactId, { limit = 200 } = {}) {
  const rows = await Message.find({ contactId }).sort({ createdAt: -1 }).limit(limit).lean();
  return rows.reverse();
}

/**
 * Devuelve un resumen de todos los contactos que tienen mensajes entrantes (role=user),
 * ordenados por actividad reciente. Incluye avatarUrl vía $lookup al modelo Contact.
 */
async function getContactsSummary() {
  const rows = await Message.aggregate([
    { $match: { role: "user" } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$contactId",
        contactName: { $first: "$contactName" },
        lastMessage: { $first: "$content" },
        lastAt: { $first: "$createdAt" },
        total: { $sum: 1 },
      },
    },
    { $sort: { lastAt: -1 } },
    // Traer avatarUrl del contacto sin traer todo el documento
    {
      $lookup: {
        from: "contacts",
        localField: "_id",
        foreignField: "contactId",
        as: "_c",
      },
    },
    { $addFields: { avatarUrl: { $first: "$_c.avatarUrl" } } },
    { $project: { _c: 0 } },
  ]);

  return rows.map((r) => ({
    contactId: r._id,
    contactName: r.contactName,
    lastMessage: r.lastMessage,
    lastAt: r.lastAt,
    total: r.total,
    avatarUrl: r.avatarUrl || "",
  }));
}

module.exports = { save, getByContact, getContactsSummary };
