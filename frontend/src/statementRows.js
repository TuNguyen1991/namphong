import { moneyAmount } from "./moneyInput.js";

const RATE_KEY_BY_WEIGHT = [
  { match: /^1\.?25T?$/, key: "rate125" },
  { match: /^2\.?5T?$/, key: "rate25" },
  { match: /^3\.?5T?$/, key: "rate35" },
  { match: /^5T?$/, key: "rate5" },
  { match: /^7T?$/, key: "rate7" },
  { match: /^8T?$/, key: "rate8" },
  { match: /^10T?$/, key: "rate10" },
  { match: /^15T?$/, key: "rate15" },
  { match: /^20T?$/, key: "rate20" },
  { match: /^CONT?20$/, key: "cont20" },
  { match: /^CONT?40$/, key: "cont40" },
  { match: /^CONT?45$/, key: "cont45" },
];
const FEE_KEY_BY_WEIGHT = [
  { match: /^1\.?25T?$/, key: "gia_1_25t" },
  { match: /^2\.?5T?$/, key: "gia_2_5t" },
  { match: /^3\.?5T?$/, key: "gia_3_5t" },
  { match: /^5T?$/, key: "gia_5t" },
  { match: /^7T?$/, key: "gia_7t" },
  { match: /^8T?$/, key: "gia_8t" },
  { match: /^10T?$/, key: "gia_10t" },
  { match: /^15T?$/, key: "gia_15t" },
  { match: /^20T?$/, key: "gia_20t" },
  { match: /^CONT?20$/, key: "gia_cont_20" },
  { match: /^CONT?40$/, key: "gia_cont_40" },
  { match: /^CONT?45$/, key: "gia_cont_45" },
];

const MONEY_FEE_KINDS = {
  warehouse: "warehouse",
  parking: "parking",
  waiting: "waiting",
};

