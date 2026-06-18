import { useState, useEffect } from "react";
import { api } from "../api/client";

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        checked ? "bg-green-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const inputCls =
  "border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300";

export default function Contacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", number: "" });
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setContacts(await api.getContacts());
    } catch {
      setError("No se pudo cargar los contactos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.number.trim()) { setFormError("El número es requerido."); return; }
    try {
      const created = await api.createContact({ name: form.name.trim(), number: form.number.trim() });
      setContacts((prev) => {
        const exists = prev.find((c) => c.contactId === created.contactId);
        return exists ? prev.map((c) => c.contactId === created.contactId ? created : c) : [created, ...prev];
      });
      setForm({ name: "", number: "" });
      setShowForm(false);
    } catch {
      setFormError("No se pudo crear el contacto.");
    }
  };

  const handleDelete = async (c) => {
    if (!confirm(`¿Eliminar a ${c.name || c.number}?`)) return;
    await api.deleteContact(c.contactId);
    setContacts((prev) => prev.filter((x) => x.contactId !== c.contactId));
  };

  const handleEditSave = async (c) => {
    const updated = await api.updateContact(c.contactId, { name: editName });
    setContacts((prev) => prev.map((x) => x.contactId === c.contactId ? updated : x));
    setEditingId(null);
  };

  const toggleAssist = async (c) => {
    const next = !c.autoAssist;
    setContacts((prev) => prev.map((x) => x.contactId === c.contactId ? { ...x, autoAssist: next } : x));
    try {
      await api.toggleAutoAssist(c.contactId, next);
    } catch {
      setContacts((prev) => prev.map((x) => x.contactId === c.contactId ? { ...x, autoAssist: c.autoAssist } : x));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Contactos</h1>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(""); }}
          className="text-sm bg-gray-900 text-white px-3 py-1.5 rounded-md hover:bg-gray-700 transition-colors"
        >
          {showForm ? "Cancelar" : "+ Nuevo"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={`${inputCls} flex-1`}
            />
            <input
              type="tel"
              placeholder="Número (ej: 50688887777)"
              value={form.number}
              onChange={(e) => setForm({ ...form, number: e.target.value })}
              className={`${inputCls} flex-1`}
            />
          </div>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
          <p className="text-xs text-gray-400">Ingresá el número completo con código de país, sin + ni espacios.</p>
          <button type="submit" className="text-sm bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors">
            Guardar
          </button>
        </form>
      )}

      {loading && <p className="text-center text-gray-400 py-12">Cargando...</p>}
      {error && <p className="text-center text-red-400 py-12">{error}</p>}

      {!loading && !error && contacts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">No hay contactos registrados aún.</p>
          <p className="text-xs text-gray-300 mt-1">Creá uno manualmente o aparecerán cuando alguien te escriba.</p>
        </div>
      )}

      {!loading && !error && contacts.length > 0 && (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.contactId} className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editingId === c.contactId ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleEditSave(c)}
                        className={`${inputCls} flex-1`}
                      />
                      <button onClick={() => handleEditSave(c)} className="text-xs text-blue-600 hover:underline">Guardar</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:underline">Cancelar</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name || c.number}</p>
                      <button
                        onClick={() => { setEditingId(c.contactId); setEditName(c.name || ""); }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                        title="Editar nombre"
                      >
                        ✏️
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400">{c.number}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Auto-asistir</span>
                    <Toggle checked={c.autoAssist} onChange={() => toggleAssist(c)} />
                  </div>
                  <button
                    onClick={() => handleDelete(c)}
                    className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    title="Eliminar contacto"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
