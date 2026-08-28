const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const incoming = require("../../app/lib/incoming");

describe("getMessageText", () => {
  it("usa el body en mensajes de chat", () => {
    assert.equal(incoming.getMessageText({ type: "chat", body: "  hola  " }), "hola");
  });

  it("usa caption en vez del body de una imagen (el body puede ser base64)", () => {
    assert.equal(
      incoming.getMessageText({ type: "image", body: "iVBOR...", caption: "mirá esto" }),
      "mirá esto"
    );
  });

  it("etiqueta medios sin caption", () => {
    assert.equal(incoming.getMessageText({ type: "sticker" }), "(el contacto envió un sticker)");
    assert.equal(incoming.getMessageText({ type: "ptt" }), "(el contacto envió un audio)");
  });

  it("ignora tipos de sistema", () => {
    assert.equal(incoming.getMessageText({ type: "revoked", body: "x" }), null);
    assert.equal(incoming.getMessageText({ type: "e2e_notification" }), null);
    assert.equal(incoming.getMessageText({ type: "protocol" }), null);
  });
});

describe("getMessageTimeMs", () => {
  it("convierte t en segundos a ms", () => {
    assert.equal(incoming.getMessageTimeMs({ t: 1_700_000_000 }), 1_700_000_000_000);
  });

  it("deja t ya en ms", () => {
    assert.equal(incoming.getMessageTimeMs({ t: 1_700_000_000_123 }), 1_700_000_000_123);
  });

  it("fail-closed si no hay timestamp", () => {
    assert.equal(incoming.getMessageTimeMs({}), null);
    assert.equal(incoming.getMessageTimeMs({ t: 0 }), null);
  });
});

describe("extractPhoneNumber", () => {
  it("no usa un @lid como teléfono", () => {
    assert.equal(incoming.extractPhoneNumber({ from: "123@lid" }, "123@lid"), null);
  });

  it("toma dígitos de @c.us", () => {
    assert.equal(incoming.extractPhoneNumber({}, "5491112345678@c.us"), "5491112345678");
  });

  it("prefiere sender @c.us", () => {
    const msg = { sender: { id: { _serialized: "549111@c.us" } } };
    assert.equal(incoming.extractPhoneNumber(msg, "99@lid"), "549111");
  });
});

describe("isSelfMessage / dropReason", () => {
  beforeEach(() => incoming.resetSelfIds());

  it("detecta fromMe sin marcar el chat ajeno como id propio", () => {
    incoming.setHostId("me@lid");
    assert.equal(incoming.isSelfMessage({ fromMe: true, from: "me@lid" }), true);
    assert.equal(incoming.isSelfMessage({ fromMe: true, from: "alice@c.us" }), true);
    assert.equal(incoming.isSelfMessage({ from: "alice@c.us" }), false);
    assert.equal(incoming.isSelfMessage({ from: "me@lid" }), true);
  });

  it("detecta id serializado true_", () => {
    assert.equal(incoming.isSelfMessage({ from: "x@c.us", id: "true_x@c.us_hash" }), true);
  });

  it("descarta grupos, broadcasts y newsletters", () => {
    assert.equal(incoming.dropReason({ isGroupMsg: true, from: "a@c.us", type: "chat", body: "hi" }), "group");
    assert.equal(incoming.dropReason({ from: "x@g.us", type: "chat", body: "hi" }), "suffix");
    assert.equal(incoming.dropReason({ from: "x@newsletter", type: "chat", body: "hi" }), "suffix");
    assert.equal(incoming.dropReason({ from: "status@broadcast", type: "chat", body: "hi" }), "suffix");
    assert.equal(incoming.dropReason({ from: "broadcast", type: "chat", body: "hi" }), "sender");
  });

  it("deja pasar un chat 1-a-1 con texto", () => {
    assert.equal(incoming.dropReason({ from: "549111@c.us", type: "chat", body: "hola" }), null);
  });

  it("por defecto descarta fromMe aunque sea el chat propio", () => {
    incoming.setHostId("me@c.us");
    assert.equal(
      incoming.dropReason({ fromMe: true, from: "me@c.us", type: "chat", body: "hola" }),
      "self"
    );
  });

  it("en ambiente de pruebas deja pasar el chat Tú y no los envíos a terceros", () => {
    incoming.setHostId("me@c.us");
    assert.equal(
      incoming.dropReason({ fromMe: true, from: "me@c.us", type: "chat", body: "hola" }, { allowSelf: true }),
      null
    );
    assert.equal(
      incoming.dropReason({ fromMe: true, from: "alice@c.us", type: "chat", body: "hola" }, { allowSelf: true }),
      "self"
    );
  });

  it("en ambiente de pruebas ignora el eco de lo que Aria acaba de enviar", () => {
    incoming.setHostId("me@c.us");
    incoming.rememberOutgoing("me@c.us", "Anotado, se lo paso");
    assert.equal(
      incoming.dropReason(
        { fromMe: true, from: "me@c.us", type: "chat", body: "Anotado, se lo paso" },
        { allowSelf: true }
      ),
      "echo"
    );
    assert.equal(
      incoming.dropReason({ fromMe: true, from: "me@c.us", type: "chat", body: "otra cosa" }, { allowSelf: true }),
      null
    );
  });
});

