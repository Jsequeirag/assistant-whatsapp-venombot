/**
 * Entry point de Aria.
 * Arranca Express (API REST) y VenomBot (WhatsApp) en el mismo proceso.
 *
 * Uso: node bot/index.js
 */
require("dotenv").config();

const { startServer } = require("../app/server");
const { processMessage } = require("../app/controllers/webhook.controller");

// Importa la librería venom ya compilada (corré "npm run build" primero)
const venom = require("../dist");

const SESSION = process.env.VENOM_SESSION || "aria";
const BROWSER = process.env.VENOM_BROWSER || "chrome"; // chrome | edge | chromium

async function main() {
  // 1. API REST
  await startServer();

  // 2. VenomBot
  const client = await venom.create({
    session: SESSION,
    browser: BROWSER,
    headless: true,
    logQR: true,
  });

  console.log("✅ Aria conectada a WhatsApp. Esperando mensajes...");

  // Mensajes entrantes → lógica de modos + IA
  client.onMessage((msg) => {
    processMessage(client, msg).catch((err) =>
      console.error("Error procesando mensaje:", err.message)
    );
  });

  // Desconexión inesperada
  client.onStateChange((state) => {
    if (state === "CONFLICT" || state === "UNLAUNCHED") {
      console.warn("⚠️  Estado WhatsApp:", state, "— intentando retomar...");
      client.useHere().catch(() => {});
    }
  });
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
