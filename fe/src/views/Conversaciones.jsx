import { useState, useEffect, useRef } from "react";
import { api } from "../api/client";
import AriaBadge from "../components/AriaBadge";
import EmojiPicker from "../components/EmojiPicker";
import Avatar from "../components/Avatar";
import LazyMedia from "../components/LazyMedia";

const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const PRIORITY_META = {
  alta: { label: "Alta", cls: "ds-priority-badge alta", rank: 0 },
  media: { label: "Media", cls: "ds-priority-badge media", rank: 1 },
  baja: { label: "Baja", cls: "ds-priority-badge baja", rank: 2 },
};

function PriorityBadge({ priority }) {
  const p = PRIORITY_META[priority] || PRIORITY_META.media;
  return (
    <span className={p.cls}>
      {priority?.toUpperCase() ?? "MEDIA"}
    </span>
  );
}

const rank = (p) => PRIORITY_META[p]?.rank ?? 1;

function packRecados(list) {
  const unread = list.filter((r) => !r.read).length;
  const topPriority = list.reduce(
    (best, r) => (rank(r.priority) < rank(best) ? r.priority : best),
    "baja"
  );
  const recados = [...list].sort(
    (a, b) => rank(a.priority) - rank(b.priority) || new Date(b.createdAt) - new Date(a.createdAt)
  );
  return { recados, unread, topPriority, hasRecados: recados.length > 0 };
}

function mergeData(contactsWithMsgs, recados) {
  const recadosByContact = new Map();
  for (const r of recados) {
    if (!recadosByContact.has(r.contactId)) recadosByContact.set(r.contactId, []);
    recadosByContact.get(r.contactId).push(r);
  }

  const fromMsgs = contactsWithMsgs.map((c) => {
    const packed = packRecados(recadosByContact.get(c.contactId) || []);
    return {
      contactId: c.contactId,
      contactName: c.contactName,
      lastMessage: c.lastMessage,
      lastAt: new Date(c.lastAt).getTime(),
      avatarUrl: c.avatarUrl || "",
      ...packed,
    };
  });

  const seen = new Set(fromMsgs.map((c) => c.contactId));
  const extras = [];
  for (const [contactId, list] of recadosByContact) {
    if (seen.has(contactId)) continue;
    const latest = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    extras.push({
      contactId,
      contactName: latest.contactName || contactId,
      lastMessage: latest.content,
      lastAt: new Date(latest.createdAt).getTime(),
      avatarUrl: "",
      ...packRecados(list),
    });
  }

  return [...fromMsgs, ...extras].sort((a, b) => b.lastAt - a.lastAt);
}

/** Chip de interpretación IA bajo cada mensaje entrante.
 *  hideSummary: cuando el summary ya se muestra como contenido principal de la burbuja. */
