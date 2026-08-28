import { useState, useEffect, useRef } from "react";
import { api } from "../../api/client";
import AriaBadge from "../../components/AriaBadge";
import EmojiPicker from "../../components/EmojiPicker";
import PriorityBadge from "../../components/PriorityBadge";
import IncomingMessage, { OutgoingMessage } from "./IncomingMessage";

/** Tope único: nginx 12M y Express 12mb cubren 8 MB de archivo en Base64 (~11 MB). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = (ev) => resolve(ev.target.result || "");
    reader.readAsDataURL(file);
  });
}

async function prepareAttachment(file) {
  const isImage = file.type.startsWith("image/");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`El archivo supera ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
  }
  if (!isImage) {
    const dataUrl = String(await readFileAsDataUrl(file));
    const base64 = dataUrl.split(",")[1];
    if (!base64) throw new Error("No se pudo procesar el archivo.");
    return { base64, filename: file.name, mimetype: file.type, preview: null };
  }

  const dataUrl = String(await readFileAsDataUrl(file));
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Formato de imagen no soportado."));
    el.src = dataUrl;
  });
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
  const out = keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.8);
  const ext = keepAlpha ? ".png" : ".jpg";
  const base64 = out.split(",")[1];
  if (!base64) throw new Error("No se pudo procesar el archivo.");
  return { base64, filename: file.name.replace(/\.[^.]+$/, ext), mimetype: mime, preview: out };
}

function RecadosPanel({ recados, showOriginals, setShowOriginals, onToggleRead }) {
  if (recados.length === 0) {
    return <p className="ds-empty compact">Sin recados.</p>;
  }
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--ds-space-2)" }}>
        <button
          type="button"
          onClick={() => setShowOriginals((v) => !v)}
          className="ds-ghost-btn bordered"
          style={{ background: showOriginals ? "var(--ds-surface)" : "transparent", color: showOriginals ? "var(--ds-text-strong)" : "var(--ds-text-faint)" }}
        >
          {showOriginals ? "▾ Originales" : "▸ Ver originales"}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-2)" }}>
        {recados.map((r) => {
          const hasOriginal = r.originalContent && r.originalContent !== r.content;
          return (
            <div key={r._id} className={`ds-recado-card ${r.read ? "" : "unread"}`}>
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
                      <p className="ds-empty" style={{ padding: 0, marginBottom: "var(--ds-space-1)", textAlign: "left" }}>Original</p>
                      <p style={{ fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-faint)", whiteSpace: "pre-wrap", wordBreak: "break-words" }}>{r.originalContent}</p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onToggleRead(r)}
                  className="ds-ghost-btn bordered"
                  style={{ color: r.read ? "var(--ds-text-faint)" : "var(--ds-text-strong)", flexShrink: 0 }}
                >
                  {r.read ? "Sin leer" : "Leído"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function Conversation({ group, onRefresh, active = true }) {
  const [tab, setTab] = useState("recados");
  const [messages, setMessages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [showOriginals, setShowOriginals] = useState(false);
  const [attachment, setAttachment] = useState(null);
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

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setSendError(null);
    try {
      setAttachment(await prepareAttachment(file));
    } catch (err) {
      setSendError(err?.message || "No se pudo leer el archivo.");
    }
  };

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

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    if (!input) {
      setText((prev) => prev + emoji);
      return;
    }
    const start = input.selectionStart ?? text.length;
    const end = input.selectionEnd ?? text.length;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);
    setTimeout(() => {
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
      input.focus();
    }, 0);
  };

  return (
    <div style={{ borderTop: "1px solid var(--ds-border)", background: "var(--ds-bg)" }}>
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

      {tab === "recados" && (
        <div style={{ padding: "var(--ds-space-3) var(--ds-space-4)" }}>
          <RecadosPanel
            recados={group.recados}
            showOriginals={showOriginals}
            setShowOriginals={setShowOriginals}
            onToggleRead={toggleRead}
          />
        </div>
      )}

      {tab === "mensajes" && (
        <>
          <div className="ds-msg-thread">
            {loading && <p className="ds-empty compact">Cargando...</p>}
            {error && <p className="ds-empty compact">{error}</p>}
            {!loading && !error && messages?.length === 0 && (
              <p className="ds-empty compact">Sin mensajes registrados.</p>
            )}
            {!loading && !error && messages?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--ds-space-4)" }}>
                {messages.map((m) => {
                  if (m.role !== "assistant") {
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
                  return <OutgoingMessage key={m._id} m={m} />;
                })}
                <div ref={endRef} />
              </div>
            )}
          </div>

          {attachment && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--ds-space-2)", padding: "var(--ds-space-2) var(--ds-space-4)", borderTop: "1px solid var(--ds-border)", background: "var(--ds-surface)" }}>
              {attachment.preview ? (
                <img src={attachment.preview} alt="" style={{ height: "40px", width: "40px", objectFit: "cover", background: "var(--ds-bg)" }} />
              ) : (
                <span style={{ fontFamily: "var(--ds-font-body)", color: "var(--ds-text-faint)", fontSize: "18px" }}>📎</span>
              )}
              <span style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", color: "var(--ds-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{attachment.filename}</span>
              <button type="button" onClick={() => setAttachment(null)} className="ds-ghost-btn">✕</button>
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Adjuntar archivo (máx. 8 MB)"
                className="ds-icon-btn"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <div style={{ borderLeft: "1px solid var(--ds-border)" }}>
                <EmojiPicker placement="top" onPick={insertEmoji} />
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
            >
              {sending ? "···" : "Enviar"}
            </button>
          </form>
          {sendError && <p className="ds-empty compact" style={{ textAlign: "left", padding: "0 var(--ds-space-4) var(--ds-space-3)" }}>{sendError}</p>}
        </>
      )}
    </div>
  );
}
