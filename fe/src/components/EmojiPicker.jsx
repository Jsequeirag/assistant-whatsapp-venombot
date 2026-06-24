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
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Insertar emoji"
        className="shrink-0 h-9 w-9 flex items-center justify-center border border-[#2a2a2a] bg-[#0f0f0f] text-lg hover:border-[#333] transition-colors"
      >
        😊
      </button>
      {open && (
        <div
          className={`absolute right-0 z-50 w-64 max-h-64 overflow-y-auto border border-[#2a2a2a] bg-[#0f0f0f] p-2 ${
            placement === "top" ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {Object.entries(CATS).map(([cat, emojis]) => (
            <div key={cat} className="mb-2 last:mb-0">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#555] px-1 mb-1">{cat}</p>
              <div className="grid grid-cols-7 gap-0.5">
                {emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onPick(e); setOpen(false); }}
                    className="h-8 w-8 flex items-center justify-center text-lg hover:bg-[#1a1a1a] transition-colors"
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
