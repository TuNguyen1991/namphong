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

const STATUS_LABELS = {
  missing_rate: "Thieu bang gia",
  missing_data: "Thieu du lieu",
  loss_risk: "Rui ro lo",
  ready_to_statement: "San sang len bang ke",
  completed: "Hoan thanh",
};

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

function matchingRateRow(trip, rates = []) {
  const customer = normalizeText(trip.customerCode);
  const route = normalizeText(trip.routeCode);
  if (!customer || !route) return null;
  return rates.find((item) => normalizeText(item.customer) === customer && normalizeText(item.route) === route) || null;
}

function freightRateForTrip(trip, rates = []) {
  const rateKey = rateKeyForWeight(trip.cargoWeight);
  if (!rateKey) return 0;
  const row = matchingRateRow(trip, rates);
  return row ? moneyAmount(row[rateKey]) : 0;
}

function routeKmForTrip(trip, routes = [], rates = []) {
  const directKm = moneyAmount(trip.km ?? trip.routeKm ?? trip.distanceKm);
  if (directKm) return directKm;
  const customer = normalizeText(trip.customerCode);
  const route = normalizeText(trip.routeCode);
  const catalogRoute = routes.find((item) => normalizeText(item.customerCode || item.customer) === customer && normalizeText(item.routeCode || item.route) === route);
  const catalogKm = moneyAmount(catalogRoute?.km);
  if (catalogKm) return catalogKm;
  return moneyAmount(matchingRateRow(trip, rates)?.km);
}

function expectedCostForTrip(trip, routes, rates) {
  const directCost = moneyAmount(trip.estimatedCost);
  if (directCost) return directCost;
  const km = routeKmForTrip(trip, routes, rates);
  return km ? Math.round(km * 18000) : 0;
}

function otherFeeAmount(trip) {
  return (trip.otherFees || []).reduce((sum, row) => sum + moneyAmount(row.amount), 0);
}

function issuesForTrip(trip, freightRevenue) {
  const issues = [];
  if (!freightRevenue) issues.push("missing_rate");
  if (!trip.plateNumber) issues.push("missing_plate");
  if (!trip.driverName) issues.push("missing_driver");
  if (!trip.point1ArrivalAt) issues.push("missing_point1_arrival");
  if (!trip.point1DepartAt) issues.push("missing_point1_depart");
  if (!trip.point2ArrivalAt) issues.push("missing_point2_arrival");
  if (!trip.point2DepartAt) issues.push("missing_point2_depart");
  if ((trip.otherFees || []).some((row) => moneyAmount(row.amount) && !String(row.description || "").trim())) {
    issues.push("fee_missing_description");
  }
  return issues;
}

function statusFor({ issues, totalRevenue, expectedCost }) {
  if (issues.includes("missing_rate")) return "missing_rate";
  if (issues.length) return "missing_data";
  if (totalRevenue > 0 && expectedCost > totalRevenue) return "loss_risk";
  if (totalRevenue > 0) return "ready_to_statement";
  return "completed";
}

function matchesFilters(row, filters = {}) {
  const status = String(filters.status || "");
  const customer = normalizeText(filters.customerCode);
  if (status && row.status !== status) return false;
  if (customer && normalizeText(row.customerCode) !== customer) return false;
  return true;
}

export function buildFinancialReadinessModel({ trips = [], rates = [], routes = [], filters = {} } = {}) {
  const rows = trips
    .filter((trip) => trip.status === "completed")
    .map((trip) => {
      const freightRevenue = freightRateForTrip(trip, rates);
      const surchargeRevenue = moneyAmount(trip.handlingFeeAmount) + otherFeeAmount(trip);
      const totalRevenue = freightRevenue + surchargeRevenue;
      const expectedCost = expectedCostForTrip(trip, routes, rates);
      const issues = issuesForTrip(trip, freightRevenue);
      const status = statusFor({ issues, totalRevenue, expectedCost });
      return {
        tripId: trip.id,
        orderCode: trip.orderCode || "",
        customerCode: trip.customerCode || "",
        routeCode: trip.routeCode || "",
        cargoWeight: trip.cargoWeight || "",
        plateNumber: trip.plateNumber || "",
        driverName: trip.driverName || "",
        status,
        statusLabel: STATUS_LABELS[status] || status,
        freightRevenue,
        surchargeRevenue,
        totalRevenue,
        expectedCost,
        variance: totalRevenue - expectedCost,
        issues,
        trip,
      };
    });

  const filteredRows = rows.filter((row) => matchesFilters(row, filters));
  const summary = filteredRows.reduce(
    (totals, row) => {
      totals.totalCompleted += 1;
      totals.totalRevenue += row.totalRevenue;
      totals.expectedCost += row.expectedCost;
      totals.variance += row.variance;
      if (row.status === "ready_to_statement") totals.readyToStatement += 1;
      if (row.status === "missing_rate") totals.missingRate += 1;
      if (row.status === "missing_data") totals.missingData += 1;
      if (row.status === "loss_risk") totals.lossRisk += 1;
      return totals;
    },
    {
      totalCompleted: 0,
      readyToStatement: 0,
      missingRate: 0,
      missingData: 0,
      lossRisk: 0,
      totalRevenue: 0,
      expectedCost: 0,
      variance: 0,
    },
  );

  return { rows: filteredRows, allRows: rows, summary };
}
