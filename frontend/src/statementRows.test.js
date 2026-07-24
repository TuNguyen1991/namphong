import test from "node:test";
import assert from "node:assert/strict";
import { buildStatementRows, statementColumnTotals, statementExportRows } from "./statementRows.js";

test("buildStatementRows filters trips and calculates rate, fees, and total", () => {
  const rows = buildStatementRows({
    trips: [
      {
        id: 1,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-07-02T08:00:00.000Z",
        plateNumber: "29H-123.45",
        driverName: "Nguyen Van A",
        cargoWeight: "10T",
        routeCode: "VSIP - NOI BAI",
        handlingFeeAmount: "200000",
        otherFees: [
          { description: "Luu dem cho lai xe", amount: "100000" },
          { description: "Ve kho", amount: "30000" },
          { description: "Phi khac", amount: "50000" },
        ],
        note: "Ghi chu",
      },
      {
        id: 2,
        customerCode: "OTHER",
        requiredArrivalAt: "2026-07-02T08:00:00.000Z",
        routeCode: "VSIP - NOI BAI",
        cargoWeight: "10T",
      },
      {
        id: 3,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-07-10T08:00:00.000Z",
        routeCode: "VSIP - NOI BAI",
        cargoWeight: "10T",
      },
    ],
    rates: [{ customer: "ALSE", route: "VSIP - NOI BAI", rate10: "1000000" }],
    filters: { customerCode: "ALSE", fromDate: "2026-07-01", toDate: "2026-07-05" },
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    index: 1,
    id: 1,
    date: "02/07/2026",
    plateNumber: "29H-123.45",
    driverName: "Nguyen Van A",
    cargoWeight: "10T",
    routeCode: "VSIP - NOI BAI",
    point1ArrivalAt: "",
    point1DepartAt: "",
    point2ArrivalAt: "",
    point2DepartAt: "",
    overnightCount: 0,
    waitingHours: 0,
    freightRate: 1000000,
    fuelSurchargeFee: 0,
    parkingFee: 0,
    waitingFee: 0,
    handlingFee: 200000,
    warehouseTicketFee: 30000,
    otherFee: 50000,
    totalAmount: 1280000,
    note: "Ghi chu",
  });
});

test("buildStatementRows calculates overnight, waiting hours, waiting fee, and remaining other fees", () => {
  const rows = buildStatementRows({
    trips: [
      {
        id: 1,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-07-02T08:00:00.000Z",
        plateNumber: "29H-123.45",
        driverName: "Nguyen Van A",
        cargoWeight: "10T",
        routeCode: "VSIP - NOI BAI",
        point1ArrivalAt: "2026-07-01T08:00:00.000Z",
        point1DepartAt: "2026-07-01T09:00:00.000Z",
        point2ArrivalAt: "2026-07-03T10:00:00.000Z",
        point2DepartAt: "2026-07-03T14:00:00.000Z",
        handlingFeeAmount: "200000",
        otherFees: [
          { description: "Ve kho", amount: "30000" },
          { description: "Phi khac", amount: "50000" },
          { description: "Kiem hoa", amount: "70000" },
        ],
      },
    ],
    rates: [{ customer: "ALSE", route: "VSIP - NOI BAI", rate10: "1000000" }],
    transportFees: [
      { content: "Mien phi cho (tu diem A den diem B)", gia_10t: "4" },
      { content: "Gio cho", gia_10t: "100000" },
      { content: "Luu ca xe", gia_10t: "1000000" },
    ],
  });

  assert.equal(rows[0].point1ArrivalAt, "01/07/2026 08:00");
  assert.equal(rows[0].point1DepartAt, "01/07/2026 09:00");
  assert.equal(rows[0].point2ArrivalAt, "03/07/2026 10:00");
  assert.equal(rows[0].point2DepartAt, "03/07/2026 14:00");
  assert.equal(rows[0].overnightCount, 2);
  assert.equal(rows[0].parkingFee, 2000000);
  assert.equal(rows[0].waitingHours, 26);
  assert.equal(rows[0].waitingFee, 2600000);
  assert.equal(rows[0].otherFee, 120000);
  assert.equal(rows[0].totalAmount, 5950000);
});

