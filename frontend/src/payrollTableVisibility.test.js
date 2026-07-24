import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const sourceDir = dirname(fileURLToPath(import.meta.url));

test("salary payroll table hides bank account column", async () => {
  const source = await readFile(join(sourceDir, "main.jsx"), "utf8");
  const payrollClassIndex = source.indexOf('className="payroll-table"');
  const payrollTableStart = source.lastIndexOf("<table", payrollClassIndex);
  const payrollTable = source.slice(payrollTableStart, source.indexOf("</table>", payrollTableStart));

  assert.equal(payrollTable.includes("payroll-col-bank"), false);
  assert.equal(payrollTable.includes("TK ng"), false);
  assert.equal(payrollTable.includes("row.bankAccount"), false);
  assert.match(payrollTable, /<th colSpan="3">[^<]*Th[^<]*ng tin t[^<]*i x/);
  assert.match(payrollTable, /<th colSpan="26">/);
  assert.match(payrollTable, /<th colSpan="5">Thanh toán tiền mặt<\/th>/);
  assert.match(payrollTable, /<th>Dương dầu<\/th>/);
  assert.match(payrollTable, /<th>Âm dầu<\/th>/);
  assert.match(payrollTable, /<th>Ứng lương<\/th>/);
  assert.match(payrollTable, /<td colSpan="35" className="empty-row">/);
});

test("driver attendance content renders inside the salary layout", async () => {
  const source = await readFile(join(sourceDir, "main.jsx"), "utf8");

  assert.equal(source.includes('{activeView === "salary" && salaryTab === "attendance" ? ('), false);
  assert.match(source, /salaryTab === "attendance" \? \(\s*<section className="attendance-layout">/);
});

test("driver attendance controls render below salary tabs", async () => {
  const source = await readFile(join(sourceDir, "main.jsx"), "utf8");
  const toolbarStart = source.indexOf('{["fuel", "salary"].includes(activeView)');
  const toolbarEnd = source.indexOf('{["customersPartners", "routes"].includes(activeView)', toolbarStart);
  const toolbarSource = source.slice(toolbarStart, toolbarEnd);
  const salaryLayoutStart = source.indexOf('{activeView === "salary" ? (');
  const salaryLayoutEnd = source.indexOf('{activeView === "reports" ? (', salaryLayoutStart);
  const salaryLayoutSource = source.slice(salaryLayoutStart, salaryLayoutEnd);

  assert.equal(toolbarSource.includes("openDriverAttendanceModal"), false);
  assert.equal(toolbarSource.includes("driverAttendanceMonth"), false);
  assert.match(
    salaryLayoutSource,
    /salaryTab === "attendance" \? \(\s*<div className="payroll-controls">[\s\S]*?openDriverAttendanceModal/,
  );
  assert.match(salaryLayoutSource, /<label className="month-filter-field">[^<]*Th[^<]*ng t[^<]*nh c[^<]*ng<input type="month" value={driverAttendanceMonth}/);
});

test("salary advances tab renders detail and monthly summary tables", async () => {
  const source = await readFile(join(sourceDir, "main.jsx"), "utf8");
  const salaryLayoutStart = source.indexOf('{activeView === "salary" ? (');
  const salaryLayoutEnd = source.indexOf('{activeView === "reports" ? (', salaryLayoutStart);
  const salaryLayoutSource = source.slice(salaryLayoutStart, salaryLayoutEnd);
  const advanceControlsStart = salaryLayoutSource.indexOf(') : salaryTab === "advances" ? (');
  const advanceControlsEnd = salaryLayoutSource.indexOf(') : salaryTab === "fuelPrices" ? (', advanceControlsStart);
  const advanceControlsSource = salaryLayoutSource.slice(advanceControlsStart, advanceControlsEnd);

  assert.match(salaryLayoutSource, /salaryTab === "advances" \? \(\s*<section className="salary-advance-layout">/);
  assert.match(salaryLayoutSource, /className="salary-advance-detail-panel"/);
  assert.match(salaryLayoutSource, /className="salary-advance-summary-panel"/);
  assert.match(salaryLayoutSource, /salaryAdvanceDetailRows\.map/);
  assert.match(salaryLayoutSource, /monthlySalaryAdvances\.length/);
  assert.match(salaryLayoutSource, /salaryAdvanceSummaryRows\.map/);
  assert.match(salaryLayoutSource, /formatPayrollMoney\(salaryAdvanceSummaryTotal\)/);
  assert.match(salaryLayoutSource, /<label className="month-filter-field">[^<]*Th[^<]*ng [^<]*ng<input type="month" value={payrollMonth}/);
  assert.equal(advanceControlsSource.includes("month-filter-field"), false);
});
