import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETED_BULK_TRIP_FIELDS,
  createCompletedBulkTripRows,
  prepareCompletedBulkTripRows,
} from "./completedBulkTripRows.js";

test("prepareCompletedBulkTripRows maps completed Excel rows to API payloads", () => {
  const rows = prepareCompletedBulkTripRows(
    [
      {
        plannedDate: "2026-07-06",
        customerCode: "ALSE",
        partnerCode: "DH",
        plateNumber: "29H-123.45",
        cargoWeight: "10T",
        driverName: "Nguyen Van A",
        routeText: "NOI BAI - VSIP",
        point1At: "2026-07-06 08:10",
        point2At: "2026-07-06 09:20",
        handlingFeeAmount: "200,000",
        warehouseTicketFee: "30,000",
        highwayTicketFee: "45000",
        driverOvernightFee: "100000",
        otherFeeAmount: "50000",
      },
    ],
    [{ id: 9, customerCode: "ALSE", routeCode: "NOI BAI - VSIP", type: "import" }],
    "admin",
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].customerCode, "ALSE");
  assert.equal(rows[0].routeId, 9);
  assert.equal(rows[0].routeCode, "NOI BAI - VSIP");
  assert.equal(rows[0].partnerCode, "DH");
  assert.equal(rows[0].plateNumber, "29H-123.45");
  assert.equal(rows[0].createdBy, "admin");
  assert.equal(rows[0].point1At, "2026-07-06T08:10");
  assert.equal(rows[0].point2At, "2026-07-06T09:20");
  assert.equal(rows[0].point3At, "");
  assert.equal(rows[0].handlingFeeAmount, "200000");
  assert.equal(rows[0].warehouseTicketFee, "30000");
});

test("prepareCompletedBulkTripRows maps separate depart times for completed rows", () => {
  const rows = prepareCompletedBulkTripRows(
    [
      {
        plannedDate: "06/07/2026",
        customerCode: "ALSE",
        partnerCode: "DH",
        plateNumber: "29H-123.45",
        driverName: "Nguyen Van A",
        routeText: "A - B - C",
        point1At: "08:10",
        point1DepartAt: "08:25",
        point2At: "09:20",
        point2DepartAt: "09:45",
        point3At: "10:30",
        point3DepartAt: "10:50",
      },
    ],
    [{ id: 9, customerCode: "ALSE", routeCode: "A - B - C", type: "import" }],
    "admin",
  );

  assert.equal(rows[0].point1At, "2026-07-06T08:10");
  assert.equal(rows[0].point1DepartAt, "2026-07-06T08:25");
  assert.equal(rows[0].point2At, "2026-07-06T09:20");
  assert.equal(rows[0].point2DepartAt, "2026-07-06T09:45");
  assert.equal(rows[0].point3At, "2026-07-06T10:30");
  assert.equal(rows[0].point3DepartAt, "2026-07-06T10:50");
});

test("prepareCompletedBulkTripRows derives planned date from point 1 and accepts Vietnamese date time", () => {
  const rows = prepareCompletedBulkTripRows(
    [
      {
        customerCode: "alse",
        partnerCode: "dh",
        plateNumber: "29h-123.45",
        driverName: "Nguyen Van A",
        routeText: "NOI BAI - VSIP",
        point1At: "06/07/2026 08:10",
        point2At: "06/07/2026 09:20",
      },
    ],
    [{ id: 9, customerCode: "ALSE", routeCode: "NOI BAI - VSIP", type: "import" }],
    "admin",
  );

  assert.equal(rows[0].plannedDate, "2026-07-06");
  assert.equal(rows[0].point1At, "2026-07-06T08:10");
  assert.equal(rows[0].point2At, "2026-07-06T09:20");
});

test("prepareCompletedBulkTripRows accepts Vietnamese planned date pasted from Excel", () => {
  const rows = prepareCompletedBulkTripRows(
    [
      {
        plannedDate: "06/07/2026",
        customerCode: "ALSE",
        partnerCode: "DH",
        plateNumber: "29H-123.45",
        driverName: "Nguyen Van A",
        routeText: "NOI BAI - VSIP",
        point1At: "08:10",
        point2At: "09:20",
      },
    ],
    [{ id: 9, customerCode: "ALSE", routeCode: "NOI BAI - VSIP", type: "import" }],
    "admin",
  );

  assert.equal(rows[0].plannedDate, "2026-07-06");
  assert.equal(rows[0].point1At, "2026-07-06T08:10");
  assert.equal(rows[0].point2At, "2026-07-06T09:20");
});

test("prepareCompletedBulkTripRows ignores blank rows and reports missing required fields", () => {
  assert.equal(prepareCompletedBulkTripRows(createCompletedBulkTripRows(2), [], "admin").length, 0);
  assert.throws(
    () =>
      prepareCompletedBulkTripRows(
        [{ plannedDate: "2026-07-06", customerCode: "ALSE", routeText: "NOI BAI - VSIP" }],
        [],
        "admin",
      ),
    /MISSING_REQUIRED_COMPLETED_BULK_TRIP_ROW/,
  );
});

test("COMPLETED_BULK_TRIP_FIELDS follows the approved column order", () => {
  assert.deepEqual(COMPLETED_BULK_TRIP_FIELDS, [
    "plannedDate",
    "customerCode",
    "partnerCode",
    "plateNumber",
    "cargoWeight",
    "driverName",
    "routeText",
    "point1At",
    "point1DepartAt",
    "point2At",
    "point2DepartAt",
    "point3At",
    "point3DepartAt",
    "handlingFeeAmount",
    "warehouseTicketFee",
    "highwayTicketFee",
    "driverOvernightFee",
    "otherFeeAmount",
  ]);
});
