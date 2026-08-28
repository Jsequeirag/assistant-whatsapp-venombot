const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const MEDIA_ROOT = path.join(__dirname, "../../media");
const MAX_MEDIA_BYTES = 3.5 * 1024 * 1024;

const EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function extFor(mimeType) {
  const mime = (mimeType || "").split(";")[0].trim().toLowerCase();
  return EXT[mime] || "bin";
}

function posixJoin(...parts) {
  return parts.join("/").replace(/\\/g, "/");
}

/** Ruta absoluta bajo MEDIA_ROOT, o null si hay path traversal. */
function absolutePath(rel) {
  if (!rel || typeof rel !== "string") return null;
  const root = path.resolve(MEDIA_ROOT);
  const resolved = path.resolve(root, rel);
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(prefix)) return null;
  return resolved;
}

async function saveBuffer(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (buffer.length > MAX_MEDIA_BYTES) {
    console.warn(`⚠️  medio omitido (${buffer.length} bytes > ${MAX_MEDIA_BYTES})`);
    return null;
  }
  const now = new Date();
  const dirRel = posixJoin(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, "0"));
  const absDir = path.join(MEDIA_ROOT, ...dirRel.split("/"));
  await fsp.mkdir(absDir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString("hex")}.${extFor(mimeType)}`;
  await fsp.writeFile(path.join(absDir, name), buffer);
  return posixJoin(dirRel, name);
}

function avatarRelPath(contactId, mimeType) {
  const hash = crypto.createHash("sha256").update(String(contactId || "")).digest("hex").slice(0, 24);
  return posixJoin("avatars", `${hash}.${extFor(mimeType)}`);
}

/** Guarda (o reemplaza) la foto de perfil de un contacto bajo be/media/avatars/. */
async function saveAvatar(contactId, buffer, mimeType) {
  if (!contactId || !Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (buffer.length > MAX_MEDIA_BYTES) {
    console.warn(`⚠️  avatar omitido (${buffer.length} bytes > ${MAX_MEDIA_BYTES})`);
    return null;
  }
  const rel = avatarRelPath(contactId, mimeType);
  const abs = absolutePath(rel);
  if (!abs) return null;
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buffer);
  return rel;
}

function mimeForRel(rel) {
  const ext = path.extname(String(rel || "")).slice(1).toLowerCase();
  const map = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  return map[ext] || "application/octet-stream";
}

async function removeFile(rel) {
  const abs = absolutePath(rel);
  if (!abs) return;
  await fsp.unlink(abs).catch(() => {});
}

async function removeMany(rels) {
  const list = (rels || []).filter(Boolean);
  if (!list.length) return;
  await Promise.all(list.map((rel) => removeFile(rel)));
}

function fileExists(rel) {
  const abs = absolutePath(rel);
  return abs ? fs.existsSync(abs) : false;
}

module.exports = {
  MEDIA_ROOT,
  MAX_MEDIA_BYTES,
  saveBuffer,
  saveAvatar,
  avatarRelPath,
  mimeForRel,
  removeFile,
  removeMany,
  absolutePath,
  fileExists,
  extFor,
};
