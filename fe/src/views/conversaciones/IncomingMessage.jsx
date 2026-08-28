import { useState } from "react";
import Avatar from "../../components/Avatar";
import LazyMedia from "../../components/LazyMedia";
import { PRIORITY_META } from "../../components/PriorityBadge";

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
      <span className="ds-empty" style={{ padding: 0, display: "inline" }}>IA · msj normal</span>
    </div>
  );
}

export default function IncomingMessage({ m, ai, showSummaryAsMain, avatarUrl, contactName }) {
  const [showRaw, setShowRaw] = useState(false);
  const isGenericLabel = m.mediaUrl && m.content?.startsWith("(el contacto envió");
  const displayText = showSummaryAsMain ? ai.summary : (isGenericLabel ? null : m.content);

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--ds-space-2)" }}>
      <Avatar url={avatarUrl} name={contactName} size={28} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", minWidth: 0, flex: 1 }}>
        <div className="ds-msg-bubble incoming">
          {m.mediaUrl && m.mediaType && (
            <LazyMedia src={m.mediaUrl} type={m.mediaType} />
          )}
          {displayText ? <p style={{ lineHeight: 1.4 }}>{displayText}</p> : null}

          {showSummaryAsMain && (
            <div style={{ marginTop: "var(--ds-space-2)" }}>
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="ds-ghost-btn"
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

export function OutgoingMessage({ m }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div className="ds-msg-bubble outgoing" style={{ maxWidth: "78%" }}>
        {m.mediaUrl && m.mediaType && (
          <LazyMedia src={m.mediaUrl} type={m.mediaType} />
        )}
        {m.content && !(m.mediaUrl && /^\[.+\]$/.test(m.content)) ? (
          <p style={{ lineHeight: 1.4 }}>{m.content}</p>
        ) : null}
        <div className="ds-msg-meta">
          {m.via === "manual" ? "✍ manual · " : "⬡ auto · "}
          {new Date(m.createdAt).toLocaleString("es")}
        </div>
      </div>
    </div>
  );
}
