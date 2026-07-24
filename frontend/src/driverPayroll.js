import { fuelDateKey } from "./fuelAccounting.js";

const BASE_WORKDAYS = 26;
const DEFAULT_PERSONAL_DEDUCTION = 15500000;
const DEFAULT_DEPENDENT_DEDUCTION = 6200000;
const CURRENT_PERSONAL_INCOME_TAX_BRACKETS = [
  { limit: 10000000, rate: 0.05 },
  { limit: 30000000, rate: 0.1 },
  { limit: 60000000, rate: 0.2 },
  { limit: 100000000, rate: 0.3 },
  { limit: Infinity, rate: 0.35 },
];

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function isCompletedTripInMonth(trip, monthValue) {
  if (trip.status && trip.status !== "completed") return false;
  return fuelDateKey(trip.requiredArrivalAt).startsWith(String(monthValue || "").slice(0, 7));
}

function tripKm(trip = {}) {
  return toNumber(trip.km ?? trip.routeKm ?? trip.distanceKm);
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
}

function routeLookupKey(customerCode, routeCode) {
  return `${normalizeKey(customerCode)}::${normalizeKey(routeCode)}`;
}

function buildKmLookup(transportRates = [], routes = []) {
  const lookup = new Map();
  for (const route of routes) {
    const key = routeLookupKey(route.customerCode ?? route.customer, route.routeCode ?? route.route);
    const km = toNumber(route.km);
    if (key !== "::" && km) lookup.set(key, km);
  }
  for (const rate of transportRates) {
    const key = routeLookupKey(rate.customerCode ?? rate.customer, rate.routeCode ?? rate.route);
    const km = toNumber(rate.km);
    if (key !== "::" && km) lookup.set(key, km);
  }
  return lookup;
}

function resolvedTripKm(trip = {}, kmLookup = new Map()) {
  const directKm = tripKm(trip);
  if (directKm) return directKm;
  return kmLookup.get(routeLookupKey(trip.customerCode ?? trip.customer, trip.routeCode ?? trip.routeText ?? trip.route)) || 0;
}

function normalizeVietnameseText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function overnightCountFromTrip(trip = {}, config = {}) {
  const directCount = toNumber(trip.overnightCount ?? trip.driverOvernightCount);
  if (directCount) return directCount;

  const overnightRate = toNumber(config.overnightBonus);
  const feeRows = Array.isArray(trip.otherFees) ? trip.otherFees : [];
  const overnightAmount = feeRows.reduce((sum, row) => {
    const description = normalizeVietnameseText(row.description);
    const isOvernight = description.includes("luu dem") || (description.includes("luu") && description.includes("dem"));
    return isOvernight ? sum + toNumber(row.amount) : sum;
  }, 0);
  if (!overnightAmount) return 0;
  if (!overnightRate) return 1;
  return Math.max(Math.round(overnightAmount / overnightRate), 1);
}

function kpiBucketForKm(km, config) {
  if (km <= 0) return null;
  if (km < 5) return { countKey: "kpiUnder5TripCount", amountKey: "kpiUnder5Amount", rate: toNumber(config.kpiUnder5Km) };
  if (km < 60) return { countKey: "kpi5To60TripCount", amountKey: "kpi5To60Amount", rate: toNumber(config.kpiUnder60Km) };
  if (km < 80) return { countKey: "kpi60To80TripCount", amountKey: "kpi60To80Amount", rate: toNumber(config.kpi60To80Km) };
  if (km < 100) return { countKey: "kpi80To100TripCount", amountKey: "kpi80To100Amount", rate: toNumber(config.kpi80To100Km) };
  return { countKey: "kpi100To150TripCount", amountKey: "kpi100To150Amount", rate: toNumber(config.kpi100To150Km) };
}

function latestMilestoneBonus(eligibleTripCount, config) {
  if (eligibleTripCount >= 90) return toNumber(config.bonus90Trips);
  if (eligibleTripCount >= 85) return toNumber(config.bonus85Trips);
  if (eligibleTripCount >= 75) return toNumber(config.bonus75Trips);
  if (eligibleTripCount >= 65) return toNumber(config.bonus65Trips);
  return 0;
}

function adjustmentFor(driverName, manualAdjustments = {}) {
  return manualAdjustments[driverName] || {};
}

function monthMatches(value, monthValue) {
  return fuelDateKey(value).startsWith(String(monthValue || "").slice(0, 7));
}

