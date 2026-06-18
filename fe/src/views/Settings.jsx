import { useState, useEffect } from "react";
import { api } from "../api/client";
import EmojiPicker from "../components/EmojiPicker";

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
          checked ? "bg-green-500" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <h2 className="font-medium text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300";

function SaveButton({ onClick, saved }) {
  return (
    <button
      onClick={onClick}
      className="text-sm bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
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

  if (loading) return <p className="text-center text-gray-400 py-12">Cargando...</p>;

  const preview = `"Hola, soy ${identity.assistantName || "Ari"}, el asistente virtual de ${identity.ownerName || "el usuario"}."`;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-900">Configuración</h1>

      {/* Identidad */}
      <Card title="👤 Identidad del asistente">
        <Field label="Tu nombre">
          <input
            type="text"
            value={identity.ownerName}
            onChange={(e) => setIdentity({ ...identity, ownerName: e.target.value })}
            placeholder="ej: Jose"
            className={inputCls}
          />
        </Field>
        <Field label="Nombre del asistente">
          <input
            type="text"
            value={identity.assistantName}
            onChange={(e) => setIdentity({ ...identity, assistantName: e.target.value })}
            placeholder="ej: Ari"
            className={inputCls}
          />
        </Field>
        <p className="text-xs text-gray-400 italic">{preview}</p>
        <SaveButton onClick={saveIdentity} saved={saved === "identity"} />
      </Card>

      {/* DND */}
      <Card title="🔕 No molestar (DND)">
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
            <input
              type="text"
              value={dnd.reason}
              onChange={(e) => setDnd({ ...dnd, reason: e.target.value })}
              placeholder="ej: en una reunión"
              className={inputCls}
            />
            <EmojiPicker onPick={(emo) => setDnd((d) => ({ ...d, reason: `${d.reason}${emo}` }))} />
          </div>
        </Field>
        <SaveButton onClick={saveDnd} saved={saved === "dnd"} />
      </Card>

      {/* Sleep */}
      <Card title="😴 Modo dormir (20:00–08:00)">
        <Toggle
          checked={sleep.active}
          onChange={(v) => setSleep({ ...sleep, active: v })}
          label={sleep.active ? "Activo" : "Inactivo"}
        />
        <Field
          label="Motivo / contexto"
          hint="La IA adapta el mensaje según esto. Si está vacío, usará 'descansando'. Ej: 'durmiendo', 'es tarde y ya no atiendo hasta mañana'."
        >
          <div className="flex items-start gap-2">
            <input
              type="text"
              value={sleep.reason}
              onChange={(e) => setSleep({ ...sleep, reason: e.target.value })}
              placeholder="ej: descansando"
              className={inputCls}
            />
            <EmojiPicker onPick={(emo) => setSleep((s) => ({ ...s, reason: `${s.reason || ""}${emo}` }))} />
          </div>
        </Field>
        <SaveButton onClick={saveSleep} saved={saved === "sleep"} />
      </Card>

      {/* Auto-asistir */}
      <Card title="🤖 Auto-asistir">
        <Toggle
          checked={autoAssist.globalEnabled}
          onChange={(v) => setAutoAssist({ ...autoAssist, globalEnabled: v })}
          label={autoAssist.globalEnabled ? "Global: activo" : "Global: inactivo"}
        />
        <p className="text-xs text-gray-400">
          Activá por contacto individualmente en la pestaña Contactos.
        </p>
        <SaveButton onClick={saveAutoAssist} saved={saved === "autoAssist"} />
      </Card>

      {/* Retención de datos */}
      <Card title="🧹 Retención de datos">
        <Field
          label="Días que duran recados y conversaciones"
          hint="Cuando un recado o mensaje supera estos días, se borra automáticamente para ahorrar espacio. 0 = no borrar nunca."
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={retention.days}
              onChange={(e) => setRetention({ days: e.target.value })}
              className={`${inputCls} w-28`}
            />
            <span className="text-sm text-gray-500">días</span>
          </div>
        </Field>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRetention({ days: d })}
              className={`px-3 py-1 rounded-full text-xs transition-colors ${
                Number(retention.days) === d
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-500 border border-gray-200 hover:border-gray-400"
              }`}
            >
              {d} {d === 1 ? "día" : "días"}
            </button>
          ))}
        </div>
        <SaveButton onClick={saveRetention} saved={saved === "retention"} />
      </Card>
    </div>
  );
}
