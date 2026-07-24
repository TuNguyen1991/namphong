import test from "node:test";
import assert from "node:assert/strict";
import { buildCompletedTripPayload, shouldSyncCompletedTripDriver, shouldSyncCompletedTripVehicle } from "./completedTripRows.js";

test("buildCompletedTripPayload creates completed trip times and surcharge rows", () => {
  const payload = buildCompletedTripPayload({
    plannedDate: "2026-07-06",
    plannedTime: "08:10",
    customerCode: "ALSE",
    partnerCode: "DH",
    routeCode: "NOI BAI - VSIP",
    plateNumber: "29H-123.45",
    cargoWeight: "10T",
    driverName: "Nguyen Van A",
    point1At: "2026-07-06T08:10",
    point2At: "2026-07-06T09:20",
    handlingFeeAmount: "200,000",
    warehouseTicketFee: "30,000",
    highwayTicketFee: "45000",
    driverOvernightFee: "100000",
    otherFeeAmount: "50000",
    createdBy: "admin",
  });

  assert.equal(payload.plannedDate, "2026-07-06");
  assert.equal(payload.plannedTime, "08:10");
  assert.equal(payload.point1ArrivalAt, "2026-07-06T08:10");
  assert.equal(payload.point1DepartAt, "2026-07-06T08:10");
  assert.equal(payload.point2ArrivalAt, "2026-07-06T09:20");
  assert.equal(payload.point2DepartAt, "2026-07-06T09:20");
  assert.equal(payload.point3ArrivalAt, "");
  assert.equal(payload.point3DepartAt, "");
  assert.equal(payload.handlingFeeSide, "Hai đầu");
  assert.equal(payload.handlingFeeAmount, "200000");
  assert.deepEqual(payload.otherFees, [
    { description: "Vé kho", amount: "30000" },
    { description: "Vé cao tốc", amount: "45000" },
    { description: "Lưu đêm cho lái xe", amount: "100000" },
    { description: "Phí khác", amount: "50000" },
  ]);
});

test("buildCompletedTripPayload uses separate depart times when provided", () => {
  const payload = buildCompletedTripPayload({
    plannedDate: "2026-07-06",
    customerCode: "ALSE",
    partnerCode: "DH",
    routeCode: "A - B - C",
    plateNumber: "29H-123.45",
    driverName: "Nguyen Van A",
    point1At: "2026-07-06T08:10",
    point1DepartAt: "2026-07-06T08:25",
    point2At: "2026-07-06T09:20",
    point2DepartAt: "2026-07-06T09:45",
    point3At: "2026-07-06T10:30",
    point3DepartAt: "2026-07-06T10:50",
  });

  assert.equal(payload.point1ArrivalAt, "2026-07-06T08:10");
  assert.equal(payload.point1DepartAt, "2026-07-06T08:25");
  assert.equal(payload.point2ArrivalAt, "2026-07-06T09:20");
  assert.equal(payload.point2DepartAt, "2026-07-06T09:45");
  assert.equal(payload.point3ArrivalAt, "2026-07-06T10:30");
  assert.equal(payload.point3DepartAt, "2026-07-06T10:50");
});

test("buildCompletedTripPayload completes third point routes when point3 time is present", () => {
  const payload = buildCompletedTripPayload({
    plannedDate: "2026-07-06",
    customerCode: "ALSE",
    partnerCode: "DH",
    routeCode: "A - B - C",
    plateNumber: "29H-123.45",
    driverName: "Nguyen Van A",
    point1At: "2026-07-06T08:10",
    point2At: "2026-07-06T09:20",
    point3At: "2026-07-06T10:30",
  });

  assert.equal(payload.point3ArrivalAt, "2026-07-06T10:30");
  assert.equal(payload.point3DepartAt, "2026-07-06T10:30");
});

test("shouldSyncCompletedTripDriver only allows Nam Phong Logistics drivers", () => {
  assert.equal(shouldSyncCompletedTripDriver({ partnerCode: "NP" }), true);
  assert.equal(shouldSyncCompletedTripDriver({ partnerCode: "np" }), true);
  assert.equal(shouldSyncCompletedTripDriver({ partnerCode: "DH" }), false);
  assert.equal(shouldSyncCompletedTripDriver({ partnerCode: "" }), false);
});

test("shouldSyncCompletedTripVehicle only allows Nam Phong Logistics vehicles", () => {
  assert.equal(shouldSyncCompletedTripVehicle({ partnerCode: "NP" }), true);
  assert.equal(shouldSyncCompletedTripVehicle({ partnerCode: "np" }), true);
  assert.equal(shouldSyncCompletedTripVehicle({ partnerCode: "DH" }), false);
  assert.equal(shouldSyncCompletedTripVehicle({ partnerCode: "" }), false);
});
