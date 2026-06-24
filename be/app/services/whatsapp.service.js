const QRCode = require("qrcode");
const venom = require("../../dist");
const { processMessage, setHostId, registerSelfId } = require("../controllers/webhook.controller");
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

    // Captura los IDs propios (host) para no responderse a sí mismo. En multi-dispositivo
    // el host tiene número (@c.us) y a veces un LID (@lid); registramos AMBOS porque los
    // auto-mensajes pueden llegar en cualquiera de los dos formatos.
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

async function sendFileBase64(contactId, { base64, filename, mimetype, caption }) {
  if (!_client || _state !== "connected") {
    throw new Error("WhatsApp no está conectado");
  }

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
    console.log(`📤  Enviando ${isImage ? "imagen" : "archivo"}: ${filename} (${fs.statSync(tmpPath).size} bytes) → ${contactId}`);

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

    if (isImage) {
      return await _client.sendImage(contactId, tmpPath, caption || "", filename);
    }
    return await _client.sendFile(contactId, tmpPath, filename, caption || "");
  } catch (err) {
    console.error(`📤  Error enviando archivo a ${contactId}:`, err?.message || err);
    throw err;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

module.exports = { start, restart, getStatus, getClient, sendText, sendFileBase64 };
