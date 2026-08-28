const express = require("express");
const cors = require("cors");
const {
  PORT,
  LISTEN_HOST,
  ARIA_API_TOKEN,
  CORS_ORIGIN,
  NODE_ENV,
  LLM_API_KEY,
  LLM_MODEL,
  LLM_BASE_URL,
  LLM_VOICE_MODEL,
} = require("./config");
const { connectDB } = require("./db");
const routes = require("./routes");
const modeService = require("./services/mode.service");
const llmService = require("./services/llm.service");
const auditService = require("./services/audit.service");
const { createApiAuth, corsOriginOption } = require("./lib/apiAuth");

const app = express();
const isProd = NODE_ENV === "production";

app.use(cors({
  origin: corsOriginOption(CORS_ORIGIN, { isProd }),
  credentials: true,
}));
app.use(express.json({ limit: "12mb" }));

app.get("/", (req, res) => res.json({ status: "Aria API running" }));
app.use("/api", createApiAuth(ARIA_API_TOKEN), routes);

app.use((err, req, res, next) => {
  console.error("API error:", err?.message || err);
  if (res.headersSent) return next(err);
  const status = Number(err.status || err.statusCode) || 500;
  res.status(status).json({ error: err.message || "Error interno" });
});

/**
 * Carga la config OpenAI-compat desde Mongo y la aplica al llm.service.
 * Si Mongo aún no tiene key pero sí hay una en .env, la siembra (para que
 * aparezca en el FE y se gestione desde ahí en adelante).
 */
async function initLlm() {
  let { apiKey, model, baseUrl, voiceModel } = await modeService.getGroqConfig();
  if (!apiKey && LLM_API_KEY) {
    await modeService.updateGroq({
      apiKey: LLM_API_KEY,
      model: model || LLM_MODEL,
      ...(LLM_BASE_URL && !baseUrl ? { baseUrl: LLM_BASE_URL } : {}),
      ...(LLM_VOICE_MODEL && !voiceModel ? { voiceModel: LLM_VOICE_MODEL } : {}),
    });
    apiKey = LLM_API_KEY;
    model = model || LLM_MODEL;
    if (LLM_BASE_URL && !baseUrl) baseUrl = LLM_BASE_URL;
    if (LLM_VOICE_MODEL && !voiceModel) voiceModel = LLM_VOICE_MODEL;
    console.log("🔑 API key de IA sembrada desde .env hacia MongoDB.");
  }
  llmService.configure({ apiKey, model, baseUrl, voiceModel });
  console.log(
    `🤖 LLM OpenAI-compat (${llmService.hasKey() ? "key OK" : "SIN key"}, modelo: ${llmService.getModel()}, baseUrl=${llmService.getBaseUrl()}, voice: ${voiceModel || "default"}).`
  );
}

async function startServer() {
  await connectDB();
  await initLlm();
  await auditService.loadFromDb(); // estado de servicios de la sesión previa
  return new Promise((resolve) => {
    app.listen(PORT, LISTEN_HOST, () => {
      if (!ARIA_API_TOKEN) {
        console.warn("⚠️  ARIA_API_TOKEN vacío: /api no exige token. Definilo en .env (y en nginx/Vite).");
      } else {
        console.log("🔒 /api exige X-Aria-Token (o Bearer).");
      }
      console.log(`🌐 API escuchando en http://${LISTEN_HOST}:${PORT}/api`);
      resolve();
    });
  });
}

module.exports = { startServer };
