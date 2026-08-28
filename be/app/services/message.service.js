const Message = require("../models/Message");
const mediaService = require("./media.service");

function toClient(doc) {
  const o = doc && doc.toObject ? doc.toObject() : { ...(doc || {}) };
  const hasMedia = Boolean(o.mediaPath || o.mediaType);
  delete o.mediaData;
  delete o.mediaPath;
  if (hasMedia && o._id) o.mediaUrl = `/api/media/${o._id}`;
  return o;
}

/** Guarda un turno. El binario va a disco (`mediaPath`); Mongo no guarda Base64. */
async function save({ contactId, contactName, role, content, via, aiClassification, isTranscribed, mediaData, mediaBuffer, mediaType }) {
  let buf = mediaBuffer;
  if (!buf && mediaData) {
    try {
      buf = Buffer.from(mediaData, "base64");
    } catch {
      buf = null;
    }
  }
  let mediaPath;
  let type = mediaType;
  if (buf && type) {
    mediaPath = await mediaService.saveBuffer(buf, type);
    if (!mediaPath) type = undefined;
  } else {
    type = undefined;
  }
  const doc = await Message.create({
    contactId,
    contactName,
    role,
    content,
    via,
    aiClassification,
    isTranscribed,
    mediaPath,
    mediaType: type,
  });
  return toClient(doc);
}

/** Devuelve los últimos `limit` mensajes, en orden cronológico (más antiguo primero). */
async function getByContact(contactId, { limit = 200 } = {}) {
  const rows = await Message.find({ contactId })
    .select("-mediaData")
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return rows.reverse().map(toClient);
}

/**
 * Devuelve un resumen de todos los contactos que tienen mensajes entrantes (role=user),
 * ordenados por actividad reciente. Incluye avatarUrl vía $lookup al modelo Contact.
 */
async function getContactsSummary() {
  const rows = await Message.aggregate([
    { $match: { role: "user" } },
    { $project: { contactId: 1, contactName: 1, content: 1, createdAt: 1 } },
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

module.exports = { save, getByContact, getContactsSummary, toClient };
