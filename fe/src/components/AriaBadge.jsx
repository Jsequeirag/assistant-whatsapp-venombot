export default function AriaBadge({ className = "" }) {
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} aria-label="Asistente" role="img">
      {/* Contenedor */}
      <div className="relative z-10 w-7 h-7 rounded-full border border-current/30 flex items-center justify-center gap-[3px]">
        <span className="w-[3px] h-2 bg-current rounded-full animate-aria-bar-1" />
        <span className="w-[3px] h-3.5 bg-current rounded-full animate-aria-bar-2" />
        <span className="w-[3px] h-2 bg-current rounded-full animate-aria-bar-3" />
      </div>

      <style>{`
        @keyframes ariaBar {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }
        .animate-aria-bar-1 {
          animation: ariaBar 1.1s ease-in-out infinite;
          transform-origin: center;
        }
        .animate-aria-bar-2 {
          animation: ariaBar 1.1s ease-in-out 0.15s infinite;
          transform-origin: center;
        }
        .animate-aria-bar-3 {
          animation: ariaBar 1.1s ease-in-out 0.3s infinite;
          transform-origin: center;
        }
      `}</style>
    </div>
  );
}
