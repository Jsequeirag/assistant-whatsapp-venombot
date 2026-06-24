import { useMemo, useState, useEffect } from "react";

const GRID = 5;

export default function TetrisLogo({
  size = 44,
  srcs = ["/logo.png"],
  interval = 3000,
}) {
  const [hovered, setHovered] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (srcs.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % srcs.length);
    }, interval);
    return () => clearInterval(id);
  }, [srcs, interval]);

  const currentSrc = srcs[index];

  const cells = useMemo(() => {
    return Array.from({ length: GRID * GRID }, (_, i) => {
      const row = Math.floor(i / GRID);
      const col = i % GRID;
      const angle = Math.random() * Math.PI * 2;
      const distance = 30 + Math.random() * 60;
      const rotate = (Math.random() - 0.5) * 120;
      return {
        row,
        col,
        tx: Math.cos(angle) * distance,
        ty: Math.sin(angle) * distance,
        rotate,
        delay: Math.random() * 0.15,
      };
    });
  }, []);

  return (
    <div
      className="relative cursor-pointer"
      style={{ width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          className="absolute top-0 left-0"
          style={{
            width: size / GRID,
            height: size / GRID,
            transform: hovered
              ? `translate(${cell.tx}px, ${cell.ty}px) rotate(${cell.rotate}deg) scale(0.6)`
              : "translate(0, 0) rotate(0deg) scale(1)",
            opacity: hovered ? 0 : 1,
            transition: `transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) ${cell.delay}s, opacity 0.35s ease ${cell.delay}s`,
            backgroundImage: `url(${currentSrc})`,
            backgroundSize: `${size}px ${size}px`,
            backgroundPosition: `${-cell.col * (size / GRID)}px ${-cell.row * (size / GRID)}px`,
            backgroundRepeat: "no-repeat",
            left: cell.col * (size / GRID),
            top: cell.row * (size / GRID),
          }}
        />
      ))}
    </div>
  );
}
