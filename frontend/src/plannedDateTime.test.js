import test from "node:test";
import assert from "node:assert/strict";
import { defaultPlannedDateTime } from "./plannedDateTime.js";

test("defaultPlannedDateTime leaves planned time blank for new transport plans", () => {
  const value = defaultPlannedDateTime(null, () => "2026-06-15");

  assert.deepEqual(value, {
    plannedDate: "2026-06-15",
    plannedTime: "",
  });
});

test("defaultPlannedDateTime keeps planned time when editing an existing transport plan", () => {
  const value = defaultPlannedDateTime(
    { requiredArrivalAt: "2026-06-15T09:30:00" },
    () => "2026-06-16",
  );

  assert.equal(value.plannedDate, "2026-06-15");
  assert.equal(value.plannedTime, "09:30");
});
