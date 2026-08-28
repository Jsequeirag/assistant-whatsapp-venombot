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
      className={status === "ok" ? "ds-status-dot-animated" : "ds-status-dot-static"}
    />
  );
}

const WA_BADGE = {
  connected: { label: "Conectada", cls: "ds-wa-badge connected" },
  qr: { label: "Esperando QR", cls: "ds-wa-badge qr" },
  starting: { label: "Iniciando", cls: "ds-wa-badge starting" },
  disconnected: { label: "Desconectada", cls: "ds-wa-badge disconnected" },
};

function WaBadge({ state }) {
  const b = WA_BADGE[state] || WA_BADGE.disconnected;
  return (
    <span className={b.cls}>
      {b.label}
    </span>
  );
}

function Card({ title, children, actions }) {
  return (
    <div className="ds-card-aria">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ds-space-4)" }}>
        <h2 style={{ fontFamily: "var(--ds-font-display)", fontWeight: "var(--ds-fw-display)", textTransform: "uppercase", letterSpacing: "1px", color: "var(--ds-text-muted)", fontSize: "var(--ds-fs-sm)" }}>
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

export default function Estado({ active = true }) {
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
  const [loadError, setLoadError] = useState(null);

  const loadWa = async () => {
    try {
      setWa(await api.getWhatsappStatus());
    } catch {
      setWa({ state: "disconnected", qr: null });
    }
  };

  useEffect(() => {
    if (!active) return undefined;
    loadWa();
    const id = setInterval(loadWa, 4000);
    return () => clearInterval(id);
  }, [active]);

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
    setLoadError(null);
    try {
      const [audit, settings] = await Promise.all([api.getAudit(), api.getSettings()]);
      setCurrent(audit.current || []);
      setGroq(settings.groq);
      setModel(settings.groq.model || "");
      setBaseUrl(settings.groq.baseUrl || "");
      setVoiceModel(settings.groq.voiceModel || "whisper-large-v3-turbo");
      await loadModels();
    } catch {
      setLoadError("No se pudo cargar el estado de servicios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const saveGroq = async () => {
    setSavedMsg("");
    const payload = { model, baseUrl, voiceModel };
    if (apiKey.trim()) payload.apiKey = apiKey.trim();
    try {
      const updated = await api.updateGroq(payload);
      setGroq(updated);
      setApiKey("");
      setSavedMsg("✓ Guardado");
      setTimeout(() => setSavedMsg(""), 2000);
      await loadModels();
      return true;
    } catch {
      setSavedMsg("No se pudo guardar");
      setTimeout(() => setSavedMsg(""), 3000);
      return false;
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      if (apiKey.trim() || model !== groq.model || baseUrl !== groq.baseUrl || voiceModel !== groq.voiceModel) {
        const ok = await saveGroq();
        if (!ok) return;
      }
      const { current: c } = await api.runAuditCheck();
      setCurrent(c || []);
    } catch {
      setSavedMsg("No se pudo verificar");
      setTimeout(() => setSavedMsg(""), 3000);
    } finally {
      setChecking(false);
    }
  };

  if (loading) return (
    <p style={{ textAlign: "center", color: "var(--ds-text-faint)", padding: "var(--ds-space-12) 0", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase" }}>
      Cargando...
    </p>
  );

  if (loadError) return (
    <div style={{ textAlign: "center", padding: "var(--ds-space-12) 0" }}>
      <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)" }}>
        {loadError}
      </p>
      <button
        type="button"
        onClick={loadAll}
        className="ds-btn-primary"
        style={{
          marginTop: "var(--ds-space-4)",
          fontFamily: "var(--ds-font-body)",
          fontWeight: "var(--ds-fw-medium)",
          fontSize: "var(--ds-fs-xs)",
          letterSpacing: "var(--ds-ls-caps)",
          textTransform: "uppercase",
          padding: "var(--ds-space-2) var(--ds-space-4)",
          background: "var(--ds-accent)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
        }}
      >
        Reintentar
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
      <h1 className="ds-display" style={{ fontSize: "var(--ds-fs-sm)", color: "var(--ds-text-strong)", marginBottom: "var(--ds-space-4)" }}>
        Estado de servicios
      </h1>

      {/* Sesión WhatsApp */}
      <Card
        title="Sesión de WhatsApp"
        actions={<WaBadge state={wa.state} />}
      >
        {wa.state === "qr" && wa.qr && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--ds-space-3)", padding: "var(--ds-space-2) 0" }}>
            <div style={{ border: "1px solid var(--ds-border)", padding: "var(--ds-space-2)", background: "#fff" }}>
              <img src={wa.qr} alt="QR de WhatsApp" style={{ width: "208px", height: "208px" }} />
            </div>
            <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)", textAlign: "center", lineHeight: 1.6 }}>
              WhatsApp → Dispositivos vinculados → Vincular dispositivo → escanear
            </p>
          </div>
        )}

        {wa.state === "connected" && (
          <p style={{ fontSize: "var(--ds-fs-sm)", color: "var(--ds-text-muted)" }}>Conectada y escuchando mensajes.</p>
        )}

        {(wa.state === "starting" || (wa.state === "qr" && !wa.qr)) && (
          <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)" }}>Generando QR...</p>
        )}

        {wa.state === "disconnected" && (
          <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)" }}>Desconectada.</p>
        )}

        <button
          onClick={restartWa}
          disabled={restarting}
          style={{
            fontFamily: "var(--ds-font-body)",
            fontWeight: "var(--ds-fw-medium)",
            fontSize: "var(--ds-fs-xs)",
            letterSpacing: "var(--ds-ls-caps)",
            textTransform: "uppercase",
            padding: "var(--ds-space-2) var(--ds-space-4)",
            border: "1px solid var(--ds-border-soft)",
            background: "transparent",
            color: "var(--ds-text-muted)",
            cursor: "pointer",
            opacity: restarting ? 0.3 : 1,
            transition: "color var(--ds-dur-hover), border-color var(--ds-dur-hover)",
          }}
          onMouseEnter={(e) => { if (!restarting) { e.currentTarget.style.borderColor = "var(--ds-border)"; e.currentTarget.style.color = "var(--ds-text-strong)"; } }}
          onMouseLeave={(e) => { if (!restarting) { e.currentTarget.style.borderColor = "var(--ds-border-soft)"; e.currentTarget.style.color = "var(--ds-text-muted)"; } }}
        >
          {restarting ? "Reiniciando..." : "Generar nueva sesión"}
        </button>
      </Card>

      {/* Servicios */}
      <Card title="Servicios">
        {current.length === 0 ? (
          <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)" }}>
            Sin chequeos todavía.
          </p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
            {current.map((s) => (
              <li key={s.service} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-3)" }}>
                  <StatusDot status={s.status} />
                  <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-muted)" }}>
                    {SERVICE_LABELS[s.service] || s.service}
                  </span>
                </span>
                <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)" }}>
                  {s.latencyMs}ms · {new Date(s.checkedAt).toLocaleString("es")}
                </span>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={check}
          disabled={checking}
          className="ds-btn-primary"
          style={{
            fontFamily: "var(--ds-font-body)",
            fontWeight: "var(--ds-fw-medium)",
            fontSize: "var(--ds-fs-xs)",
            letterSpacing: "var(--ds-ls-caps)",
            textTransform: "uppercase",
            padding: "var(--ds-space-2) var(--ds-space-4)",
            background: "var(--ds-accent)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            opacity: checking ? 0.3 : 1,
          }}
          onMouseEnter={(e) => { if (!checking) e.currentTarget.style.opacity = 0.8; }}
          onMouseLeave={(e) => { if (!checking) e.currentTarget.style.opacity = 1; }}
        >
          {checking ? "Verificando..." : "Verificar ahora"}
        </button>
      </Card>

      {/* Proveedor de IA */}
      <Card title="Proveedor de IA">
        {/* API Key */}
        <div>
          <label style={{ display: "block", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-label)", textTransform: "uppercase", color: "var(--ds-text-faint)", marginBottom: "var(--ds-space-2)" }}>
            API Key
            {groq.hasKey && (
              <span style={{ color: "var(--ds-border)", marginLeft: "var(--ds-space-2)" }}>( actual: {groq.keyMasked} )</span>
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
          <label style={{ display: "block", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-label)", textTransform: "uppercase", color: "var(--ds-text-faint)", marginBottom: "var(--ds-space-2)" }}>
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
          <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-border)", marginTop: "var(--ds-space-2)" }}>
            Vacío → Groq (default) · OpenRouter → https://openrouter.ai/api/v1 · OpenAI → https://api.openai.com/v1
          </p>
        </div>

        {/* Modelo de chat */}
        <div>
          <label style={{ display: "block", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-label)", textTransform: "uppercase", color: "var(--ds-text-faint)", marginBottom: "var(--ds-space-2)" }}>
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
            <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", marginTop: "var(--ds-space-2)" }}>
              Guardá una key válida para cargar la lista de modelos disponibles.
            </p>
          )}
        </div>

        {/* Modelo de voz */}
        <div>
          <label style={{ display: "block", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-label)", textTransform: "uppercase", color: "var(--ds-text-faint)", marginBottom: "var(--ds-space-2)" }}>
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
          <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-border)", marginTop: "var(--ds-space-2)" }}>
            Solo aplica cuando el proveedor soporta /audio/transcriptions (Groq, OpenAI).
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)" }}>
          <button
            onClick={saveGroq}
            className="ds-btn-primary"
            style={{
              fontFamily: "var(--ds-font-body)",
              fontWeight: "var(--ds-fw-medium)",
              fontSize: "var(--ds-fs-xs)",
              letterSpacing: "var(--ds-ls-caps)",
              textTransform: "uppercase",
              padding: "var(--ds-space-2) var(--ds-space-4)",
              background: "var(--ds-accent)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = 0.8}
            onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
          >
            Guardar
          </button>
          <button
            onClick={check}
            disabled={checking}
            style={{
              fontFamily: "var(--ds-font-body)",
              fontWeight: "var(--ds-fw-medium)",
              fontSize: "var(--ds-fs-xs)",
              letterSpacing: "var(--ds-ls-caps)",
              textTransform: "uppercase",
              padding: "var(--ds-space-2) var(--ds-space-4)",
              border: "1px solid var(--ds-border-soft)",
              background: "transparent",
              color: "var(--ds-text-muted)",
              cursor: "pointer",
              opacity: checking ? 0.3 : 1,
              transition: "color var(--ds-dur-hover), border-color var(--ds-dur-hover)",
            }}
            onMouseEnter={(e) => { if (!checking) { e.currentTarget.style.borderColor = "var(--ds-border)"; e.currentTarget.style.color = "var(--ds-text-strong)"; } }}
            onMouseLeave={(e) => { if (!checking) { e.currentTarget.style.borderColor = "var(--ds-border-soft)"; e.currentTarget.style.color = "var(--ds-text-muted)"; } }}
          >
            {checking ? "Verificando..." : "Verificar"}
          </button>
          {savedMsg && (
            <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: savedMsg.startsWith("✓") ? "var(--ds-text-muted)" : "#ef4444" }}>{savedMsg}</span>
          )}
        </div>
      </Card>
    </div>
  );
}
