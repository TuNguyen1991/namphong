import test from "node:test";
import assert from "node:assert/strict";
import { shouldRejectRequestWithoutDatabase, shouldRejectWriteWithoutDatabase } from "./storageGuard.js";

test("shouldRejectWriteWithoutDatabase blocks mutating requests when MySQL is configured but disconnected", () => {
  assert.equal(shouldRejectWriteWithoutDatabase({ method: "POST", mysqlConfigured: true, dbConnected: false }), true);
  assert.equal(shouldRejectWriteWithoutDatabase({ method: "PUT", mysqlConfigured: true, dbConnected: false }), true);
  assert.equal(shouldRejectWriteWithoutDatabase({ method: "DELETE", mysqlConfigured: true, dbConnected: false }), true);
  assert.equal(shouldRejectWriteWithoutDatabase({ method: "GET", mysqlConfigured: true, dbConnected: false }), false);
  assert.equal(shouldRejectWriteWithoutDatabase({ method: "POST", mysqlConfigured: true, dbConnected: true }), false);
  assert.equal(shouldRejectWriteWithoutDatabase({ method: "POST", mysqlConfigured: false, dbConnected: false }), false);
});

test("shouldRejectRequestWithoutDatabase blocks API data reads when MySQL is configured but disconnected", () => {
  assert.equal(shouldRejectRequestWithoutDatabase({ path: "/api/operations", mysqlConfigured: true, dbConnected: false }), true);
  assert.equal(shouldRejectRequestWithoutDatabase({ path: "/api/trips", mysqlConfigured: true, dbConnected: false }), true);
  assert.equal(shouldRejectRequestWithoutDatabase({ path: "/api/health", mysqlConfigured: true, dbConnected: false }), false);
  assert.equal(shouldRejectRequestWithoutDatabase({ path: "/assets/app.js", mysqlConfigured: true, dbConnected: false }), false);
  assert.equal(shouldRejectRequestWithoutDatabase({ path: "/api/operations", mysqlConfigured: true, dbConnected: true }), false);
  assert.equal(shouldRejectRequestWithoutDatabase({ path: "/api/operations", mysqlConfigured: false, dbConnected: false }), false);
});
