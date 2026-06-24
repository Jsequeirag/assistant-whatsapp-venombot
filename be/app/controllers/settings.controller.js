const modeService = require("../services/mode.service");
const llmService = require("../services/llm.service");

async function get(req, res) {
  res.json(await modeService.getSettings());
}

async function updateDnd(req, res) {
  const { active, reason } = req.body;
  await modeService.updateDnd({ active, reason });
  const settings = await modeService.getSettings();
  res.json(settings.dnd);
}

async function updateSleep(req, res) {
  const { active, reason } = req.body;
  await modeService.updateSleep({ active, reason });
  const settings = await modeService.getSettings();
  res.json(settings.sleep);
}

async function updateAutoAssist(req, res) {
  const { globalEnabled } = req.body;
  await modeService.updateAutoAssist({ globalEnabled });
  const settings = await modeService.getSettings();
  res.json(settings.autoAssist);
}

async function updateIdentity(req, res) {
  const { ownerName, assistantName } = req.body;
  await modeService.updateIdentity({ ownerName, assistantName });
  const settings = await modeService.getSettings();
  res.json(settings.identity);
}

async function updateGroq(req, res) {
  const { apiKey, model, baseUrl, voiceModel } = req.body;
  // apiKey solo se actualiza si viene un valor nuevo (el FE no envía la máscara).
  await modeService.updateGroq({
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
    ...(voiceModel ? { voiceModel } : {}),
  });
  // Aplicar en caliente al cliente LLM.
  const cfg = await modeService.getGroqConfig();
  llmService.configure(cfg);
  const settings = await modeService.getSettings();
  res.json(settings.groq);
}

async function listGroqModels(req, res) {
  if (!llmService.hasKey()) return res.json({ models: [] });
  try {
    res.json({ models: await llmService.listModels() });
  } catch (e) {
    res.json({ models: [], error: e.message });
  }
}

async function updateRetention(req, res) {
  const { days } = req.body;
  await modeService.updateRetention({ days });
  const settings = await modeService.getSettings();
  res.json(settings.retention);
}

module.exports = { get, updateDnd, updateSleep, updateAutoAssist, updateIdentity, updateGroq, listGroqModels, updateRetention };
