import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDriverPayrollRows,
  calculatePersonalIncomeTax,
  driverPayrollExportRows,
  driverPayrollTotals,
} from "./driverPayroll.js";

const salaryConfig = [{
  baseSalary: "9000000",
  mealAllowance: "700000",
  phoneAllowance: "300000",
  kpiUnder5Km: "40000",
  kpiUnder60Km: "80000",
  kpi60To80Km: "120000",
  kpi80To100Km: "160000",
  kpi100To150Km: "220000",
  overtimeDayBonus: "300000",
  bonus65Trips: "1000000",
  bonus75Trips: "1500000",
  bonus85Trips: "2000000",
  bonus90Trips: "2500000",
  socialInsuranceEmployee: "8",
  healthInsuranceEmployee: "1.5",
  unemploymentInsuranceEmployee: "1",
  overnightBonus: "300000",
  personalDeduction: "15500000",
  dependentDeduction: "6200000",
}];

test("buildDriverPayrollRows calculates capped base salary, overtime workdays, km bucket salary, allowances, deductions, and net salary", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ id: 1, name: "Nguyen Van A", employeeCode: "LX001", position: "Lai xe", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 31, leaveDays: 3, workdays: 28 }],
    trips: [
      { id: 10, status: "completed", requiredArrivalAt: "2026-07-02T08:00:00.000Z", driverName: "Nguyen Van A", km: 4 },
      { id: 11, status: "completed", requiredArrivalAt: "2026-07-03T08:00:00.000Z", driverName: "Nguyen Van A", km: 5 },
      { id: 12, status: "completed", requiredArrivalAt: "2026-07-04T08:00:00.000Z", driverName: "Nguyen Van A", km: 70 },
      { id: 13, status: "completed", requiredArrivalAt: "2026-07-05T08:00:00.000Z", driverName: "Nguyen Van A", km: 90 },
      { id: 14, status: "completed", requiredArrivalAt: "2026-07-06T08:00:00.000Z", driverName: "Nguyen Van A", km: 120 },
    ],
    manualAdjustments: { "Nguyen Van A": { otherBonus: 200000, advance: 300000, penalty: 100000, otherDeduction: 50000, note: "Tam ung" } },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].driverName, "Nguyen Van A");
  assert.equal(rows[0].standardWorkdays, 26);
  assert.equal(rows[0].workdays, 28);
  assert.equal(rows[0].baseWorkdays, 26);
  assert.equal(rows[0].excessWorkdays, 2);
  assert.equal(rows[0].workdaySalary, 9000000);
  assert.equal(rows[0].excessWorkdaySalary, 600000);
  assert.equal(rows[0].tripCount, 5);
  assert.equal(rows[0].eligibleMilestoneTripCount, 3);
  assert.equal(rows[0].kpiUnder5TripCount, 1);
  assert.equal(rows[0].kpiUnder5Amount, 40000);
  assert.equal(rows[0].kpi5To60TripCount, 1);
  assert.equal(rows[0].kpi5To60Amount, 80000);
  assert.equal(rows[0].kpi60To80TripCount, 1);
  assert.equal(rows[0].kpi60To80Amount, 120000);
  assert.equal(rows[0].kpi80To100TripCount, 1);
  assert.equal(rows[0].kpi80To100Amount, 160000);
  assert.equal(rows[0].kpi100To150TripCount, 1);
  assert.equal(rows[0].kpi100To150Amount, 220000);
  assert.equal(rows[0].tripSalary, 620000);
  assert.equal(rows[0].loadingBonus, 0);
  assert.equal(rows[0].overnightBonus, 0);
  assert.equal(rows[0].mealAllowance, 700000);
  assert.equal(rows[0].phoneAllowance, 300000);
  assert.equal(rows[0].grossIncome, 11420000);
  assert.equal(rows[0].insuranceDeduction, 945000);
  assert.equal(rows[0].totalDeductions, 1395000);
  assert.equal(rows[0].netSalary, 10025000);
  assert.deepEqual(rows[0].warnings, []);
});

test("buildDriverPayrollRows prorates meal and phone allowances below 26 workdays", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ id: 1, name: "Nguyen Van A", employeeCode: "LX001", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 26, leaveDays: 13, workdays: 13 }],
    trips: [],
  });

  assert.equal(rows[0].mealAllowance, 350000);
  assert.equal(rows[0].phoneAllowance, 150000);
  assert.equal(rows[0].allowancesTotal, 500000);
});

