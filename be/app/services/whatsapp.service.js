const QRCode = require("qrcode");
const venom = require("../../dist");
const {
  processMessage,
  setHostId,
  registerSelfId,
  enqueueByContact,
} = require("../controllers/webhook.controller");
const incoming = require("../lib/incoming");
const auditService = require("./audit.service");
const Contact = require("../models/Contact");

const SESSION = process.env.VENOM_SESSION || "aria";
const BROWSER = process.env.VENOM_BROWSER || "chrome"; // chrome | edge | chromium

const DEAD_STATES = new Set(["TIMEOUT", "UNPAIRED", "UNPAIRED_IDLE", "UNLAUNCHED"]);
const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60 * 1000;

let _client = null;
let _state = "disconnected"; // starting | qr | connected | disconnected
let _qr = null; // data URL de la imagen del QR
let _starting = false;
let _intentionalClose = false;
let _reconnectTimer = null;
let _reconnectAttempt = 0;

async function _onQR(qrString) {
  try {
    _qr = await QRCode.toDataURL(qrString, { margin: 1, width: 300 });
  } catch {
    _qr = null;
  }
  _state = "qr";
  console.log("📱 Nuevo QR disponible — escanealo desde el panel (pestaña Estado).");
}

function _clearReconnect() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
}

function _scheduleReconnect(reason) {
  if (_intentionalClose || _starting) return;
  if (_reconnectTimer) return;
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** _reconnectAttempt, RECONNECT_MAX_MS);
  _reconnectAttempt += 1;
  console.warn(`↻ Reintento WhatsApp en ${Math.round(delay / 1000)}s (${reason})`);
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    if (_intentionalClose || _starting || _state === "connected") return;
    _state = "disconnected";
    start().catch((e) => console.error("Error reconectando WhatsApp:", e.message));
  }, delay);
}

function _markDisconnected(reason, { reconnect = true } = {}) {
  _state = "disconnected";
  _qr = null;
  auditService.recordWhatsApp("error", reason, "runtime");
  if (reconnect) _scheduleReconnect(reason);
}

async function _disposeClient() {
  const c = _client;
  _client = null;
  if (!c) return;
  try { await c.close(); } catch {}
}

function _attachHandlers(client) {
  client.onMessage((msg) => {
    enqueueByContact(msg.from || "", () => processMessage(client, msg));
  });
  // fromMe (chat "Tú" / envíos propios). processMessage los descarta salvo ambiente de pruebas.
  client.onAnyMessage((msg) => {
    if (!msg?.fromMe) return;
    enqueueByContact(msg.from || "", () => processMessage(client, msg));
  });

  client.onStateChange((state) => {
    console.log("📡 WhatsApp state:", state);
    if (state === "CONNECTED") {
      _state = "connected";
      _qr = null;
      _reconnectAttempt = 0;
      _clearReconnect();
      auditService.recordWhatsApp("ok", `Sesión "${SESSION}" conectada`, "runtime");
      return;
    }
    if (state === "CONFLICT") {
      console.warn("⚠️  Estado WhatsApp: CONFLICT — intentando retomar...");
      auditService.recordWhatsApp("error", "Estado: CONFLICT", "runtime");
      client.useHere().catch(() => {});
      return;
    }
    if (DEAD_STATES.has(state)) {
      if (_intentionalClose) return;
      console.warn("⚠️  WhatsApp cayó:", state);
      if (_client === client) _client = null;
      _markDisconnected(`Estado: ${state}`);
      client.close().catch(() => {});
    }
  });

  client.on("disconnected", (reason) => {
    if (_intentionalClose) return;
    console.warn("⚠️  WhatsApp disconnected:", reason);
    if (_client === client) _client = null;
    _markDisconnected(`Desconectado: ${reason}`);
  });
}

