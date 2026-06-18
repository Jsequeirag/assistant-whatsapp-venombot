const whatsappService = require("../services/whatsapp.service");

function status(req, res) {
  res.json(whatsappService.getStatus());
}

async function restart(req, res) {
  const r = await whatsappService.restart();
  res.json(r);
}

module.exports = { status, restart };
