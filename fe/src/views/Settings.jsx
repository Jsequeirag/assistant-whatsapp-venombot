import { useState, useEffect } from "react";
import { api } from "../api/client";
import EmojiPicker from "../components/EmojiPicker";

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-5 w-10 items-center border transition-colors focus:outline-none"
        style={{
          background: checked ? "#e8e8e8" : "transparent",
          borderColor: checked ? "#e8e8e8" : "#333",
        }}
      >
        <span
          className="inline-block h-3.5 w-3.5 transition-transform"
          style={{
            background: checked ? "#0c0c0c" : "#555",
            transform: checked ? "translateX(20px)" : "translateX(4px)",
          }}
        />
      </button>
      <span className="font-mono text-[11px] uppercase tracking-wider text-[#aaa]">{label}</span>
    </label>
  );
}

function Card({ title, children }) {
  return (
    <div className="border border-[#2a2a2a] bg-[#0f0f0f] p-5 space-y-4">
      <h2 className="font-mono text-[11px] uppercase tracking-widest text-[#aaa]">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block font-mono text-[9px] uppercase tracking-widest text-[#555] mb-1.5">{label}</label>
      {children}
      {hint && <p className="font-mono text-[9px] text-[#555] mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SaveButton({ onClick, saved }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 bg-[#e8e8e8] text-[#0c0c0c] hover:bg-[#d0d0d0] transition-colors"
    >
      {saved ? "✓ Guardado" : "Guardar"}
    </button>
  );
}

export default function Settings() {
  const [identity, setIdentity] = useState({ ownerName: "", assistantName: "" });
  const [dnd, setDnd] = useState({ active: false, reason: "" });
  const [sleep, setSleep] = useState({ active: false });
  const [autoAssist, setAutoAssist] = useState({ globalEnabled: false, reason: "" });
  const [retention, setRetention] = useState({ days: 30 });
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings().then((s) => {
      setIdentity(s.identity);
      setDnd(s.dnd);
      setSleep(s.sleep);
      setAutoAssist(s.autoAssist);
      if (s.retention) setRetention(s.retention);
      setLoading(false);
    });
  }, []);

  const notify = (key) => {
    setSaved(key);
    setTimeout(() => setSaved(null), 2000);
  };

  const saveIdentity = async () => { await api.updateIdentity(identity); notify("identity"); };
  const saveDnd = async () => { await api.updateDnd(dnd); notify("dnd"); };
  const saveSleep = async () => { await api.updateSleep(sleep); notify("sleep"); };
  const saveAutoAssist = async () => { await api.updateAutoAssist(autoAssist); notify("autoAssist"); };
  const saveRetention = async () => { const r = await api.updateRetention(retention.days); setRetention(r); notify("retention"); };

  if (loading) return (
    <p className="font-mono text-center text-[#555] py-12 text-[11px] uppercase tracking-wider">
      Cargando...
    </p>
  );

  const preview = `"Hola, soy ${identity.assistantName || "Ari"}, el asistente virtual de ${identity.ownerName || "el usuario"}."`;

  return (
    <div className="space-y-3">
      <h1 className="font-mono text-[11px] uppercase tracking-widest text-[#e8e8e8] mb-5">
        Configuración
      </h1>

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
        <p className="font-mono text-[10px] text-[#555] italic">{preview}</p>
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
          <div className="flex items-start gap-2">
            <div className="t-input flex-1">
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
          label="Motivo / contexto"
          hint="La IA adapta el mensaje según esto. Si está vacío, usará 'descansando'."
        >
          <div className="flex items-start gap-2">
            <div className="t-input flex-1">
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
        <p className="font-mono text-[9px] text-[#555] leading-relaxed">
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
          <div className="flex items-center gap-3">
            <div className="t-input w-28">
              <input
                type="number"
                min="0"
                value={retention.days}
                onChange={(e) => setRetention({ days: e.target.value })}
              />
            </div>
            <span className="font-mono text-[11px] text-[#555] uppercase tracking-wider">días</span>
          </div>
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRetention({ days: d })}
              className="font-mono text-[9px] uppercase tracking-wider px-3 py-1 border transition-colors"
              style={{
                borderColor: Number(retention.days) === d ? "#e8e8e8" : "#2a2a2a",
                color: Number(retention.days) === d ? "#e8e8e8" : "#555",
                background: Number(retention.days) === d ? "#131313" : "transparent",
              }}
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
