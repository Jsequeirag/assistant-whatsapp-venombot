const auditService = require("../services/audit.service");

/** Estado actual cacheado en memoria (no re-ejecuta los chequeos). */
async function list(req, res) {
  res.json({ current: auditService.getCurrent() });
}

/** Re-ejecuta los chequeos ahora y devuelve el estado actualizado. */
async function runCheck(req, res) {
  const results = await auditService.runChecks("manual");
  res.json({ current: auditService.getCurrent(), results });
}

module.exports = { list, runCheck };