/** Arranca la sesión de WhatsApp. Resuelve cuando queda conectada. */
async function start() {
  if (_starting) return;
  if (_state === "connected" && _client) return;
  _starting = true;
  _state = "starting";
  _qr = null;
  _clearReconnect();
  try {
    if (_client) {
      _intentionalClose = true;
      await _disposeClient();
      _intentionalClose = false;
    }
    _client = await venom.create(
      { session: SESSION, browser: BROWSER, headless: true, logQR: true },
      (qr) => _onQR(qr),
      (status) => {
        if (status === "qrReadSuccess" || status === "successChat") {
          _state = _state === "qr" ? "starting" : _state;
        }
      }
    );
    _state = "connected";
    _qr = null;
    _reconnectAttempt = 0;
    console.log("✅ Aria conectada a WhatsApp. Esperando mensajes...");
    auditService.recordWhatsApp("ok", `Sesión "${SESSION}" conectada`);

    try {
      const host = await _client.getHostDevice();
      const wid = host?.wid || host?.me?._serialized || host?.id?._serialized || null;
      if (wid) setHostId(typeof wid === "string" ? wid : wid._serialized || null);
      const lid =
        host?.lid?._serialized || host?.lid || host?.id?.lid?._serialized || host?.id?.lid || host?.me?.lid?._serialized || null;
      if (lid && typeof lid === "string") registerSelfId(lid);
    } catch (e) {
      console.warn("No se pudo obtener el número del host:", e.message);
    }

    _attachHandlers(_client);
  } catch (e) {
    _state = "disconnected";
    auditService.recordWhatsApp("error", e.message, "startup");
    console.error("❌ No se pudo iniciar WhatsApp:", e.message);
    _scheduleReconnect(e.message);
  } finally {
    _starting = false;
  }
}

/**
 * Cierra la sesión actual (logout → nueva sesión / nuevo QR) y vuelve a arrancar.
 * No espera a la reconexión: el QR aparecerá vía polling de estado.
 */
async function restart() {
  _intentionalClose = true;
  _clearReconnect();
  _reconnectAttempt = 0;
  if (_client) {
    try { await _client.logout(); } catch {}
    try { await _client.close(); } catch {}
  }
  _client = null;
  _qr = null;
  _state = "disconnected";
  _intentionalClose = false;
  auditService.recordWhatsApp("error", "Sesión reiniciada manualmente", "runtime");
  start().catch((e) => console.error("Error al reiniciar WhatsApp:", e.message));
  return { state: _state };
}

function getStatus() {
  return { state: _state, qr: _state === "qr" ? _qr : null };
}

function getClient() {
  return _client;
}

function _extractJid(st) {
  if (!st) return null;
  if (typeof st === "string" && st.includes("@")) return st;
  const wid = st.jid || st.wid || st.id || st.lid;
  if (!wid) return null;
  if (typeof wid === "string") return wid;
  return wid._serialized || (typeof wid.toString === "function" ? wid.toString() : null);
}

/**
 * Resuelve el chatId enviable (@lid si WhatsApp lo usa, o un sibling guardado).
 * El historial del panel sigue usando el contactId original.
 */
async function resolveChatId(contactId) {
  if (!_client || _state !== "connected") {
    throw new Error("WhatsApp no está conectado");
  }
  if (typeof contactId === "string" && contactId.endsWith("@lid")) return contactId;

  const number = String(contactId || "").replace(/@.+$/, "").replace(/\D/g, "");
  if (number) {
    const lid = await Contact.findOne({ number, contactId: /@lid$/ }).lean();
    if (lid?.contactId) return lid.contactId;
  }

  try {
    const st = await _client.checkNumberStatus(contactId);
    const jid = _extractJid(st);
    if (jid && jid !== contactId) {
      console.log(`📤  Destino resuelto ${contactId} → ${jid}`);
      return jid;
    }
  } catch (e) {
    console.warn(`checkNumberStatus falló para ${contactId}:`, e?.message || e);
  }
  return contactId;
}

/**
 * Envía un texto a un contacto desde el panel (Fase 5 — responder desde la app).
 * Lanza si no hay sesión conectada o si el envío falla, para que el controlador
 * pueda devolver un error claro al frontend.
 */
