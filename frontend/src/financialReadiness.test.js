import test from "node:test";
import assert from "node:assert/strict";
import { buildFinancialReadinessModel } from "./financialReadiness.js";

function completedTrip(overrides = {}) {
  return {
    id: overrides.id || 1,
    orderCode: overrides.orderCode || `NP${overrides.id || 1}`,
    status: "completed",
    customerCode: "DHL",
    routeCode: "ALSE - NBA",
    cargoWeight: "5T",
    plateNumber: "29H-12345",
    driverName: "Nguyen Van A",
    requiredArrivalAt: "2026-07-21T08:00:00.000Z",
    point1ArrivalAt: "2026-07-21T08:00:00.000Z",
    point1DepartAt: "2026-07-21T08:30:00.000Z",
    point2ArrivalAt: "2026-07-21T10:00:00.000Z",
    point2DepartAt: "2026-07-21T10:30:00.000Z",
    estimatedCost: 800000,
    otherFees: [],
    ...overrides,
  };
}

const rates = [{ id: 1, customer: "DHL", route: "ALSE - NBA", km: "45", rate5: "1200000" }];

test("buildFinancialReadinessModel marks completed priced trip ready", () => {
  const model = buildFinancialReadinessModel({ trips: [completedTrip()], rates });

  assert.equal(model.rows[0].status, "ready_to_statement");
  assert.equal(model.rows[0].totalRevenue, 1200000);
  assert.equal(model.rows[0].expectedCost, 800000);
  assert.equal(model.rows[0].variance, 400000);
  assert.equal(model.summary.readyToStatement, 1);
});

test("buildFinancialReadinessModel flags missing freight rate", () => {
  const model = buildFinancialReadinessModel({ trips: [completedTrip({ cargoWeight: "15T" })], rates });

  assert.equal(model.rows[0].status, "missing_rate");
  assert.deepEqual(model.rows[0].issues, ["missing_rate"]);
  assert.equal(model.summary.missingRate, 1);
});

test("buildFinancialReadinessModel flags missing operational data", () => {
  const model = buildFinancialReadinessModel({
    trips: [completedTrip({ plateNumber: "", point2DepartAt: "" })],
    rates,
  });

  assert.equal(model.rows[0].status, "missing_data");
  assert.ok(model.rows[0].issues.includes("missing_plate"));
  assert.ok(model.rows[0].issues.includes("missing_point2_depart"));
});

test("buildFinancialReadinessModel flags fee amount without description", () => {
  const model = buildFinancialReadinessModel({
    trips: [completedTrip({ otherFees: [{ description: "", amount: "50000" }] })],
    rates,
  });

  assert.equal(model.rows[0].status, "missing_data");
  assert.ok(model.rows[0].issues.includes("fee_missing_description"));
});

test("buildFinancialReadinessModel flags loss risk when expected cost exceeds revenue", () => {
  const model = buildFinancialReadinessModel({
    trips: [completedTrip({ estimatedCost: 1400000 })],
    rates,
  });

  assert.equal(model.rows[0].status, "loss_risk");
  assert.equal(model.rows[0].variance, -200000);
  assert.equal(model.summary.lossRisk, 1);
});

test("buildFinancialReadinessModel totals summaries across statuses", () => {
  const model = buildFinancialReadinessModel({
    trips: [
      completedTrip({ id: 1 }),
      completedTrip({ id: 2, cargoWeight: "15T" }),
      completedTrip({ id: 3, estimatedCost: 1400000 }),
      { ...completedTrip({ id: 4 }), status: "plan" },
    ],
    rates,
  });

  assert.equal(model.summary.totalCompleted, 3);
  assert.equal(model.summary.readyToStatement, 1);
  assert.equal(model.summary.missingRate, 1);
  assert.equal(model.summary.lossRisk, 1);
  assert.equal(model.summary.totalRevenue, 2400000);
  assert.equal(model.summary.expectedCost, 3000000);
  assert.equal(model.summary.variance, -600000);
});
