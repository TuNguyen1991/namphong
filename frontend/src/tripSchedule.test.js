import test from "node:test";
import assert from "node:assert/strict";
import { adjustTripScheduleDate, normalizeTripScheduleOrder, setTripScheduleDate, tripScheduleDatesFromItem } from "./tripSchedule.js";

test("adjustTripScheduleDate shifts the edited date and all following dates", () => {
  const form = {
    plannedDate: "2026-06-15",
    point1ArrivalDate: "2026-06-15",
    point1DepartDate: "2026-06-15",
    point2ArrivalDate: "2026-06-15",
    point2DepartDate: "2026-06-15",
    point3ArrivalDate: "2026-06-15",
    point3DepartDate: "2026-06-15",
  };

  const next = adjustTripScheduleDate(form, "point1DepartDate", 1);

  assert.equal(next.plannedDate, "2026-06-15");
  assert.equal(next.point1ArrivalDate, "2026-06-15");
  assert.equal(next.point1DepartDate, "2026-06-16");
  assert.equal(next.point2ArrivalDate, "2026-06-16");
  assert.equal(next.point2DepartDate, "2026-06-16");
  assert.equal(next.point3ArrivalDate, "2026-06-16");
  assert.equal(next.point3DepartDate, "2026-06-16");
});

test("normalizeTripScheduleOrder allows point 1 arrival before planned time but orders later points", () => {
  const next = normalizeTripScheduleOrder({
    plannedDate: "2026-06-15",
    plannedTime: "10:00",
    point1ArrivalDate: "2026-06-15",
    point1ArrivalTime: "09:00",
    point1DepartDate: "2026-06-15",
    point1DepartTime: "08:30",
    point2ArrivalDate: "2026-06-15",
    point2ArrivalTime: "",
  });

  assert.equal(next.point1ArrivalDate, "2026-06-15");
  assert.equal(next.point1ArrivalTime, "09:00");
  assert.equal(next.point1DepartDate, "2026-06-15");
  assert.equal(next.point1DepartTime, "09:00");
  assert.equal(next.point2ArrivalDate, "2026-06-15");
  assert.equal(next.point2ArrivalTime, "");
});

test("setTripScheduleDate shifts following dates by the direct date edit delta", () => {
  const next = setTripScheduleDate(
    {
      plannedDate: "2026-06-15",
      point1ArrivalDate: "2026-06-15",
      point1DepartDate: "2026-06-16",
      point2ArrivalDate: "2026-06-16",
      point2DepartDate: "2026-06-16",
    },
    "plannedDate",
    "2026-06-17",
  );

  assert.equal(next.plannedDate, "2026-06-17");
  assert.equal(next.point1ArrivalDate, "2026-06-17");
  assert.equal(next.point1DepartDate, "2026-06-18");
  assert.equal(next.point2ArrivalDate, "2026-06-18");
  assert.equal(next.point2DepartDate, "2026-06-18");
});

test("tripScheduleDatesFromItem defaults point dates to the planned date for new trips", () => {
  const dates = tripScheduleDatesFromItem(null, "2026-06-15");

  assert.deepEqual(dates, {
    point1ArrivalDate: "2026-06-15",
    point1DepartDate: "2026-06-15",
    point2ArrivalDate: "2026-06-15",
    point2DepartDate: "2026-06-15",
    point3ArrivalDate: "2026-06-15",
    point3DepartDate: "2026-06-15",
  });
});
