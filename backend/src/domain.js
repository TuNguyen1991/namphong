export const CARGO_WEIGHT_OPTIONS = ["1.2T", "2.5T", "3.5T", "5T", "7T", "8T", "10T", "15T", "Cont40", "Cont45"];
export const HANDLING_FEE_SIDE_OPTIONS = ["Không", "Đầu nhận", "Đầu trả", "Hai đầu"];
export const VEHICLE_TYPE_OPTIONS = ["Thường", "Lạnh", "Bóng hơi"];

export const TRIP_STATUS_FLOW = [
  "plan",
  "booked_truck",
  "arrived_1",
  "trucking_to_2",
  "arrived_2",
  "trucking_to_3",
  "arrived_3",
  "completed",
];

export const TRIP_STATUS_LABELS = {
  plan: "Plan",
  booked_truck: "Booked truck",
  arrived_1: "Arrived 1",
  trucking_to_2: "Trucking to 2",
  arrived_2: "Arrived 2",
  trucking_to_3: "Trucking to 3",
  arrived_3: "Arrived 3",
  completed: "Complete",
};

export function formatOrderCode(date = new Date(), sequence = 1) {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}${String(sequence).padStart(3, "0")}`;
}

export function localMysqlDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function createAuditFields(payload = {}, now = new Date()) {
  return {
    createdBy: String(payload.createdBy || "").trim(),
    createdAt: payload.createdAt || now.toISOString(),
  };
}

export function orderCodePrefix(date = new Date()) {
  return formatOrderCode(date, 0).slice(0, 6);
}

export function nextDailyOrderSequence(trips, date = new Date()) {
  const prefix = orderCodePrefix(date);
  const maxSequence = trips.reduce((max, trip) => {
    const code = String(trip.orderCode || "");
    if (!code.startsWith(prefix)) return max;
    return Math.max(max, Number(code.slice(-3)) || 0);
  }, 0);
  return maxSequence + 1;
}

export function normalizeCargoWeight(value) {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).trim();
  const container = raw.match(/^cont(40|45)t?$/i);
  if (container) return `Cont${container[1]}`;
  const normalized = CARGO_WEIGHT_OPTIONS.find((option) => option.toLowerCase() === raw.toLowerCase());
  if (normalized) return normalized;
  const numeric = Number(raw.replace(/t$/i, ""));
  return Number.isFinite(numeric) ? `${numeric}T` : raw;
}

export function normalizeVehicleType(value) {
  const raw = String(value || "").trim();
  return raw || "Thường";
}

function normalizeWaybillRow(row = {}) {
  return {
    hawb: String(row.hawb || "").trim().toUpperCase(),
    mawb: String(row.mawb || "").trim().toUpperCase(),
    packageCount: row.packageCount === null || row.packageCount === undefined ? "" : String(row.packageCount).trim(),
    grossWeight: row.grossWeight === null || row.grossWeight === undefined ? "" : String(row.grossWeight).trim(),
  };
}

export function normalizeWaybills(payload = {}) {
  const source = Array.isArray(payload.waybills)
    ? payload.waybills
    : [{ hawb: payload.hawb, mawb: payload.mawb, packageCount: payload.packageCount, grossWeight: payload.grossWeight }];
  return source
    .map(normalizeWaybillRow)
    .filter((row) => row.hawb || row.mawb || row.packageCount || row.grossWeight);
}

function normalizeFeeRow(row = {}) {
  return {
    description: String(row.description || "").trim(),
    amount: cleanMoneyValue(row.amount),
  };
}

function cleanMoneyValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s/g, "");
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  const lastSeparator = Math.max(lastDot, lastComma);
  let normalized = compact;

  if (lastSeparator >= 0) {
    const separator = compact[lastSeparator];
    const fraction = compact.slice(lastSeparator + 1).replace(/\D/g, "");
    const sameSeparatorCount = compact.split(separator).length - 1;
    const hasBothSeparators = lastDot >= 0 && lastComma >= 0;
    const isDecimal = fraction.length > 0 && fraction.length <= 2 && (hasBothSeparators || sameSeparatorCount === 1);
    normalized = isDecimal
      ? `${compact.slice(0, lastSeparator).replace(/[.,]/g, "")}.${fraction}`
      : compact.replace(/[.,]/g, "");
  }

  const [integer = "", decimal = ""] = normalized.replace(/[^\d.]/g, "").split(".");
  const cleanInteger = integer.replace(/^0+(?=\d)/, "");
  if (!cleanInteger && !decimal) return "";
  return decimal && Number(decimal) !== 0 ? `${cleanInteger || "0"}.${decimal.slice(0, 2)}` : cleanInteger || "0";
}

export function normalizeTripFees(payload = {}) {
  const handlingFeeSide = HANDLING_FEE_SIDE_OPTIONS.includes(payload.handlingFeeSide) ? payload.handlingFeeSide : "Không";
  const handlingFeeAmount = handlingFeeSide === "Không" ? "" : cleanMoneyValue(payload.handlingFeeAmount);
  const otherFees = Array.isArray(payload.otherFees) ? payload.otherFees : [];
  return {
    handlingFeeSide,
    handlingFeeAmount,
    otherFees: otherFees.map(normalizeFeeRow).filter((row) => row.description || row.amount),
  };
}

export function deriveTripStatus(times = {}, hasThirdPoint = false) {
  let status = times.plateNumber ? "booked_truck" : "plan";
  if (times.point1ArrivalAt) status = "arrived_1";
  if (times.point1DepartAt) status = "trucking_to_2";
  if (times.point2ArrivalAt) status = "arrived_2";
  if (times.point2DepartAt) status = hasThirdPoint ? "trucking_to_3" : "completed";
  if (hasThirdPoint && times.point3ArrivalAt) status = "arrived_3";
  if (hasThirdPoint && times.point3DepartAt) status = "completed";
  return { status, label: TRIP_STATUS_LABELS[status] };
}

export function sortTripsForBoard(trips) {
  return [...trips].sort((a, b) => {
    const statusA = TRIP_STATUS_FLOW.includes(a.status) ? TRIP_STATUS_FLOW.indexOf(a.status) : TRIP_STATUS_FLOW.length - 2;
    const statusB = TRIP_STATUS_FLOW.includes(b.status) ? TRIP_STATUS_FLOW.indexOf(b.status) : TRIP_STATUS_FLOW.length - 2;
    if (statusA !== statusB) return statusA - statusB;
    const timeA = new Date(a.requiredArrivalAt || 0).getTime();
    const timeB = new Date(b.requiredArrivalAt || 0).getTime();
    if (timeA !== timeB) return timeB - timeA;
    return String(a.orderCode || "").localeCompare(String(b.orderCode || ""));
  });
}

export function nextId(items) {
  return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

export function gateLogStatus(log = {}) {
  if (log.gateOutAt) return { status: "completed", statusLabel: "Đã ra" };
  if (log.gateInAt) return { status: "inside", statusLabel: "Đang trong kho" };
  return { status: "waiting", statusLabel: "Chờ vào" };
}

export function buildGateLog(payload = {}, id = 1, now = new Date()) {
  const registeredAt = payload.registeredAt || now.toISOString();
  const audit = createAuditFields(payload, now);
  const log = {
    id,
    ...audit,
    source: payload.source || "manual",
    sourceId: payload.sourceId || "",
    plateNumber: String(payload.plateNumber || "").trim().toUpperCase(),
    driverName: String(payload.driverName || "").trim(),
    driverPhone: String(payload.driverPhone || "").trim(),
    note: String(payload.note || "").trim(),
    registeredAt,
    gateInAt: payload.gateInAt || "",
    gateOutAt: payload.gateOutAt || "",
    updatedAt: now.toISOString(),
  };
  return { ...log, ...gateLogStatus(log) };
}

export function markGateIn(log, now = new Date()) {
  if (!log.gateInAt) log.gateInAt = now.toISOString();
  log.gateOutAt = "";
  Object.assign(log, gateLogStatus(log), { updatedAt: now.toISOString() });
  return log;
}

export function markGateOut(log, now = new Date()) {
  if (!log.gateInAt) log.gateInAt = now.toISOString();
  log.gateOutAt = now.toISOString();
  Object.assign(log, gateLogStatus(log), { updatedAt: now.toISOString() });
  return log;
}

export function shouldSyncUnloadArrivalFromGate(trip = {}, registeredAt = "") {
  if (!trip.point1ArrivalAt || !trip.point1DepartAt || !registeredAt) return false;
  const unloadTime = new Date(registeredAt).getTime();
  const point1ArrivalTime = new Date(trip.point1ArrivalAt).getTime();
  const point1DepartTime = new Date(trip.point1DepartAt).getTime();
  if (![unloadTime, point1ArrivalTime, point1DepartTime].every(Number.isFinite)) return false;
  return unloadTime > point1ArrivalTime && unloadTime > point1DepartTime;
}

function normalizeStopText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isVsipStopName(value) {
  const text = normalizeStopText(value);
  return text.includes("VSIP") || text.includes("ALSE");
}

function driverRouteStops(trip = {}) {
  const explicitStops = [trip.from, trip.to, trip.via].filter(Boolean);
  if (explicitStops.length >= 2) return explicitStops;
  return String(trip.routeCode || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
}

function latestDriverEvent(events = [], stopNo, eventType) {
  return events
    .filter((event) => Number(event.stopNo) === Number(stopNo) && event.eventType === eventType)
    .sort((a, b) => new Date(b.createdAt || b.eventTime || 0).getTime() - new Date(a.createdAt || a.eventTime || 0).getTime())[0];
}

const DRIVER_TIMELINE_EVENT_TYPES = ["arrival", "depart"];
const DRIVER_REPORT_EVENT_TYPES = ["document", "expense", "incident"];
const DRIVER_REPORT_TYPES = ["document", "waiting", "handling", "toll", "incident"];

function driverReportEvents(events = []) {
  return events
    .filter((event) => DRIVER_REPORT_EVENT_TYPES.includes(event.eventType))
    .map((event) => ({
      id: event.id,
      tripId: event.tripId,
      orderCode: event.orderCode || "",
      stopNo: event.stopNo,
      stopName: event.stopName || "",
      eventType: event.eventType,
      reportType: event.reportType || "",
      amount: event.amount || "",
      note: event.note || event.editReason || "",
      attachmentName: event.attachmentName || "",
      attachmentDataUrl: event.attachmentDataUrl || "",
      createdAt: event.createdAt || event.eventTime || "",
    }))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export function buildDriverTripView(trip = {}, events = []) {
  const stops = driverRouteStops(trip).map((name, index) => {
    const stopNo = index + 1;
    const arrivalKey = `point${stopNo}ArrivalAt`;
    const departKey = `point${stopNo}DepartAt`;
    const arrivalEvent = latestDriverEvent(events, stopNo, "arrival");
    const departEvent = latestDriverEvent(events, stopNo, "depart");
    return {
      stopNo,
      name,
      isVsip: isVsipStopName(name),
      arrivalAt: trip[arrivalKey] || arrivalEvent?.eventTime || "",
      departAt: trip[departKey] || departEvent?.eventTime || "",
      arrivalStatus: trip[arrivalKey] ? "confirmed" : arrivalEvent?.status || "",
      departStatus: trip[departKey] ? "confirmed" : departEvent?.status || "",
      arrivalReason: arrivalEvent?.editReason || "",
      departReason: departEvent?.editReason || "",
    };
  });

  return {
    id: trip.id,
    orderCode: trip.orderCode || "",
    routeCode: trip.routeCode || "",
    plateNumber: trip.plateNumber || "",
    driverName: trip.driverName || "",
    driverPhone: trip.driverPhone || "",
    plannedDate: trip.plannedDate || "",
    plannedTime: trip.plannedTime || "",
    dispatcherPhone: trip.dispatcherPhone || "",
    stops,
    reports: driverReportEvents(events),
  };
}

export function applyDriverStopEvent(trip = {}, payload = {}, existingEvents = [], now = new Date()) {
  const stopNo = Number(payload.stopNo);
  const eventType = String(payload.eventType || "");
  const stops = driverRouteStops(trip);
  const stopName = stops[stopNo - 1] || "";
  if (!stopName) throw new Error("Điểm dừng không hợp lệ");
  if (![...DRIVER_TIMELINE_EVENT_TYPES, ...DRIVER_REPORT_EVENT_TYPES].includes(eventType)) throw new Error("Loại trạng thái không hợp lệ");

  if (DRIVER_REPORT_EVENT_TYPES.includes(eventType)) {
    const reportType = String(payload.reportType || eventType).trim();
    if (!DRIVER_REPORT_TYPES.includes(reportType)) throw new Error("Invalid driver report type");
    const requestedTime = payload.eventTime ? new Date(payload.eventTime) : now;
    if (!Number.isFinite(requestedTime.getTime())) throw new Error("Giờ cập nhật không hợp lệ");
    const note = String(payload.note || payload.editReason || "").trim();
    return {
      trip,
      event: {
        tripId: trip.id,
        orderCode: trip.orderCode || "",
        stopNo,
        stopName,
        eventType,
        eventTime: requestedTime.toISOString(),
        source: "driver",
        status: "confirmed",
        editReason: note,
        reportType,
        amount: String(payload.amount || "").trim(),
        note,
        attachmentName: String(payload.attachmentName || "").trim(),
        attachmentDataUrl: String(payload.attachmentDataUrl || "").trim(),
        createdAt: now.toISOString(),
      },
    };
  }

  const arrivalKey = `point${stopNo}ArrivalAt`;
  const departKey = `point${stopNo}DepartAt`;
  if (eventType === "depart") {
    const hasArrival = trip[arrivalKey] || latestDriverEvent(existingEvents, stopNo, "arrival")?.eventTime;
    if (!hasArrival) throw new Error("Chưa có giờ đến nên không thể rời đi");
  }

  const requestedTime = payload.eventTime ? new Date(payload.eventTime) : now;
  if (!Number.isFinite(requestedTime.getTime())) throw new Error("Giờ cập nhật không hợp lệ");

  const eventTime = requestedTime.toISOString();
  const event = {
    tripId: trip.id,
    orderCode: trip.orderCode || "",
    stopNo,
    stopName,
    eventType,
    eventTime,
    source: "driver",
    status: "confirmed",
    editReason: String(payload.editReason || "").trim(),
    createdAt: now.toISOString(),
  };

  trip[eventType === "arrival" ? arrivalKey : departKey] = eventTime;
  const hasThirdPoint = Boolean(trip.via || trip.point3ArrivalAt || trip.point3DepartAt);
  const { status: tripStatus, label: statusLabel } = deriveTripStatus(
    {
      point1ArrivalAt: trip.point1ArrivalAt || "",
      point1DepartAt: trip.point1DepartAt || "",
      point2ArrivalAt: trip.point2ArrivalAt || "",
      point2DepartAt: trip.point2DepartAt || "",
      point3ArrivalAt: trip.point3ArrivalAt || "",
      point3DepartAt: trip.point3DepartAt || "",
      plateNumber: trip.plateNumber || "",
    },
    hasThirdPoint,
  );
  Object.assign(trip, { status: tripStatus, statusLabel, updatedAt: now.toISOString() });

  return { trip, event };
}
