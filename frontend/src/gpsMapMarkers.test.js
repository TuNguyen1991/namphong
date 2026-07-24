import test from "node:test";
import assert from "node:assert/strict";
import { plannedTripMarkerPositions } from "./gpsMapMarkers.js";

test("plannedTripMarkerPositions offsets trips sharing the same target", () => {
  const rows = plannedTripMarkerPositions([
    { id: 1, targetStop: { lat: 21.077013, lng: 105.97963 } },
    { id: 2, targetStop: { lat: 21.077013, lng: 105.97963 } },
    { id: 3, targetStop: { lat: 21.077013, lng: 105.97963 } },
  ]);

  assert.equal(rows[0].lat, 21.077013);
  assert.equal(rows[0].lng, 105.97963);
  assert.notDeepEqual([rows[1].lat, rows[1].lng], [rows[0].lat, rows[0].lng]);
  assert.notDeepEqual([rows[2].lat, rows[2].lng], [rows[1].lat, rows[1].lng]);
});

test("plannedTripMarkerPositions keeps invalid coordinates unchanged", () => {
  const [row] = plannedTripMarkerPositions([{ id: 1, targetStop: { lat: "", lng: "" } }]);

  assert.equal(Number.isFinite(row.lat), false);
  assert.equal(Number.isFinite(row.lng), false);
});
