const { Router } = require("express");
const recados = require("../controllers/recados.controller");
const settings = require("../controllers/settings.controller");
const contacts = require("../controllers/contacts.controller");

const router = Router();

// ─── Recados ──────────────────────────────────────────────────────────────────
router.get("/recados", recados.list);
router.patch("/recados/:id/read", recados.markRead);

// ─── Settings / Modos ─────────────────────────────────────────────────────────
router.get("/settings", settings.get);
router.patch("/settings/dnd", settings.updateDnd);
router.patch("/settings/sleep", settings.updateSleep);
router.patch("/settings/auto-assist", settings.updateAutoAssist);

// ─── Contactos ────────────────────────────────────────────────────────────────
router.get("/contacts", contacts.list);
router.patch("/contacts/:id/auto-assist", contacts.toggleAutoAssist);

module.exports = router;
