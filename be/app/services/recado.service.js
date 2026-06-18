const Recado = require("../models/Recado");

async function save({ contactId, contactName, content, originalContent, priority, timestamp }) {
  return Recado.create({ contactId, contactName, content, originalContent, priority, timestamp });
}

async function getAll({ read } = {}) {
  const filter = read !== undefined ? { read } : {};
  return Recado.find(filter).sort({ createdAt: -1 }).lean();
}

async function markRead(id, read = true) {
  return Recado.findByIdAndUpdate(id, { read }, { new: true });
}

module.exports = { save, getAll, markRead };
