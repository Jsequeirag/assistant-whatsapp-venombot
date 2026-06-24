const contactService = require("../services/contact.service");
const messageService = require("../services/message.service");
const whatsappService = require("../services/whatsapp.service");

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

// ─── Fase 5: vista conversacional ──────────────────────────────────────────────

/** Todos los contactos que tienen al menos un mensaje entrante, con su último mensaje. */
async function getMessagesSummary(req, res) {
  const summary = await messageService.getContactsSummary();
  res.json(summary);
}

async function getMessages(req, res) {
  const contactId = decodeURIComponent(req.params.id);
  const messages = await messageService.getByContact(contactId);
  res.json(messages);
}

async function reply(req, res) {
  const contactId = decodeURIComponent(req.params.id);
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Texto requerido" });

  const contact = await contactService.getById(contactId);
  try {
    await whatsappService.sendText(contactId, text);
  } catch (err) {
    return res.status(503).json({ error: err?.message || "No se pudo enviar el mensaje" });
  }

  const message = await messageService.save({
    contactId,
    contactName: contact?.name || "",
    role: "assistant",
    content: text,
    via: "manual",
  });
  // Mantener el historial in-memory en sync para que el LLM tenga el contexto del envío manual.
  contactService.addToHistory(contactId, "model", text);
  res.status(201).json(message);
}

async function replyFile(req, res) {
  const contactId = decodeURIComponent(req.params.id);
  const { base64, filename, mimetype, caption } = req.body || {};
  if (!base64 || !filename) return res.status(400).json({ error: "base64 y filename requeridos" });

  const contact = await contactService.getById(contactId);
  try {
    await whatsappService.sendFileBase64(contactId, { base64, filename, mimetype, caption });
  } catch (err) {
    console.error(`📤  replyFile error [${contactId}]:`, err?.message || err);
    return res.status(503).json({ error: err?.message || "No se pudo enviar el archivo" });
  }

  // Guardar en el historial: caption si la hay, o el nombre del archivo como indicador
  const content = caption?.trim() || `[${filename}]`;
  const message = await messageService.save({
    contactId,
    contactName: contact?.name || "",
    role: "assistant",
    content,
    via: "manual",
  });
  contactService.addToHistory(contactId, "model", content);
  res.status(201).json(message);
}

module.exports = { list, create, update, remove, getMessagesSummary, getMessages, reply, replyFile };
