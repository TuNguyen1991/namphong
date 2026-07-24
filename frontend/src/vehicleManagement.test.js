import test from "node:test";
import assert from "node:assert/strict";
import { officialNpVehicles } from "./vehicleManagement.js";

test("officialNpVehicles excludes automatically generated vehicle records", () => {
  const vehicles = [
    { plateNumber: "29H-123.45", registrationNumber: "SDKX-001" },
    { plateNumber: "29H-222.22", length: "9.9" },
    { plateNumber: "29H-333.33", fuelNorm: "11.5" },
    { plateNumber: "99C-111.11", loadCapacity: "10T", type: "10T", driverName: "Auto Driver", route: "A - B", status: "San sang" },
  ];

  assert.deepEqual(
    officialNpVehicles(vehicles).map((vehicle) => vehicle.plateNumber),
    ["29H-123.45", "29H-222.22", "29H-333.33"],
  );
});
