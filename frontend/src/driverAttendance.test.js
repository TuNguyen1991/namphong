import test from "node:test";
import assert from "node:assert/strict";
import {
  attendanceMonthForLeaveDate,
  buildDriverAttendanceModel,
  driverAttendanceDetailRows,
  officialNpDrivers,
  selectableAttendanceDrivers,
  sortDriversForManagement,
  driverDocumentStatusLabel,
} from "./driverAttendance.js";

test("attendanceMonthForLeaveDate switches the view to the saved leave month", () => {
  assert.equal(attendanceMonthForLeaveDate("2026-07-16", "2026-06"), "2026-07");
  assert.equal(attendanceMonthForLeaveDate("16/07/2026", "2026-06"), "2026-07");
  assert.equal(attendanceMonthForLeaveDate("", "2026-06"), "2026-06");
});

test("buildDriverAttendanceModel treats leave rows as days off and unmarked days as working days", () => {
  const model = buildDriverAttendanceModel({
    rows: [
      { id: 1, driverName: "A", leaveDate: "2026-06-01" },
      { id: 2, driverName: "A", leaveDate: "2026-06-01" },
      { id: 3, driverName: "A", leaveDate: "2026-06-02" },
      { id: 4, driverName: "B", leaveDate: "2026-06-03" },
      { id: 5, driverName: "A", leaveDate: "2026-07-01" },
    ],
    drivers: [{ name: "A" }, { name: "B" }, { name: "C" }],
    monthValue: "2026-06",
    today: new Date("2026-07-02T00:00:00"),
  });

  assert.equal(model.standardWorkdays, 30);
  assert.equal(model.monthLeaveRows.length, 4);
  assert.deepEqual(
    model.summary.map((row) => [row.driverName, row.leaveDays, row.workdays]),
    [
      ["A", 2, 28],
      ["B", 1, 29],
      ["C", 0, 30],
    ],
  );
  assert.deepEqual(model.totals, { workdays: 87, leaveDays: 3 });
});

test("buildDriverAttendanceModel counts only days elapsed for the current month", () => {
  const model = buildDriverAttendanceModel({
    rows: [
      { id: 1, driverName: "A", leaveDate: "2026-07-01" },
      { id: 2, driverName: "A", leaveDate: "2026-07-03" },
      { id: 3, driverName: "B", leaveDate: "2026-07-02" },
    ],
    drivers: [{ name: "A" }, { name: "B" }],
    monthValue: "2026-07",
    today: new Date("2026-07-02T00:00:00"),
  });

  assert.equal(model.standardWorkdays, 2);
  assert.deepEqual(
    model.summary.map((row) => [row.driverName, row.leaveDays, row.workdays]),
    [
      ["A", 1, 1],
      ["B", 1, 1],
    ],
  );
  assert.deepEqual(model.totals, { workdays: 2, leaveDays: 2 });
});

test("buildDriverAttendanceModel excludes drivers whose contract ended before the viewed month", () => {
  const model = buildDriverAttendanceModel({
    rows: [
      { id: 1, driverName: "Ended In June", leaveDate: "2026-07-01" },
      { id: 2, driverName: "Resigned", leaveDate: "2026-07-02" },
      { id: 3, driverName: "Unknown Leave Driver", leaveDate: "2026-07-02" },
    ],
    drivers: [
      { name: "Active Driver", contractEnd: "" },
      { name: "Ended In June", contractEnd: "30/06/2026" },
      { name: "Ends In July", contractEnd: "2026-07-01" },
      { name: "Resigned", status: "Nghỉ việc" },
    ],
    monthValue: "2026-07",
    today: new Date("2026-07-03T00:00:00"),
  });

  assert.deepEqual(
    model.summary.map((row) => row.driverName),
    ["Active Driver", "Ends In July", "Unknown Leave Driver"],
  );
});

