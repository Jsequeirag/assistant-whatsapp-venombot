import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";

const PRIORITY_META = {
  alta: { label: "Alta", cls: "bg-red-100 text-red-700", dot: "🔴", rank: 0 },
  media: { label: "Media", cls: "bg-amber-100 text-amber-700", dot: "🟡", rank: 1 },
  baja: { label: "Baja", cls: "bg-green-100 text-green-700", dot: "🟢", rank: 2 },
};

function PriorityBadge({ priority }) {
  const p = PRIORITY_META[priority] || PRIORITY_META.media;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.cls}`}>
      {p.dot} {p.label}
    </span>
  );
}

const rank = (p) => PRIORITY_META[p]?.rank ?? 1;

/** Agrupa la lista plana de recados por contacto. */
function groupByContact(recados) {
  const map = new Map();
  for (const r of recados) {
    if (!map.has(r.contactId)) {
      map.set(r.contactId, {
        contactId: r.contactId,
        contactName: r.contactName || r.contactId,
        recados: [],
        unread: 0,
        lastAt: 0,
        topPriority: "baja",
      });
    }
    const g = map.get(r.contactId);
    g.recados.push(r);
    if (!r.read) g.unread += 1;
    const t = new Date(r.createdAt).getTime();
    if (t > g.lastAt) g.lastAt = t;
    if (rank(r.priority) < rank(g.topPriority)) g.topPriority = r.priority;
  }
  // Último recado (más reciente) por grupo, y orden de grupos por actividad reciente.
  return [...map.values()]
    .map((g) => ({
      ...g,
      last: [...g.recados].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0],
    }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

function Conversation({ group, onRefresh }) {
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [showOriginals, setShowOriginals] = useState(false); // toggle general por contacto
  const endRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setMessages(await api.getMessages(group.contactId));
    } catch {
      setError("No se pudo cargar la conversación.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [group.contactId]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const saved = await api.reply(group.contactId, value);
      setMessages((prev) => [...(prev || []), saved]);
      setText("");
      onRefresh?.();
    } catch {
      setSendError("No se pudo enviar. ¿WhatsApp está conectado?");
    } finally {
      setSending(false);
    }
  };

  const toggleRead = async (r) => {
    try {
      await api.markRecado(r._id, !r.read);
      onRefresh?.();
    } catch { /* silencioso */ }
  };

  return (
    <div className="border-t border-gray-100 bg-gray-50">
      {/* Recados del contacto: interpretación IA + importancia (por defecto).
          Toggle general por contacto para ver los mensajes originales (no uno por uno). */}
      {group.recados.length > 0 && (
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              Recados ({group.recados.length})
            </p>
            <button
              type="button"
              onClick={() => setShowOriginals((v) => !v)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                showOriginals
                  ? "border-blue-200 text-blue-600 bg-blue-50"
                  : "border-gray-200 text-gray-500 hover:border-gray-400"
              }`}
            >
              {showOriginals ? "▾ Originales visibles" : "▸ Ver mensajes originales"}
            </button>
          </div>
          <ul className="space-y-2 mb-2">
            {[...group.recados]
              .sort((a, b) => rank(a.priority) - rank(b.priority) || new Date(b.createdAt) - new Date(a.createdAt))
              .map((r) => {
                const hasOriginal = r.originalContent && r.originalContent !== r.content;
                return (
                  <li key={r._id} className="bg-white rounded-md border border-gray-100 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <PriorityBadge priority={r.priority} />
                          <span className="text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleString("es")}</span>
                        </div>
                        <p className={`text-sm ${r.read ? "text-gray-400" : "text-gray-800"}`}>{r.content}</p>
                        {showOriginals && hasOriginal && (
                          <div className="mt-1.5 border-l-2 border-gray-200 pl-2.5 py-0.5">
                            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Mensaje original</p>
                            <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{r.originalContent}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => toggleRead(r)}
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-md border transition-colors ${
                          r.read
                            ? "border-gray-200 text-gray-400 hover:border-gray-400"
                            : "border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100"
                        }`}
                      >
                        {r.read ? "Sin leer" : "Leído"}
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {/* Timeline tipo chat */}
      <div className="px-4 py-3 max-h-80 overflow-y-auto">
        {loading && <p className="text-center text-gray-400 py-6 text-sm">Cargando conversación...</p>}
        {error && <p className="text-center text-red-400 py-6 text-sm">{error}</p>}
        {!loading && !error && messages?.length === 0 && (
          <p className="text-center text-gray-400 py-6 text-sm">Sin mensajes registrados.</p>
        )}
        {!loading && !error && messages?.length > 0 && (
          <div className="space-y-2">
            {messages.map((m) => {
              const mine = m.role === "assistant";
              return (
                <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      mine ? "bg-blue-600 text-white rounded-br-sm" : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    {m.content}
                    <div className={`text-[10px] mt-1 ${mine ? "text-blue-100" : "text-gray-400"}`}>
                      {mine && (m.via === "manual" ? "✍️ manual · " : "🤖 auto · ")}
                      {new Date(m.createdAt).toLocaleString("es")}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Responder desde la app */}
      <form onSubmit={send} className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe una respuesta…"
          className="flex-1 text-sm rounded-full border border-gray-200 px-4 py-2 focus:outline-none focus:border-blue-400"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="shrink-0 text-sm px-4 py-2 rounded-full bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors"
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </form>
      {sendError && <p className="px-4 pb-3 -mt-1 text-xs text-red-500">{sendError}</p>}
    </div>
  );
}

export default function Conversaciones() {
  const [recados, setRecados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRecados(await api.getRecados());
    } catch {
      setError("No se pudo cargar las conversaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const groups = groupByContact(recados);

  return (
    <div>
      <h1 className="text-lg font-semibold text-gray-900 mb-4">Conversaciones</h1>

      {loading && <p className="text-center text-gray-400 py-12">Cargando...</p>}
      {error && <p className="text-center text-red-400 py-12">{error}</p>}
      {!loading && !error && groups.length === 0 && (
        <p className="text-center text-gray-400 py-12">No hay conversaciones.</p>
      )}

      {!loading && !error && groups.length > 0 && (
        <ul className="space-y-2">
          {groups.map((g) => {
            const expanded = open === g.contactId;
            return (
              <li key={g.contactId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setOpen(expanded ? null : g.contactId)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{g.contactName}</p>
                      <PriorityBadge priority={g.topPriority} />
                      {g.unread > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold text-white bg-red-500 rounded-full">
                          {g.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-0.5">{g.last?.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(g.lastAt).toLocaleString("es")}</p>
                  </div>
                  <span className="shrink-0 text-gray-400 text-sm">{expanded ? "▾" : "▸"}</span>
                </button>
                {expanded && <Conversation group={g} onRefresh={load} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
