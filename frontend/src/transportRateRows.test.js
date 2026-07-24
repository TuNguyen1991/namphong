import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyTransportRateRows,
  normalizeTransportRateRows,
  TRANSPORT_RATE_FIELD_KEYS,
} from "./transportRateRows.js";

test("createEmptyTransportRateRows creates independent blank rows", () => {
  const rows = createEmptyTransportRateRows(2);

  rows[0].customer = "ALSE";

  assert.equal(rows.length, 2);
  assert.equal(rows[1].customer, "");
  assert.deepEqual(Object.keys(rows[0]), TRANSPORT_RATE_FIELD_KEYS);
});

test("normalizeTransportRateRows skips blank rows and uppercases required fields", () => {
  const result = normalizeTransportRateRows([
    { customer: " alse ", route: " cau giay - noi bai ", km: "12", rate10: "1000000" },
    { customer: "", route: "", km: "", rate10: "" },
  ]);

  assert.deepEqual(result.payloads, [
    {
      customer: "ALSE",
      route: "CAU GIAY - NOI BAI",
      km: "12",
      rate125: "",
      rate25: "",
      rate35: "",
      rate5: "",
      rate7: "",
      rate8: "",
      rate10: "1000000",
      rate15: "",
      rate20: "",
      cont20: "",
      cont40: "",
      cont45: "",
      status: "active",
    },
  ]);
  assert.deepEqual(result.errors, []);
});

test("normalizeTransportRateRows reports partial rows with missing customer or route", () => {
  const result = normalizeTransportRateRows([
    { customer: "ALSE", route: "" },
    { customer: "", route: "VSIP - NOI BAI" },
  ]);

  assert.deepEqual(result.payloads, []);
  assert.deepEqual(result.errors, [
    "Dòng 1 cần nhập khách hàng và tuyến đường.",
    "Dòng 2 cần nhập khách hàng và tuyến đường.",
  ]);
});
