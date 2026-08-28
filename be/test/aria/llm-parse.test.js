const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const llm = require("../../app/services/llm.service");

describe("stripThink / parseJsonLoose", () => {
  it("saca bloques <think> de qwen", () => {
    assert.equal(llm.stripThink("<think>razonamiento</think>\nHola"), "Hola");
  });

  it("parsea JSON con fences y basura alrededor", () => {
    const raw = "```json\n{ \"isRecado\": true, \"priority\": \"alta\" }\n```";
    assert.deepEqual(llm.parseJsonLoose(raw), { isRecado: true, priority: "alta" });
  });

  it("extrae el primer objeto si el modelo habla de más", () => {
    const parsed = llm.parseJsonLoose('claro: {"completed": true} listo');
    assert.equal(parsed.completed, true);
  });

  it("devuelve null si no hay JSON", () => {
    assert.equal(llm.parseJsonLoose("no es json"), null);
    assert.equal(llm.parseJsonLoose(""), null);
  });
});

describe("normalizeClass / normalizeTurn", () => {
  it("fuerza isRecado estricto y prioridad válida", () => {
    const c = llm.normalizeClass({ isRecado: "sí", priority: "urgente" });
    assert.equal(c.isRecado, false);
    assert.equal(c.priority, "baja");
  });

  it("limpia summary si no es recado", () => {
    const c = llm.normalizeClass({ isRecado: false, summary: "hola", priority: "alta" });
    assert.equal(c.summary, null);
    assert.equal(c.priority, "baja");
  });

  it("arma reply y recadoCompleted del turno combinado", () => {
    const t = llm.normalizeTurn({
      isRecado: true,
      summary: "llama ya",
      priority: "alta",
      appropriate: true,
      reply: "  Anotado.  ",
      completed: true,
    });
    assert.equal(t.reply, "Anotado.");
    assert.equal(t.recadoCompleted, true);
    assert.equal(t.isRecado, true);
  });
});

describe("toChatMessages", () => {
  it("mapea role model → assistant", () => {
    assert.deepEqual(llm.toChatMessages([{ role: "model", content: "ok" }, { role: "user", content: "hi" }]), [
      { role: "assistant", content: "ok" },
      { role: "user", content: "hi" },
    ]);
  });
});

describe("consumeChatSlot", () => {
  beforeEach(() => llm.resetChatSlots());

  it("deja pasar hasta 8 por contacto y corta el 9º", () => {
    for (let i = 0; i < 8; i++) assert.equal(llm.consumeChatSlot("a@c.us"), true);
    assert.equal(llm.consumeChatSlot("a@c.us"), false);
  });

  it("no mezcla cupo entre contactos", () => {
    for (let i = 0; i < 8; i++) llm.consumeChatSlot("a@c.us");
    assert.equal(llm.consumeChatSlot("b@c.us"), true);
  });
});
