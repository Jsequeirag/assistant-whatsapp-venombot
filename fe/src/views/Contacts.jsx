import { useState, useEffect } from "react";
import { api } from "../api/client";
import { Pencil, Trash2 } from "lucide-react";

function Avatar({ url, name, size = 40 }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="ds-avatar-circle"
      style={{ width: size, height: size, flexShrink: 0 }}
    />
  ) : (
    <div
      className="ds-avatar-circle ds-avatar-initial"
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--ds-space-4)" }}>
        <h1 className="ds-display" style={{ fontSize: "var(--ds-fs-sm)", color: "var(--ds-text-strong)" }}>
          Contactos
        </h1>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(""); }}
          className="ds-btn-primary"
          style={{
            fontFamily: "var(--ds-font-body)",
            fontWeight: "var(--ds-fw-medium)",
            fontSize: "var(--ds-fs-xs)",
            letterSpacing: "var(--ds-ls-caps)",
            textTransform: "uppercase",
            padding: "var(--ds-space-2) var(--ds-space-3)",
            background: "var(--ds-accent)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = 0.8}
          onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
        >
          {showForm ? "Cancelar" : "+ Nuevo"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ border: "1px solid var(--ds-border)", padding: "var(--ds-space-4)", marginBottom: "var(--ds-space-3)", display: "flex", flexDirection: "column", gap: "var(--ds-space-3)" }}>
          <div style={{ display: "flex", gap: "var(--ds-space-2)" }}>
            <div className="t-input" style={{ flex: 1 }}>
              <input
                type="text"
                placeholder="Nombre"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="t-input" style={{ flex: 1 }}>
              <input
                type="tel"
                placeholder="Número (ej: 50688887777)"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
            </div>
          </div>
          {formError && (
            <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)" }}>{formError}</p>
          )}
          <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", lineHeight: 1.6 }}>
            Número completo con código de país, sin + ni espacios.
          </p>
          <button
            type="submit"
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
              alignSelf: "flex-start",
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = 0.8}
            onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
          >
            Guardar
          </button>
        </form>
      )}

      {loading && (
        <p style={{ textAlign: "center", color: "var(--ds-text-faint)", padding: "var(--ds-space-12) 0", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase" }}>
          Cargando...
        </p>
      )}
      {error && (
        <p style={{ textAlign: "center", color: "var(--ds-text-faint)", padding: "var(--ds-space-12) 0", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase" }}>
          {error}
        </p>
      )}

      {!loading && !error && contacts.length === 0 && (
        <div style={{ textAlign: "center", padding: "var(--ds-space-12) 0" }}>
          <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)" }}>
            No hay contactos registrados.
          </p>
          <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-border)", marginTop: "var(--ds-space-2)" }}>
            Creá uno manualmente o aparecerán cuando alguien te escriba.
          </p>
        </div>
      )}

      {!loading && !error && contacts.length > 0 && (
        <div className="ds-list">
          {contacts.map((c) => (
            <div key={c.contactId} className="ds-list-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-3)", padding: "var(--ds-space-3) var(--ds-space-4)", cursor: "pointer", transition: "background var(--ds-dur-hover)" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--ds-bg)"} onMouseLeave={(e) => e.currentTarget.style.background = "var(--ds-surface)"}>
                <Avatar url={c.avatarUrl} name={c.name || c.number} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  {editingId === c.contactId ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)" }}>
                      <div className="t-input" style={{ flex: 1 }}>
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
                        style={{
                          fontFamily: "var(--ds-font-body)",
                          fontWeight: "var(--ds-fw-regular)",
                          fontSize: "var(--ds-fs-xs)",
                          letterSpacing: "var(--ds-ls-caps)",
                          textTransform: "uppercase",
                          color: "var(--ds-text-strong)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          transition: "color var(--ds-dur-hover)",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "var(--ds-text-muted)"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "var(--ds-text-strong)"}
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        style={{
                          fontFamily: "var(--ds-font-body)",
                          fontWeight: "var(--ds-fw-regular)",
                          fontSize: "var(--ds-fs-xs)",
                          letterSpacing: "var(--ds-ls-caps)",
                          textTransform: "uppercase",
                          color: "var(--ds-text-faint)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          transition: "color var(--ds-dur-hover)",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = "var(--ds-text-muted)"}
                        onMouseLeave={(e) => e.currentTarget.style.color = "var(--ds-text-faint)"}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)" }}>
                      <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-sm)", color: "var(--ds-text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name || c.number}</p>
                      <button
                        onClick={() => { setEditingId(c.contactId); setEditName(c.name || ""); }}
                        style={{
                          padding: "var(--ds-space-1)",
                          color: "var(--ds-border)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          transition: "color var(--ds-dur-hover)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ds-text-muted)"; e.currentTarget.style.background = "var(--ds-surface)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ds-border)"; e.currentTarget.style.background = "transparent"; }}
                        title="Editar nombre"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                  <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", marginTop: "var(--ds-space-1)" }}>{c.number}</p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-1)", flexShrink: 0 }}>
                  <button
                    onClick={() => handleDelete(c)}
                    style={{
                      padding: "var(--ds-space-2)",
                      color: "var(--ds-text-faint)",
                      background: "none",
                      border: "1px solid transparent",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "#ef4444";
                      e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                      e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.3)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--ds-text-faint)";
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }}
                    title="Eliminar contacto"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
