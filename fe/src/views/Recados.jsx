import { useState, useEffect } from "react";
import { api } from "../api/client";

const FILTERS = [
  { label: "Todos", value: "all" },
  { label: "Sin leer", value: "unread" },
  { label: "Leídos", value: "read" },
];

const PRIORITY_FILTERS = [
  { label: "Todas", value: "all" },
  { label: "🔴 Alta", value: "alta" },
  { label: "🟡 Media", value: "media" },
  { label: "🟢 Baja", value: "baja" },
];

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

function RecadoItem({ r, onToggle }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasOriginal = r.originalContent && r.originalContent !== r.content;

  return (
    <li
      className={`bg-white rounded-lg border p-4 transition-opacity ${
        r.read ? "opacity-50 border-gray-100" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {r.contactName || r.contactId}
            </p>
            <PriorityBadge priority={r.priority} />
          </div>
          <p className="text-sm text-gray-700 mt-0.5">{r.content}</p>

          {hasOriginal && (
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className="text-xs text-blue-500 hover:text-blue-700 mt-1"
            >
              {showOriginal ? "▾ Ocultar original" : "▸ Ver mensaje original"}
            </button>
          )}
          {showOriginal && hasOriginal && (
            <div className="mt-1.5 border-l-2 border-gray-200 pl-2.5 py-1">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Mensaje original</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{r.originalContent}</p>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-1">
            {new Date(r.createdAt).toLocaleString("es")}
          </p>
        </div>
        <button
          onClick={() => onToggle(r)}
          className={`shrink-0 text-xs px-2.5 py-1 rounded-md border transition-colors ${
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
}

export default function Recados() {
  const [recados, setRecados] = useState([]);
  const [filter, setFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRecados(await api.getRecados());
    } catch {
      setError("No se pudo cargar los recados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (r) => {
    try {
      await api.markRecado(r._id, !r.read);
      setRecados((prev) =>
        prev.map((x) => (x._id === r._id ? { ...x, read: !r.read } : x))
      );
    } catch {
      // silencioso — el estado no cambia
    }
  };

  const rank = (p) => PRIORITY_META[p]?.rank ?? 1;

  const visible = recados
    .filter((r) => (filter === "all" ? true : filter === "read" ? r.read : !r.read))
    .filter((r) => (priorityFilter === "all" ? true : (r.priority || "media") === priorityFilter))
    // Orden: prioridad alta primero; dentro de cada nivel, más reciente primero.
    .sort((a, b) => rank(a.priority) - rank(b.priority) || new Date(b.createdAt) - new Date(a.createdAt));

  const unread = recados.filter((r) => !r.read).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Recados</h1>
        {unread > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unread}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              filter === f.value
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {PRIORITY_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setPriorityFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              priorityFilter === f.value
                ? "bg-gray-700 text-white"
                : "bg-white text-gray-500 border border-gray-200 hover:border-gray-400"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-center text-gray-400 py-12">Cargando...</p>}
      {error && <p className="text-center text-red-400 py-12">{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <p className="text-center text-gray-400 py-12">No hay recados.</p>
      )}

      {!loading && !error && visible.length > 0 && (
        <ul className="space-y-2">
          {visible.map((r) => (
            <RecadoItem key={r._id} r={r} onToggle={toggle} />
          ))}
        </ul>
      )}
    </div>
  );
}
