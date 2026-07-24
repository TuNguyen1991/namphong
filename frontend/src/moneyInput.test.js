import test from "node:test";
import assert from "node:assert/strict";
import { cleanMoneyInput, moneyAmount } from "./moneyInput.js";

test("cleanMoneyInput preserves database decimal values", () => {
  assert.equal(cleanMoneyInput("100.00"), "100");
  assert.equal(cleanMoneyInput("100000.00"), "100000");
});

test("cleanMoneyInput accepts thousands separators from user and Excel", () => {
  assert.equal(cleanMoneyInput("100,000"), "100000");
  assert.equal(cleanMoneyInput("100.000"), "100000");
  assert.equal(cleanMoneyInput("1,250,000"), "1250000");
  assert.equal(cleanMoneyInput("1.250.000"), "1250000");
});

test("moneyAmount reads clean, decimal, and formatted values consistently", () => {
  assert.equal(moneyAmount("100.00"), 100);
  assert.equal(moneyAmount("100,000"), 100000);
  assert.equal(moneyAmount("100.000"), 100000);
});
