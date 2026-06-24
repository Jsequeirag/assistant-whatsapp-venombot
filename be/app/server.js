const express = require("express");
const cors = require("cors");
const { PORT, GROQ_API_KEY, GROQ_MODEL } = require("./config");
const { connectDB } = require("./db");
const routes = require("./routes");
const modeService = require("./services/mode.service");
const llmService = require("./services/llm.service");
const auditService = require("./services/audit.service");

const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));

app.get("/", (req, res) => res.json({ status: "Aria API running" }));
app.use("/api", routes);

/**
 * Carga la config de Groq desde Mongo y la aplica al llm.service.
 * Si Mongo aún no tiene key pero sí hay una en .env, la siembra (para que
 * aparezca en el FE y se gestione desde ahí en adelante).
 */
async function initLlm() {
  let { apiKey, model } = await modeService.getGroqConfig();
  if (!apiKey && GROQ_API_KEY) {
    await modeService.updateGroq({ apiKey: GROQ_API_KEY, model: model || GROQ_MODEL });
    apiKey = GROQ_API_KEY;
    model = model || GROQ_MODEL;
    console.log("🔑 Groq API key sembrada desde .env hacia MongoDB.");
  }
  llmService.configure({ apiKey, model });
  console.log(`🤖 Groq configurado (${llmService.hasKey() ? "key OK" : "SIN key"}, modelo: ${llmService.getModel()}).`);
}

async function startServer() {
  await connectDB();
  await initLlm();
  await auditService.loadFromDb(); // estado de servicios de la sesión previa
  return new Promise((resolve) => {
    app.listen(PORT, () => {
      console.log(`🌐 API escuchando en http://localhost:${PORT}/api`);
      resolve();
    });
  });
}

module.exports = { startServer };
