import { useState, useEffect } from "react";
import { api } from "../api/client";

const SERVICE_LABELS = {
  groq: "🤖 Groq (IA)",
  mongodb: "🗄️ MongoDB",
  whatsapp: "💬 WhatsApp",
};

function StatusDot({ status }) {
  const color = status === "ok" ? "bg-green-500" : "bg-red-500";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

const WA_BADGE = {
  connected: { label: "Conectada", cls: "bg-green-100 text-green-700" },
  qr: { label: "Esperando QR", cls: "bg-amber-100 text-amber-700" },
  starting: { label: "Iniciando", cls: "bg-gray-100 text-gray-600" },
  disconnected: { label: "Desconectada", cls: "bg-red-100 text-red-700" },
};

function WaBadge({ state }) {
  const b = WA_BADGE[state] || WA_BADGE.disconnected;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>;
}

const inputCls =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300";

export default function Estado() {
  const [current, setCurrent] = useState([]);
  const [groq, setGroq] = useState({ model: "", hasKey: false, keyMasked: "" });
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [wa, setWa] = useState({ state: "disconnected", qr: null });
  const [restarting, setRestarting] = useState(false);

  const loadWa = async () => {
    try {
      setWa(await api.getWhatsappStatus());
    } catch {
      setWa({ state: "disconnected", qr: null });
    }
  };

  // Poll del estado de WhatsApp mientras no esté conectado (para refrescar el QR).
  useEffect(() => {
    loadWa();
    const id = setInterval(loadWa, 4000);
    return () => clearInterval(id);
  }, []);

  const restartWa = async () => {
    if (!confirm("¿Cerrar la sesión actual y generar una nueva? Tendrás que escanear el QR de nuevo.")) return;
    setRestarting(true);
    try {
      await api.restartWhatsapp();
      await loadWa();
    } finally {
      setRestarting(false);
    }
  };

  const loadModels = async () => {
    try {
      const { models: m } = await api.getGroqModels();
      setModels(m || []);
    } catch {
      setModels([]);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    const [audit, settings] = await Promise.all([api.getAudit(), api.getSettings()]);
    setCurrent(audit.current || []);
    setGroq(settings.groq);
    setModel(settings.groq.model || "");
    await loadModels();
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const saveGroq = async () => {
    setSavedMsg("");
    const payload = { model };
    if (apiKey.trim()) payload.apiKey = apiKey.trim();
    const updated = await api.updateGroq(payload);
    setGroq(updated);
    setApiKey("");
    setSavedMsg("✓ Guardado");
    setTimeout(() => setSavedMsg(""), 2000);
    await loadModels(); // si recién se cargó una key válida, ahora hay modelos
  };

  const check = async () => {
    setChecking(true);
    try {
      // Guarda primero si hay una key nueva escrita, luego verifica.
      if (apiKey.trim() || model !== groq.model) await saveGroq();
      const { current: c } = await api.runAuditCheck();
      setCurrent(c || []);
    } finally {
      setChecking(false);
    }
  };

  if (loading) return <p className="text-center text-gray-400 py-12">Cargando...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Estado de servicios</h1>

      {/* Sesión de WhatsApp / QR */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900">💬 Sesión de WhatsApp</h2>
          <WaBadge state={wa.state} />
        </div>

        {wa.state === "qr" && wa.qr && (
          <div className="flex flex-col items-center gap-2 py-2">
            <img src={wa.qr} alt="QR de WhatsApp" className="w-56 h-56" />
            <p className="text-xs text-gray-500 text-center">
              Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo, y escaneá este código.
            </p>
          </div>
        )}

        {wa.state === "connected" && (
          <p className="text-sm text-gray-600">Conectada y escuchando mensajes. ✅</p>
        )}

        {(wa.state === "starting" || (wa.state === "qr" && !wa.qr)) && (
          <p className="text-sm text-gray-400">Generando QR...</p>
        )}

        {wa.state === "disconnected" && (
          <p className="text-sm text-gray-400">Desconectada.</p>
        )}

        <button
          onClick={restartWa}
          disabled={restarting}
          className="mt-4 text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {restarting ? "Reiniciando..." : "Generar nueva sesión"}
        </button>
      </div>

      {/* Estado actual por servicio */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h2 className="font-medium text-gray-900 mb-3">Servicios</h2>
        {current.length === 0 ? (
          <p className="text-sm text-gray-400">Sin chequeos todavía. Pulsá "Verificar ahora".</p>
        ) : (
          <ul className="space-y-2">
            {current.map((s) => (
              <li key={s.service} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <StatusDot status={s.status} />
                  {SERVICE_LABELS[s.service] || s.service}
                </span>
                <span className="text-gray-400 text-xs">
                  {s.latencyMs}ms · {new Date(s.checkedAt).toLocaleString("es")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={check}
          disabled={checking}
          className="mt-4 text-sm bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {checking ? "Verificando..." : "Verificar ahora"}
        </button>
      </div>

      {/* Configuración de Groq */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
        <h2 className="font-medium text-gray-900">🔑 API Key de Groq</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            API Key {groq.hasKey && <span className="text-gray-400">(actual: {groq.keyMasked})</span>}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={groq.hasKey ? "Dejar vacío para mantener la actual" : "gsk_..."}
            className={inputCls}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Modelo</label>
          {models.length > 0 ? (
            <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
              {/* Incluye el modelo actual aunque no esté en la lista devuelta */}
              {model && !models.includes(model) && <option value={model}>{model} (actual)</option>}
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="qwen/qwen3-32b"
              className={inputCls}
            />
          )}
          {models.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Guardá una API key válida para cargar la lista de modelos.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveGroq}
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            Guardar
          </button>
          <button
            onClick={check}
            disabled={checking}
            className="text-sm border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {checking ? "Verificando..." : "Verificar key"}
          </button>
          {savedMsg && <span className="text-xs text-green-600">{savedMsg}</span>}
        </div>
        <p className="text-xs text-gray-400">
          La key se guarda en MongoDB y se usa al instante. Conseguila en console.groq.com/keys
        </p>
      </div>
    </div>
  );
}
