const recadoService = require("../services/recado.service");

function list(req, res) {
  const { read } = req.query;
  const filter = read === undefined ? {} : { read: read === "true" };
  res.json(recadoService.getAll(filter));
}

function markRead(req, res) {
  const { id } = req.params;
  const read = req.body?.read !== false; // default true
  const recado = recadoService.markRead(id, read);
  if (!recado) return res.status(404).json({ error: "Recado no encontrado" });
  res.json(recado);
}

module.exports = { list, markRead };
