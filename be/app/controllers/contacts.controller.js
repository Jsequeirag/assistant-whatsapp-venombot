const contactService = require("../services/contact.service");
const messageService = require("../services/message.service");
const whatsappService = require("../services/whatsapp.service");
const mediaService = require("../services/media.service");
const { dicebearUrl } = require("../lib/avatar");

/** Express ya decodifica params; un `%` suelto no debe tirar URIError 500. */
function contactIdFrom(req) {
  const raw = req.params.id;
  if (typeof raw !== "string") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function list(req, res) {
  res.json(await contactService.getAll());
}

async function create(req, res) {
  const { name, number } = req.body;
  if (!number) return res.status(400).json({ error: "Número requerido" });
  const contact = await contactService.create(number, name);
  if (!contact) return res.status(400).json({ error: "Número inválido" });
  res.status(201).json(contact);
}

async function update(req, res) {
  const decoded = contactIdFrom(req);
  const { name } = req.body;
  const contact = await contactService.update(decoded, { name });
  if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });
  res.json(contact);
}

async function remove(req, res) {
  const decoded = contactIdFrom(req);
  const contact = await contactService.remove(decoded);
  if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });
  res.json({ ok: true });
}

/** GET /api/contacts/:id/avatar — foto de WhatsApp en disco, o DiceBear. */
async function avatar(req, res) {
  const contactId = contactIdFrom(req);
  const contact = await contactService.getById(contactId);
  if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

  if (contact.avatarPath && mediaService.fileExists(contact.avatarPath)) {
    const abs = mediaService.absolutePath(contact.avatarPath);
    res.set("Cache-Control", "public, max-age=86400");
    res.type(mediaService.mimeForRel(contact.avatarPath));
    return res.sendFile(abs);
  }

  const generated = dicebearUrl(contact.name || contact.number || contactId);
  res.set("Cache-Control", "public, max-age=3600");
  return res.redirect(generated);
}

// ─── Fase 5: vista conversacional ──────────────────────────────────────────────

/** Todos los contactos que tienen al menos un mensaje entrante, con su último mensaje. */
async function getMessagesSummary(req, res) {
  const summary = await messageService.getContactsSummary();
  res.json(summary);
}

async function getMessages(req, res) {
  const contactId = contactIdFrom(req);
  const messages = await messageService.getByContact(contactId);
  res.json(messages);
}

async function reply(req, res) {
  const contactId = contactIdFrom(req);
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
  await contactService.ensureSession(contactId);
  contactService.addToHistory(contactId, "model", text);
  contactService.touchSession(contactId);
  res.status(201).json(message);
}

async function replyFile(req, res) {
  const contactId = contactIdFrom(req);
  const { base64, filename, mimetype, caption } = req.body || {};
  if (!base64 || !filename) return res.status(400).json({ error: "base64 y filename requeridos" });

  const contact = await contactService.getById(contactId);
  try {
    await whatsappService.sendFileBase64(contactId, { base64, filename, mimetype, caption });
  } catch (err) {
    console.error(`📤  replyFile error [${contactId}]:`, err?.message || err);
    return res.status(503).json({ error: err?.message || "No se pudo enviar el archivo" });
  }

  const content = caption?.trim() || `[${filename}]`;
  const raw = typeof base64 === "string" && base64.includes("base64,")
    ? base64.slice(base64.indexOf("base64,") + 7)
    : base64;
  const isVisual = (mimetype || "").startsWith("image/") || mimetype === "video/mp4";
  const message = await messageService.save({
    contactId,
    contactName: contact?.name || "",
    role: "assistant",
    content,
    via: "manual",
    mediaBuffer: isVisual && raw ? Buffer.from(raw, "base64") : undefined,
    mediaType: isVisual ? mimetype : undefined,
  });
  await contactService.ensureSession(contactId);
  contactService.addToHistory(contactId, "model", content);
  contactService.touchSession(contactId);
  res.status(201).json(message);
}

module.exports = { list, create, update, remove, avatar, getMessagesSummary, getMessages, reply, replyFile };