test("buildDriverPayrollRows caps meal and phone allowances at 26 workdays", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ id: 1, name: "Nguyen Van A", employeeCode: "LX001", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 31, leaveDays: 0, workdays: 28 }],
    trips: [],
  });

  assert.equal(rows[0].mealAllowance, 700000);
  assert.equal(rows[0].phoneAllowance, 300000);
  assert.equal(rows[0].allowancesTotal, 1000000);
});

test("buildDriverPayrollRows flags missing salary configuration", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig: [],
    drivers: [{ name: "Nguyen Van A" }],
  });

  assert.deepEqual(rows, []);
});

test("buildDriverPayrollRows warns when a completed trip has no km for salary calculation", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ name: "Nguyen Van A" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 26, leaveDays: 0, workdays: 26 }],
    trips: [{ id: 10, status: "completed", requiredArrivalAt: "2026-07-02T08:00:00.000Z", driverName: "Nguyen Van A", routeCode: "NO KM" }],
  });

  assert.equal(rows[0].tripSalary, 0);
  assert.equal(rows[0].missingKmTripCount, 1);
  assert.deepEqual(rows[0].warnings, ["Thiếu tài khoản ngân hàng", "1 chuyến chưa có KM"]);
});

test("buildDriverPayrollRows does not add payroll rows for trip drivers outside the filtered company driver list", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ name: "Company Driver", employeeCode: "LX001", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [
      { driverName: "Company Driver", standardWorkdays: 26, leaveDays: 0, workdays: 26 },
      { driverName: "Outside Driver", standardWorkdays: 26, leaveDays: 0, workdays: 26 },
    ],
    trips: [
      { id: 10, status: "completed", requiredArrivalAt: "2026-07-02T08:00:00.000Z", driverName: "Company Driver", km: 10 },
      { id: 11, status: "completed", requiredArrivalAt: "2026-07-03T08:00:00.000Z", driverName: "Outside Driver", km: 10 },
    ],
  });

  assert.deepEqual(rows.map((row) => row.driverName), ["Company Driver"]);
  assert.equal(rows[0].tripCount, 1);
});

test("buildDriverPayrollRows resolves trip km from transport rates when trips do not store km", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ id: 1, name: "Nguyen Van A", employeeCode: "LX001", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 26, leaveDays: 0, workdays: 26 }],
    trips: [
      { id: 10, status: "completed", requiredArrivalAt: "2026-07-02T08:00:00.000Z", driverName: "Nguyen Van A", customerCode: "ALSE", routeCode: "R4" },
      { id: 11, status: "completed", requiredArrivalAt: "2026-07-03T08:00:00.000Z", driverName: "Nguyen Van A", customerCode: "ALSE", routeCode: "R70" },
    ],
    transportRates: [
      { customer: "ALSE", route: "R4", km: "4" },
      { customer: "ALSE", route: "R70", km: "70" },
    ],
  });

  assert.equal(rows[0].missingKmTripCount, 0);
  assert.equal(rows[0].kpiUnder5TripCount, 1);
  assert.equal(rows[0].kpiUnder5Amount, 40000);
  assert.equal(rows[0].kpi60To80TripCount, 1);
  assert.equal(rows[0].kpi60To80Amount, 120000);
});

test("buildDriverPayrollRows resolves trip km from transport rates despite route accents and extra spacing", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-06",
    salaryConfig,
    drivers: [{ id: 1, name: "Ha Quang Khanh", employeeCode: "LX001", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [{ driverName: "Ha Quang Khanh", standardWorkdays: 26, leaveDays: 0, workdays: 26 }],
    trips: [
      {
        id: 927,
        status: "completed",
        requiredArrivalAt: "2026-06-27T08:30:00.000Z",
        driverName: "Ha Quang Khanh",
        customerCode: "ALSE",
        routeCode: "VSIP BẮC NINH -  QUẾ VÕ",
      },
    ],
    transportRates: [{ customer: "ALSE", route: "VSIP BAC NINH - QUE VO", km: "45" }],
  });

  assert.equal(rows[0].missingKmTripCount, 0);
  assert.equal(rows[0].kpi5To60TripCount, 1);
  assert.equal(rows[0].kpi5To60Amount, 80000);
});

test("buildDriverPayrollRows calculates loading, overnight, overtime workday bonus, and other deductions", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ id: 1, name: "Nguyen Van A", employeeCode: "LX001", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 31, leaveDays: 3, workdays: 28 }],
    trips: [
      {
        id: 10,
        status: "completed",
        requiredArrivalAt: "2026-07-02T08:00:00.000Z",
        driverName: "Nguyen Van A",
        km: 12,
        handlingFeeAmount: "150000",
        otherFees: [{ description: "Luu dem lai xe", amount: "600000" }],
      },
    ],
    manualAdjustments: { "Nguyen Van A": { advance: 300000, penalty: 100000, otherDeduction: 50000 } },
  });

  assert.equal(rows[0].loadingBonus, 150000);
  assert.equal(rows[0].overnightCount, 2);
  assert.equal(rows[0].overnightBonus, 600000);
  assert.equal(rows[0].excessWorkdays, 2);
  assert.equal(rows[0].excessWorkdaySalary, 600000);
  assert.equal(rows[0].otherDeductionsTotal, 450000);
  assert.equal(rows[0].personalIncomeTax, 0);
  assert.equal(rows[0].totalDeductions, 1395000);
  assert.equal(rows[0].grossIncome, 11430000);
});

