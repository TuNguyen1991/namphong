import test from "node:test";
import assert from "node:assert/strict";
import { buildWaitingUnloadRows } from "./waitingUnload.js";

test("buildWaitingUnloadRows combines deliveries waiting at VSIP and inbound VSIP trips", () => {
  const rows = buildWaitingUnloadRows({
    deliveries: [
      {
        id: 1,
        customerCode: "DHL",
        status: "arrived_1",
        requiredArrivalAt: "2026-06-11T08:00:00.000Z",
        vsipArrivalAt: "2026-06-11T09:00:00.000Z",
        vsipDepartAt: "",
        plateNumber: "99C-111.11",
        waybills: [{ packageCount: "2", grossWeight: "30" }],
      },
      {
        id: 2,
        customerCode: "KN",
        status: "completed",
        vsipArrivalAt: "2026-06-11T09:00:00.000Z",
        vsipDepartAt: "2026-06-11T10:00:00.000Z",
      },
    ],
    trips: [
      {
        id: 10,
        orderCode: "260611001",
        customerCode: "EI",
        routeCode: "VP - VSIP",
        status: "arrived_2",
        requiredArrivalAt: "2026-06-11T07:00:00.000Z",
        point2ArrivalAt: "2026-06-11T08:30:00.000Z",
        point2DepartAt: "",
        plateNumber: "99H-222.22",
        waybills: [{ packageCount: "4", grossWeight: "80" }],
      },
      {
        id: 11,
        orderCode: "260611002",
        customerCode: "DHL",
        routeCode: "VSIP - NBA",
        status: "arrived_1",
        point1ArrivalAt: "2026-06-11T08:30:00.000Z",
        point1DepartAt: "",
      },
      {
        id: 12,
        orderCode: "260611003",
        customerCode: "DHL",
        routeCode: "QV3 - ALSE",
        status: "completed",
        point2ArrivalAt: "2026-06-11T08:30:00.000Z",
        point2DepartAt: "2026-06-11T09:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => `${row.source}:${row.id}`),
    ["transport:10", "delivery:1"],
  );
  assert.equal(rows[0].sourceLabel, "Vận chuyển");
  assert.equal(rows[0].vsipArrivalAt, "2026-06-11T08:30:00.000Z");
  assert.equal(rows[1].sourceLabel, "Giao hàng VSIP");
  assert.equal(rows[1].routeText, "Giao hàng VSIP");
});
