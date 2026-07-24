import assert from "node:assert/strict";
import test from "node:test";
import { findLatestDriverByPlate } from "./latestDriverByPlate.js";

test("findLatestDriverByPlate returns the newest driver info for a matching plate", () => {
  const trips = [
    {
      id: 1,
      orderCode: "260617001",
      plateNumber: "29H-123.45",
      driverName: "Nguyen Van Cu",
      driverPhone: "0900000000",
      requiredArrivalAt: "2026-06-16T08:00:00.000Z",
    },
    {
      id: 2,
      orderCode: "260617002",
      plateNumber: "29H12345",
      driverName: "Nguyen Van Moi",
      driverPhone: "0911111111",
      requiredArrivalAt: "2026-06-17T08:00:00.000Z",
    },
  ];

  assert.deepEqual(findLatestDriverByPlate(trips, "29h 123.45"), {
    orderCode: "260617002",
    plateNumber: "29H12345",
    driverName: "Nguyen Van Moi",
    driverPhone: "0911111111",
    requiredArrivalAt: "2026-06-17T08:00:00.000Z",
  });
});

test("findLatestDriverByPlate ignores rows without driver name or phone and can exclude the current trip", () => {
  const trips = [
    {
      id: 10,
      orderCode: "260617010",
      plateNumber: "99C-111.11",
      driverName: "",
      driverPhone: "",
      requiredArrivalAt: "2026-06-18T08:00:00.000Z",
    },
    {
      id: 11,
      orderCode: "260617011",
      plateNumber: "99C11111",
      driverName: "Tran Van A",
      driverPhone: "0988888888",
      requiredArrivalAt: "2026-06-17T08:00:00.000Z",
    },
  ];

  assert.equal(findLatestDriverByPlate(trips, "99C11111", { excludeTripId: 11 }), null);
});
