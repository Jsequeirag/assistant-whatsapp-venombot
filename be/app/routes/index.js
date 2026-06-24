const { Router } = require("express");
const recados = require("../controllers/recados.controller");
const settings = require("../controllers/settings.controller");
const contacts = require("../controllers/contacts.controller");
const audit = require("../controllers/audit.controller");
const whatsapp = require("../controllers/whatsapp.controller");

const router = Router();

// ─── Recados ──────────────────────────────────────────────────────────────────
router.get("/recados", recados.list);
router.patch("/recados/:id/read", recados.markRead);

// ─── Settings / Modos ─────────────────────────────────────────────────────────
router.get("/settings", settings.get);
router.patch("/settings/dnd", settings.updateDnd);
router.patch("/settings/sleep", settings.updateSleep);
router.patch("/settings/auto-assist", settings.updateAutoAssist)
router.patch("/settings/identity", settings.updateIdentity);
router.patch("/settings/groq", settings.updateGroq);
router.get("/settings/groq/models", settings.listGroqModels);
router.patch("/settings/retention", settings.updateRetention);

// ─── Auditoría de servicios ────────────────────────────────────────────────────
router.get("/audit", audit.list);
router.post("/audit/check", audit.runCheck);

// ─── WhatsApp (QR / sesión) ─────────────────────────────────────────────────────
router.get("/whatsapp/status", whatsapp.status);
router.post("/whatsapp/restart", whatsapp.restart);

// ─── Contactos ────────────────────────────────────────────────────────────────
router.get("/contacts", contacts.list);
router.post("/contacts", contacts.create);
// Ruta fija antes de /:id para que no sea capturada como parámetro
router.get("/contacts/messages-summary", contacts.getMessagesSummary);
router.patch("/contacts/:id", contacts.update);

router.delete("/contacts/:id", contacts.remove);
router.get("/contacts/:id/messages", contacts.getMessages);
router.post("/contacts/:id/reply", contacts.reply);
router.post("/contacts/:id/reply-file", contacts.replyFile);

module.exports = router;
