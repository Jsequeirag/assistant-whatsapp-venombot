const contactService = require("../services/contact.service");

async function list(req, res) {
  res.json(await contactService.getAll());
}

async function create(req, res) {
  const { name, number } = req.body;
  if (!number) return res.status(400).json({ error: "Número requerido" });
  const contact = await contactService.create(number, name);
  res.status(201).json(contact);
}

async function update(req, res) {
  const decoded = decodeURIComponent(req.params.id);
  const { name } = req.body;
  const contact = await contactService.update(decoded, { name });
  if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });
  res.json(contact);
}

async function remove(req, res) {
  const decoded = decodeURIComponent(req.params.id);
  const contact = await contactService.remove(decoded);
  if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });
  res.json({ ok: true });
}

async function toggleAutoAssist(req, res) {
  const { id } = req.params;
  const { enabled } = req.body;
  const decoded = decodeURIComponent(id);
  const contact = await contactService.setAutoAssist(decoded, enabled === true);
  if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });
  res.json(contact);
}

module.exports = { list, create, update, remove, toggleAutoAssist };
