import { useState, useEffect } from "react";
import { api } from "../api/client";

const SERVICE_LABELS = {
  groq: "Groq (IA)",
  mongodb: "MongoDB",
  whatsapp: "WhatsApp",
};

function StatusDot({ status }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 ${status === "ok" ? "animate-online" : ""}`}
      style={{ background: status === "ok" ? "#e8e8e8" : "#333" }}
    />
  );
}

const WA_BADGE = {
  connected: { label: "Conectada", color: "#e8e8e8", border: "#e8e8e8" },
  qr: { label: "Esperando QR", color: "#aaa", border: "#aaa" },
  starting: { label: "Iniciando", color: "#555", border: "#555" },
  disconnected: { label: "Desconectada", color: "#333", border: "#333" },
};

function WaBadge({ state }) {
  const b = WA_BADGE[state] || WA_BADGE.disconnected;
  return (
    <span
      className="font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border"
      style={{ color: b.color, borderColor: b.border }}
    >
      {b.label}
    </span>
  );
}

function Card({ title, children, actions }) {
  return (
    <div className="border border-[#2a2a2a] bg-[#0f0f0f] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#aaa]">{title}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

export default function Estado() {
  const [current, setCurrent] = useState([]);
  const [groq, setGroq] = useState({ model: "", hasKey: false, keyMasked: "", baseUrl: "", voiceModel: "" });
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [voiceModel, setVoiceModel] = useState("");
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
    setBaseUrl(settings.groq.baseUrl || "");
    setVoiceModel(settings.groq.voiceModel || "whisper-large-v3-turbo");
    await loadModels();
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const saveGroq = async () => {
    setSavedMsg("");
    const payload = { model, baseUrl, voiceModel };
    if (apiKey.trim()) payload.apiKey = apiKey.trim();
    const updated = await api.updateGroq(payload);
    setGroq(updated);
    setApiKey("");
    setSavedMsg("✓ Guardado");
    setTimeout(() => setSavedMsg(""), 2000);
    await loadModels();
  };

  const check = async () => {
    setChecking(true);
    try {
      if (apiKey.trim() || model !== groq.model || baseUrl !== groq.baseUrl || voiceModel !== groq.voiceModel) {
        await saveGroq();
      }
      const { current: c } = await api.runAuditCheck();
      setCurrent(c || []);
    } finally {
      setChecking(false);
    }
  };

  if (loading) return (
    <p className="font-mono text-center text-[#555] py-12 text-[11px] uppercase tracking-wider">
      Cargando...
    </p>
  );

  return (
    <div className="space-y-3">
      <h1 className="font-mono text-[11px] uppercase tracking-widest text-[#e8e8e8] mb-5">
        Estado de servicios
      </h1>

      {/* Sesión WhatsApp */}
      <Card
        title="Sesión de WhatsApp"
        actions={<WaBadge state={wa.state} />}
      >
        {wa.state === "qr" && wa.qr && (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="border border-[#2a2a2a] p-2 bg-white">
              <img src={wa.qr} alt="QR de WhatsApp" className="w-52 h-52" />
            </div>
            <p className="font-mono text-[9px] text-[#555] text-center leading-relaxed uppercase tracking-wider">
              WhatsApp → Dispositivos vinculados → Vincular dispositivo → escanear
            </p>
          </div>
        )}

        {wa.state === "connected" && (
          <p className="text-[13px] text-[#aaa]">Conectada y escuchando mensajes.</p>
        )}

        {(wa.state === "starting" || (wa.state === "qr" && !wa.qr)) && (
          <p className="font-mono text-[11px] text-[#555] uppercase tracking-wider">Generando QR...</p>
        )}

        {wa.state === "disconnected" && (
          <p className="font-mono text-[11px] text-[#555] uppercase tracking-wider">Desconectada.</p>
        )}

        <button
          onClick={restartWa}
          disabled={restarting}
          className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 border border-[#2a2a2a] text-[#aaa] hover:border-[#333] hover:text-[#e8e8e8] transition-colors disabled:opacity-30"
        >
          {restarting ? "Reiniciando..." : "Generar nueva sesión"}
        </button>
      </Card>

      {/* Servicios */}
      <Card title="Servicios">
        {current.length === 0 ? (
          <p className="font-mono text-[10px] text-[#555] uppercase tracking-wider">
            Sin chequeos todavía.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {current.map((s) => (
              <li key={s.service} className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <StatusDot status={s.status} />
                  <span className="font-mono text-[11px] text-[#aaa] uppercase tracking-wider">
                    {SERVICE_LABELS[s.service] || s.service}
                  </span>
                </span>
                <span className="font-mono text-[9px] text-[#555]">
                  {s.latencyMs}ms · {new Date(s.checkedAt).toLocaleString("es")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={check}
          disabled={checking}
          className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 bg-[#e8e8e8] text-[#0c0c0c] hover:bg-[#d0d0d0] transition-colors disabled:opacity-30"
        >
          {checking ? "Verificando..." : "Verificar ahora"}
        </button>
      </Card>

      {/* Proveedor de IA */}
      <Card title="Proveedor de IA">
        {/* API Key */}
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-[#555] mb-1.5">
            API Key
            {groq.hasKey && (
              <span className="text-[#333] ml-2">( actual: {groq.keyMasked} )</span>
            )}
          </label>
          <div className="t-input">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={groq.hasKey ? "Dejar vacío para mantener la actual" : "sk-... / gsk_..."}
              autoComplete="off"
            />
          </div>
        </div>

        {/* URL base */}
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-[#555] mb-1.5">
            URL base del proveedor
          </label>
          <div className="t-input">
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="vacío = Groq  ·  https://openrouter.ai/api/v1"
            />
          </div>
          <p className="font-mono text-[9px] text-[#333] mt-1.5">
            Vacío → Groq (default) · OpenRouter → https://openrouter.ai/api/v1 · OpenAI → https://api.openai.com/v1
          </p>
        </div>

        {/* Modelo de chat */}
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-[#555] mb-1.5">
            Modelo de chat
          </label>
          {models.length > 0 ? (
            <div className="t-input">
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {model && !models.includes(model) && (
                  <option value={model}>{model} (actual)</option>
                )}
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="t-input">
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="qwen/qwen3-32b  ·  openai/gpt-4o-mini  ·  gpt-4o"
              />
            </div>
          )}
          {models.length === 0 && (
            <p className="font-mono text-[9px] text-[#555] mt-1.5">
              Guardá una key válida para cargar la lista de modelos disponibles.
            </p>
          )}
        </div>

        {/* Modelo de voz */}
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-[#555] mb-1.5">
            Modelo de transcripción de voz
          </label>
          <div className="t-input">
            <input
              type="text"
              value={voiceModel}
              onChange={(e) => setVoiceModel(e.target.value)}
              placeholder="whisper-large-v3-turbo"
            />
          </div>
          <p className="font-mono text-[9px] text-[#333] mt-1.5">
            Solo aplica cuando el proveedor soporta /audio/transcriptions (Groq, OpenAI).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={saveGroq}
            className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 bg-[#e8e8e8] text-[#0c0c0c] hover:bg-[#d0d0d0] transition-colors"
          >
            Guardar
          </button>
          <button
            onClick={check}
            disabled={checking}
            className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 border border-[#2a2a2a] text-[#aaa] hover:border-[#333] hover:text-[#e8e8e8] transition-colors disabled:opacity-30"
          >
            {checking ? "Verificando..." : "Verificar"}
          </button>
          {savedMsg && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#aaa]">{savedMsg}</span>
          )}
        </div>
      </Card>
    </div>
  );
}
