import test from "node:test";
import assert from "node:assert/strict";
import { prepareBulkTripRows } from "./bulkTripRows.js";

test("prepareBulkTripRows ignores default blank rows with only planned date and vehicle type", () => {
  const rows = prepareBulkTripRows(
    [
      {
        customerCode: "DHL",
        routeText: "QV3 - VSIP - NBA",
        cargoWeight: "",
        vehicleType: "Thường",
        plannedDate: "2026-06-16",
        plannedTime: "09:30",
      },
      {
        customerCode: "",
        routeText: "",
        cargoWeight: "",
        vehicleType: "Thường",
        plannedDate: "2026-06-16",
        plannedTime: "",
      },
    ],
    [{ id: 7, customerCode: "DHL", routeCode: "QV3 - VSIP - NBA", type: "import" }],
    "admin",
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].routeId, 7);
  assert.equal(rows[0].routeCode, "QV3 - VSIP - NBA");
  assert.equal(rows[0].createdBy, "admin");
});

test("prepareBulkTripRows reports missing required fields only for meaningful edited rows", () => {
  assert.throws(
    () =>
      prepareBulkTripRows(
        [
          {
            customerCode: "",
            routeText: "QV3 - VSIP - NBA",
            vehicleType: "Thường",
            plannedDate: "2026-06-16",
            plannedTime: "",
          },
        ],
        [],
        "admin",
      ),
    /MISSING_REQUIRED_BULK_TRIP_ROW/,
  );
});
