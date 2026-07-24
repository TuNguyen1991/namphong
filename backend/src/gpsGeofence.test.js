import test from "node:test";
import assert from "node:assert/strict";
import { applyGpsPointToTrips, haversineMeters, removeGpsPlateData, removeGpsProviderData, targetStopForTrip } from "./gpsGeofence.js";

function baseStore() {
  return {
    locations: [
      { id: 1, name: "Compal", code: "VP", lat: 21.212137, lng: 105.808189, radiusM: 500 },
      { id: 2, name: "ALSE", code: "ALSE", lat: 21.077013, lng: 105.97963, radiusM: 500 },
    ],
    routes: [{ id: 1, customerCode: "DHL", routeCode: "VP - ALSE", from: "Compal", to: "ALSE", via: "" }],
    trips: [
      {
        id: 10,
        orderCode: "260615001",
        customerCode: "DHL",
        routeCode: "VP - ALSE",
        from: "Compal",
        to: "ALSE",
        via: "",
        plateNumber: "29H-123.45",
        point1ArrivalAt: "2026-06-15T01:00:00.000Z",
        point1DepartAt: "2026-06-15T01:30:00.000Z",
        point2ArrivalAt: "",
        point2DepartAt: "",
        status: "trucking_to_2",
      },
    ],
    gpsVehicleStates: {},
    gpsEvents: [],
  };
}

test("haversineMeters returns short distance for nearby coordinates", () => {
  const meters = haversineMeters({ lat: 21.077013, lng: 105.97963 }, { lat: 21.0775, lng: 105.98 });
  assert.ok(meters > 0);
  assert.ok(meters < 80);
});

test("targetStopForTrip uses the first stop without arrival/depart time", () => {
  const store = baseStore();
  const target = targetStopForTrip(store.trips[0], store);
  assert.equal(target.stopNo, 2);
  assert.equal(target.location.name, "ALSE");
});

test("applyGpsPointToTrips records arrival when planned plate enters target location", () => {
  const store = baseStore();
  const result = applyGpsPointToTrips(store, {
    plateNumber: "29h-123.45",
    lat: 21.077013,
    lng: 105.97963,
    provider: "Demo GPS",
  }, new Date("2026-06-15T02:00:00.000Z"));

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].eventType, "arrival");
  assert.equal(store.trips[0].point2ArrivalAt, "2026-06-15T02:00:00.000Z");
  assert.equal(store.trips[0].status, "arrived_2");
});

test("applyGpsPointToTrips records depart when plate leaves after arrival", () => {
  const store = baseStore();
  applyGpsPointToTrips(store, {
    plateNumber: "29H-123.45",
    lat: 21.077013,
    lng: 105.97963,
  }, new Date("2026-06-15T02:00:00.000Z"));

  const result = applyGpsPointToTrips(store, {
    plateNumber: "29H-123.45",
    lat: 21.09,
    lng: 105.99,
  }, new Date("2026-06-15T02:45:00.000Z"));

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].eventType, "depart");
  assert.equal(store.trips[0].point2DepartAt, "2026-06-15T02:45:00.000Z");
  assert.equal(store.trips[0].status, "completed");
});

test("removeGpsProviderData removes only matching provider vehicles, states, and events", () => {
  const store = {
    gpsVehiclesByPlate: {
      "99H09501": { plateNumber: "99H-09501", provider: "TNG Etruck", id: "tng-etruck-99H09501" },
      "29H12345": { plateNumber: "29H-12345", provider: "Demo GPS", id: "demo-29H12345" },
    },
    gpsVehicleStates: {
      "99H09501:1:1": { inside: true },
      "29H12345:1:1": { inside: true },
    },
    gpsEvents: [
      { id: 1, source: "gps", editReason: "TNG Etruck 99H-09501" },
      { id: 2, source: "gps", editReason: "Demo GPS 29H-12345" },
    ],
  };

  const removed = removeGpsProviderData(store, "TNG");

  assert.deepEqual(removed, { vehicles: 1, states: 1, events: 1 });
  assert.equal(store.gpsVehiclesByPlate["99H09501"], undefined);
  assert.ok(store.gpsVehiclesByPlate["29H12345"]);
  assert.equal(store.gpsVehicleStates["99H09501:1:1"], undefined);
  assert.ok(store.gpsVehicleStates["29H12345:1:1"]);
  assert.deepEqual(store.gpsEvents.map((event) => event.id), [2]);
});

test("removeGpsPlateData removes only one plate from live GPS data", () => {
  const store = {
    gpsVehiclesByPlate: {
      "99H09501": { plateNumber: "99H-09501", provider: "NamPhong Nội Bộ" },
      "29H12345": { plateNumber: "29H-12345", provider: "Demo GPS" },
    },
    gpsVehicleStates: {
      "99H09501:1:1": { inside: true },
      "29H12345:1:1": { inside: true },
    },
    gpsEvents: [
      { id: 1, source: "gps", editReason: "NamPhong Nội Bộ 99H09501" },
      { id: 2, source: "gps", editReason: "Demo GPS 29H-12345" },
    ],
  };

  const removed = removeGpsPlateData(store, "99H-09501");

  assert.deepEqual(removed, { vehicles: 1, states: 1, events: 1 });
  assert.equal(store.gpsVehiclesByPlate["99H09501"], undefined);
  assert.ok(store.gpsVehiclesByPlate["29H12345"]);
  assert.equal(store.gpsVehicleStates["99H09501:1:1"], undefined);
  assert.ok(store.gpsVehicleStates["29H12345:1:1"]);
  assert.deepEqual(store.gpsEvents.map((event) => event.id), [2]);
});
