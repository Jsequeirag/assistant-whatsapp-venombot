import { useState, useEffect } from "react";
import { api } from "../api/client";
import { Pencil, Trash2 } from "lucide-react";

function Avatar({ url, name, size = 34 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      style={{ width: size, height: size, background: "#131313", flexShrink: 0 }}
    />
  ) : (
    <div
      className="flex items-center justify-center font-mono text-[11px] text-[#555] bg-[#131313]"
      style={{ width: size, height: size, flexShrink: 0 }}
    >
      {initial}
    </div>
  );
}


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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-mono text-[11px] uppercase tracking-widest text-[#e8e8e8]">Contactos</h1>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(""); }}
          className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 bg-[#e8e8e8] text-[#0c0c0c] hover:bg-[#d0d0d0] transition-colors"
        >
          {showForm ? "Cancelar" : "+ Nuevo"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border border-[#2a2a2a] bg-[#0f0f0f] p-4 mb-3 space-y-3">
          <div className="flex gap-2">
            <div className="t-input flex-1">
              <input
                type="text"
                placeholder="Nombre"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="t-input flex-1">
              <input
                type="tel"
                placeholder="Número (ej: 50688887777)"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
            </div>
          </div>
          {formError && (
            <p className="font-mono text-[9px] uppercase tracking-wider text-[#555]">{formError}</p>
          )}
          <p className="font-mono text-[9px] text-[#555] leading-relaxed">
            Número completo con código de país, sin + ni espacios.
          </p>
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 bg-[#e8e8e8] text-[#0c0c0c] hover:bg-[#d0d0d0] transition-colors"
          >
            Guardar
          </button>
        </form>
      )}

      {loading && (
        <p className="font-mono text-center text-[#555] py-12 text-[11px] uppercase tracking-wider">
          Cargando...
        </p>
      )}
      {error && (
        <p className="font-mono text-center text-[#555] py-12 text-[11px] uppercase tracking-wider">
          {error}
        </p>
      )}

      {!loading && !error && contacts.length === 0 && (
        <div className="text-center py-12">
          <p className="font-mono text-[#555] text-[11px] uppercase tracking-wider">
            No hay contactos registrados.
          </p>
          <p className="font-mono text-[9px] text-[#333] mt-2">
            Creá uno manualmente o aparecerán cuando alguien te escriba.
          </p>
        </div>
      )}

      {!loading && !error && contacts.length > 0 && (
        <ul className="border border-[#1a1a1a] divide-y divide-[#1a1a1a]">
          {contacts.map((c) => (
            <li key={c.contactId} className="bg-[#0f0f0f] px-4 py-3 hover:bg-[#131313] transition-colors">
              <div className="flex items-center gap-3">
                <Avatar url={c.avatarUrl} name={c.name || c.number} />
                <div className="min-w-0 flex-1">
                  {editingId === c.contactId ? (
                    <div className="flex items-center gap-2">
                      <div className="t-input flex-1">
                        <input
                          autoFocus
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleEditSave(c)}
                        />
                      </div>
                      <button
                        onClick={() => handleEditSave(c)}
                        className="font-mono text-[9px] uppercase tracking-wider text-[#e8e8e8] hover:text-[#aaa]"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="font-mono text-[9px] uppercase tracking-wider text-[#555] hover:text-[#aaa]"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[12px] text-[#e8e8e8] truncate">{c.name || c.number}</p>
                      <button
                        onClick={() => { setEditingId(c.contactId); setEditName(c.name || ""); }}
                        className="p-1.5 text-[#333] hover:text-[#aaa] hover:bg-[#1a1a1a] transition-colors"
                        title="Editar nombre"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                  <p className="font-mono text-[9px] text-[#555] mt-0.5">{c.number}</p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleDelete(c)}
                    className="group p-2 text-[#555] hover:text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all duration-200"
                    title="Eliminar contacto"
                  >
                    <Trash2 size={15} className="group-hover:scale-110 transition-transform duration-200" />
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