test("buildDriverPayrollRows calculates driver cash settlement from net monthly fuel delta, tickets, and salary advances", () => {
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ id: 1, name: "Nguyen Van A", employeeCode: "LX001", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 26, leaveDays: 0, workdays: 26 }],
    trips: [
      {
        id: 10,
        status: "completed",
        requiredArrivalAt: "2026-07-02T08:00:00.000Z",
        driverName: "Nguyen Van A",
        km: 12,
        otherFees: [
          { description: "Ve kho", amount: "30000" },
          { description: "Phi khac", amount: "50000" },
        ],
      },
      {
        id: 11,
        status: "completed",
        requiredArrivalAt: "2026-07-12T08:00:00.000Z",
        driverName: "Nguyen Van A",
        km: 12,
        warehouseTicketFee: "20000",
      },
    ],
    fuelLogs: [
      { id: 1, date: "2026-07-05", driverName: "Nguyen Van A", fuelDelta: 10 },
      { id: 2, date: "2026-07-18", driverName: "Nguyen Van A", fuelDelta: -4 },
      { id: 3, date: "2026-08-01", driverName: "Nguyen Van A", fuelDelta: 20 },
    ],
    standardFuelPrices: [{ month: "2026-07", unitPrice: "22000" }],
    salaryAdvances: [
      { id: 1, date: "2026-07-06", driverName: "Nguyen Van A", amount: "100000" },
      { id: 2, date: "2026-08-06", driverName: "Nguyen Van A", amount: "900000" },
    ],
  });

  assert.equal(rows[0].positiveFuelAmount, 132000);
  assert.equal(rows[0].negativeFuelAmount, 0);
  assert.equal(rows[0].ticketAmount, 50000);
  assert.equal(rows[0].salaryAdvanceAmount, 100000);
  assert.equal(rows[0].cashPaymentTotal, 82000);
});

test("calculatePersonalIncomeTax applies current progressive resident salary tax brackets", () => {
  assert.equal(calculatePersonalIncomeTax(0), 0);
  assert.equal(calculatePersonalIncomeTax(10000000), 500000);
  assert.equal(calculatePersonalIncomeTax(30000000), 2500000);
  assert.equal(calculatePersonalIncomeTax(60000000), 8500000);
  assert.equal(calculatePersonalIncomeTax(100000000), 20500000);
  assert.equal(calculatePersonalIncomeTax(120000000), 27500000);
});

test("calculatePersonalIncomeTax follows the five brackets shown in the payroll tax table", () => {
  assert.equal(calculatePersonalIncomeTax(5000000), 250000);
  assert.equal(calculatePersonalIncomeTax(20000000), 1500000);
  assert.equal(calculatePersonalIncomeTax(45000000), 5500000);
  assert.equal(calculatePersonalIncomeTax(80000000), 14500000);
  assert.equal(calculatePersonalIncomeTax(150000000), 38000000);
});

test("buildDriverPayrollRows calculates PIT from personal and dependent deductions in salary config", () => {
  const highIncomeConfig = [{
    ...salaryConfig[0],
    baseSalary: "50000000",
    personalDeduction: "15500000",
    dependentDeduction: "6200000",
  }];
  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig: highIncomeConfig,
    drivers: [{ id: 1, name: "Nguyen Van A", employeeCode: "LX001", familyDeduction: "2", bankAccount: "123", bankName: "VCB" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 26, leaveDays: 0, workdays: 26 }],
    trips: [],
  });

  assert.equal(rows[0].grossIncome, 51000000);
  assert.equal(rows[0].insuranceDeduction, 5250000);
  assert.equal(rows[0].allowancesTotal, 1000000);
  assert.equal(rows[0].personalDeduction, 15500000);
  assert.equal(rows[0].dependentCount, 2);
  assert.equal(rows[0].dependentDeductionTotal, 12400000);
  assert.equal(rows[0].taxableIncome, 16850000);
  assert.equal(rows[0].personalIncomeTax, 1185000);
  assert.equal(rows[0].totalDeductions, 6435000);
});

