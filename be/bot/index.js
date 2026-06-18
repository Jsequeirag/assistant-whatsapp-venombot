/**
 * Entry point de Aria.
 * Arranca Express (API REST) y VenomBot (WhatsApp) en el mismo proceso.
 *
 * Uso: node bot/index.js
 */
require("dotenv").config();

const { startServer } = require("../app/server");
const auditService = require("../app/services/audit.service");
const whatsappService = require("../app/services/whatsapp.service");

async function main() {
  // 1. API REST (conecta MongoDB, carga config de Groq y estado de servicios)
  await startServer();

  // 2. Validación de servicios ANTES de arrancar WhatsApp (MongoDB + "hola" a Groq)
  console.log("🩺 Verificando servicios...");
  const checks = await auditService.runChecks("startup");
  for (const c of checks) {
    const icon = c.status === "ok" ? "✅" : "❌";
    console.log(`   ${icon} ${c.service}: ${c.status} (${c.latencyMs}ms) ${c.message}`);
  }
  if (checks.some((c) => c.service === "groq" && c.status === "error")) {
    console.warn("⚠️  Groq no respondió al 'hola' de prueba. El bot arrancará igual, pero la IA podría no responder.");
  }

  // Scheduler: revalida los servicios cada 24 horas.
  const DAY_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    auditService
      .runChecks("scheduled")
      .then((rs) => rs.forEach((c) => console.log(`🩺 [24h] ${c.service}: ${c.status} (${c.latencyMs}ms)`)))
      .catch((e) => console.error("Error en chequeo programado:", e.message));
  }, DAY_MS);

  // 3. WhatsApp (VenomBot). El QR se captura y queda disponible en el panel (pestaña Estado).
  await whatsappService.start();
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