function standardFuelUnitPrice(standardFuelPrices = [], monthValue = "") {
  const month = String(monthValue || "").slice(0, 7);
  const row = standardFuelPrices.find((item) => String(item.month || "").slice(0, 7) === month);
  return toNumber(row?.unitPrice);
}

function driverFuelSettlement(driverName, fuelLogs = [], standardFuelPrices = [], monthValue = "") {
  const unitPrice = standardFuelUnitPrice(standardFuelPrices, monthValue);
  const netDeltaLiters = fuelLogs
    .filter((log) => log.driverName === driverName && monthMatches(log.date, monthValue))
    .reduce((sum, log) => sum + toNumber(log.fuelDelta), 0);
  if (netDeltaLiters > 0) {
    return { positiveFuelAmount: Math.round(netDeltaLiters * unitPrice), negativeFuelAmount: 0 };
  }
  if (netDeltaLiters < 0) {
    return { positiveFuelAmount: 0, negativeFuelAmount: Math.round(Math.abs(netDeltaLiters) * unitPrice) };
  }
  return { positiveFuelAmount: 0, negativeFuelAmount: 0 };
}

function tripTicketAmount(trip = {}) {
  const directTicket = toNumber(trip.warehouseTicketFee);
  if (directTicket) return directTicket;
  const feeRows = Array.isArray(trip.otherFees) ? trip.otherFees : [];
  return feeRows.reduce((sum, row) => {
    const description = normalizeVietnameseText(row.description);
    const isWarehouseTicket = description.includes("kho") && (description.includes("ve") || description.includes("ticket"));
    return isWarehouseTicket ? sum + toNumber(row.amount) : sum;
  }, 0);
}

function salaryAdvanceAmount(driverName, salaryAdvances = [], monthValue = "") {
  return salaryAdvances
    .filter((row) => row.driverName === driverName && monthMatches(row.date, monthValue))
    .reduce((sum, row) => sum + toNumber(row.amount), 0);
}

export function calculatePersonalIncomeTax(taxableIncome = 0) {
  let remainingIncome = Math.max(toNumber(taxableIncome), 0);
  let previousLimit = 0;
  let tax = 0;

  for (const bracket of CURRENT_PERSONAL_INCOME_TAX_BRACKETS) {
    const bracketIncome = Math.min(remainingIncome, bracket.limit - previousLimit);
    if (bracketIncome <= 0) break;
    tax += bracketIncome * bracket.rate;
    remainingIncome -= bracketIncome;
    previousLimit = bracket.limit;
  }

  return Math.round(tax);
}

