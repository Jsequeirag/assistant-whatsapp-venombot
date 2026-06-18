/**
 * Gestión de recados.
 * Fase 1: in-memory. Fase 2: migrar a Recado model en MongoDB.
 */
let recados = [];
let nextId = 1;

function save({ contactId, contactName, content, timestamp }) {
  const recado = {
    id: String(nextId++),
    contactId,
    contactName,
    content,
    timestamp: timestamp || new Date(),
    read: false,
  };
  recados.push(recado);
  return recado;
}

function getAll({ read } = {}) {
  if (read === undefined) return [...recados];
  return recados.filter((r) => r.read === read);
}

function markRead(id, read = true) {
  const r = recados.find((r) => r.id === id);
  if (!r) return null;
  r.read = read;
  return r;
}

module.exports = { save, getAll, markRead };
