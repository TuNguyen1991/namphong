import test from "node:test";
import assert from "node:assert/strict";
import { buildDispatchAlertModel } from "./dispatchAlerts.js";

const NOW = new Date("2026-07-21T08:00:00.000Z");

function trip(overrides = {}) {
  return {
    id: overrides.id || 1,
    orderCode: overrides.orderCode || `NP${overrides.id || 1}`,
    customerCode: overrides.customerCode || "DHL",
    routeCode: overrides.routeCode || "ALSE - NBA",
    requiredArrivalAt: overrides.requiredArrivalAt || "2026-07-21T08:20:00.000Z",
    status: overrides.status || "plan",
    statusLabel: overrides.statusLabel || "Plan",
    plateNumber: overrides.plateNumber || "",
    driverName: overrides.driverName || "",
    ...overrides,
  };
}

test("buildDispatchAlertModel flags missing assignment within 90 minutes", () => {
  const model = buildDispatchAlertModel({
    now: NOW,
    trips: [trip({ id: 1, requiredArrivalAt: "2026-07-21T08:20:00.000Z" })],
  });

  assert.equal(model.summary.missingAssignment, 1);
  assert.equal(model.alerts[0].type, "missingAssignment");
  assert.equal(model.alerts[0].severity, "high");
});

test("buildDispatchAlertModel marks late arrivals critical after 30 minutes", () => {
  const model = buildDispatchAlertModel({
    now: NOW,
    trips: [trip({ id: 2, requiredArrivalAt: "2026-07-21T07:20:00.000Z", plateNumber: "29H-12345", driverName: "Nguyen Van A" })],
  });

  const alert = model.alerts.find((item) => item.type === "lateArrival");
  assert.equal(alert.severity, "critical");
  assert.equal(alert.minutes, 40);
});

test("buildDispatchAlertModel flags long waiting after arrival without depart", () => {
  const model = buildDispatchAlertModel({
    now: NOW,
    trips: [
      trip({
        id: 3,
        requiredArrivalAt: "2026-07-21T04:30:00.000Z",
        point1ArrivalAt: "2026-07-21T05:00:00.000Z",
        point1DepartAt: "",
        plateNumber: "29H-11111",
        driverName: "Tran Van B",
      }),
    ],
  });

  const alert = model.alerts.find((item) => item.type === "longWaiting");
  assert.equal(alert.severity, "high");
  assert.equal(alert.minutes, 180);
});

test("buildDispatchAlertModel detects stale GPS by planned plate", () => {
  const model = buildDispatchAlertModel({
    now: NOW,
    trips: [trip({ id: 4, plateNumber: "29H-22222", driverName: "Le Van C" })],
    gpsDashboard: {
      vehicles: [{ plateNumber: "29H-22222", lastUpdate: "2026-07-21T07:20:00.000Z" }],
    },
  });

  const alert = model.alerts.find((item) => item.type === "gpsStale");
  assert.equal(alert.severity, "medium");
  assert.equal(alert.minutes, 40);
});

test("buildDispatchAlertModel sorts alerts by severity then minutes", () => {
  const model = buildDispatchAlertModel({
    now: NOW,
    trips: [
      trip({ id: 5, requiredArrivalAt: "2026-07-21T08:40:00.000Z" }),
      trip({ id: 6, requiredArrivalAt: "2026-07-21T07:10:00.000Z", plateNumber: "29H-33333", driverName: "Pham Van D" }),
    ],
  });

  assert.equal(model.alerts[0].type, "lateArrival");
  assert.equal(model.alerts[0].severity, "critical");
});

test("buildDispatchAlertModel returns summary and active trip rows", () => {
  const model = buildDispatchAlertModel({
    now: NOW,
    trips: [
      trip({ id: 7, status: "completed", requiredArrivalAt: "2026-07-21T06:00:00.000Z" }),
      trip({ id: 8, requiredArrivalAt: "2026-07-21T08:10:00.000Z" }),
    ],
  });

  assert.equal(model.summary.completedTrips, 1);
  assert.equal(model.summary.activeTrips, 1);
  assert.equal(model.activeTripRows.length, 1);
  assert.equal(model.activeTripRows[0].warningCount, 1);
});