const STATEMENT_EXPORT_COLUMNS = [
  { key: "index", label: "STT" },
  { key: "date", label: "Ngày" },
  { key: "plateNumber", label: "Biển kiểm soát" },
  { key: "driverName", label: "Lái xe" },
  { key: "cargoWeight", label: "Tải trọng" },
  { key: "routeCode", label: "Tuyến đường" },
  { key: "point1ArrivalAt", label: "Đến điểm 1" },
  { key: "point1DepartAt", label: "Rời điểm 1" },
  { key: "point2ArrivalAt", label: "Đến điểm 2" },
  { key: "point2DepartAt", label: "Rời điểm 2" },
  { key: "overnightCount", label: "Lưu đêm" },
  { key: "waitingHours", label: "Số giờ chờ" },
  { key: "freightRate", label: "Giá cước" },
  { key: "fuelSurchargeFee", label: "Phụ phí xăng dầu" },
  { key: "parkingFee", label: "Phí lưu xe" },
  { key: "waitingFee", label: "Phí chờ giờ" },
  { key: "handlingFee", label: "Phí bốc xếp" },
  { key: "warehouseTicketFee", label: "Vé kho" },
  { key: "otherFee", label: "Phí khác" },
  { key: "totalAmount", label: "Tổng tiền" },
  { key: "note", label: "Ghi chú" },
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dateKeyFromParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function localDateKey(date) {
  if (!date || !Number.isFinite(date.getTime())) return "";
  return dateKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function yearCandidates(context = {}) {
  return [...new Set([context.fromDate, context.toDate]
    .map((value) => String(value || "").slice(0, 4))
    .filter((value) => /^\d{4}$/.test(value))
    .map(Number))];
}

function resolveYear({ explicitYear, month, day, context = {} }) {
  if (explicitYear) return explicitYear;
  const candidates = yearCandidates(context);
  const fromDate = context.fromDate || "";
  const toDate = context.toDate || "";
  const matched = candidates.find((year) => {
    const key = dateKeyFromParts(year, month, day);
    if (fromDate && key < fromDate) return false;
    if (toDate && key > toDate) return false;
    return true;
  });
  if (matched) return matched;
  return candidates[0] || new Date().getFullYear();
}

function parsedDateTime(value, context = {}) {
  if (!value) return "";
  const text = String(value).trim();
  const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoDate) {
    const date = new Date(text);
    if (Number.isFinite(date.getTime())) return date;
  }
  const time = text.match(/\b(\d{1,2}):(\d{2})\b/);
  const fullDate = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  const shortDate = text.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
  const dateParts = fullDate || shortDate;
  if (dateParts) {
    const day = Number(dateParts[1]);
    const month = Number(dateParts[2]);
    const explicitYear = fullDate ? Number(fullDate[3]) : 0;
    const year = resolveYear({ explicitYear, month, day, context });
    const hour = time ? Number(time[1]) : 0;
    const minute = time ? Number(time[2]) : 0;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59) {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    }
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateKey(value, context = {}) {
  if (value instanceof Date) return localDateKey(value);
  const text = String(value || "").trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    return localDateKey(new Date(text));
  }
  const date = parsedDateTime(value, context);
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDate(value, context = {}) {
  const key = dateKey(value, context);
  if (!key) return "";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value, context = {}) {
  const date = parsedDateTime(value, context);
  if (!date) return "";
  const [day, month, year] = date.toISOString().slice(0, 10).split("-").reverse();
  const time = date.toISOString().slice(11, 16);
  return `${day}/${month}/${year} ${time}`;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
}

function normalizeWeight(value) {
  return normalizeText(value).replace(/\s/g, "").replace(/CONTAINER/g, "CONT");
}

function rateKeyForWeight(value) {
  const weight = normalizeWeight(value);
  return RATE_KEY_BY_WEIGHT.find((item) => item.match.test(weight))?.key || "";
}

function feeKeyForWeight(value) {
  const weight = normalizeWeight(value);
  return FEE_KEY_BY_WEIGHT.find((item) => item.match.test(weight))?.key || "";
}

function feeDescription(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function otherFeeKind(row) {
  const text = feeDescription(row.description);
  if (text.includes("kho")) return MONEY_FEE_KINDS.warehouse;
  if (text.includes("luu") || text.includes("dem") || text.includes("lai xe")) return MONEY_FEE_KINDS.parking;
  if (text.includes("cho")) return MONEY_FEE_KINDS.waiting;
  return "";
}

function feeByKind(trip, kind) {
  return (trip.otherFees || []).reduce((sum, row) => {
    const matches = otherFeeKind(row) === kind;
    return matches ? sum + moneyAmount(row.amount) : sum;
  }, 0);
}

function remainingOtherFee(trip) {
  return (trip.otherFees || []).reduce((sum, row) => {
    return otherFeeKind(row) ? sum : sum + moneyAmount(row.amount);
  }, 0);
}

function transportFeeRate(transportFees, cargoWeight, contentMatcher) {
  const feeKey = feeKeyForWeight(cargoWeight);
  if (!feeKey) return 0;
  const row = (transportFees || []).find((item) => contentMatcher(feeDescription(item.content)));
  return row ? moneyAmount(row[feeKey]) : 0;
}

function diffHours(fromValue, toValue, context = {}) {
  const from = parsedDateTime(fromValue, context);
  const to = parsedDateTime(toValue, context);
  if (!from || !to || to <= from) return 0;
  return (to.getTime() - from.getTime()) / 36e5;
}

function overnightCount(trip, context) {
  return Math.floor(diffHours(trip.point1ArrivalAt, trip.point2DepartAt, context) / 24);
}

function waitingHours(trip, nights, freeWaitingHours, context) {
  const hours = diffHours(trip.point1ArrivalAt, trip.point2DepartAt, context) - (12 * nights) - freeWaitingHours;
  return Math.ceil(Math.max(0, hours) * 2) / 2;
}

function statementFeeMetrics(trip, transportFees, context) {
  const nights = overnightCount(trip, context);
  const overnightRate = transportFeeRate(transportFees, trip.cargoWeight, (content) => content.includes("luu") && content.includes("ca") && content.includes("xe"));
  const freeWaitingHours = transportFeeRate(transportFees, trip.cargoWeight, (content) => content.includes("mien") && content.includes("phi") && content.includes("cho"));
  const waitingRate = transportFeeRate(transportFees, trip.cargoWeight, (content) => content.includes("gio") && content.includes("cho"));
  const waitHours = waitingHours(trip, nights, freeWaitingHours, context);
  return {
    overnightCount: nights,
    parkingFee: nights * overnightRate,
    waitingHours: waitHours,
    waitingFee: waitHours * waitingRate,
  };
}

function matchingRate(trip, rates) {
  const customer = normalizeText(trip.customerCode);
  const route = normalizeText(trip.routeCode);
  const rateKey = rateKeyForWeight(trip.cargoWeight);
  if (!customer || !route || !rateKey) return 0;
  const row = rates.find((item) => normalizeText(item.customer) === customer && normalizeText(item.route) === route);
  return row ? moneyAmount(row[rateKey]) : 0;
}

function matchingFuelSurchargePercent(fuelSurcharges = [], plannedDate = "") {
  const row = fuelSurcharges.find((item) => {
    const fromDate = item.dateFrom || "";
    const toDate = item.dateTo || "";
    if (fromDate && plannedDate < fromDate) return false;
    if (toDate && plannedDate > toDate) return false;
    return true;
  });
  return row ? moneyAmount(row.percent) : 0;
}

export function buildStatementRows({ trips = [], rates = [], transportFees = [], fuelSurcharges = [], filters = {} } = {}) {
  const customer = normalizeText(filters.customerCode);
  const fromDate = filters.fromDate || "";
  const toDate = filters.toDate || "";
  const dateContext = { fromDate, toDate };

  return trips
    .filter((trip) => {
      const plannedDate = dateKey(trip.requiredArrivalAt, dateContext);
      if (customer && normalizeText(trip.customerCode) !== customer) return false;
      if (fromDate && plannedDate < fromDate) return false;
      if (toDate && plannedDate > toDate) return false;
      return true;
    })
    .sort((a, b) => {
      const dateA = parsedDateTime(a.requiredArrivalAt, dateContext)?.getTime() || 0;
      const dateB = parsedDateTime(b.requiredArrivalAt, dateContext)?.getTime() || 0;
      return dateA - dateB;
    })
    .map((trip, index) => {
      const plannedDate = dateKey(trip.requiredArrivalAt, dateContext);
      const freightRate = matchingRate(trip, rates);
      const fuelSurchargePercent = matchingFuelSurchargePercent(fuelSurcharges, plannedDate);
      const fuelSurchargeFee = Math.round(freightRate * fuelSurchargePercent / 100);
      const feeMetrics = statementFeeMetrics(trip, transportFees, dateContext);
      const handlingFee = moneyAmount(trip.handlingFeeAmount);
      const warehouseTicketFee = feeByKind(trip, "warehouse");
      const otherFee = remainingOtherFee(trip);
      return {
        index: index + 1,
        id: trip.id,
        date: formatDate(trip.requiredArrivalAt, dateContext),
        plateNumber: trip.plateNumber || "",
        driverName: trip.driverName || "",
        cargoWeight: trip.cargoWeight || "",
        routeCode: trip.routeCode || "",
        point1ArrivalAt: formatDateTime(trip.point1ArrivalAt, dateContext),
        point1DepartAt: formatDateTime(trip.point1DepartAt, dateContext),
        point2ArrivalAt: formatDateTime(trip.point2ArrivalAt, dateContext),
        point2DepartAt: formatDateTime(trip.point2DepartAt, dateContext),
        overnightCount: feeMetrics.overnightCount,
        waitingHours: feeMetrics.waitingHours,
        freightRate,
        fuelSurchargeFee,
        parkingFee: feeMetrics.parkingFee,
        waitingFee: feeMetrics.waitingFee,
        handlingFee,
        warehouseTicketFee,
        otherFee,
        totalAmount: freightRate + fuelSurchargeFee + feeMetrics.parkingFee + feeMetrics.waitingFee + handlingFee + warehouseTicketFee + otherFee,
        note: trip.note || "",
      };
    });
}

export function statementColumnTotals(rows = []) {
  return rows.reduce((totals, row) => ({
    freightRate: totals.freightRate + moneyAmount(row.freightRate),
    fuelSurchargeFee: totals.fuelSurchargeFee + moneyAmount(row.fuelSurchargeFee),
    parkingFee: totals.parkingFee + moneyAmount(row.parkingFee),
    waitingFee: totals.waitingFee + moneyAmount(row.waitingFee),
    handlingFee: totals.handlingFee + moneyAmount(row.handlingFee),
    warehouseTicketFee: totals.warehouseTicketFee + moneyAmount(row.warehouseTicketFee),
    otherFee: totals.otherFee + moneyAmount(row.otherFee),
    totalAmount: totals.totalAmount + moneyAmount(row.totalAmount),
  }), {
    freightRate: 0,
    fuelSurchargeFee: 0,
    parkingFee: 0,
    waitingFee: 0,
    handlingFee: 0,
    warehouseTicketFee: 0,
    otherFee: 0,
    totalAmount: 0,
  });
}

export function statementExportRows(rows = []) {
  return [
    STATEMENT_EXPORT_COLUMNS.map((column) => column.label),
    ...rows.map((row) => STATEMENT_EXPORT_COLUMNS.map((column) => row[column.key] ?? "")),
  ];
}
