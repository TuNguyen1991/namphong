import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiBase } from "./apiBase.js";

test("resolveApiBase uses backend localhost for local Vite development", () => {
  assert.equal(resolveApiBase({ explicitBase: undefined, isProd: false, hostname: "127.0.0.1" }), "http://127.0.0.1:4100");
  assert.equal(resolveApiBase({ explicitBase: undefined, isProd: false, hostname: "localhost" }), "http://127.0.0.1:4100");
});

test("resolveApiBase uses same origin when dev server is opened from another machine", () => {
  assert.equal(resolveApiBase({ explicitBase: undefined, isProd: false, hostname: "als-tms.xyz" }), "");
  assert.equal(resolveApiBase({ explicitBase: undefined, isProd: false, hostname: "192.168.1.20" }), "");
});

test("resolveApiBase honors explicit API base", () => {
  assert.equal(resolveApiBase({ explicitBase: "https://api.example.test", isProd: false, hostname: "als-tms.xyz" }), "https://api.example.test");
});
