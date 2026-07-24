import test from "node:test";
import assert from "node:assert/strict";
import { findTransportRateIndex, upsertTransportRate } from "./transportRates.js";

test("findTransportRateIndex matches customer and route case-insensitively", () => {
  const rates = [{ id: 1, customer: "NP", route: "NOI BAI - VSIP BAC NINH", rate10: "1450000" }];

  assert.equal(findTransportRateIndex(rates, { customer: " np ", route: " noi bai - vsip bac ninh " }), 0);
});

test("upsertTransportRate updates an existing route instead of adding a duplicate", () => {
  const rates = [{ id: 1, customer: "NP", route: "NOI BAI - VSIP BAC NINH", rate10: "1450000" }];

  const result = upsertTransportRate(
    rates,
    { customer: "NP", route: "NOI BAI - VSIP BAC NINH", km: "45", rate10: "1500000", status: "active" },
    () => 2,
  );

  assert.equal(result.created, false);
  assert.equal(rates.length, 1);
  assert.equal(rates[0].id, 1);
  assert.equal(rates[0].km, "45");
  assert.equal(rates[0].rate10, "1500000");
});

test("upsertTransportRate creates a new row when the route is not present", () => {
  const rates = [];

  const result = upsertTransportRate(rates, { customer: "NP", route: "VSIP - NOI BAI" }, () => 7);

  assert.equal(result.created, true);
  assert.equal(rates.length, 1);
  assert.equal(rates[0].id, 7);
});
