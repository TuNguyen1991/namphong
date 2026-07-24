import test from "node:test";
import assert from "node:assert/strict";
import { buildGateRegistrationCandidates } from "./gateCandidates.js";

test("buildGateRegistrationCandidates lists only vehicles whose planned time is at least one hour overdue", () => {
  const rows = buildGateRegistrationCandidates({
    now: new Date("2026-06-11T09:00:00.000Z"),
    deliveries: [
      {
        id: 1,
        customerCode: "DHL",
        plateNumber: "99C-111.11",
        driverName: "Le Van A",
        driverPhone: "0901",
        requiredArrivalAt: "2026-06-11T08:00:00.000Z",
        vsipArrivalAt: "",
        vsipDepartAt: "",
      },
      {
        id: 4,
        customerCode: "DHL",
        plateNumber: "99C-444.44",
        requiredArrivalAt: "2026-06-11T08:30:00.000Z",
        vsipArrivalAt: "",
        vsipDepartAt: "",
      },
    ],
    waitingUnloadRows: [
      {
        id: 5,
        source: "transport",
        customerCode: "DHL",
        routeText: "VP - VSIP",
        plateNumber: "99C-555.55",
        driverName: "Le Van C",
        vsipArrivalAt: "2026-06-11T08:00:00.000Z",
      },
    ],
    trips: [
      {
        id: 2,
        orderCode: "260611002",
        customerCode: "EI",
        routeCode: "VSIP - NBA",
        from: "ALSE",
        to: "Noi Bai",
        status: "planned",
        requiredArrivalAt: "2026-06-11T08:00:00.000Z",
        point1ArrivalAt: "",
        point1DepartAt: "",
        plateNumber: "99H02551",
        driverName: "Tran Van B",
        driverPhone: "0902",
      },
      {
        id: 3,
        orderCode: "260611003",
        customerCode: "KN",
        routeCode: "VSIP - NBA",
        requiredArrivalAt: "2026-06-11T08:30:00.000Z",
        point1ArrivalAt: "",
        point1DepartAt: "",
        plateNumber: "99H-333.33",
      },
    ],
    gateLogs: [{ plateNumber: "99C-999.99", gateOutAt: "" }],
  });

  assert.deepEqual(
    rows.map((row) => `${row.purpose}:${row.plateNumber}`),
    ["unload:99C-111.11", "unload:99C-555.55", "export:99H02551"],
  );
  assert.equal(rows[0].source, "delivery");
  assert.equal(rows[0].routeText, "Giao hàng VSIP");
  assert.equal(rows[0].registeredAt, "2026-06-11T08:00:00.000Z");
  assert.equal(rows[2].purposeLabel, "Vào xuất hàng");
});

test("buildGateRegistrationCandidates hides vehicles already in open gate logs", () => {
  const rows = buildGateRegistrationCandidates({
    now: new Date("2026-06-11T09:00:00.000Z"),
    deliveries: [
      {
        id: 1,
        plateNumber: "99C-111.11",
        requiredArrivalAt: "2026-06-11T08:00:00.000Z",
        vsipDepartAt: "",
      },
    ],
    gateLogs: [{ plateNumber: "99C-111.11", gateOutAt: "" }],
  });

  assert.deepEqual(rows, []);
});

test("buildGateRegistrationCandidates lists in-transit factory to VSIP to Noi Bai trips after leaving point 1", () => {
  const rows = buildGateRegistrationCandidates({
    now: new Date("2026-06-11T09:00:00.000Z"),
    trips: [
      {
        id: 99,
        orderCode: "260611099",
        customerCode: "EI",
        routeCode: "Factory - VSIP - Noi Bai",
        from: "Factory",
        to: "VSIP",
        via: "Noi Bai",
        status: "trucking_to_2",
        requiredArrivalAt: "2026-06-11T07:00:00.000Z",
        point1ArrivalAt: "2026-06-11T07:00:00.000Z",
        point1DepartAt: "2026-06-11T07:15:00.000Z",
        point2ArrivalAt: "",
        point2DepartAt: "",
        plateNumber: "99H15151",
        driverName: "Tran Van B",
        driverPhone: "0902",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => `${row.purpose}:${row.purposeLabel}:${row.plateNumber}:${row.actualArrivalAt}`),
    ["unload-export:Hạ-xuất hàng:99H15151:"],
  );
  assert.equal(rows[0].routeText, "Factory - VSIP - Noi Bai");
  assert.equal(rows[0].planAt, "2026-06-11T07:15:00.000Z");
  assert.equal(rows[0].registeredAt, "2026-06-11T07:15:00.000Z");
});

test("buildGateRegistrationCandidates lists in-transit factory to VSIP trips after leaving point 1", () => {
  const rows = buildGateRegistrationCandidates({
    now: new Date("2026-06-11T09:00:00.000Z"),
    trips: [
      {
        id: 100,
        orderCode: "260611100",
        customerCode: "DHL",
        routeCode: "Factory - VSIP",
        from: "Factory",
        to: "VSIP",
        via: "",
        status: "trucking_to_2",
        requiredArrivalAt: "2026-06-11T07:00:00.000Z",
        point1ArrivalAt: "2026-06-11T07:00:00.000Z",
        point1DepartAt: "2026-06-11T07:20:00.000Z",
        point2ArrivalAt: "",
        point2DepartAt: "",
        plateNumber: "99H15152",
        driverName: "Tran Van C",
        driverPhone: "0903",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => `${row.purpose}:${row.purposeLabel}:${row.plateNumber}:${row.actualArrivalAt}`),
    ["unload:Hạ hàng:99H15152:"],
  );
  assert.equal(rows[0].routeText, "Factory - VSIP");
  assert.equal(rows[0].planAt, "2026-06-11T07:20:00.000Z");
  assert.equal(rows[0].registeredAt, "2026-06-11T07:20:00.000Z");
});
