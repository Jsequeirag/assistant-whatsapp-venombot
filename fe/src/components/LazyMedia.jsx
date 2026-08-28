import { useEffect, useRef, useState } from "react";

/** Carga el medio al acercarse al viewport. Prefiere `src` (URL); `data` es Base64 legado. */
export default function LazyMedia({ src, data, type, alt = "" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    if (src) {
      setUrl(src);
      return undefined;
    }
    if (!data || !type) return undefined;
    let blobUrl;
    try {
      const bin = atob(data);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      blobUrl = URL.createObjectURL(new Blob([bytes], { type }));
      setUrl(blobUrl);
    } catch {
      setUrl(null);
    }
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [visible, src, data, type]);

  const isVideo = type === "video/mp4" || (type || "").startsWith("video/");
  const frame = {
    maxWidth: "220px",
    maxHeight: "220px",
    objectFit: "contain",
    minHeight: "80px",
    background: "var(--ds-bg)",
  };

  return (
    <div ref={ref} style={{ marginBottom: "var(--ds-space-2)", minHeight: 80 }}>
      {!url ? (
        <div style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ds-text-faint)", fontSize: "var(--ds-fs-xs)" }}>
          {visible ? "…" : ""}
        </div>
      ) : isVideo ? (
        <video src={url} autoPlay loop muted playsInline style={frame} />
      ) : (
        <img src={url} alt={alt} style={frame} />
      )}
    </div>
  );
}
