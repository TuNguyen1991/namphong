import { fuelDateKey } from "./fuelAccounting.js";

function toLocalDateInput(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isInactiveDriverStatus(status) {
  const text = normalizeText(status);
  return ["nghi viec", "da nghi", "ngung viec", "ket thuc hop dong"].includes(text);
}

function isDriverActiveForAttendance(driver = {}, bounds = {}) {
  if (isInactiveDriverStatus(driver.status)) return false;
  const contractEnd = fuelDateKey(driver.contractEnd);
  return !contractEnd || contractEnd >= bounds.from;
}

function driverAttendanceBounds(driver = {}, bounds = {}) {
  const contractStart = fuelDateKey(driver.contractStart);
  const contractEnd = fuelDateKey(driver.contractEnd);
  const from = contractStart && contractStart > bounds.from ? contractStart : bounds.from;
  const to = contractEnd && contractEnd < bounds.to ? contractEnd : bounds.to;
  return { from, to };
}

function countDaysInclusive(from, to) {
  if (!from || !to || from > to) return 0;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function isDriverActiveForManagement(driver = {}, today = new Date()) {
  if (isInactiveDriverStatus(driver.status)) return false;
  const contractEnd = fuelDateKey(driver.contractEnd);
  const todayKey = toLocalDateInput(today);
  return !contractEnd || contractEnd >= todayKey;
}

export function officialNpDrivers(drivers = []) {
  return drivers.filter((driver) => !String(driver.employeeCode || "").trim().toUpperCase().startsWith("AUTO"));
}

export function driverDocumentStatusLabel(value) {
  return value ? "Có" : "Chưa có";
}

export function sortDriversForManagement(drivers = [], today = new Date()) {
  return drivers
    .map((driver, index) => ({ driver, index, isActive: isDriverActiveForManagement(driver, today) }))
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ driver }) => driver);
}

export function selectableAttendanceDrivers(drivers = [], leaveDateOrMonth = "", today = new Date()) {
  const monthValue = fuelDateKey(leaveDateOrMonth).slice(0, 7) || String(leaveDateOrMonth || "").slice(0, 7);
  const bounds = attendanceMonthBounds(monthValue, today);
  return drivers.filter((driver) => driver.name && isDriverActiveForAttendance(driver, bounds));
}

export function attendanceMonthBounds(monthValue, today = new Date()) {
  const [year, month] = String(monthValue || toLocalDateInput(today).slice(0, 7)).split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month - 1;
  return {
    from: toLocalDateInput(start),
    to: toLocalDateInput(isCurrentMonth ? today : end),
    fullMonthTo: toLocalDateInput(end),
  };
}

export function countAttendanceWorkdays(monthValue, today = new Date()) {
  const [year, month] = String(monthValue || toLocalDateInput(today).slice(0, 7)).split("-").map(Number);
  if (today.getFullYear() === year && today.getMonth() === month - 1) return today.getDate();
  return new Date(year, month, 0).getDate();
}

export function attendanceMonthForLeaveDate(leaveDate, fallbackMonth = "") {
  return fuelDateKey(leaveDate).slice(0, 7) || fallbackMonth;
}

export function buildDriverAttendanceModel({ rows = [], drivers = [], monthValue = "", today = new Date() } = {}) {
  const bounds = attendanceMonthBounds(monthValue, today);
  const standardWorkdays = countAttendanceWorkdays(monthValue, today);
  const sortedRows = [...rows].sort((a, b) => {
    const byDate = fuelDateKey(b.leaveDate).localeCompare(fuelDateKey(a.leaveDate));
    if (byDate) return byDate;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  const monthLeaveRows = sortedRows.filter((row) => {
    const key = fuelDateKey(row.leaveDate);
    return key >= bounds.from && key <= bounds.to;
  });
  const leaveDatesByDriver = new Map();
  for (const row of monthLeaveRows) {
    const driverName = row.driverName || "Chưa có tên";
    const key = fuelDateKey(row.leaveDate);
    if (!key) continue;
    const dates = leaveDatesByDriver.get(driverName) || new Set();
    dates.add(key);
    leaveDatesByDriver.set(driverName, dates);
  }
  const activeDrivers = drivers.filter((driver) => {
    if (!isDriverActiveForAttendance(driver, bounds)) return false;
    const driverBounds = driverAttendanceBounds(driver, bounds);
    return driverBounds.from <= driverBounds.to;
  });
  const inactiveDriverNames = new Set(
    drivers
      .filter((driver) => !isDriverActiveForAttendance(driver, bounds))
      .map((driver) => driver.name)
      .filter(Boolean),
  );
  const driverNames = new Set([
    ...activeDrivers.map((driver) => driver.name).filter(Boolean),
    ...sortedRows.map((row) => row.driverName).filter((name) => name && !inactiveDriverNames.has(name)),
  ]);
  const activeDriverByName = new Map(activeDrivers.map((driver) => [driver.name, driver]));
  const summary = [...driverNames].sort((a, b) => a.localeCompare(b, "vi")).map((driverName) => {
    const driverBounds = driverAttendanceBounds(activeDriverByName.get(driverName) || {}, bounds);
    const driverStandardWorkdays = countDaysInclusive(driverBounds.from, driverBounds.to);
    const leaveDays = [...(leaveDatesByDriver.get(driverName) || [])].filter((key) => key >= driverBounds.from && key <= driverBounds.to).length;
    return {
      driverName,
      standardWorkdays: driverStandardWorkdays,
      leaveDays,
      workdays: Math.max(driverStandardWorkdays - leaveDays, 0),
    };
  });
  const totals = summary.reduce(
    (sum, row) => ({
      workdays: sum.workdays + row.workdays,
      leaveDays: sum.leaveDays + row.leaveDays,
    }),
    { workdays: 0, leaveDays: 0 },
  );
  return { rows: sortedRows, monthLeaveRows, summary, totals, bounds, standardWorkdays };
}

export function driverAttendanceDetailRows(model = {}) {
  return Array.isArray(model.monthLeaveRows) ? model.monthLeaveRows : [];
}
