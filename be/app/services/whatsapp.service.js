const QRCode = require("qrcode");
const venom = require("../../dist");
const { processMessage, setHostId } = require("../controllers/webhook.controller");
const auditService = require("./audit.service");

const SESSION = process.env.VENOM_SESSION || "aria";
const BROWSER = process.env.VENOM_BROWSER || "chrome"; // chrome | edge | chromium

let _client = null;
let _state = "disconnected"; // starting | qr | connected | disconnected
let _qr = null; // data URL de la imagen del QR
let _starting = false;

async function _onQR(qrString) {
  try {
    _qr = await QRCode.toDataURL(qrString, { margin: 1, width: 300 });
  } catch {
    _qr = null;
  }
  _state = "qr";
  console.log("📱 Nuevo QR disponible — escanealo desde el panel (pestaña Estado).");
}

function _attachHandlers() {
  _client.onMessage((msg) => {
    processMessage(_client, msg).catch((err) =>
      console.error("Error procesando mensaje:", err.message)
    );
  });
  _client.onStateChange((state) => {
    if (state === "CONFLICT" || state === "UNLAUNCHED") {
      console.warn("⚠️  Estado WhatsApp:", state, "— intentando retomar...");
      auditService.recordWhatsApp("error", `Estado: ${state}`, "runtime");
      _client.useHere().catch(() => {});
    }
  });
}

/** Arranca la sesión de WhatsApp. Resuelve cuando queda conectada. */
async function start() {
  if (_starting || _state === "connected") return;
  _starting = true;
  _state = "starting";
  _qr = null;
  try {
    _client = await venom.create(
      { session: SESSION, browser: BROWSER, headless: true, logQR: true },
      (qr) => _onQR(qr), // catchQR
      () => {} // statusFind
    );
    _state = "connected";
    _qr = null;
    console.log("✅ Aria conectada a WhatsApp. Esperando mensajes...");
    auditService.recordWhatsApp("ok", `Sesión "${SESSION}" conectada`);

    // Captura el número propio (host) para no responderse a sí mismo.
    try {
      const host = await _client.getHostDevice();
      const wid = host?.wid || host?.me?._serialized || host?.id?._serialized || null;
      if (wid) setHostId(typeof wid === "string" ? wid : wid._serialized || null);
    } catch (e) {
      console.warn("No se pudo obtener el número del host:", e.message);
    }

    _attachHandlers();
  } catch (e) {
    _state = "disconnected";
    auditService.recordWhatsApp("error", e.message, "startup");
    console.error("❌ No se pudo iniciar WhatsApp:", e.message);
  } finally {
    _starting = false;
  }
}

/**
 * Cierra la sesión actual (logout → nueva sesión / nuevo QR) y vuelve a arrancar.
 * No espera a la reconexión: el QR aparecerá vía polling de estado.
 */
async function restart() {
  if (_client) {
    try { await _client.logout(); } catch {}
    try { await _client.close(); } catch {}
  }
  _client = null;
  _qr = null;
  _state = "disconnected";
  auditService.recordWhatsApp("error", "Sesión reiniciada manualmente", "runtime");
  // arranca en background; el FE verá el QR al pollear el estado
  start().catch((e) => console.error("Error al reiniciar WhatsApp:", e.message));
  return { state: _state };
}

function getStatus() {
  return { state: _state, qr: _state === "qr" ? _qr : null };
}

function getClient() {
  return _client;
}

/**
 * Envía un texto a un contacto desde el panel (Fase 5 — responder desde la app).
 * Lanza si no hay sesión conectada o si el envío falla, para que el controlador
 * pueda devolver un error claro al frontend.
 */
async function sendText(contactId, text) {
  if (!_client || _state !== "connected") {
    throw new Error("WhatsApp no está conectado");
  }
  return _client.sendText(contactId, text);
}

module.exports = { start, restart, getStatus, getClient, sendText };
