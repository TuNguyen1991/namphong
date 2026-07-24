export const COMPLETED_BULK_TRIP_FIELDS = [
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
];

const REQUIRED_COMPLETED_FIELDS = ["customerCode", "partnerCode", "plateNumber", "driverName", "routeText", "point1At", "point2At"];
const MONEY_FIELDS = ["handlingFeeAmount", "warehouseTicketFee", "highwayTicketFee", "driverOvernightFee", "otherFeeAmount"];

export function createCompletedBulkTripRow(source = {}) {
  return Object.fromEntries(COMPLETED_BULK_TRIP_FIELDS.map((field) => [field, String(source?.[field] ?? "")]));
}

export function createCompletedBulkTripRows(count = 10) {
  return Array.from({ length: count }, () => createCompletedBulkTripRow());
}

function hasAnyCompletedBulkTripValue(row) {
  return COMPLETED_BULK_TRIP_FIELDS.some((field) => String(row?.[field] || "").trim());
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const localDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (localDate) {
    const [, day, month, year] = localDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return raw;
}

function normalizeDateTimeInput(value, fallbackDate = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/\//g, "-").replace(/\s+/, "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return normalized;
  const localDateTime = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (localDateTime) {
    const [, day, month, year, hour, minute] = localDateTime;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized}T08:00`;
  if (/^\d{1,2}:\d{2}$/.test(normalized) && fallbackDate) return `${fallbackDate}T${normalized.padStart(5, "0")}`;
  return normalized;
}

function normalizeMoneyInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withoutSpaces = raw.replace(/\s/g, "");
  const thousandsNormalized = withoutSpaces.replace(/[.,](?=\d{3}(\D|$))/g, "");
  const decimalNormalized = thousandsNormalized.replace(/,/g, ".");
  const [integer = "", decimal = ""] = decimalNormalized.replace(/[^\d.]/g, "").split(".");
  const cleanInteger = integer.replace(/^0+(?=\d)/, "");
  return decimal ? `${cleanInteger || "0"}.${decimal.slice(0, 2)}` : cleanInteger;
}

export function prepareCompletedBulkTripRows(rows = [], routes = [], createdBy = "") {
  const prepared = rows.filter(hasAnyCompletedBulkTripValue).map((row) => {
    const customerCode = String(row.customerCode || "").trim().toUpperCase();
    const routeText = String(row.routeText || "").trim().toUpperCase();
    const selectedRoute = routes.find((route) => route.routeCode === routeText && (!customerCode || route.customerCode === customerCode));
    const rowPlannedDate = normalizeDateInput(row.plannedDate);
    const point1At = normalizeDateTimeInput(row.point1At, rowPlannedDate);
    const plannedDate = rowPlannedDate || point1At.slice(0, 10);

    return {
      ...createCompletedBulkTripRow(row),
      plannedDate,
      customerCode: customerCode || selectedRoute?.customerCode || "",
      partnerCode: String(row.partnerCode || "").trim().toUpperCase(),
      plateNumber: String(row.plateNumber || "").trim().toUpperCase(),
      cargoWeight: String(row.cargoWeight || "").trim(),
      driverName: String(row.driverName || "").trim(),
      routeText,
      routeId: selectedRoute?.id || "",
      routeCode: selectedRoute?.routeCode || routeText,
      orderType: selectedRoute?.type,
      point1At,
      point1DepartAt: normalizeDateTimeInput(row.point1DepartAt, plannedDate),
      point2At: normalizeDateTimeInput(row.point2At, plannedDate),
      point2DepartAt: normalizeDateTimeInput(row.point2DepartAt, plannedDate),
      point3At: normalizeDateTimeInput(row.point3At, plannedDate),
      point3DepartAt: normalizeDateTimeInput(row.point3DepartAt, plannedDate),
      ...Object.fromEntries(MONEY_FIELDS.map((field) => [field, normalizeMoneyInput(row[field])])),
      createdBy,
    };
  });

  if (prepared.some((row) => REQUIRED_COMPLETED_FIELDS.some((field) => !String(row[field] || "").trim()))) {
    throw new Error("MISSING_REQUIRED_COMPLETED_BULK_TRIP_ROW");
  }

  return prepared;
}
