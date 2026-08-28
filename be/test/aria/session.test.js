const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const contact = require("../../app/services/contact.service");

describe("toLlmTurn", () => {
  it("mapea assistant → model para el historial LLM", () => {
    assert.deepEqual(contact.toLlmTurn({ role: "assistant", content: "Anotado" }), {
      role: "model",
      content: "Anotado",
    });
  });

  it("omite contenido vacío", () => {
    assert.equal(contact.toLlmTurn({ role: "user", content: "  " }), null);
  });
});

describe("sesión in-memory", () => {
  it("isSessionExpired es false si nunca hubo actividad", () => {
    const id = "fresh-" + Date.now() + "@c.us";
    contact.dropSession(id);
    assert.equal(contact.isSessionExpired(id, 20 * 60 * 1000), false);
  });

  it("resetSession deja historial vacío y no se rehidrata solo", () => {
    const id = "reset-" + Date.now() + "@c.us";
    contact.addToHistory(id, "user", "hola");
    contact.resetSession(id);
    const s = contact.getSession(id);
    assert.deepEqual(s.conversationHistory, []);
    assert.equal(s.hydrated, true);
    assert.equal(s.greetedOnce, false);
    contact.dropSession(id);
  });

  it("addToHistory recorta a 20 turnos", () => {
    const id = "cap-" + Date.now() + "@c.us";
    contact.resetSession(id);
    for (let i = 0; i < 25; i++) contact.addToHistory(id, "user", "m" + i);
    const hist = contact.getSession(id).conversationHistory;
    assert.equal(hist.length, 20);
    assert.equal(hist[0].content, "m5");
    assert.equal(hist[19].content, "m24");
    contact.dropSession(id);
  });
});
