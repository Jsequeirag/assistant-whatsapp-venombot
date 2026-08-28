const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { tokensEqual, providedToken, createApiAuth, corsOriginOption } = require("../../app/lib/apiAuth");

describe("tokensEqual", () => {
  it("acepta el mismo string", () => {
    assert.equal(tokensEqual("abc", "abc"), true);
  });
  it("rechaza distinto largo o valor", () => {
    assert.equal(tokensEqual("abc", "abd"), false);
    assert.equal(tokensEqual("abc", "ab"), false);
    assert.equal(tokensEqual("abc", ""), false);
  });
});

describe("providedToken", () => {
  it("lee X-Aria-Token", () => {
    assert.equal(providedToken({ headers: { "x-aria-token": " secret " } }), "secret");
  });
  it("lee Bearer", () => {
    assert.equal(providedToken({ headers: { authorization: "Bearer xyz" } }), "xyz");
  });
});

describe("createApiAuth", () => {
  function mockRes() {
    const res = { statusCode: 200, body: null, headers: {} };
    res.set = (k, v) => { res.headers[k] = v; return res; };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
  }

  it("si no hay token configurado, deja pasar", () => {
    let next = false;
    createApiAuth("")({ method: "GET", headers: {} }, mockRes(), () => { next = true; });
    assert.equal(next, true);
  });

  it("401 sin header", () => {
    const res = mockRes();
    let next = false;
    createApiAuth("s3cret")({ method: "GET", headers: {} }, res, () => { next = true; });
    assert.equal(next, false);
    assert.equal(res.statusCode, 401);
  });

  it("pasa con el token correcto", () => {
    let next = false;
    createApiAuth("s3cret")(
      { method: "GET", headers: { "x-aria-token": "s3cret" } },
      mockRes(),
      () => { next = true; }
    );
    assert.equal(next, true);
  });

  it("deja pasar OPTIONS (CORS preflight)", () => {
    let next = false;
    createApiAuth("s3cret")({ method: "OPTIONS", headers: {} }, mockRes(), () => { next = true; });
    assert.equal(next, true);
  });
});

describe("corsOriginOption", () => {
  it("prod sin lista → false (solo same-origin)", () => {
    assert.equal(corsOriginOption("", { isProd: true }), false);
  });
  it("dev sin lista → true", () => {
    assert.equal(corsOriginOption("", { isProd: false }), true);
  });
  it("un origen o varios", () => {
    assert.equal(corsOriginOption("https://a.com", { isProd: true }), "https://a.com");
    assert.deepEqual(corsOriginOption("https://a.com, https://b.com"), ["https://a.com", "https://b.com"]);
  });
});