test("buildStatementRows calculates fuel surcharge from freight rate by planned date", () => {
  const rows = buildStatementRows({
    trips: [
      {
        id: 1,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-07-10T08:00:00.000Z",
        cargoWeight: "10T",
        routeCode: "VSIP - NOI BAI",
      },
      {
        id: 2,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-07-20T08:00:00.000Z",
        cargoWeight: "10T",
        routeCode: "VSIP - NOI BAI",
      },
      {
        id: 3,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-08-01T08:00:00.000Z",
        cargoWeight: "10T",
        routeCode: "VSIP - NOI BAI",
      },
    ],
    rates: [{ customer: "ALSE", route: "VSIP - NOI BAI", rate10: "1000000" }],
    fuelSurcharges: [
      { content: "Phu phi xang dau thang 7", dateFrom: "2026-07-01", dateTo: "2026-07-15", percent: "8" },
      { content: "Phu phi xang dau nua cuoi thang 7", dateFrom: "2026-07-16", dateTo: "2026-07-31", percent: "10" },
    ],
  });

  assert.equal(rows[0].fuelSurchargeFee, 80000);
  assert.equal(rows[0].totalAmount, 1080000);
  assert.equal(rows[1].fuelSurchargeFee, 100000);
  assert.equal(rows[1].totalAmount, 1100000);
  assert.equal(rows[2].fuelSurchargeFee, 0);
  assert.equal(rows[2].totalAmount, 1000000);
});

test("buildStatementRows rounds waiting hours up to the nearest half hour", () => {
  const rows = buildStatementRows({
    trips: [
      {
        id: 1,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-07-02T08:00:00.000Z",
        cargoWeight: "10T",
        routeCode: "VSIP - NOI BAI",
        point1ArrivalAt: "2026-07-01T08:00:00.000Z",
        point2DepartAt: "2026-07-03T09:15:00.000Z",
      },
    ],
    transportFees: [
      { content: "Mien phi cho", gia_10t: "0" },
      { content: "Gio cho", gia_10t: "100000" },
      { content: "Luu ca xe", gia_10t: "1000000" },
    ],
  });

  assert.equal(rows[0].overnightCount, 2);
  assert.equal(rows[0].waitingHours, 25.5);
  assert.equal(rows[0].waitingFee, 2550000);
});

test("buildStatementRows parses day-month planned dates with filter year and sorts by planned date", () => {
  const rows = buildStatementRows({
    trips: [
      {
        id: 2,
        customerCode: "ALSE",
        requiredArrivalAt: "21:52 30-05",
        plateNumber: "99H03457",
        cargoWeight: "10T",
        routeCode: "VSIP BAC NINH - NOI BAI",
        point1ArrivalAt: "21:52 30-05",
        point2DepartAt: "01:55 31-05",
      },
      {
        id: 1,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-05-27T08:00:00.000Z",
        cargoWeight: "10T",
        routeCode: "A - B",
      },
      {
        id: 3,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-06-26T08:00:00.000Z",
        cargoWeight: "10T",
        routeCode: "OUTSIDE",
      },
    ],
    filters: { customerCode: "ALSE", fromDate: "2026-05-26", toDate: "2026-06-25" },
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.id), [1, 2]);
  assert.equal(rows[1].date, "30/05/2026");
  assert.equal(rows[1].point1ArrivalAt, "30/05/2026 21:52");
  assert.equal(rows[1].point2DepartAt, "31/05/2026 01:55");
  assert.deepEqual(rows.map((row) => row.index), [1, 2]);
});

