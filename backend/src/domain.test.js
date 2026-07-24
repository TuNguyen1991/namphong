import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveTripStatus,
  formatOrderCode,
  nextDailyOrderSequence,
  normalizeCargoWeight,
  normalizeTripFees,
  normalizeVehicleType,
  normalizeWaybills,
  sortTripsForBoard,
  gateLogStatus,
  buildGateLog,
  markGateIn,
  markGateOut,
  applyDriverStopEvent,
  buildDriverTripView,
  localMysqlDateTime,
  createAuditFields,
  shouldSyncUnloadArrivalFromGate,
} from "./domain.js";

test("formatOrderCode uses yymmddxxx", () => {
  assert.equal(formatOrderCode(new Date("2026-06-10T00:00:00"), 1), "260610001");
  assert.equal(formatOrderCode(new Date("2026-06-10T00:00:00"), 27), "260610027");
});

test("localMysqlDateTime stores API ISO time as local database wall time", () => {
  assert.equal(localMysqlDateTime("2026-06-16T02:30:00.000Z"), "2026-06-16 09:30:00");
});

test("createAuditFields records input account and input time", () => {
  assert.deepEqual(createAuditFields({ createdBy: "dispatcher" }, new Date("2026-06-16T04:30:00.000Z")), {
    createdBy: "dispatcher",
    createdAt: "2026-06-16T04:30:00.000Z",
  });
});

test("normalizeCargoWeight keeps fixed truck load options", () => {
  assert.equal(normalizeCargoWeight("1.2T"), "1.2T");
  assert.equal(normalizeCargoWeight(2.5), "2.5T");
  assert.equal(normalizeCargoWeight("Cont40"), "Cont40");
  assert.equal(normalizeCargoWeight("Cont45"), "Cont45");
  assert.equal(normalizeCargoWeight("Cont40T"), "Cont40");
  assert.equal(normalizeCargoWeight("cont45t"), "Cont45");
});

test("normalizeWaybills keeps multiple bill rows and falls back from legacy fields", () => {
  assert.deepEqual(
    normalizeWaybills({
      waybills: [
        { hawb: " h1 ", mawb: " m1 ", packageCount: "10", grossWeight: "100.5" },
        { hawb: "", mawb: "", packageCount: "", grossWeight: "" },
        { hawb: "h2", mawb: "m2", packageCount: "5", grossWeight: "40" },
      ],
    }),
    [
      { hawb: "H1", mawb: "M1", packageCount: "10", grossWeight: "100.5" },
      { hawb: "H2", mawb: "M2", packageCount: "5", grossWeight: "40" },
    ],
  );
  assert.deepEqual(normalizeWaybills({ hawb: "oldh", mawb: "oldm", packageCount: 3, grossWeight: 20 }), [
    { hawb: "OLDH", mawb: "OLDM", packageCount: "3", grossWeight: "20" },
  ]);
});

test("normalizeTripFees keeps handling fee and non-empty other fee rows", () => {
  assert.deepEqual(
    normalizeTripFees({
      handlingFeeSide: "Đầu nhận",
      handlingFeeAmount: "150000",
      otherFees: [
        { description: "Chờ bốc", amount: "200000" },
        { description: "", amount: "" },
        { description: "Phí đêm", amount: 50000 },
      ],
    }),
    {
      handlingFeeSide: "Đầu nhận",
      handlingFeeAmount: "150000",
      otherFees: [
        { description: "Chờ bốc", amount: "200000" },
        { description: "Phí đêm", amount: "50000" },
      ],
    },
  );

  assert.deepEqual(normalizeTripFees({ handlingFeeSide: "Sai", handlingFeeAmount: "100" }), {
    handlingFeeSide: "Không",
    handlingFeeAmount: "",
    otherFees: [],
  });
});

test("normalizeTripFees cleans formatted money values from edit forms", () => {
  assert.deepEqual(
    normalizeTripFees({
      handlingFeeSide: "Hai đầu",
      handlingFeeAmount: "100.00",
      otherFees: [
        { description: "Vé kho", amount: "55,000" },
        { description: "Vé cao tốc", amount: "40.000" },
      ],
    }),
    {
      handlingFeeSide: "Hai đầu",
      handlingFeeAmount: "100",
      otherFees: [
        { description: "Vé kho", amount: "55000" },
        { description: "Vé cao tốc", amount: "40000" },
      ],
    },
  );
});

test("nextDailyOrderSequence resets by order date", () => {
  const trips = [
    { orderCode: "260609009" },
    { orderCode: "260610001" },
    { orderCode: "260610002" },
  ];
  assert.equal(nextDailyOrderSequence(trips, new Date("2026-06-10T18:00:00")), 3);
  assert.equal(nextDailyOrderSequence(trips, new Date("2026-06-11T08:00:00")), 1);
});

