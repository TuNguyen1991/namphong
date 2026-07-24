import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyDispatchScheduleModel } from "./dailyDispatchSchedule.js";

function trip(overrides = {}) {
  return {
    id: overrides.id || 1,
    orderCode: overrides.orderCode || `NP${overrides.id || 1}`,
    customerCode: "DHL",
    routeCode: "ALSE - NBA",
    requiredArrivalAt: overrides.requiredArrivalAt || "2026-07-21T08:00:00.000Z",
    plateNumber: overrides.plateNumber ?? "29H-12345",
    driverName: overrides.driverName ?? "Nguyen Van A",
    status: "plan",
    ...overrides,
  };
}

test("buildDailyDispatchScheduleModel uses default 180 minute window", () => {
  const model = buildDailyDispatchScheduleModel({ date: "2026-07-21", trips: [trip()] });

  assert.equal(model.trips[0].durationMinutes, 180);
  assert.equal(model.trips[0].startAt, "2026-07-21T08:00:00.000Z");
  assert.equal(model.trips[0].endAt, "2026-07-21T11:00:00.000Z");
});

test("buildDailyDispatchScheduleModel detects vehicle overlap", () => {
  const model = buildDailyDispatchScheduleModel({
    date: "2026-07-21",
    trips: [
      trip({ id: 1, requiredArrivalAt: "2026-07-21T08:00:00.000Z", plateNumber: "29H-12345", driverName: "A" }),
      trip({ id: 2, requiredArrivalAt: "2026-07-21T09:00:00.000Z", plateNumber: "29H12345", driverName: "B" }),
    ],
  });

  assert.equal(model.summary.vehicleOverlap, 1);
  assert.equal(model.conflicts[0].type, "vehicle_overlap");
});

test("buildDailyDispatchScheduleModel detects driver overlap", () => {
  const model = buildDailyDispatchScheduleModel({
    date: "2026-07-21",
    trips: [
      trip({ id: 3, requiredArrivalAt: "2026-07-21T08:00:00.000Z", plateNumber: "29H-11111", driverName: "Nguyen Van A" }),
      trip({ id: 4, requiredArrivalAt: "2026-07-21T09:00:00.000Z", plateNumber: "29H-22222", driverName: " nguyen van a " }),
    ],
  });

  assert.equal(model.summary.driverOverlap, 1);
  assert.ok(model.conflicts.some((conflict) => conflict.type === "driver_overlap"));
});

test("buildDailyDispatchScheduleModel detects short turnaround", () => {
  const model = buildDailyDispatchScheduleModel({
    date: "2026-07-21",
    trips: [
      trip({ id: 5, requiredArrivalAt: "2026-07-21T08:00:00.000Z", point2DepartAt: "2026-07-21T09:00:00.000Z" }),
      trip({ id: 6, requiredArrivalAt: "2026-07-21T09:30:00.000Z" }),
    ],
  });

  assert.equal(model.summary.shortTurnaround, 1);
  assert.ok(model.conflicts.some((conflict) => conflict.type === "short_turnaround"));
});

test("buildDailyDispatchScheduleModel detects missing assignment", () => {
  const model = buildDailyDispatchScheduleModel({
    date: "2026-07-21",
    trips: [trip({ id: 7, plateNumber: "", driverName: "" })],
  });

  assert.equal(model.summary.missingAssignment, 1);
  assert.equal(model.trips[0].conflicts[0].type, "missing_assignment");
});

test("buildDailyDispatchScheduleModel filters by selected date and groups by vehicle and driver", () => {
  const model = buildDailyDispatchScheduleModel({
    date: "2026-07-21",
    trips: [
      trip({ id: 8, requiredArrivalAt: "2026-07-21T08:00:00.000Z", plateNumber: "29H-88888", driverName: "Driver 8" }),
      trip({ id: 9, requiredArrivalAt: "2026-07-22T08:00:00.000Z", plateNumber: "29H-99999", driverName: "Driver 9" }),
    ],
  });

  assert.equal(model.summary.tripCount, 1);
  assert.equal(model.vehicleGroups[0].label, "29H-88888");
  assert.equal(model.driverGroups[0].label, "Driver 8");
});
