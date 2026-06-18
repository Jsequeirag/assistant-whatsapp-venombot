import { useState, useRef, useEffect } from "react";

// Paleta curada de emojis comunes para motivos/contextos de ausencia.
// Sin dependencias externas (evita problemas de instalación por TLS del entorno).
const CATS = {
  Caras: ["😀", "🙂", "😅", "😊", "😇", "🤔", "😴", "😪", "🥱", "😎", "🤒", "🤕", "🥳", "😌"],
  Estados: ["🔕", "😶", "💤", "✈️", "🏖️", "🍽️", "☕", "🏥", "💼", "📵", "⏰", "📅", "🚗", "🏃"],
  Símbolos: ["✅", "❌", "⚠️", "📌", "📝", "💬", "👍", "🙏", "❤️", "🎉", "⭐", "🔥", "💪", "🤝"],
};

export default function EmojiPicker({ onPick }) {
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
        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-md border border-gray-200 text-lg hover:bg-gray-50 transition-colors"
      >
        😊
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2">
          {Object.entries(CATS).map(([cat, emojis]) => (
            <div key={cat} className="mb-2 last:mb-0">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 px-1 mb-1">{cat}</p>
              <div className="grid grid-cols-7 gap-0.5">
                {emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onPick(e); setOpen(false); }}
                    className="h-8 w-8 flex items-center justify-center rounded text-lg hover:bg-gray-100 transition-colors"
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