function AiChip({ ai, hideSummary = false }) {
  if (!ai || ai.isRecado === null || ai.isRecado === undefined) return null;

  if (ai.isRecado) {
    const p = PRIORITY_META[ai.priority] || PRIORITY_META.media;
    return (
      <div className="ds-ai-chip">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", marginBottom: "var(--ds-space-1)" }}>
          <span className="ds-ai-label">IA</span>
          <span className={p.cls}>
            RECADO · {ai.priority?.toUpperCase()}
          </span>
        </div>
        {!hideSummary && ai.summary && (
          <p style={{ fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", fontStyle: "italic", lineHeight: 1.4 }}>{ai.summary}</p>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: "var(--ds-space-2)" }}>
      <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-border)" }}>IA · msj normal</span>
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
    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ds-space-2)" }}>
      <Avatar url={avatarUrl} name={contactName} size={28} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0, flex: 1 }}>
        <div className="ds-msg-bubble incoming">
          {/* Medio visual (imagen, sticker, gif) */}
          {m.mediaData && m.mediaType && (
            <LazyMedia data={m.mediaData} type={m.mediaType} />
          )}
          {/* Contenido principal: caption o interpretación IA.
              Si hay mediaData y el texto es solo la etiqueta genérica, no se muestra
              (la imagen ya lo dice todo). */}
          {(() => {
            const isGenericLabel = m.mediaData && m.content?.startsWith("(el contacto envió");
            const displayText = showSummaryAsMain ? ai.summary : (isGenericLabel ? null : m.content);
            return displayText ? <p style={{ lineHeight: 1.4 }}>{displayText}</p> : null;
          })()}

          {/* Toggle transcripción original (solo audios con resumen IA) */}
          {showSummaryAsMain && (
            <div style={{ marginTop: "var(--ds-space-2)" }}>
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
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
                {showRaw ? "▾ Mensaje original" : "▸ Mensaje original"}
              </button>
              {showRaw && (
                <p style={{ marginTop: "var(--ds-space-1)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", fontStyle: "italic", borderLeft: "2px solid var(--ds-border)", paddingLeft: "var(--ds-space-2)", lineHeight: 1.4 }}>
                  {m.content}
                </p>
              )}
            </div>
          )}

          <div className="ds-msg-meta">
            {m.isTranscribed && <span style={{ marginRight: "var(--ds-space-1)" }}>🎙</span>}
            {new Date(m.createdAt).toLocaleString("es")}
          </div>
        </div>
        <AiChip ai={ai} hideSummary={showSummaryAsMain} />
      </div>
    </div>
  );
}

function Conversation({ group, onRefresh, active = true }) {
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
  const sendingRef = useRef(false);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const loadMessages = async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const msgs = await api.getMessages(group.contactId);
        if (cancelled || sendingRef.current) return;
        setMessages(msgs);
        readyRef.current = true;
        if (silent) setError(null);
      } catch {
        if (!cancelled && !silent) setError("No se pudo cargar la conversación.");
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };
    loadMessages({ silent: readyRef.current });
    const id = setInterval(() => {
      if (document.hidden || sendingRef.current) return;
      loadMessages({ silent: true });
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [group.contactId, active]);

  const lastMsgId = messages?.[messages.length - 1]?._id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lastMsgId]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setSendError(null);

    const isImage = file.type.startsWith("image/");
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (file.size > limit) {
      const mb = Math.round(limit / (1024 * 1024));
      setSendError(`El archivo supera ${mb} MB.`);
      return;
    }

    const fail = (msg) => setSendError(msg || "No se pudo leer el archivo.");
    const finalize = (base64, mimetype, filename, preview) => {
      if (!base64) {
        fail("No se pudo procesar el archivo.");
        return;
      }
      setAttachment({ base64, filename, mimetype, preview });
    };

    if (isImage) {
      const reader = new FileReader();
      reader.onerror = () => fail("No se pudo leer la imagen.");
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 1200;
          const scale = Math.min(1, MAX / Math.max(img.width || 1, img.height || 1));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          const keepAlpha = file.type === "image/png" || file.type === "image/webp";
          if (!keepAlpha) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const mime = keepAlpha ? "image/png" : "image/jpeg";
          const dataUrl = keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.8);
          const ext = keepAlpha ? ".png" : ".jpg";
          const name = file.name.replace(/\.[^.]+$/, ext);
          finalize(dataUrl.split(",")[1], mime, name, dataUrl);
        };
        img.onerror = () => fail("Formato de imagen no soportado.");
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onerror = () => fail("No se pudo leer el archivo.");
      reader.onload = (ev) => {
        const dataUrl = ev.target.result || "";
        finalize(String(dataUrl).split(",")[1], file.type, file.name, null);
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
    sendingRef.current = true;
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
    } catch (err) {
      setSendError(err?.message || "No se pudo enviar. ¿WhatsApp está conectado?");
    } finally {
      sendingRef.current = false;
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
    <div style={{ borderTop: "1px solid var(--ds-border)", background: "var(--ds-bg)" }}>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div className="ds-tab-nav">
        {[
          { id: "recados", label: `Recados${group.recados.length ? ` (${group.recados.length})` : ""}` },
          { id: "mensajes", label: "Mensajes" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="ds-tab-btn"
            style={{
              color: tab === t.id ? "var(--ds-text-strong)" : "var(--ds-text-faint)",
              borderBottom: tab === t.id ? "3px solid var(--ds-accent)" : "3px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Pestaña: Recados ────────────────────────────────────────────── */}
      {tab === "recados" && (
        <div style={{ padding: "var(--ds-space-3) var(--ds-space-4)" }}>
          {group.recados.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--ds-text-faint)", padding: "var(--ds-space-6) 0", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase" }}>
              Sin recados.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--ds-space-2)" }}>
                <button
                  type="button"
                  onClick={() => setShowOriginals((v) => !v)}
                  style={{
                    fontFamily: "var(--ds-font-body)",
                    fontWeight: "var(--ds-fw-regular)",
                    fontSize: "var(--ds-fs-xs)",
                    letterSpacing: "var(--ds-ls-caps)",
                    textTransform: "uppercase",
                    padding: "var(--ds-space-1) var(--ds-space-2)",
                    border: "1px solid var(--ds-border-soft)",
                    background: showOriginals ? "var(--ds-surface)" : "transparent",
                    color: showOriginals ? "var(--ds-text-strong)" : "var(--ds-text-faint)",
                    cursor: "pointer",
                    transition: "color var(--ds-dur-hover), border-color var(--ds-dur-hover)",
                  }}
                  onMouseEnter={(e) => { if (!showOriginals) e.currentTarget.style.borderColor = "var(--ds-border)"; }}
                  onMouseLeave={(e) => { if (!showOriginals) e.currentTarget.style.borderColor = "var(--ds-border-soft)"; }}
                >
                  {showOriginals ? "▾ Originales" : "▸ Ver originales"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
                {group.recados.map((r) => {
                  const hasOriginal = r.originalContent && r.originalContent !== r.content;
                  return (
                    <div
                      key={r._id}
                      className={`ds-recado-card ${r.read ? "" : "unread"}`}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--ds-space-2)" }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", marginBottom: "var(--ds-space-1)" }}>
                            <PriorityBadge priority={r.priority} />
                            <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)" }}>
                              {new Date(r.createdAt).toLocaleString("es")}
                            </span>
                          </div>
                          <p style={{ fontSize: "var(--ds-fs-sm)", lineHeight: 1.4, color: r.read ? "var(--ds-text-faint)" : "var(--ds-text-strong)" }}>
                            {r.content}
                          </p>
                          {showOriginals && hasOriginal && (
                            <div style={{ marginTop: "var(--ds-space-2)", borderLeft: "2px solid var(--ds-border)", paddingLeft: "var(--ds-space-3)" }}>
                              <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-label)", textTransform: "uppercase", color: "var(--ds-text-faint)", marginBottom: "var(--ds-space-1)" }}>Original</p>
                              <p style={{ fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", whiteSpace: "pre-wrap", wordBreak: "break-words" }}>{r.originalContent}</p>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => toggleRead(r)}
                          style={{
                            fontFamily: "var(--ds-font-body)",
                            fontWeight: "var(--ds-fw-regular)",
                            fontSize: "var(--ds-fs-xs)",
                            letterSpacing: "var(--ds-ls-caps)",
                            textTransform: "uppercase",
                            padding: "var(--ds-space-1) var(--ds-space-2)",
                            border: "1px solid var(--ds-border-soft)",
                            background: "transparent",
                            color: r.read ? "var(--ds-text-faint)" : "var(--ds-text-strong)",
                            cursor: "pointer",
                            transition: "color var(--ds-dur-hover), border-color var(--ds-dur-hover)",
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--ds-border)"}
                          onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--ds-border-soft)"}
                        >
                          {r.read ? "Sin leer" : "Leído"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Pestaña: Mensajes + responder ───────────────────────────────── */}
      {tab === "mensajes" && (
        <>
          <div className="ds-msg-thread">
            {loading && (
              <p style={{ textAlign: "center", color: "var(--ds-text-faint)", padding: "var(--ds-space-6) 0", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase" }}>
                Cargando...
              </p>
            )}
            {error && (
              <p style={{ textAlign: "center", color: "var(--ds-text-faint)", padding: "var(--ds-space-6) 0", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase" }}>
                {error}
              </p>
            )}
            {!loading && !error && messages?.length === 0 && (
              <p style={{ textAlign: "center", color: "var(--ds-text-faint)", padding: "var(--ds-space-6) 0", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase" }}>
                Sin mensajes registrados.
              </p>
            )}
            {!loading && !error && messages?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
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
                    <div key={m._id} style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div className="ds-msg-bubble outgoing" style={{ maxWidth: "78%" }}>
                        {m.mediaData && m.mediaType && (
                          <LazyMedia data={m.mediaData} type={m.mediaType} />
                        )}
                        {m.content && !(m.mediaData && /^\[.+\]$/.test(m.content)) ? (
                          <p style={{ lineHeight: 1.4 }}>{m.content}</p>
                        ) : null}
                        <div className="ds-msg-meta">
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
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", padding: "var(--ds-space-2) var(--ds-space-4)", borderTop: "1px solid var(--ds-border)", background: "var(--ds-surface)" }}>
              {attachment.preview ? (
                <img src={attachment.preview} alt="" style={{ height: "40px", width: "40px", objectFit: "cover", background: "var(--ds-bg)" }} />
              ) : (
                <span style={{ fontFamily: "var(--ds-font-body)", color: "var(--ds-text-faint)", fontSize: "18px" }}>📎</span>
              )}
              <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{attachment.filename}</span>
              <button
                type="button"
                onClick={clearAttachment}
                style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", padding: "var(--ds-space-1)", background: "none", border: "none", cursor: "pointer", transition: "color var(--ds-dur-hover)" }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--ds-text-strong)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--ds-text-faint)"}
              >
                ✕
              </button>
            </div>
          )}

          <form onSubmit={send} style={{ display: "flex", alignItems: "stretch", borderTop: "1px solid var(--ds-border)", background: "var(--ds-bg)" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "var(--ds-space-3)", padding: "var(--ds-space-3) var(--ds-space-4)" }}>
              <AriaBadge className="text-[var(--ds-text-faint)] shrink-0" />
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={attachment ? "Añade una descripción (opcional)..." : "escribe una respuesta..."}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "var(--ds-text-strong)",
                  outline: "none",
                  fontSize: "var(--ds-fs-sm)",
                  fontFamily: "var(--ds-font-body)",
                  fontWeight: "var(--ds-fw-regular)",
                  border: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", borderLeft: "1px solid var(--ds-border)" }}>
              {/* Input file oculto */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              {/* Botón adjunto */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Adjuntar archivo"
                style={{
                  height: "36px",
                  width: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--ds-text-faint)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  transition: "color var(--ds-dur-hover)",
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = "var(--ds-text-muted)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "var(--ds-text-faint)"}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <div style={{ borderLeft: "1px solid var(--ds-border)" }}>
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
              className="ds-btn-primary"
              style={{
                fontFamily: "var(--ds-font-body)",
                fontWeight: "var(--ds-fw-medium)",
                fontSize: "var(--ds-fs-xs)",
                letterSpacing: "var(--ds-ls-caps)",
                textTransform: "uppercase",
                padding: "var(--ds-space-3) var(--ds-space-5)",
                background: "var(--ds-accent)",
                color: "#fff",
                border: "none",
                borderLeft: "1px solid var(--ds-border)",
                cursor: "pointer",
                opacity: sending || (!text.trim() && !attachment) ? 0.25 : 1,
                transition: "opacity var(--ds-dur-hover)",
              }}
              onMouseEnter={(e) => { if (!sending && (text.trim() || attachment)) e.currentTarget.style.opacity = 0.8; }}
              onMouseLeave={(e) => { if (!sending && (text.trim() || attachment)) e.currentTarget.style.opacity = 1; }}
            >
              {sending ? "···" : "Enviar"}
            </button>
          </form>
          {sendError && (
            <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase", color: "var(--ds-text-faint)", padding: "0 var(--ds-space-4)", paddingBottom: "var(--ds-space-3)" }}>{sendError}</p>
          )}
        </>
      )}
    </div>
  );
}

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
      setError(null);
    } catch { /* silencioso: el poll no pisa el error de la carga inicial */ }
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

  const groups = mergeData(contactsWithMsgs, recados);

  return (
    <div>
      <h1 className="ds-display" style={{ fontSize: "var(--ds-fs-sm)", marginBottom: "var(--ds-space-4)", color: "var(--ds-text-strong)" }}>
        Conversaciones
      </h1>

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
      {!loading && !error && groups.length === 0 && (
        <p style={{ textAlign: "center", color: "var(--ds-text-faint)", padding: "var(--ds-space-12) 0", fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-caps)", textTransform: "uppercase" }}>
          Sin conversaciones.
        </p>
      )}

      {!loading && !error && groups.length > 0 && (
        <div className="ds-list">
          {groups.map((g) => {
            const expanded = open === g.contactId;
            return (
              <div
                key={g.contactId}
                className={`ds-list-item ${expanded ? "active" : ""}`}
              >
                <button
                  onClick={() => setOpen(expanded ? null : g.contactId)}
                  className="ds-list-item-content"
                >
                  <Avatar url={g.avatarUrl} name={g.contactName} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", marginBottom: "var(--ds-space-1)" }}>
                      <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-sm)", color: "var(--ds-text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.contactName}</p>
                      {g.hasRecados && <PriorityBadge priority={g.topPriority} />}
                      {g.unread > 0 && (
                        <span className="ds-counter-badge">
                          {g.unread}
                        </span>
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
