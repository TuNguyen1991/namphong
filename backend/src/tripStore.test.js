import test from "node:test";
import assert from "node:assert/strict";
import { paginateTrips, shouldPersistWholeStore } from "./tripStore.js";

test("paginateTrips returns a bounded page with total metadata", () => {
  const trips = Array.from({ length: 12 }, (_, index) => ({ id: index + 1, orderCode: `T${index + 1}` }));

  const result = paginateTrips(trips, { page: "2", pageSize: "5" });

  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 5);
  assert.equal(result.total, 12);
  assert.deepEqual(result.rows.map((trip) => trip.id), [6, 7, 8, 9, 10]);
});

test("paginateTrips returns the original array when pagination is not requested", () => {
  const trips = [{ id: 1 }, { id: 2 }];

  assert.equal(paginateTrips(trips, {}), trips);
});

test("shouldPersistWholeStore skips direct trip mutations when MySQL can persist them directly", () => {
  assert.equal(shouldPersistWholeStore({ method: "POST", path: "/api/trips" }, { directTripPersistence: true }), false);
  assert.equal(shouldPersistWholeStore({ method: "PUT", path: "/api/trips/7" }, { directTripPersistence: true }), false);
  assert.equal(shouldPersistWholeStore({ method: "DELETE", path: "/api/trips/7" }, { directTripPersistence: true }), false);
  assert.equal(shouldPersistWholeStore({ method: "POST", path: "/api/trips/bulk" }, { directTripPersistence: true }), false);
});

test("shouldPersistWholeStore keeps full persistence for non-trip and driver event routes", () => {
  assert.equal(shouldPersistWholeStore({ method: "POST", path: "/api/customers" }, { directTripPersistence: true }), true);
  assert.equal(shouldPersistWholeStore({ method: "POST", path: "/api/driver-trips/NP260721001/events" }, { directTripPersistence: true }), true);
  assert.equal(shouldPersistWholeStore({ method: "GET", path: "/api/trips" }, { directTripPersistence: true }), false);
});
