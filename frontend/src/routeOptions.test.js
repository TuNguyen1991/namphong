import test from "node:test";
import assert from "node:assert/strict";
import { routeOptionsForCustomer } from "./routeOptions.js";

test("routeOptionsForCustomer returns only routes for the selected customer", () => {
  const rates = [
    { id: 1, customer: "DHL", route: "DHL - VSIP" },
    { id: 2, customer: "ALSE", route: "ALSE - VSIP" },
    { id: 3, customer: "DHL", route: "DHL - NOI BAI" },
  ];

  assert.deepEqual(routeOptionsForCustomer(rates, "dhl").map((route) => route.routeCode), [
    "DHL - VSIP",
    "DHL - NOI BAI",
  ]);
});

test("routeOptionsForCustomer returns no routes until a customer is selected", () => {
  assert.deepEqual(routeOptionsForCustomer([{ id: 1, customer: "DHL", route: "DHL - VSIP" }], ""), []);
});

test("routeOptionsForCustomer skips inactive and duplicate rate routes", () => {
  const rates = [
    { id: 1, customer: "DHL", route: "DHL - VSIP", status: "active" },
    { id: 2, customer: "DHL", route: "DHL - VSIP", status: "active" },
    { id: 3, customer: "DHL", route: "DHL - NOI BAI", status: "inactive" },
  ];

  assert.deepEqual(routeOptionsForCustomer(rates, "DHL"), [
    { customerCode: "DHL", routeCode: "DHL - VSIP" },
  ]);
});