export function buildDriverPayrollRows({
  drivers = [],
  attendanceSummary = [],
  trips = [],
  transportRates = [],
  routes = [],
  salaryConfig = [],
  fuelLogs = [],
  standardFuelPrices = [],
  salaryAdvances = [],
  manualAdjustments = {},
  monthValue = "",
} = {}) {
  const config = salaryConfig[0];
  if (!config) return [];

  const kmLookup = buildKmLookup(transportRates, routes);
  const attendanceByDriver = new Map(attendanceSummary.map((row) => [row.driverName, row]));
  const activeDriverNames = new Set(drivers.map((driver) => driver.name).filter(Boolean));

  return [...activeDriverNames].sort((a, b) => a.localeCompare(b, "vi")).map((driverName, index) => {
    const driver = drivers.find((item) => item.name === driverName) || {};
    const attendance = attendanceByDriver.get(driverName) || {};
    const leaveDays = toNumber(attendance.leaveDays);
    const workdays = toNumber(attendance.workdays);
    const baseSalary = toNumber(config.baseSalary);
    const dailySalary = baseSalary / BASE_WORKDAYS;
    const baseWorkdays = Math.min(workdays, BASE_WORKDAYS);
    const excessWorkdays = Math.max(workdays - BASE_WORKDAYS, 0);
    const workdaySalary = Math.round(dailySalary * baseWorkdays);
    const excessWorkdaySalary = Math.round(toNumber(config.overtimeDayBonus) * excessWorkdays);
    const driverTrips = trips.filter((trip) => trip.driverName === driverName && isCompletedTripInMonth(trip, monthValue));
    const kpiBuckets = {
      kpiUnder5TripCount: 0,
      kpiUnder5Amount: 0,
      kpi5To60TripCount: 0,
      kpi5To60Amount: 0,
      kpi60To80TripCount: 0,
      kpi60To80Amount: 0,
      kpi80To100TripCount: 0,
      kpi80To100Amount: 0,
      kpi100To150TripCount: 0,
      kpi100To150Amount: 0,
    };
    let tripSalary = 0;
    let missingKmTripCount = 0;
    let eligibleMilestoneTripCount = 0;

    for (const trip of driverTrips) {
      const km = resolvedTripKm(trip, kmLookup);
      if (!km) {
        missingKmTripCount += 1;
        continue;
      }
      const bucket = kpiBucketForKm(km, config);
      kpiBuckets[bucket.countKey] += 1;
      kpiBuckets[bucket.amountKey] += bucket.rate;
      tripSalary += bucket.rate;
      if (km > 5) eligibleMilestoneTripCount += 1;
    }

    const tripCount = driverTrips.length;
    const loadingBonus = driverTrips.reduce((sum, trip) => sum + toNumber(trip.handlingFeeAmount), 0);
    const ticketAmount = driverTrips.reduce((sum, trip) => sum + tripTicketAmount(trip), 0);
    const overnightCount = driverTrips.reduce((sum, trip) => sum + overnightCountFromTrip(trip, config), 0);
    const overnightBonus = Math.round(overnightCount * toNumber(config.overnightBonus));
    const allowanceRatio = Math.min(Math.max(workdays, 0), BASE_WORKDAYS) / BASE_WORKDAYS;
    const mealAllowance = Math.round(toNumber(config.mealAllowance) * allowanceRatio);
    const phoneAllowance = Math.round(toNumber(config.phoneAllowance) * allowanceRatio);
    const overtimeDayBonus = 0;
    const milestoneBonus = latestMilestoneBonus(eligibleMilestoneTripCount, config);
    const adjustment = adjustmentFor(driverName, manualAdjustments);
    const otherBonus = toNumber(adjustment.otherBonus);
    const advance = toNumber(adjustment.advance);
    const salaryAdvance = salaryAdvanceAmount(driverName, salaryAdvances, monthValue);
    const penalty = toNumber(adjustment.penalty);
    const otherDeduction = toNumber(adjustment.otherDeduction);
    const allowancesTotal = mealAllowance + phoneAllowance;
    const bonusesTotal = loadingBonus + overnightBonus + overtimeDayBonus + milestoneBonus + otherBonus;
    const grossIncome = workdaySalary + excessWorkdaySalary + tripSalary + allowancesTotal + bonusesTotal;
    const insuranceDeduction = Math.round(baseSalary * (
      toNumber(config.socialInsuranceEmployee) +
      toNumber(config.healthInsuranceEmployee) +
      toNumber(config.unemploymentInsuranceEmployee)
    ) / 100);
    const otherDeductionsTotal = advance + penalty + otherDeduction;
    const personalDeduction = toNumber(config.personalDeduction) || DEFAULT_PERSONAL_DEDUCTION;
    const dependentCount = toNumber(driver.familyDeduction);
    const dependentDeduction = toNumber(config.dependentDeduction) || DEFAULT_DEPENDENT_DEDUCTION;
    const dependentDeductionTotal = dependentCount * dependentDeduction;
    const taxableIncome = Math.max(grossIncome - insuranceDeduction - allowancesTotal - personalDeduction - dependentDeductionTotal, 0);
    const personalIncomeTax = calculatePersonalIncomeTax(taxableIncome);
    const totalDeductions = insuranceDeduction + otherDeductionsTotal + personalIncomeTax;
    const fuelSettlement = driverFuelSettlement(driverName, fuelLogs, standardFuelPrices, monthValue);
    const positiveFuelAmount = fuelSettlement.positiveFuelAmount;
    const negativeFuelAmount = fuelSettlement.negativeFuelAmount;
    const cashPaymentTotal = positiveFuelAmount - negativeFuelAmount + ticketAmount - salaryAdvance;
    const warnings = [];
    if (!driver.bankAccount) warnings.push("Thiếu tài khoản ngân hàng");
    if (!workdays) warnings.push("Chưa có ngày công chuẩn");
    if (missingKmTripCount) warnings.push(`${missingKmTripCount} chuyến chưa có KM`);

    return {
      index: index + 1,
      driverId: driver.id,
      employeeCode: driver.employeeCode || "",
      driverName,
      position: driver.position || driver.licenseType || driver.license || "",
      bankAccount: driver.bankAccount || "",
      bankName: driver.bankName || "",
      standardWorkdays: BASE_WORKDAYS,
      leaveDays,
      workdays,
      baseWorkdays,
      excessWorkdays,
      baseSalary,
      workdaySalary,
      excessWorkdaySalary,
      tripCount,
      eligibleMilestoneTripCount,
      ...kpiBuckets,
      tripSalary,
      loadingBonus,
      overnightCount,
      overnightBonus,
      positiveFuelAmount,
      negativeFuelAmount,
      ticketAmount,
      salaryAdvanceAmount: salaryAdvance,
      cashPaymentTotal,
      kpiBonus: tripSalary,
      mealAllowance,
      phoneAllowance,
      overtimeDayBonus,
      milestoneBonus,
      otherBonus,
      allowancesTotal,
      bonusesTotal,
      insuranceDeduction,
      personalDeduction,
      dependentCount,
      dependentDeduction,
      dependentDeductionTotal,
      taxableIncome,
      advance,
      penalty,
      otherDeduction,
      otherDeductionsTotal,
      personalIncomeTax,
      grossIncome,
      totalDeductions,
      netSalary: grossIncome - totalDeductions,
      missingKmTripCount,
      note: adjustment.note || "",
      status: adjustment.status || "draft",
      warnings,
    };
  });
}

