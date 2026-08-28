import { useState, useEffect } from "react";
import { api } from "../api/client";
import Avatar from "../components/Avatar";
import PriorityBadge from "../components/PriorityBadge";
import { mergeThreads } from "./conversaciones/mergeThreads";
import Conversation from "./conversaciones/Conversation";

export default function Conversaciones({ active = true }) {
  const [contactsWithMsgs, setContactsWithMsgs] = useState([]);
  const [recados, setRecados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cms, recs] = await Promise.all([
        api.getContactsWithMessages(),
        api.getRecados(),
      ]);
      setContactsWithMsgs(cms);
      setRecados(recs);
    } catch {
      setError("No se pudo cargar las conversaciones.");
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    try {
      const [cms, recs] = await Promise.all([
        api.getContactsWithMessages(),
        api.getRecados(),
      ]);
      setContactsWithMsgs(cms);
      setRecados(recs);
      setError(null);
    } catch { /* el poll no pisa el error de la carga inicial */ }
  };

  useEffect(() => {
    if (!active) return undefined;
    if (contactsWithMsgs.length === 0) load();
    else refresh();
    const id = setInterval(() => {
      if (document.hidden) return;
      refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [active]);

  const groups = mergeThreads(contactsWithMsgs, recados);

  return (
    <div>
      <h1 className="ds-display" style={{ fontSize: "var(--ds-fs-sm)", marginBottom: "var(--ds-space-4)", color: "var(--ds-text-strong)" }}>
        Conversaciones
      </h1>

      {loading && <p className="ds-empty">Cargando...</p>}
      {error && <p className="ds-empty">{error}</p>}
      {!loading && !error && groups.length === 0 && <p className="ds-empty">Sin conversaciones.</p>}

      {!loading && !error && groups.length > 0 && (
        <div className="ds-list">
          {groups.map((g) => {
            const expanded = open === g.contactId;
            return (
              <div key={g.contactId} className={`ds-list-item ${expanded ? "active" : ""}`}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : g.contactId)}
                  className="ds-list-item-content"
                >
                  <Avatar url={g.avatarUrl} name={g.contactName} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", marginBottom: "var(--ds-space-1)" }}>
                      <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-sm)", color: "var(--ds-text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.contactName}</p>
                      {g.hasRecados && <PriorityBadge priority={g.topPriority} />}
                      {g.unread > 0 && (
                        <span className="ds-counter-badge">{g.unread}</span>
                      )}
                    </div>
                    <p style={{ fontSize: "var(--ds-fs-sm)", color: "var(--ds-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>{g.lastMessage}</p>
                    <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-border)", marginTop: "var(--ds-space-1)" }}>
                      {new Date(g.lastAt).toLocaleString("es")}
                    </p>
                  </div>
                  <span style={{ flexShrink: 0, fontFamily: "var(--ds-font-body)", color: "var(--ds-text-faint)", fontSize: "var(--ds-fs-xs)" }}>
                    {expanded ? "▾" : "▸"}
                  </span>
                </button>
                {expanded && <Conversation group={g} onRefresh={refresh} active={active} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
