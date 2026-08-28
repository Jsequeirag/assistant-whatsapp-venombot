const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  dicebearUrl,
  localAvatarUrl,
  extractProfilePicUrl,
  picFromSender,
} = require("../../app/lib/avatar");

describe("dicebearUrl", () => {
  it("usa seed del nombre y es determinístico", () => {
    const a = dicebearUrl("Ana");
    const b = dicebearUrl("Ana");
    assert.equal(a, b);
    assert.match(a, /^https:\/\/api\.dicebear\.com\/10\.x\/bottts-neutral\/svg\?seed=Ana$/);
  });

  it("cae a default si el seed está vacío", () => {
    assert.match(dicebearUrl("  "), /seed=default$/);
    assert.match(dicebearUrl(""), /seed=default$/);
  });
});

describe("localAvatarUrl", () => {
  it("codifica @ del contactId", () => {
    assert.equal(
      localAvatarUrl("5491112345678@c.us"),
      "/api/contacts/5491112345678%40c.us/avatar"
    );
  });
});

describe("extractProfilePicUrl", () => {
  it("acepta URL directa", () => {
    assert.equal(extractProfilePicUrl("https://pps.whatsapp.net/v/foto.jpg"), "https://pps.whatsapp.net/v/foto.jpg");
  });

  it("saca eurl / imgFull de objetos de WhatsApp Web", () => {
    assert.equal(
      extractProfilePicUrl({ eurl: "https://pps.whatsapp.net/a.jpg", img: "https://pps.whatsapp.net/thumb.jpg" }),
      "https://pps.whatsapp.net/a.jpg"
    );
    assert.equal(extractProfilePicUrl({ imgFull: "http://cdn.example/full.png" }), "http://cdn.example/full.png");
  });

  it("desenvuelve data/result", () => {
    assert.equal(
      extractProfilePicUrl({ data: { eurl: "https://pps.whatsapp.net/x.jpg" } }),
      "https://pps.whatsapp.net/x.jpg"
    );
  });

  it("devuelve null si no hay foto", () => {
    assert.equal(extractProfilePicUrl(null), null);
    assert.equal(extractProfilePicUrl(""), null);
    assert.equal(extractProfilePicUrl({ eurl: null }), null);
    assert.equal(extractProfilePicUrl({ eurl: "" }), null);
    assert.equal(extractProfilePicUrl({ tag: "abc" }), null);
  });
});

describe("picFromSender", () => {
  it("lee profilePicThumbObj.eurl", () => {
    const sender = { pushname: "Ana", profilePicThumbObj: { eurl: "https://pps.whatsapp.net/ana.jpg" } };
    assert.equal(picFromSender(sender), "https://pps.whatsapp.net/ana.jpg");
  });

  it("sin foto → null", () => {
    assert.equal(picFromSender({ pushname: "Ana" }), null);
    assert.equal(picFromSender(null), null);
  });
});