async function sendText(contactId, text) {
  const dest = await resolveChatId(contactId);
  incoming.rememberOutgoing(dest, text);
  if (dest !== contactId) incoming.rememberOutgoing(contactId, text);
  return _client.sendText(dest, text);
}

async function sendFileBase64(contactId, { base64, filename, mimetype, caption }) {
  const dest = await resolveChatId(contactId);

  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  // Escribir a archivo temporal → venom lo lee con fs.readFileSync y lo sube
  // sin pasar el base64 completo por page.evaluate (más estable con archivos grandes)
  const safeName = filename.replace(/[^a-z0-9._-]/gi, "_");
  const tmpPath = path.join(os.tmpdir(), `aria_${Date.now()}_${safeName}`);

  try {
    fs.writeFileSync(tmpPath, Buffer.from(base64, "base64"));
    const isImage = (mimetype || "").startsWith("image/");
    console.log(`📤  Enviando ${isImage ? "imagen" : "archivo"}: ${filename} (${fs.statSync(tmpPath).size} bytes) → ${dest}`);

    // Parchear _prepareMedia en el browser buscando los módulos reales de webpack
    await _client.page.evaluate(() => {
      const W = window;
      let OD = null, MP = null;

      const testObj = (v) => {
        if (!OD && v && typeof v.createFromData === "function") OD = v;
        if (!MP && v && typeof v.prepRawMedia === "function") MP = v;
      };

      // Buscar en __webpack_module_cache__ (webpack 5)
      const cache = W.__webpack_module_cache__;
      if (cache) {
        for (const mod of Object.values(cache)) {
          const exp = mod?.exports;
          if (!exp || typeof exp !== "object") continue;
          testObj(exp);
          testObj(exp.default);
          testObj(exp.OpaqueData);
          testObj(exp.MediaPrep);
          for (const v of Object.values(exp)) {
            if (!OD || !MP) testObj(v);
          }
          if (OD && MP) break;
        }
      }

      // Fallback: buscar en __webpack_require__ (webpack 4) o en w.modules
      if (!OD || !MP) {
        const req = W.__webpack_require__;
        const c = req?.c || req?.m;
        if (c) {
          for (const mod of Object.values(c)) {
            const exp = mod?.exports ?? mod;
            if (!exp || typeof exp !== "object") continue;
            testObj(exp);
            testObj(exp.default);
            if (!OD || !MP) for (const v of Object.values(exp)) testObj(v);
            if (OD && MP) break;
          }
        }
      }

      if (OD && MP) {
        console.log("✅ Media modules found, patching _prepareMedia");
        W.WWebJS._prepareMedia = async function (opts) {
          if (!opts?.data) throw new Error("Media data required");
          const file = W.WWebJS._base64ToFile(opts.data, opts.mimetype, opts.filename);
          const opaque = await OD.createFromData(file, file.type);
          const prep = MP.prepRawMedia(opaque, {
            asDocument: opts.type === "document",
            isPtt: !!opts.isPtt,
          });
          const mediaData = await prep.waitForPrep();
          return mediaData?.toJSON ? mediaData.toJSON() : mediaData;
        };
      } else {
        console.warn("❌ Media modules not found. OD:", !!OD, "MP:", !!MP,
          "| cache keys sample:", Object.keys(W.__webpack_module_cache__ || {}).slice(0, 5));
      }
    });

    incoming.rememberOutgoing(dest, caption || filename);
    if (dest !== contactId) incoming.rememberOutgoing(contactId, caption || filename);
    if (isImage) {
      return await _client.sendImage(dest, tmpPath, caption || "", filename);
    }
    return await _client.sendFile(dest, tmpPath, filename, caption || "");
  } catch (err) {
    console.error(`📤  Error enviando archivo a ${dest}:`, err?.message || err);
    throw err;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

module.exports = { start, restart, getStatus, getClient, sendText, sendFileBase64 };