test("normalizeVehicleType defaults only when empty", () => {
  assert.equal(normalizeVehicleType(), "Th\u01b0\u1eddng");
  assert.equal(normalizeVehicleType("L\u1ea1nh"), "L\u1ea1nh");
  assert.equal(normalizeVehicleType("B\u00f3ng h\u01a1i"), "B\u00f3ng h\u01a1i");
  assert.equal(normalizeVehicleType("Mui bat"), "Mui bat");
});

test("sortTripsForBoard groups by status then newest planned time first, completed last", () => {
  const trips = [
    { orderCode: "C2", status: "completed", requiredArrivalAt: "2026-06-10T08:00:00.000Z" },
    { orderCode: "A2", status: "plan", requiredArrivalAt: "2026-06-10T10:00:00.000Z" },
    { orderCode: "B1", status: "arrived_1", requiredArrivalAt: "2026-06-10T09:00:00.000Z" },
    { orderCode: "A1", status: "plan", requiredArrivalAt: "2026-06-10T08:00:00.000Z" },
    { orderCode: "C1", status: "completed", requiredArrivalAt: "2026-06-10T07:00:00.000Z" },
  ];
  assert.deepEqual(sortTripsForBoard(trips).map((trip) => trip.orderCode), ["A2", "A1", "B1", "C2", "C1"]);
});

test("deriveTripStatus follows two-point route timing rules", () => {
  assert.deepEqual(deriveTripStatus({}, false), { status: "plan", label: "Plan" });
  assert.deepEqual(deriveTripStatus({ plateNumber: "29H-123.45" }, false), {
    status: "booked_truck",
    label: "Booked truck",
  });
  assert.deepEqual(deriveTripStatus({ point1ArrivalAt: "x" }, false), { status: "arrived_1", label: "Arrived 1" });
  assert.deepEqual(deriveTripStatus({ point1ArrivalAt: "x", point1DepartAt: "x" }, false), {
    status: "trucking_to_2",
    label: "Trucking to 2",
  });
  assert.deepEqual(deriveTripStatus({ point1ArrivalAt: "x", point1DepartAt: "x", point2ArrivalAt: "x" }, false), {
    status: "arrived_2",
    label: "Arrived 2",
  });
  assert.deepEqual(
    deriveTripStatus({ point1ArrivalAt: "x", point1DepartAt: "x", point2ArrivalAt: "x", point2DepartAt: "x" }, false),
    { status: "completed", label: "Complete" },
  );
});

test("deriveTripStatus follows three-point route timing rules", () => {
  const throughPoint2 = { point1ArrivalAt: "x", point1DepartAt: "x", point2ArrivalAt: "x", point2DepartAt: "x" };
  assert.deepEqual(deriveTripStatus(throughPoint2, true), { status: "trucking_to_3", label: "Trucking to 3" });
  assert.deepEqual(deriveTripStatus({ ...throughPoint2, point3ArrivalAt: "x" }, true), {
    status: "arrived_3",
    label: "Arrived 3",
  });
  assert.deepEqual(deriveTripStatus({ ...throughPoint2, point3ArrivalAt: "x", point3DepartAt: "x" }, true), {
    status: "completed",
    label: "Complete",
  });
});

test("gate log lifecycle starts waiting, then inside, then completed", () => {
  const log = buildGateLog(
    {
      plateNumber: " 99h-123.45 ",
      driverName: "Nguyen Van A",
      driverPhone: "0900000000",
      note: "Xe ngoai",
    },
    7,
    new Date("2026-06-11T08:00:00.000Z"),
  );

  assert.equal(log.id, 7);
  assert.equal(log.plateNumber, "99H-123.45");
  assert.equal(log.status, "waiting");
  assert.equal(log.statusLabel, "Chờ vào");
  assert.equal(log.registeredAt, "2026-06-11T08:00:00.000Z");
  assert.equal(log.gateInAt, "");
  assert.equal(log.gateOutAt, "");

  markGateIn(log, new Date("2026-06-11T08:15:00.000Z"));
  assert.deepEqual(gateLogStatus(log), { status: "inside", statusLabel: "Đang trong kho" });
  assert.equal(log.gateInAt, "2026-06-11T08:15:00.000Z");

  markGateOut(log, new Date("2026-06-11T09:30:00.000Z"));
  assert.deepEqual(gateLogStatus(log), { status: "completed", statusLabel: "Đã ra" });
  assert.equal(log.gateOutAt, "2026-06-11T09:30:00.000Z");
});

test("buildDriverTripView exposes ordered stops from trip route", () => {
  const view = buildDriverTripView({
    id: 10,
    orderCode: "260611010",
    routeCode: "Factory - VSIP - NBA",
    from: "Factory",
    to: "VSIP",
    via: "Noi Bai",
    plateNumber: "99H15151",
    driverName: "Tran Van A",
  });

  assert.deepEqual(
    view.stops.map((stop) => `${stop.stopNo}:${stop.name}:${stop.isVsip}`),
    ["1:Factory:false", "2:VSIP:true", "3:Noi Bai:false"],
  );
});

