import { useState, useEffect } from "react";
import { api } from "../api/client";
import EmojiPicker from "../components/EmojiPicker";

function Toggle({ checked, onChange, label }) {
  return (
    <label className="ds-toggle" style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-3)", cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
      />
      <div className="ds-toggle-track">
        <div className="ds-toggle-thumb" />
      </div>
      <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-medium)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-muted)" }}>{label}</span>
    </label>
  );
}

function Card({ title, children }) {
  return (
    <div className="ds-card-aria">
      <h2 style={{ fontFamily: "var(--ds-font-display)", fontWeight: "var(--ds-fw-display)", textTransform: "uppercase", letterSpacing: "1px", color: "var(--ds-text-muted)", fontSize: "var(--ds-fs-sm)", marginBottom: "var(--ds-space-4)" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: "block", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-label)", textTransform: "uppercase", color: "var(--ds-text-faint)", marginBottom: "var(--ds-space-2)" }}>{label}</label>
      {children}
      {hint && <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", marginTop: "var(--ds-space-2)", lineHeight: 1.6 }}>{hint}</p>}
    </div>
  );
}

const TIMEZONES = [
  "America/Argentina/Buenos_Aires",
  "America/Argentina/Cordoba",
  "America/Montevideo",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/New_York",
  "Europe/Madrid",
  "UTC",
];

function SaveButton({ onClick, saved }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      {saved ? "✓ Guardado" : "Guardar"}
    </button>
  );
}

export default function Settings() {
  const [identity, setIdentity] = useState({ ownerName: "", assistantName: "" });
  const [dnd, setDnd] = useState({ active: false, reason: "" });
  const [sleep, setSleep] = useState({ active: false });
  const [timezone, setTimezone] = useState("America/Argentina/Buenos_Aires");
  const [autoAssist, setAutoAssist] = useState({ globalEnabled: false, reason: "" });
  const [retention, setRetention] = useState({ days: 30 });
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadSettings = () => {
    setLoading(true);
    setLoadError(null);
    api.getSettings()
      .then((s) => {
        setIdentity(s.identity);
        setDnd(s.dnd);
        setSleep(s.sleep);
        if (s.timezone) setTimezone(s.timezone);
        setAutoAssist(s.autoAssist);
        if (s.retention) setRetention(s.retention);
      })
      .catch(() => setLoadError("No se pudo cargar la configuración."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSettings(); }, []);

  const notify = (key) => {
    setSaveError(null);
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  };

  const persist = async (key, fn) => {
    setSaveError(null);
    try {
      await fn();
      notify(key);
    } catch (err) {
      setSaveError(err?.message || "No se pudo guardar. Revisá que el API esté disponible.");
    }
  };

  const saveIdentity = () => persist("identity", () => api.updateIdentity(identity));
  const saveDnd = () => persist("dnd", () => api.updateDnd(dnd));
  const saveSleep = () => persist("sleep", () => api.updateSleep({ ...sleep, timezone }));
  const saveAutoAssist = () => persist("autoAssist", () => api.updateAutoAssist(autoAssist));
  const saveRetention = () => persist("retention", async () => {
    const r = await api.updateRetention(retention.days);
    setRetention(r);
  });

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
        onClick={loadSettings}
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

  const preview = `"Hola, soy ${identity.assistantName || "Ari"}, el asistente virtual de ${identity.ownerName || "el usuario"}."`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
      <h1 className="ds-display" style={{ fontSize: "var(--ds-fs-sm)", color: "var(--ds-text-strong)", marginBottom: "var(--ds-space-4)" }}>
        Configuración
      </h1>
      {saveError && (
        <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "#ef4444", marginBottom: "var(--ds-space-2)" }}>
          {saveError}
        </p>
      )}

      {/* Identidad */}
      <Card title="Identidad del asistente">
        <Field label="Tu nombre">
          <div className="t-input">
            <input
              type="text"
              value={identity.ownerName}
              onChange={(e) => setIdentity({ ...identity, ownerName: e.target.value })}
              placeholder="ej: Jose"
            />
          </div>
        </Field>
        <Field label="Nombre del asistente">
          <div className="t-input">
            <input
              type="text"
              value={identity.assistantName}
              onChange={(e) => setIdentity({ ...identity, assistantName: e.target.value })}
              placeholder="ej: Ari"
            />
          </div>
        </Field>
        <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", fontStyle: "italic" }}>{preview}</p>
        <SaveButton onClick={saveIdentity} saved={saved === "identity"} />
      </Card>

      {/* DND */}
      <Card title="No molestar (DND)">
        <Toggle
          checked={dnd.active}
          onChange={(v) => setDnd({ ...dnd, active: v })}
          label={dnd.active ? "Activo" : "Inactivo"}
        />
        <Field
          label="Motivo"
          hint="La IA adapta el mensaje según esto. Ej: 'en una reunión', 'almorzando', 'de viaje hasta el viernes'."
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ds-space-2)" }}>
            <div className="t-input" style={{ flex: 1 }}>
              <input
                type="text"
                value={dnd.reason}
                onChange={(e) => setDnd({ ...dnd, reason: e.target.value })}
                placeholder="ej: en una reunión"
              />
            </div>
            <EmojiPicker onPick={(emo) => setDnd((d) => ({ ...d, reason: `${d.reason}${emo}` }))} />
          </div>
        </Field>
        <SaveButton onClick={saveDnd} saved={saved === "dnd"} />
      </Card>

      {/* Sleep */}
      <Card title="Modo dormir (20:00–08:00)">
        <Toggle
          checked={sleep.active}
          onChange={(v) => setSleep({ ...sleep, active: v })}
          label={sleep.active ? "Activo" : "Inactivo"}
        />
        <Field
          label="Zona horaria"
          hint="El rango 20:00–08:00 se calcula en esta zona, no en la del servidor."
        >
          <div className="t-input">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
              {!TIMEZONES.includes(timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
            </select>
          </div>
        </Field>
        <Field
          label="Motivo / contexto"
          hint="La IA adapta el mensaje según esto. Si está vacío, usará 'descansando'."
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ds-space-2)" }}>
            <div className="t-input" style={{ flex: 1 }}>
              <input
                type="text"
                value={sleep.reason}
                onChange={(e) => setSleep({ ...sleep, reason: e.target.value })}
                placeholder="ej: descansando"
              />
            </div>
            <EmojiPicker onPick={(emo) => setSleep((s) => ({ ...s, reason: `${s.reason || ""}${emo}` }))} />
          </div>
        </Field>
        <SaveButton onClick={saveSleep} saved={saved === "sleep"} />
      </Card>

      {/* Auto-asistir */}
      <Card title="Auto-asistir">
        <Toggle
          checked={autoAssist.globalEnabled}
          onChange={(v) => setAutoAssist({ ...autoAssist, globalEnabled: v })}
          label={autoAssist.globalEnabled ? "Global: activo" : "Global: inactivo"}
        />
        <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", lineHeight: 1.6 }}>
          Cuando está activo, el bot sigue la conversación con todos los contactos.
        </p>
        <SaveButton onClick={saveAutoAssist} saved={saved === "autoAssist"} />
      </Card>

      {/* Retención */}
      <Card title="Retención de datos">
        <Field
          label="Días de retención"
          hint="Recados y mensajes más antiguos se eliminan automáticamente. 0 = nunca borrar."
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-3)" }}>
            <div className="t-input" style={{ width: "112px" }}>
              <input
                type="number"
                min="0"
                value={retention.days}
                onChange={(e) => setRetention({ days: e.target.value })}
              />
            </div>
            <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)" }}>días</span>
          </div>
        </Field>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--ds-space-2)" }}>
          {[1, 2, 7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRetention({ days: d })}
              style={{
                fontFamily: "var(--ds-font-body)",
                fontWeight: "var(--ds-fw-regular)",
                fontSize: "var(--ds-fs-xs)",
                letterSpacing: "var(--ds-ls-caps)",
                textTransform: "uppercase",
                padding: "var(--ds-space-1) var(--ds-space-3)",
                border: "1px solid var(--ds-border-soft)",
                background: Number(retention.days) === d ? "var(--ds-surface)" : "transparent",
                color: Number(retention.days) === d ? "var(--ds-text-strong)" : "var(--ds-text-faint)",
                cursor: "pointer",
                transition: "color var(--ds-dur-hover), border-color var(--ds-dur-hover)",
              }}
              onMouseEnter={(e) => { if (Number(retention.days) !== d) e.currentTarget.style.borderColor = "var(--ds-border)"; }}
              onMouseLeave={(e) => { if (Number(retention.days) !== d) e.currentTarget.style.borderColor = "var(--ds-border-soft)"; }}
            >
              {d}d
            </button>
          ))}
        </div>
        <SaveButton onClick={saveRetention} saved={saved === "retention"} />
      </Card>
    </div>
  );
}
