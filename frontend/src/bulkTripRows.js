const MEANINGFUL_BULK_TRIP_FIELDS = [
  "customerCode",
  "routeText",
  "cargoWeight",
  "plannedTime",
  "partnerCode",
  "plateNumber",
  "driverName",
  "driverPhone",
  "note",
];

function hasValue(row, field) {
  return String(row?.[field] || "").trim() !== "";
}

export function isMeaningfulBulkTripRow(row) {
  return MEANINGFUL_BULK_TRIP_FIELDS.some((field) => hasValue(row, field));
}

export function prepareBulkTripRows(rows = [], routes = [], createdBy = "") {
  const prepared = rows.filter(isMeaningfulBulkTripRow).map((row) => {
    const selectedRoute = routes.find((item) => item.routeCode === row.routeText && (!row.customerCode || item.customerCode === row.customerCode));
    return {
      ...row,
      routeId: selectedRoute?.id || "",
      routeCode: selectedRoute?.routeCode || row.routeText,
      orderType: selectedRoute?.type,
      customerCode: row.customerCode || selectedRoute?.customerCode,
      createdBy,
    };
  });

  if (prepared.some((row) => !row.customerCode || !row.routeCode || !row.plannedDate || !row.plannedTime)) {
    throw new Error("MISSING_REQUIRED_BULK_TRIP_ROW");
  }

  return prepared;
}