test("buildDriverPayrollRows selects highest milestone bonus using only trips over 5km", () => {
  const under5KmTrips = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    status: "completed",
    requiredArrivalAt: "2026-07-02T08:00:00.000Z",
    driverName: "Nguyen Van A",
    km: 4,
  }));
  const over5KmTrips = Array.from({ length: 65 }, (_, index) => ({
    id: index + 101,
    status: "completed",
    requiredArrivalAt: "2026-07-02T08:00:00.000Z",
    driverName: "Nguyen Van A",
    km: 12,
  }));

  const rows = buildDriverPayrollRows({
    monthValue: "2026-07",
    salaryConfig,
    drivers: [{ name: "Nguyen Van A" }],
    attendanceSummary: [{ driverName: "Nguyen Van A", standardWorkdays: 26, leaveDays: 0, workdays: 26 }],
    trips: [...under5KmTrips, ...over5KmTrips],
  });

  assert.equal(rows[0].tripCount, 95);
  assert.equal(rows[0].eligibleMilestoneTripCount, 65);
  assert.equal(rows[0].milestoneBonus, 1000000);
});

test("driverPayrollTotals totals key payroll money columns", () => {
  assert.deepEqual(driverPayrollTotals([
    { grossIncome: 1000, totalDeductions: 200, netSalary: 800, tripCount: 2, missingKmTripCount: 1 },
    { grossIncome: 3000, totalDeductions: 500, netSalary: 2500, tripCount: 3, missingKmTripCount: 0 },
  ]), {
    grossIncome: 4000,
    totalDeductions: 700,
    netSalary: 3300,
    positiveFuelAmount: 0,
    negativeFuelAmount: 0,
    ticketAmount: 0,
    salaryAdvanceAmount: 0,
    cashPaymentTotal: 0,
    tripCount: 5,
    missingKmTripCount: 1,
  });
});

test("driverPayrollExportRows returns Excel-ready payroll rows", () => {
  const exportRows = driverPayrollExportRows([
    {
      index: 1,
      employeeCode: "LX001",
      driverName: "Nguyen Van A",
      standardWorkdays: 26,
      leaveDays: 2,
      workdays: 24,
      excessWorkdays: 0,
      workdaySalary: 8307692,
      excessWorkdaySalary: 600000,
      tripCount: 2,
      kpiUnder5TripCount: 1,
      kpiUnder5Amount: 40000,
      kpi5To60TripCount: 1,
      kpi5To60Amount: 80000,
      kpi60To80TripCount: 0,
      kpi60To80Amount: 0,
      kpi80To100TripCount: 0,
      kpi80To100Amount: 0,
      kpi100To150TripCount: 0,
      kpi100To150Amount: 0,
      tripSalary: 1000000,
      loadingBonus: 150000,
      overnightBonus: 300000,
      milestoneBonus: 0,
      otherBonus: 200000,
      allowancesTotal: 1000000,
      bonusesTotal: 300000,
      insuranceDeduction: 945000,
      otherDeductionsTotal: 200000,
      personalIncomeTax: 250000,
      totalDeductions: 1395000,
      grossIncome: 10807692,
      netSalary: 9412692,
      positiveFuelAmount: 100000,
      negativeFuelAmount: 40000,
      ticketAmount: 30000,
      salaryAdvanceAmount: 20000,
      cashPaymentTotal: 70000,
      note: "Tam ung",
    },
  ]);

  assert.deepEqual(exportRows[0], ["STT", "Mã NV", "Tài xế", "Công chuẩn", "Nghỉ", "Công tính", "Công thừa", "Chuyến <5km", "Chuyến 5-60km", "Chuyến 60-80km", "Chuyến 80-100km", "Chuyến 100-150km", "Lương cơ bản", "Phụ cấp", "KPI <5km", "KPI 5-60km", "KPI 60-80km", "KPI 80-100km", "KPI 100-150km", "Bốc xếp", "Lưu đêm", "Thưởng công vượt", "Thưởng mốc/khác", "Bảo hiểm", "Khấu trừ khác", "Thuế TNCN", "Tổng thu nhập", "Khấu trừ", "Thực lĩnh", "Dương dầu", "Âm dầu", "Vé", "Ứng lương", "Tổng thanh toán tiền mặt", "Ghi chú"]);
  assert.deepEqual(exportRows[1], [1, "LX001", "Nguyen Van A", 26, 2, 24, 0, 1, 1, 0, 0, 0, 8307692, 1000000, 40000, 80000, 0, 0, 0, 150000, 300000, 600000, 200000, 945000, 200000, 250000, 10807692, 1395000, 9412692, 100000, 40000, 30000, 20000, 70000, "Tam ung"]);
});
