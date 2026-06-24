import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import AriaBadge from "../components/AriaBadge";
import EmojiPicker from "../components/EmojiPicker";

/** Avatar cuadrado 34×34 con imagen DiceBear o inicial como fallback. */
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

const PRIORITY_META = {
  alta: { label: "Alta", cls: "border-[#e8e8e8] text-[#e8e8e8]", rank: 0 },
  media: { label: "Media", cls: "border-[#aaa] text-[#aaa]", rank: 1 },
  baja: { label: "Baja", cls: "border-[#555] text-[#555]", rank: 2 },
};

function PriorityBadge({ priority }) {
  const p = PRIORITY_META[priority] || PRIORITY_META.media;
  return (
    <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0 border ${p.cls}`}>
      {priority?.toUpperCase() ?? "MEDIA"}
    </span>
  );
}

const rank = (p) => PRIORITY_META[p]?.rank ?? 1;

function mergeData(contactsWithMsgs, recados) {
  const recadosByContact = new Map();
  for (const r of recados) {
    if (!recadosByContact.has(r.contactId)) recadosByContact.set(r.contactId, []);
    recadosByContact.get(r.contactId).push(r);
  }

  return contactsWithMsgs
    .map((c) => {
      const cRecados = recadosByContact.get(c.contactId) || [];
      const unread = cRecados.filter((r) => !r.read).length;
      const topPriority = cRecados.reduce(
        (best, r) => (rank(r.priority) < rank(best) ? r.priority : best),
        "baja"
      );
      return {
        contactId: c.contactId,
        contactName: c.contactName,
        lastMessage: c.lastMessage,
        lastAt: new Date(c.lastAt).getTime(),
        avatarUrl: c.avatarUrl || "",
        recados: cRecados.sort(
          (a, b) => rank(a.priority) - rank(b.priority) || new Date(b.createdAt) - new Date(a.createdAt)
        ),
        unread,
        topPriority,
        hasRecados: cRecados.length > 0,
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}

/** Chip de interpretación IA bajo cada mensaje entrante.
 *  hideSummary: cuando el summary ya se muestra como contenido principal de la burbuja. */
function AiChip({ ai, hideSummary = false }) {
  if (!ai || ai.isRecado === null || ai.isRecado === undefined) return null;

  if (ai.isRecado) {
    const p = PRIORITY_META[ai.priority] || PRIORITY_META.media;
    return (
      <div className="mt-2 pl-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono text-[9px] text-[#555] uppercase tracking-wider">IA</span>
          <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 border ${p.cls}`}>
            RECADO · {ai.priority?.toUpperCase()}
          </span>
        </div>
        {!hideSummary && ai.summary && (
          <p className="text-[11px] text-[#555] italic leading-snug">{ai.summary}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <span className="font-mono text-[9px] text-[#333] uppercase tracking-wider">IA · msj normal</span>
    </div>
  );
}

/**
 * Burbuja de mensaje entrante.
 * Si showSummaryAsMain=true: muestra el resumen IA como texto principal
 * con un toggle para ver la transcripción original.
 */
function IncomingMessage({ m, ai, showSummaryAsMain, avatarUrl, contactName }) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="flex items-start gap-2">
      <Avatar url={avatarUrl} name={contactName} size={28} />
      <div className="flex flex-col items-start min-w-0">
        <div
          className="max-w-full px-3 py-2 text-[13px] whitespace-pre-wrap break-words text-[#e8e8e8]"
          style={{ background: "#0f0f0f", border: "1.5px solid #2a2a2a", borderLeft: "3px solid #2a2a2a" }}
        >
          {/* Medio visual (imagen, sticker, gif) */}
          {m.mediaData && m.mediaType && (
            <div className="mb-2">
              {m.mediaType === "video/mp4" ? (
                <video
                  src={`data:${m.mediaType};base64,${m.mediaData}`}
                  autoPlay loop muted playsInline
                  className="max-w-[220px] max-h-[220px] object-contain"
                />
              ) : (
                <img
                  src={`data:${m.mediaType};base64,${m.mediaData}`}
                  alt=""
                  className="max-w-[220px] max-h-[220px] object-contain"
                />
              )}
            </div>
          )}
          {/* Contenido principal: caption o interpretación IA.
              Si hay mediaData y el texto es solo la etiqueta genérica, no se muestra
              (la imagen ya lo dice todo). */}
          {(() => {
            const isGenericLabel = m.mediaData && m.content?.startsWith("(el contacto envió");
            const displayText = showSummaryAsMain ? ai.summary : (isGenericLabel ? null : m.content);
            return displayText ? <p className="leading-snug">{displayText}</p> : null;
          })()}

          {/* Toggle transcripción original (solo audios con resumen IA) */}
          {showSummaryAsMain && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="font-mono text-[9px] uppercase tracking-wider text-[#555] hover:text-[#aaa] transition-colors"
              >
                {showRaw ? "▾ Mensaje original" : "▸ Mensaje original"}
              </button>
              {showRaw && (
                <p className="mt-1 text-[11px] text-[#555] italic border-l-2 border-[#2a2a2a] pl-2 leading-snug">
                  {m.content}
                </p>
              )}
            </div>
          )}

          <div className="font-mono text-[9px] mt-1.5 text-[#555]">
            {m.isTranscribed && <span className="mr-1.5">🎙</span>}
            {new Date(m.createdAt).toLocaleString("es")}
          </div>
        </div>
        <AiChip ai={ai} hideSummary={showSummaryAsMain} />
      </div>
    </div>
  );
}

