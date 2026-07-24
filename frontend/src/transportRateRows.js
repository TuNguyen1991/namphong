export const TRANSPORT_RATE_FIELD_KEYS = [
  "customer",
  "route",
  "km",
  "rate125",
  "rate25",
  "rate35",
  "rate5",
  "rate7",
  "rate8",
  "rate10",
  "rate15",
  "rate20",
  "cont20",
  "cont40",
  "cont45",
];

export function createEmptyTransportRateRow(source = {}) {
  return Object.fromEntries(TRANSPORT_RATE_FIELD_KEYS.map((key) => [key, String(source?.[key] ?? "")]));
}

export function createEmptyTransportRateRows(count = 1) {
  return Array.from({ length: count }, () => createEmptyTransportRateRow());
}

function hasAnyTransportRateValue(row) {
  return TRANSPORT_RATE_FIELD_KEYS.some((key) => String(row?.[key] ?? "").trim());
}

export function normalizeTransportRateRows(rows, status = "active") {
  const payloads = [];
  const errors = [];

  rows.forEach((row, index) => {
    if (!hasAnyTransportRateValue(row)) return;

    const payload = createEmptyTransportRateRow(row);
    payload.customer = String(row.customer || "").trim().toUpperCase();
    payload.route = String(row.route || "").trim().toUpperCase();
    payload.status = status;

    if (!payload.customer || !payload.route) {
      errors.push(`Dòng ${index + 1} cần nhập khách hàng và tuyến đường.`);
      return;
    }

    payloads.push(payload);
  });

  return { payloads, errors };
}