test("applyDriverStopEvent blocks depart before arrival", () => {
  assert.throws(
    () =>
      applyDriverStopEvent(
        { id: 10, routeCode: "Factory - VSIP", from: "Factory", to: "VSIP" },
        { stopNo: 1, eventType: "depart" },
        [],
        new Date("2026-06-11T09:00:00.000Z"),
      ),
    /Chưa có giờ đến/,
  );
});

test("applyDriverStopEvent updates non-VSIP trip fields with server time", () => {
  const trip = { id: 10, routeCode: "Factory - VSIP", from: "Factory", to: "VSIP" };
  const result = applyDriverStopEvent(
    trip,
    { stopNo: 1, eventType: "arrival" },
    [],
    new Date("2026-06-11T09:00:00.000Z"),
  );

  assert.equal(result.event.status, "confirmed");
  assert.equal(result.event.eventTime, "2026-06-11T09:00:00.000Z");
  assert.equal(trip.point1ArrivalAt, "2026-06-11T09:00:00.000Z");
});

test("applyDriverStopEvent records driver document without changing trip timeline", () => {
  const trip = { id: 10, orderCode: "260621001", routeCode: "Factory - VSIP", from: "Factory", to: "VSIP" };
  const result = applyDriverStopEvent(
    trip,
    {
      stopNo: 1,
      eventType: "document",
      reportType: "document",
      note: "POD signed",
      attachmentName: "pod.jpg",
      attachmentDataUrl: "data:image/jpeg;base64,abc",
    },
    [],
    new Date("2026-06-11T09:00:00.000Z"),
  );

  assert.equal(result.event.eventType, "document");
  assert.equal(result.event.reportType, "document");
  assert.equal(result.event.note, "POD signed");
  assert.equal(result.event.attachmentName, "pod.jpg");
  assert.equal(result.event.attachmentDataUrl, "data:image/jpeg;base64,abc");
  assert.equal(trip.point1ArrivalAt, undefined);
  assert.equal(trip.status, undefined);
});

test("applyDriverStopEvent rejects invalid driver report type", () => {
  const trip = { id: 10, orderCode: "260621001", routeCode: "Factory - VSIP", from: "Factory", to: "VSIP" };

  assert.throws(
    () => applyDriverStopEvent(
      trip,
      { stopNo: 1, eventType: "expense", reportType: "fuel" },
      [],
      new Date("2026-06-11T09:00:00.000Z"),
    ),
    /report type/i,
  );
});

test("buildDriverTripView exposes newest driver reports", () => {
  const trip = { id: 10, orderCode: "260621001", routeCode: "Factory - VSIP", from: "Factory", to: "VSIP" };
  const view = buildDriverTripView(trip, [
    { id: 1, tripId: 10, stopNo: 1, eventType: "arrival", eventTime: "2026-06-11T08:00:00.000Z" },
    { id: 2, tripId: 10, stopNo: 1, eventType: "document", reportType: "document", note: "POD", createdAt: "2026-06-11T09:00:00.000Z" },
    { id: 3, tripId: 10, stopNo: 2, eventType: "incident", reportType: "incident", note: "Flat tire", createdAt: "2026-06-11T10:00:00.000Z" },
  ]);

  assert.equal(view.reports.length, 2);
  assert.equal(view.reports[0].reportType, "incident");
  assert.equal(view.reports[1].reportType, "document");
});

test("applyDriverStopEvent records VSIP driver time as confirmed trip time", () => {
  const trip = {
    id: 10,
    routeCode: "Factory - VSIP",
    from: "Factory",
    to: "VSIP",
    point1ArrivalAt: "2026-06-11T08:00:00.000Z",
    point1DepartAt: "2026-06-11T08:15:00.000Z",
  };
  const result = applyDriverStopEvent(
    trip,
    { stopNo: 2, eventType: "arrival" },
    [],
    new Date("2026-06-11T09:00:00.000Z"),
  );

  assert.equal(result.event.status, "confirmed");
  assert.equal(result.event.eventTime, "2026-06-11T09:00:00.000Z");
  assert.equal(trip.point2ArrivalAt, "2026-06-11T09:00:00.000Z");
  assert.equal(trip.status, "arrived_2");
});

test("shouldSyncUnloadArrivalFromGate requires point 1 times and later unload time", () => {
  const trip = {
    point1ArrivalAt: "2026-07-03T08:00:00.000Z",
    point1DepartAt: "2026-07-03T08:30:00.000Z",
  };

  assert.equal(shouldSyncUnloadArrivalFromGate({ ...trip }, "2026-07-03T08:45:00.000Z"), true);
  assert.equal(shouldSyncUnloadArrivalFromGate({ ...trip, point1DepartAt: "" }, "2026-07-03T08:45:00.000Z"), false);
  assert.equal(shouldSyncUnloadArrivalFromGate({ ...trip }, "2026-07-03T08:30:00.000Z"), false);
  assert.equal(shouldSyncUnloadArrivalFromGate({ ...trip }, "2026-07-03T08:15:00.000Z"), false);
});
