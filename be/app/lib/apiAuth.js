const crypto = require("crypto");

function tokensEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function providedToken(req) {
  const header = req.headers["x-aria-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return "";
}

/**
 * Si `token` está vacío, no exige nada (modo local sin configurar).
 * Si hay token, /api exige X-Aria-Token o Authorization: Bearer.
 */
function createApiAuth(token) {
  const expected = (token || "").trim();
  return function apiAuth(req, res, next) {
    if (!expected) return next();
    if (req.method === "OPTIONS") return next();
    if (tokensEqual(providedToken(req), expected)) return next();
    res.set("WWW-Authenticate", 'Bearer realm="Aria"');
    return res.status(401).json({ error: "No autorizado" });
  };
}

function corsOriginOption(raw, { isProd } = {}) {
  const list = String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 1) return list[0];
  if (list.length > 1) return list;
  // Sin orígenes extra: same-origin (Vite proxy / nginx). En prod no abrir a "*".
  return isProd ? false : true;
}

module.exports = { tokensEqual, providedToken, createApiAuth, corsOriginOption };
