import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TRANSPORT_FILTERS,
  REPORT_COLUMN_GROUPS,
  REPORT_COLUMNS,
  REPORT_FILTER_FIELDS,
} from "./reportConfig.js";

test("report config exposes transport filters and report columns", () => {
  assert.deepEqual(DEFAULT_TRANSPORT_FILTERS, {
    customer: "",
    status: "",
    q: "",
    special: "",
    orderType: "",
    createdBy: "",
  });
  assert.equal(REPORT_FILTER_FIELDS[0].key, "customerCode");
  assert.ok(REPORT_COLUMN_GROUPS.some((group) => group.title === "THÔNG TIN CHUYẾN XE"));
  assert.ok(REPORT_COLUMNS.some((column) => column.key === "totalSurcharge"));
});