describe("resolvePresence (DND > Sleep > available)", () => {
  it("DND gana aunque sea horario de sleep", () => {
    assert.deepEqual(
      incoming.resolvePresence({ dndActive: true, dndReason: "reunión", sleepActive: true, hour: 23 }),
      { status: "dnd", reason: "reunión" }
    );
  });

  it("Sleep solo entre 20:00 y 08:00", () => {
    assert.equal(incoming.resolvePresence({ sleepActive: true, hour: 20 }).status, "sleep");
    assert.equal(incoming.resolvePresence({ sleepActive: true, hour: 7 }).status, "sleep");
    assert.equal(incoming.resolvePresence({ sleepActive: true, hour: 12 }).status, "available");
  });

  it("sin modos → available", () => {
    assert.equal(incoming.resolvePresence({ hour: 23 }).status, "available");
  });
});

describe("decideTurn", () => {
  it("disponible + auto-asistir OFF = silencio (solo recado)", () => {
    const t = incoming.decideTurn({ status: "available", globalAssist: false, alreadyGreeted: false, recadoCompleted: false });
    assert.equal(t.silence, true);
    assert.equal(t.willGreet, false);
  });

  it("DND sin saludar = saludo, no silencio", () => {
    const t = incoming.decideTurn({ status: "dnd", globalAssist: false, alreadyGreeted: false, recadoCompleted: false });
    assert.equal(t.willGreet, true);
    assert.equal(t.silence, false);
    assert.equal(t.greetingTracked, true);
  });

  it("DND ya saludado + sin auto-asistir = silencio", () => {
    const t = incoming.decideTurn({ status: "dnd", globalAssist: false, alreadyGreeted: true, recadoCompleted: false });
    assert.equal(t.willGreet, false);
    assert.equal(t.silence, true);
  });

  it("DND ya saludado + auto-asistir = conversa", () => {
    const t = incoming.decideTurn({ status: "dnd", globalAssist: true, alreadyGreeted: true, recadoCompleted: false });
    assert.equal(t.silence, false);
    assert.equal(t.willGreet, false);
  });

  it("auto-asistir + recado completo = silencio", () => {
    const t = incoming.decideTurn({ status: "available", globalAssist: true, alreadyGreeted: true, recadoCompleted: true });
    assert.equal(t.silence, true);
  });

  it("disponible + auto-asistir + recado abierto = responde", () => {
    const t = incoming.decideTurn({ status: "available", globalAssist: true, alreadyGreeted: false, recadoCompleted: false });
    assert.equal(t.silence, false);
    assert.equal(t.willGreet, false);
  });
});
