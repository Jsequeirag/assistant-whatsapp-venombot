const Message = require("../models/Message");
const mediaService = require("../services/media.service");

const ID_RE = /^[a-f0-9]{24}$/i;

/** GET /api/media/:id — archivo en disco, o Base64 legado (y migra a disco). */
async function send(req, res) {
  const id = req.params.id;
  if (!ID_RE.test(id || "")) return res.status(400).json({ error: "Id inválido" });

  const msg = await Message.findById(id).select("mediaPath mediaData mediaType").lean();
  if (!msg) return res.status(404).json({ error: "No encontrado" });

  const mime = msg.mediaType || "application/octet-stream";

  if (msg.mediaPath && mediaService.fileExists(msg.mediaPath)) {
    const abs = mediaService.absolutePath(msg.mediaPath);
    res.set("Cache-Control", "public, max-age=86400, immutable");
    res.type(mime);
    return res.sendFile(abs);
  }

  if (msg.mediaData) {
    let buf;
    try {
      buf = Buffer.from(msg.mediaData, "base64");
    } catch {
      return res.status(404).json({ error: "Medio ilegible" });
    }
    mediaService
      .saveBuffer(buf, mime)
      .then(async (rel) => {
        if (!rel) return;
        await Message.updateOne({ _id: id }, { $set: { mediaPath: rel }, $unset: { mediaData: 1 } });
      })
      .catch((e) => console.warn(`⚠️  migración media ${id}: ${e?.message || e}`));
    res.set("Cache-Control", "public, max-age=3600");
    res.type(mime);
    return res.send(buf);
  }

  return res.status(404).json({ error: "Sin medio" });
}

module.exports = { send };