test("buildStatementRows filters ISO planned dates by local planned date", () => {
  const rows = buildStatementRows({
    trips: [
      {
        id: 1,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-07-01T23:30:00.000Z",
        cargoWeight: "10T",
        routeCode: "NOI BAI - VSIP",
      },
    ],
    filters: { fromDate: "2026-07-02", toDate: "2026-07-02" },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, "02/07/2026");
});

test("buildStatementRows leaves freight rate empty when no matching rate is found", () => {
  const rows = buildStatementRows({
    trips: [{ id: 1, customerCode: "ALSE", requiredArrivalAt: "2026-07-02T08:00:00.000Z", routeCode: "A - B", cargoWeight: "5T" }],
    rates: [],
    filters: {},
  });

  assert.equal(rows[0].freightRate, 0);
  assert.equal(rows[0].totalAmount, 0);
});

test("buildStatementRows matches freight rates despite route accents and extra spacing", () => {
  const rows = buildStatementRows({
    trips: [
      {
        id: 927,
        customerCode: "ALSE",
        requiredArrivalAt: "2026-06-27T08:30:00.000Z",
        routeCode: "VSIP BẮC NINH -  QUẾ VÕ",
        cargoWeight: "10T",
      },
    ],
    rates: [{ customer: "ALSE", route: "VSIP BAC NINH - QUE VO", rate10: "1200000" }],
  });

  assert.equal(rows[0].freightRate, 1200000);
  assert.equal(rows[0].totalAmount, 1200000);
});

test("statementColumnTotals totals each money column", () => {
  const totals = statementColumnTotals([
    { freightRate: 1000000, fuelSurchargeFee: 80000, parkingFee: 100000, waitingFee: 250000, handlingFee: 200000, warehouseTicketFee: 30000, otherFee: 50000, totalAmount: 1710000 },
    { freightRate: 700000, fuelSurchargeFee: 70000, parkingFee: 0, waitingFee: 100000, handlingFee: 150000, warehouseTicketFee: 20000, otherFee: 0, totalAmount: 1040000 },
  ]);

  assert.deepEqual(totals, {
    freightRate: 1700000,
    fuelSurchargeFee: 150000,
    parkingFee: 100000,
    waitingFee: 350000,
    handlingFee: 350000,
    warehouseTicketFee: 50000,
    otherFee: 50000,
    totalAmount: 2750000,
  });
});

test("statementExportRows returns Excel-ready statement rows in table order", () => {
  const rows = statementExportRows([
    {
      index: 1,
      date: "30/05/2026",
      plateNumber: "99H03457",
      driverName: "Cáp Trung Quang",
      cargoWeight: "10T",
      routeCode: "VSIP BAC NINH - NOI BAI",
      point1ArrivalAt: "30/05/2026 21:52",
      point1DepartAt: "30/05/2026 22:40",
      point2ArrivalAt: "30/05/2026 23:48",
      point2DepartAt: "31/05/2026 01:55",
      overnightCount: 0,
      waitingHours: 0,
      freightRate: 1500000,
      parkingFee: 0,
      waitingFee: 0,
      handlingFee: 0,
      warehouseTicketFee: 0,
      otherFee: 0,
      fuelSurchargeFee: 0,
      totalAmount: 1500000,
      note: "",
    },
  ]);

  assert.deepEqual(rows[0], [
    "STT",
    "Ngày",
    "Biển kiểm soát",
    "Lái xe",
    "Tải trọng",
    "Tuyến đường",
    "Đến điểm 1",
    "Rời điểm 1",
    "Đến điểm 2",
    "Rời điểm 2",
    "Lưu đêm",
    "Số giờ chờ",
    "Giá cước",
    "Phụ phí xăng dầu",
    "Phí lưu xe",
    "Phí chờ giờ",
    "Phí bốc xếp",
    "Vé kho",
    "Phí khác",
    "Tổng tiền",
    "Ghi chú",
  ]);
  assert.deepEqual(rows[1], [
    1,
    "30/05/2026",
    "99H03457",
    "Cáp Trung Quang",
    "10T",
    "VSIP BAC NINH - NOI BAI",
    "30/05/2026 21:52",
    "30/05/2026 22:40",
    "30/05/2026 23:48",
    "31/05/2026 01:55",
    0,
    0,
    1500000,
    0,
    0,
    0,
    0,
    0,
    0,
    1500000,
    "",
  ]);
});
