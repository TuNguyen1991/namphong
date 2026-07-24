import test from "node:test";
import assert from "node:assert/strict";
import { calculateFuelDraft, enrichFuelLogs } from "./fuelAccounting.js";

test("enrichFuelLogs calculates run km, norm liters, delta and monthly total by vehicle and driver", () => {
  const rows = enrichFuelLogs(
    [
      { id: 1, date: "2026-06-01", plateNumber: "29H-123.45", driverName: "A", kmReading: 1000, liters: 50 },
      { id: 2, date: "2026-06-10", plateNumber: "29H-123.45", driverName: "A", kmReading: 1300, liters: 40 },
      { id: 3, date: "2026-06-20", plateNumber: "29H-123.45", driverName: "A", kmReading: 1500, liters: 30 },
    ],
    [{ plateNumber: "29H-123.45", fuelNorm: "10L/100km" }],
  );

  assert.equal(rows[0].kmRun, 0);
  assert.equal(rows[1].kmRun, 300);
  assert.equal(rows[1].normLiters, 30);
  assert.equal(rows[1].fuelDelta, -20);
  assert.equal(rows[2].fuelDelta, -20);
  assert.equal(rows[2].monthlyDelta, -40);
});

test("calculateFuelDraft uses previous liters from the same vehicle", () => {
  const draft = calculateFuelDraft(
    { date: "2026-06-15", plateNumber: "29C-889.10", driverName: "B", kmReading: 1120, liters: 35 },
    [{ id: 1, date: "2026-06-01", plateNumber: "29C-889.10", driverName: "B", kmReading: 1000, liters: 45 }],
    [{ plateNumber: "29C-889.10", fuelNorm: "12" }],
  );

  assert.equal(draft.kmRun, 120);
  assert.equal(draft.normLiters, 14.4);
  assert.equal(draft.previousLiters, 45);
  assert.equal(draft.fuelDelta, -30.6);
});
