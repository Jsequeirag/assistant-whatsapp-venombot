const contactService = require("../services/contact.service");

function list(req, res) {
  res.json(contactService.getAll());
}

function toggleAutoAssist(req, res) {
  const { id } = req.params;
  const { enabled } = req.body;
  const decoded = decodeURIComponent(id);
  const contact = contactService.setAutoAssist(decoded, enabled === true);
  if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });
  res.json(contact);
}

module.exports = { list, toggleAutoAssist };
