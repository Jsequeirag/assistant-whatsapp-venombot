/** Genera la URL de avatar DiceBear a partir del nombre (seed determinístico). */
function dicebearUrl(seed) {
  const s = String(seed || "default").trim() || "default";
  return `https://api.dicebear.com/10.x/bottts-neutral/svg?seed=${encodeURIComponent(s)}`;
}

function localAvatarUrl(contactId) {
  return `/api/contacts/${encodeURIComponent(contactId)}/avatar`;
}

function httpUrl(value) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return /^https?:\/\//i.test(t) ? t : null;
}

/**
 * Normaliza lo que devuelve VenomBot / WhatsApp Web (string, eurl, imgFull, …)
 * a una URL http(s) o null si no hay foto.
 */
function extractProfilePicUrl(raw) {
  if (!raw) return null;
  const direct = httpUrl(raw);
  if (direct) return direct;
  if (typeof raw !== "object") return null;

  const nested = raw.data && typeof raw.data === "object" ? raw.data : raw.result;
  const bag = nested && typeof nested === "object" ? { ...raw, ...nested } : raw;
  for (const key of ["eurl", "imgFull", "imgUrl", "previewEurl", "full", "url", "img"]) {
    const found = httpUrl(bag[key]);
    if (found) return found;
  }
  return null;
}

function picFromSender(sender) {
  if (!sender || typeof sender !== "object") return null;
  return (
    extractProfilePicUrl(sender.profilePicThumbObj) ||
    extractProfilePicUrl(sender.profilePicThumb) ||
    extractProfilePicUrl(sender.profilePicUrl) ||
    extractProfilePicUrl(sender)
  );
}

module.exports = {
  dicebearUrl,
  localAvatarUrl,
  extractProfilePicUrl,
  picFromSender,
};
