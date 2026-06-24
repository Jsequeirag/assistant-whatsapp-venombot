import { useMemo } from "react";

const PARTICLES = 24;

const GREENS = [
  "#052e16",
  "#14532d",
  "#166534",
  "#15803d",
  "#16a34a",
  "#22c55e",
  "#4ade80",
  "#86efac",
  "#bbf7d0",
];

export default function TetrisFlow() {
  const particles = useMemo(() => {
    return Array.from({ length: PARTICLES }, (_, i) => ({
      id: i,
      size: 4 + Math.random() * 8,
      top: Math.random() * 100,
      duration: 6 + Math.random() * 10,
      delay: Math.random() * -12,
      opacity: 0.12 + Math.random() * 0.22,
      color: GREENS[Math.floor(Math.random() * GREENS.length)],
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute will-change-transform"
          style={{
            width: p.size,
            height: p.size,
            top: `${p.top}%`,
            left: "-20px",
            backgroundColor: p.color,
            opacity: p.opacity,
            animation: `tetrisFlow ${p.duration}s linear ${p.delay}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes tetrisFlow {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(calc(100vw + 40px));
          }
        }
      `}</style>
    </div>
  );
}
