const Recado = require("../models/Recado");
const Message = require("../models/Message");
const modeService = require("./mode.service");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Borra recados y mensajes más viejos que los días de retención configurados.
 * Si la retención es 0 (deshabilitada), no borra nada.
 * @returns {Promise<{skipped?: boolean, days: number, cutoff?: Date, recados?: number, messages?: number}>}
 */
async function purgeOld() {
  const days = await modeService.getRetentionDays();
  if (!days || days < 1) return { skipped: true, days: days || 0 };

  const cutoff = new Date(Date.now() - days * DAY_MS);
  const [recados, messages] = await Promise.all([
    Recado.deleteMany({ createdAt: { $lt: cutoff } }),
    Message.deleteMany({ createdAt: { $lt: cutoff } }),
  ]);

  return {
    days,
    cutoff,
    recados: recados.deletedCount || 0,
    messages: messages.deletedCount || 0,
  };
}

module.exports = { purgeOld };
