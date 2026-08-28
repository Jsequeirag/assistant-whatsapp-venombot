import { useState, useRef, useEffect } from "react";

const CATS = {
  Caras: ["😀", "🙂", "😅", "😊", "😇", "🤔", "😴", "😪", "🥱", "😎", "🤒", "🤕", "🥳", "😌"],
  Estados: ["🔕", "😶", "💤", "✈️", "🏖️", "🍽️", "☕", "🏥", "💼", "📵", "⏰", "📅", "🚗", "🏃"],
  Símbolos: ["✅", "❌", "⚠️", "📌", "📝", "💬", "👍", "🙏", "❤️", "🎉", "⭐", "🔥", "💪", "🤝"],
};

export default function EmojiPicker({ onPick, placement = "bottom" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Insertar emoji"
        style={{
          flexShrink: 0,
          height: "36px",
          width: "36px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid var(--ds-border-soft)",
          background: "var(--ds-surface)",
          fontSize: "18px",
          cursor: "pointer",
          transition: "border-color var(--ds-dur-hover)",
        }}
        onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--ds-border)"}
        onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--ds-border-soft)"}
      >
        😊
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            zIndex: 50,
            width: "256px",
            maxHeight: "256px",
            overflowY: "auto",
            border: "1px solid var(--ds-border)",
            background: "var(--ds-surface)",
            padding: "var(--ds-space-2)",
            ...(placement === "top" ? { bottom: "100%", marginBottom: "var(--ds-space-1)" } : { top: "100%", marginTop: "var(--ds-space-1)" }),
          }}
        >
          {Object.entries(CATS).map(([cat, emojis]) => (
            <div key={cat} style={{ marginBottom: "var(--ds-space-2)" }}>
              <p style={{ fontFamily: "var(--ds-font-body)", fontWeight: "var(--ds-fw-regular)", fontSize: "var(--ds-fs-xs)", letterSpacing: "var(--ds-ls-label)", textTransform: "uppercase", color: "var(--ds-text-faint)", padding: "var(--ds-space-1)", marginBottom: "var(--ds-space-1)" }}>{cat}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "var(--ds-space-1)" }}>
                {emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onPick(e); setOpen(false); }}
                    style={{
                      height: "32px",
                      width: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "background var(--ds-dur-hover)",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--ds-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