function Conversation({ group, onRefresh }) {
  const [tab, setTab] = useState("recados");
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [showOriginals, setShowOriginals] = useState(false);
  const [attachment, setAttachment] = useState(null); // { base64, filename, mimetype, preview }
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

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

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const finalize = (base64, mimetype, filename, preview) =>
      setAttachment({ base64, filename, mimetype, preview });

    if (file.type.startsWith("image/")) {
      // Comprimir imagen antes de enviar (máx 1200px, JPEG 0.80)
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.80);
          finalize(dataUrl.split(",")[1], "image/jpeg", file.name.replace(/\.[^.]+$/, ".jpg"), dataUrl);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        finalize(dataUrl.split(",")[1], file.type, file.name, null);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearAttachment = () => setAttachment(null);

  const send = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if ((!value && !attachment) || sending) return;
    setSending(true);
    setSendError(null);
    try {
      let saved;
      if (attachment) {
        saved = await api.replyFile(
          group.contactId,
          attachment.base64,
          attachment.filename,
          attachment.mimetype,
          value || undefined
        );
        setAttachment(null);
      } else {
        saved = await api.reply(group.contactId, value);
      }
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
    <div className="border-t border-[#1a1a1a] bg-[#0a0a0a]">

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="flex border-b border-[#1a1a1a]">
        {[
          { id: "recados", label: `Recados${group.recados.length ? ` (${group.recados.length})` : ""}` },
          { id: "mensajes", label: "Mensajes" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="font-mono text-[10px] uppercase tracking-wider px-4 py-2.5 transition-colors"
            style={{
              color: tab === t.id ? "#e8e8e8" : "#555",
              borderBottom: tab === t.id ? "3px solid #e8e8e8" : "3px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Pestaña: Recados ────────────────────────────────────────────── */}
      {tab === "recados" && (
        <div className="px-4 py-3">
          {group.recados.length === 0 ? (
            <p className="font-mono text-center text-[#555] py-6 text-[11px] uppercase tracking-wider">
              Sin recados.
            </p>
          ) : (
            <>
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={() => setShowOriginals((v) => !v)}
                  className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 border transition-colors ${
                    showOriginals
                      ? "border-[#e8e8e8]/30 text-[#e8e8e8]"
                      : "border-[#2a2a2a] text-[#555] hover:border-[#333] hover:text-[#aaa]"
                  }`}
                >
                  {showOriginals ? "▾ Originales" : "▸ Ver originales"}
                </button>
              </div>
              <ul className="space-y-1.5">
                {group.recados.map((r) => {
                  const hasOriginal = r.originalContent && r.originalContent !== r.content;
                  return (
                    <li
                      key={r._id}
                      className="bg-[#0f0f0f] border border-[#2a2a2a] p-2.5"
                      style={{ borderLeft: r.read ? "3px solid #1a1a1a" : "3px solid #e8e8e8" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <PriorityBadge priority={r.priority} />
                            <span className="font-mono text-[9px] text-[#555]">
                              {new Date(r.createdAt).toLocaleString("es")}
                            </span>
                          </div>
                          <p className={`text-[13px] leading-snug ${r.read ? "text-[#555]" : "text-[#e8e8e8]"}`}>
                            {r.content}
                          </p>
                          {showOriginals && hasOriginal && (
                            <div className="mt-2 border-l-2 border-[#1a1a1a] pl-3">
                              <p className="font-mono text-[9px] uppercase tracking-widest text-[#555] mb-0.5">Original</p>
                              <p className="text-[12px] text-[#555] whitespace-pre-wrap break-words">{r.originalContent}</p>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleRead(r)}
                          className={`shrink-0 font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 border transition-colors ${
                            r.read
                              ? "border-[#2a2a2a] text-[#555] hover:border-[#333]"
                              : "border-[#e8e8e8]/30 text-[#e8e8e8] hover:border-[#e8e8e8]/60"
                          }`}
                        >
                          {r.read ? "Sin leer" : "Leído"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {/* ── Pestaña: Mensajes + responder ───────────────────────────────── */}
      {tab === "mensajes" && (
        <>
          <div className="px-4 py-3 max-h-80 overflow-y-auto">
            {loading && (
              <p className="font-mono text-center text-[#555] py-6 text-[11px] uppercase tracking-wider">
                Cargando...
              </p>
            )}
            {error && (
              <p className="font-mono text-center text-[#555] py-6 text-[11px] uppercase tracking-wider">
                {error}
              </p>
            )}
            {!loading && !error && messages?.length === 0 && (
              <p className="font-mono text-center text-[#555] py-6 text-[11px] uppercase tracking-wider">
                Sin mensajes registrados.
              </p>
            )}
            {!loading && !error && messages?.length > 0 && (
              <div className="space-y-4">
                {messages.map((m) => {
                  const mine = m.role === "assistant";
                  if (!mine) {
                    const ai = m.aiClassification;
                    const showSummaryAsMain = ai?.isRecado && ai?.summary && ai.summary !== m.content;
                    return (
                      <IncomingMessage
                        key={m._id}
                        m={m}
                        ai={ai}
                        showSummaryAsMain={showSummaryAsMain}
                        avatarUrl={group.avatarUrl}
                        contactName={group.contactName}
                      />
                    );
                  }
                  return (
                    <div key={m._id} className="flex justify-end">
                      <div
                        className="max-w-[78%] px-3 py-2 text-[13px] whitespace-pre-wrap break-words text-[#e8e8e8]"
                        style={{ background: "#131313", border: "1.5px solid #2a2a2a", borderRight: "3px solid #e8e8e8" }}
                      >
                        {m.content}
                        <div className="font-mono text-[9px] mt-1.5 text-[#555]">
                          {m.via === "manual" ? "✍ manual · " : "⬡ auto · "}
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

          {/* Preview adjunto */}
          {attachment && (
            <div className="flex items-center gap-2 px-4 py-2 border-t border-[#1a1a1a] bg-[#0f0f0f]">
              {attachment.preview ? (
                <img src={attachment.preview} alt="" className="h-10 w-10 object-cover bg-[#131313]" />
              ) : (
                <span className="font-mono text-[#555] text-[18px]">📎</span>
              )}
              <span className="font-mono text-[10px] text-[#aaa] truncate flex-1">{attachment.filename}</span>
              <button
                type="button"
                onClick={clearAttachment}
                className="font-mono text-[10px] text-[#555] hover:text-[#e8e8e8] px-1.5 transition-colors"
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={send} className="flex items-stretch border-t border-[#1a1a1a] bg-[#0a0a0a]">
            <div className="flex-1 flex items-center gap-3 px-4 py-3">
              <AriaBadge className="text-[#555] shrink-0" />
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={attachment ? "Añade una descripción (opcional)..." : "escribe una respuesta..."}
                className="flex-1 bg-transparent text-[#e8e8e8] outline-none text-[13px] placeholder:text-[#555] placeholder:font-mono placeholder:text-[11px]"
              />
            </div>
            <div className="flex items-center gap-0 border-l border-[#1a1a1a]">
              {/* Input file oculto */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt"
                onChange={handleFileSelect}
                className="hidden"
              />
              {/* Botón adjunto */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Adjuntar archivo"
                className="h-9 w-9 flex items-center justify-center text-[#555] hover:text-[#aaa] transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <div className="border-l border-[#1a1a1a]">
                <EmojiPicker
                  placement="top"
                  onPick={(emoji) => {
                    const input = inputRef.current;
                    if (!input) { setText((prev) => prev + emoji); return; }
                    const start = input.selectionStart ?? text.length;
                    const end = input.selectionEnd ?? text.length;
                    const newText = text.slice(0, start) + emoji + text.slice(end);
                    setText(newText);
                    setTimeout(() => {
                      const pos = start + emoji.length;
                      input.setSelectionRange(pos, pos);
                      input.focus();
                    }, 0);
                  }}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={sending || (!text.trim() && !attachment)}
              className="font-mono text-[10px] uppercase tracking-wider px-5 bg-[#e8e8e8] text-[#0c0c0c] border-l border-[#1a1a1a] disabled:opacity-25 hover:bg-[#d0d0d0] transition-colors"
            >
              {sending ? "···" : "Enviar"}
            </button>
          </form>
          {sendError && (
            <p className="font-mono px-4 pb-3 text-[9px] uppercase tracking-wider text-[#555]">{sendError}</p>
          )}
        </>
      )}
    </div>
  );
}

export default function Conversaciones() {
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

  // Refresco silencioso: actualiza datos sin setLoading(true) para que
  // Conversation no se desmonte y no pierda el tab activo.
  const refresh = async () => {
    try {
      const [cms, recs] = await Promise.all([
        api.getContactsWithMessages(),
        api.getRecados(),
      ]);
      setContactsWithMsgs(cms);
      setRecados(recs);
    } catch { /* silencioso */ }
  };

  useEffect(() => { load(); }, []);

  const groups = mergeData(contactsWithMsgs, recados);

  return (
    <div>
      <h1 className="font-mono text-[11px] uppercase tracking-widest text-[#e8e8e8] mb-5">
        Conversaciones
      </h1>

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
      {!loading && !error && groups.length === 0 && (
        <p className="font-mono text-center text-[#555] py-12 text-[11px] uppercase tracking-wider">
          Sin conversaciones.
        </p>
      )}

      {!loading && !error && groups.length > 0 && (
        <ul className="border border-[#1a1a1a] divide-y divide-[#1a1a1a]">
          {groups.map((g) => {
            const expanded = open === g.contactId;
            return (
              <li
                key={g.contactId}
                className="bg-[#0f0f0f] overflow-hidden"
                style={{ borderLeft: expanded ? "3px solid #e8e8e8" : "3px solid transparent" }}
              >
                <button
                  onClick={() => setOpen(expanded ? null : g.contactId)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-[#131313] transition-colors"
                >
                  <Avatar url={g.avatarUrl} name={g.contactName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-1">
                      <p className="font-mono text-[12px] text-[#e8e8e8] truncate">{g.contactName}</p>
                      {g.hasRecados && <PriorityBadge priority={g.topPriority} />}
                      {g.unread > 0 && (
                        <span className="font-mono inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 text-[9px] font-bold text-[#0c0c0c] bg-[#e8e8e8]">
                          {g.unread}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#555] truncate leading-snug">{g.lastMessage}</p>
                    <p className="font-mono text-[9px] text-[#333] mt-1">
                      {new Date(g.lastAt).toLocaleString("es")}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[#555] text-[11px]">
                    {expanded ? "▾" : "▸"}
                  </span>
                </button>
                {expanded && <Conversation group={g} onRefresh={refresh} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
