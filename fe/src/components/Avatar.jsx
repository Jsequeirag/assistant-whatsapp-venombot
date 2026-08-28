import { useEffect, useState } from "react";

/** Avatar circular. Si la URL falla (DiceBear caído, sin red), muestra la inicial. */
export default function Avatar({ url, name, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").charAt(0).toUpperCase();

  useEffect(() => {
    setBroken(false);
  }, [url]);

  if (!url || broken) {
    return (
      <div
        className="ds-avatar-circle ds-avatar-initial"
        style={{ width: size, height: size, flexShrink: 0 }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="ds-avatar-circle"
      style={{ width: size, height: size, flexShrink: 0 }}
      onError={() => setBroken(true)}
    />
  );
}