export function driverPayrollTotals(rows = []) {
  return rows.reduce((totals, row) => ({
    grossIncome: totals.grossIncome + toNumber(row.grossIncome),
    totalDeductions: totals.totalDeductions + toNumber(row.totalDeductions),
    netSalary: totals.netSalary + toNumber(row.netSalary),
    positiveFuelAmount: totals.positiveFuelAmount + toNumber(row.positiveFuelAmount),
    negativeFuelAmount: totals.negativeFuelAmount + toNumber(row.negativeFuelAmount),
    ticketAmount: totals.ticketAmount + toNumber(row.ticketAmount),
    salaryAdvanceAmount: totals.salaryAdvanceAmount + toNumber(row.salaryAdvanceAmount),
    cashPaymentTotal: totals.cashPaymentTotal + toNumber(row.cashPaymentTotal),
    tripCount: totals.tripCount + toNumber(row.tripCount),
    missingKmTripCount: totals.missingKmTripCount + toNumber(row.missingKmTripCount),
  }), {
    grossIncome: 0,
    totalDeductions: 0,
    netSalary: 0,
    positiveFuelAmount: 0,
    negativeFuelAmount: 0,
    ticketAmount: 0,
    salaryAdvanceAmount: 0,
    cashPaymentTotal: 0,
    tripCount: 0,
    missingKmTripCount: 0,
  });
}

export function driverPayrollExportRows(rows = []) {
  return [
    ["STT", "Mã NV", "Tài xế", "Công chuẩn", "Nghỉ", "Công tính", "Công thừa", "Chuyến <5km", "Chuyến 5-60km", "Chuyến 60-80km", "Chuyến 80-100km", "Chuyến 100-150km", "Lương cơ bản", "Phụ cấp", "KPI <5km", "KPI 5-60km", "KPI 60-80km", "KPI 80-100km", "KPI 100-150km", "Bốc xếp", "Lưu đêm", "Thưởng công vượt", "Thưởng mốc/khác", "Bảo hiểm", "Khấu trừ khác", "Thuế TNCN", "Tổng thu nhập", "Khấu trừ", "Thực lĩnh", "Dương dầu", "Âm dầu", "Vé", "Ứng lương", "Tổng thanh toán tiền mặt", "Ghi chú"],
    ...rows.map((row) => [
      row.index,
      row.employeeCode,
      row.driverName,
      row.standardWorkdays,
      row.leaveDays,
      row.workdays,
      row.excessWorkdays,
      row.kpiUnder5TripCount,
      row.kpi5To60TripCount,
      row.kpi60To80TripCount,
      row.kpi80To100TripCount,
      row.kpi100To150TripCount,
      row.workdaySalary,
      row.allowancesTotal,
      row.kpiUnder5Amount,
      row.kpi5To60Amount,
      row.kpi60To80Amount,
      row.kpi80To100Amount,
      row.kpi100To150Amount,
      row.loadingBonus,
      row.overnightBonus,
      row.excessWorkdaySalary,
      row.milestoneBonus + row.otherBonus,
      row.insuranceDeduction,
      row.otherDeductionsTotal,
      row.personalIncomeTax,
      row.grossIncome,
      row.totalDeductions,
      row.netSalary,
      row.positiveFuelAmount,
      row.negativeFuelAmount,
      row.ticketAmount,
      row.salaryAdvanceAmount,
      row.cashPaymentTotal,
      row.note,
    ]),
  ];
}
