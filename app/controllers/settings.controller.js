const modeService = require("../services/mode.service");

function get(req, res) {
  res.json(modeService.getSettings());
}

function updateDnd(req, res) {
  const { active, reason, prompt } = req.body;
  modeService.updateDnd({ active, reason, prompt });
  res.json(modeService.getSettings().dnd);
}

function updateSleep(req, res) {
  const { active, prompt } = req.body;
  modeService.updateSleep({ active, prompt });
  res.json(modeService.getSettings().sleep);
}

function updateAutoAssist(req, res) {
  const { globalEnabled } = req.body;
  modeService.updateAutoAssist({ globalEnabled });
  res.json(modeService.getSettings().autoAssist);
}

module.exports = { get, updateDnd, updateSleep, updateAutoAssist };
