const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const media = require("../../app/services/media.service");

describe("absolutePath", () => {
  it("resuelve rutas relativas dentro de be/media", () => {
    const abs = media.absolutePath("2026/08/abc.jpg");
    assert.ok(abs);
    assert.equal(abs, path.join(media.MEDIA_ROOT, "2026", "08", "abc.jpg"));
  });

  it("bloquea path traversal", () => {
    assert.equal(media.absolutePath("../tokens/secret"), null);
    assert.equal(media.absolutePath("..\\..\\etc\\passwd"), null);
    assert.equal(media.absolutePath(""), null);
    assert.equal(media.absolutePath(null), null);
  });
});

describe("saveAvatar", () => {
  it("escribe bajo avatars/ con nombre estable por contacto", async () => {
    const id = "5491112345678@c.us";
    const buf = Buffer.from("fake-jpeg");
    const rel = await media.saveAvatar(id, buf, "image/jpeg");
    assert.ok(rel);
    assert.match(rel, /^avatars\/[a-f0-9]+\.jpg$/);
    assert.equal(rel, media.avatarRelPath(id, "image/jpeg"));
    assert.equal(media.fileExists(rel), true);
    assert.equal(media.mimeForRel(rel), "image/jpeg");
    await media.removeFile(rel);
    assert.equal(media.fileExists(rel), false);
  });

  it("rechaza buffers vacíos", async () => {
    assert.equal(await media.saveAvatar("x@c.us", Buffer.alloc(0), "image/jpeg"), null);
    assert.equal(await media.saveAvatar("", Buffer.from("x"), "image/jpeg"), null);
  });
});

describe("extFor / saveBuffer límites", () => {
  it("elige extensión por mime", () => {
    assert.equal(media.extFor("image/jpeg; charset=binary"), "jpg");
    assert.equal(media.extFor("video/mp4"), "mp4");
    assert.equal(media.extFor("application/octet-stream"), "bin");
  });

  it("rechaza buffers vacíos o demasiado grandes", async () => {
    assert.equal(await media.saveBuffer(Buffer.alloc(0), "image/jpeg"), null);
    assert.equal(await media.saveBuffer("not-a-buffer", "image/jpeg"), null);
    const huge = Buffer.alloc(media.MAX_MEDIA_BYTES + 1);
    assert.equal(await media.saveBuffer(huge, "image/jpeg"), null);
  });
});