test("buildDriverAttendanceModel counts workdays within contract range for each driver", () => {
  const model = buildDriverAttendanceModel({
    rows: [
      { id: 1, driverName: "Starts Mid Month", leaveDate: "2026-07-11" },
      { id: 2, driverName: "Starts Mid Month", leaveDate: "2026-07-09" },
      { id: 3, driverName: "Ends Mid Month", leaveDate: "2026-07-15" },
      { id: 4, driverName: "Ended Before Month", leaveDate: "2026-07-01" },
    ],
    drivers: [
      { name: "Starts Mid Month", contractStart: "2026-07-10" },
      { name: "Ends Mid Month", contractEnd: "2026-07-15" },
      { name: "Ended Before Month", contractEnd: "2026-06-30" },
    ],
    monthValue: "2026-07",
    today: new Date("2026-07-20T00:00:00"),
  });

  assert.deepEqual(
    model.summary.map((row) => [row.driverName, row.standardWorkdays, row.leaveDays, row.workdays]),
    [
      ["Ends Mid Month", 15, 1, 14],
      ["Starts Mid Month", 11, 1, 10],
    ],
  );
});

test("driverAttendanceDetailRows shows only selected-month leave rows for the detail table", () => {
  const model = buildDriverAttendanceModel({
    rows: [
      { id: 1, driverName: "A", leaveDate: "2026-06-12" },
      { id: 2, driverName: "A", leaveDate: "2026-07-01" },
    ],
    drivers: [{ name: "A" }],
    monthValue: "2026-07",
    today: new Date("2026-07-20T00:00:00"),
  });

  assert.deepEqual(model.monthLeaveRows.map((row) => row.leaveDate), ["2026-07-01"]);
  assert.deepEqual(driverAttendanceDetailRows(model).map((row) => row.leaveDate), ["2026-07-01"]);
});

test("selectableAttendanceDrivers hides ended and resigned drivers for the leave month", () => {
  const drivers = [
    { name: "Active Driver", contractEnd: "" },
    { name: "Ended In June", contractEnd: "30/06/2026" },
    { name: "Ends In July", contractEnd: "2026-07-01" },
    { name: "Resigned", status: "Nghỉ việc" },
  ];

  assert.deepEqual(
    selectableAttendanceDrivers(drivers, "2026-07-03").map((driver) => driver.name),
    ["Active Driver", "Ends In July"],
  );
});

test("sortDriversForManagement puts ended and resigned drivers at the bottom", () => {
  const drivers = [
    { name: "Active Driver" },
    { name: "Ended Yesterday", contractEnd: "2026-07-02" },
    { name: "Ends Today", contractEnd: "2026-07-03" },
    { name: "Resigned Driver", status: "Nghỉ việc" },
    { name: "Active Future End", contractEnd: "2026-07-04" },
  ];

  assert.deepEqual(
    sortDriversForManagement(drivers, new Date("2026-07-03T00:00:00")).map((driver) => driver.name),
    ["Active Driver", "Ends Today", "Active Future End", "Ended Yesterday", "Resigned Driver"],
  );
});

test("officialNpDrivers excludes automatically generated driver records", () => {
  const drivers = [
    { name: "Manual Driver", employeeCode: "NP001" },
    { name: "Auto Driver", employeeCode: "AUTO0021" },
    { name: "Spaced Auto Driver", employeeCode: " auto0022 " },
    { name: "No Code Driver", employeeCode: "" },
  ];

  assert.deepEqual(
    officialNpDrivers(drivers).map((driver) => driver.name),
    ["Manual Driver", "No Code Driver"],
  );
});

test("driverDocumentStatusLabel returns compact Vietnamese document status", () => {
  assert.equal(driverDocumentStatusLabel(true), "Có");
  assert.equal(driverDocumentStatusLabel(false), "Chưa có");
  assert.equal(driverDocumentStatusLabel(1), "Có");
  assert.equal(driverDocumentStatusLabel(""), "Chưa có");
});
