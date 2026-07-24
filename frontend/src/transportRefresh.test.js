import test from "node:test";
import assert from "node:assert/strict";
import { transportTripsPath, shouldAutoRefreshTransport, shouldLoadAppData, TRANSPORT_AUTO_REFRESH_MS } from "./transportRefresh.js";

test("transport auto refresh interval is five minutes", () => {
  assert.equal(TRANSPORT_AUTO_REFRESH_MS, 5 * 60 * 1000);
});

test("transport auto refresh only runs for signed-in transport tab", () => {
  assert.equal(shouldAutoRefreshTransport({ activeView: "transport", currentUser: { username: "admin" } }), true);
  assert.equal(shouldAutoRefreshTransport({ activeView: "gps", currentUser: { username: "admin" } }), false);
  assert.equal(shouldAutoRefreshTransport({ activeView: "transport", currentUser: null }), false);
});

test("app data only loads after auth is ready and user is signed in", () => {
  assert.equal(shouldLoadAppData({ authReady: false, currentUser: null }), false);
  assert.equal(shouldLoadAppData({ authReady: true, currentUser: null }), false);
  assert.equal(shouldLoadAppData({ authReady: true, currentUser: { username: "admin" } }), true);
});

test("transportTripsPath adds bounded pagination to the filtered trips request", () => {
  assert.equal(transportTripsPath("status=plan"), "/api/trips?status=plan&page=1&pageSize=500");
  assert.equal(transportTripsPath(""), "/api/trips?page=1&pageSize=500");
});
