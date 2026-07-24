import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  Bell,
  Building2,
  LogIn,
  LogOut,
  MapPinned,
  Minus,
  PackagePlus,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  UserRound,
  Warehouse,
} from "lucide-react";
import { buildGateRegistrationCandidates } from "./gateCandidates.js";
import { defaultPlannedDateTime } from "./plannedDateTime.js";
import {
  adjustTripScheduleDate,
  normalizeTripScheduleOrder,
  setTripScheduleDate,
  tripScheduleDatesFromItem,
} from "./tripSchedule.js";
import { buildWaitingUnloadRows } from "./waitingUnload.js";
import { plannedTripMarkerPositions } from "./gpsMapMarkers.js";
import { prepareBulkTripRows } from "./bulkTripRows.js";
import {
  COMPLETED_BULK_TRIP_FIELDS,
  createCompletedBulkTripRows,
  prepareCompletedBulkTripRows,
} from "./completedBulkTripRows.js";
import { shouldAutoRefreshTransport, shouldLoadAppData, transportTripsPath, TRANSPORT_AUTO_REFRESH_MS } from "./transportRefresh.js";
import { resolveApiBase } from "./apiBase.js";
import { normalizeAuthenticatedUser } from "./authAccounts.js";
import { findLatestDriverByPlate } from "./latestDriverByPlate.js";
import { routeOptionsForCustomer } from "./routeOptions.js";
import { cleanMoneyInput, moneyAmount } from "./moneyInput.js";
import { calculateFuelDraft, enrichFuelLogs, fuelDateKey } from "./fuelAccounting.js";
import { officialNpVehicles } from "./vehicleManagement.js";
import { buildStatementRows, statementColumnTotals, statementExportRows } from "./statementRows.js";
import {
  buildDriverPayrollRows,
  driverPayrollExportRows,
  driverPayrollTotals,
} from "./driverPayroll.js";
import {
  attendanceMonthForLeaveDate,
  buildDriverAttendanceModel,
  driverAttendanceDetailRows,
  driverDocumentStatusLabel,
  officialNpDrivers,
  selectableAttendanceDrivers,
  sortDriversForManagement,
} from "./driverAttendance.js";
import {
  createEmptyTransportRateRow,
  createEmptyTransportRateRows,
  normalizeTransportRateRows,
} from "./transportRateRows.js";
import {
  DEFAULT_TRANSPORT_FILTERS,
  REPORT_COLUMN_GROUPS,
  REPORT_COLUMNS,
  REPORT_FILTER_FIELDS,
} from "./utils/reportConfig.js";
import { buildDispatchAlertModel } from "./dispatchAlerts.js";
import { buildFinancialReadinessModel } from "./financialReadiness.js";
import { buildDailyDispatchScheduleModel } from "./dailyDispatchSchedule.js";
import {
  buildDriverReportPayload,
  driverNextStop,
  driverReportLabel,
} from "./driverMobile.js";
import "./styles.css";

const API_BASE = resolveApiBase({
  explicitBase: import.meta.env.VITE_API_BASE,
  isProd: import.meta.env.PROD,
  hostname: window.location.hostname,
});
const LOGIN_CREDENTIALS_KEY = "np_login_credentials";

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const plainNumber = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 2,
});

const statusClass = {
  plan: "s-plan",
  booked_truck: "s-booked",
  arrived_1: "s-transit",
  trucking_to_2: "s-wait-unload",
  arrived_2: "s-loading",
  trucking_to_3: "s-wait-load",
  arrived_3: "s-transit",
  completed: "s-done",
};

const CARGO_WEIGHT_OPTIONS = ["1.2T", "2.5T", "3.5T", "5T", "7T", "8T", "10T", "15T", "Cont40", "Cont45"];
const VEHICLE_TYPE_OPTIONS = ["Thường", "Lạnh", "Bóng hơi"];
const HANDLING_FEE_SIDE_OPTIONS = ["Không", "Đầu nhận", "Đầu trả", "Hai đầu"];
const TIME_PATTERN = "([01][0-9]|2[0-3]):[0-5][0-9]|24:00";
const WAYBILL_FIELDS = ["packageCount", "grossWeight"];
const BULK_TRIP_FIELDS = [
  "customerCode",
  "routeText",
  "cargoWeight",
  "vehicleType",
  "plannedDate",
  "plannedTime",
  "partnerCode",
  "plateNumber",
  "driverName",
  "driverPhone",
  "note",
];
const COMPLETED_BULK_TRIP_LABELS = {
  plannedDate: "Ngày kế hoạch",
  customerCode: "Khách hàng",
  partnerCode: "ĐV vận tải",
  plateNumber: "Biển kiểm soát",
  cargoWeight: "Tải trọng xe",
  driverName: "Lái xe",
  routeText: "Hành trình",
  point1At: "Ngày giờ đến điểm 1",
  point1DepartAt: "Ngày giờ rời điểm 1",
  point2At: "Ngày giờ đến điểm 2",
  point2DepartAt: "Ngày giờ rời điểm 2",
  point3At: "Ngày giờ đến điểm 3",
  point3DepartAt: "Ngày giờ rời điểm 3",
  handlingFeeAmount: "Bốc xếp",
  warehouseTicketFee: "Vé kho",
  highwayTicketFee: "Vé cao tốc",
  driverOvernightFee: "Lưu đêm lái xe",
  otherFeeAmount: "Phí khác",
};
const ACCOUNT_ROLES = [
  { key: "admin", label: "Admin", description: "Toàn quyền hệ thống" },
  { key: "dispatcher", label: "Điều phối", description: "Tạo/sửa kế hoạch xe, theo dõi trạng thái" },
  { key: "driver", label: "Lái xe", description: "Chỉ cập nhật giờ đến/rời điểm giao nhận" },
  { key: "accountant", label: "Kế toán", description: "Xem báo cáo, xuất Excel, đối soát chi phí" },
  { key: "customer", label: "Khách hàng", description: "Xem trạng thái chuyến và báo cáo được cho phép" },
];
const PERMISSION_ROWS = [
  { key: "createTransport", label: "Tạo kế hoạch vận chuyển", roles: ["admin", "dispatcher"] },
  { key: "editTransport", label: "Sửa kế hoạch vận chuyển", roles: ["admin", "dispatcher"] },
  { key: "deleteTransport", label: "Xóa kế hoạch", roles: ["admin"] },
  { key: "updateArrival", label: "Cập nhật giờ đến/rời", roles: ["admin", "dispatcher", "driver"] },
  { key: "viewTrips", label: "Xem danh sách chuyến", roles: ["admin", "dispatcher", "driver", "accountant", "customer"] },
  { key: "viewRates", label: "Xem giá cước", roles: ["admin", "accountant"] },
  { key: "viewSurcharge", label: "Xem phụ phí", roles: ["admin", "dispatcher", "accountant"] },
  { key: "exportExcel", label: "Xuất Excel", roles: ["admin", "dispatcher", "accountant"] },
  { key: "createReportTemplate", label: "Tạo template báo cáo", roles: ["admin", "accountant"] },
  { key: "createAccount", label: "Tạo tài khoản mới", roles: ["admin"] },
  { key: "assignPermissions", label: "Phân quyền tài khoản", roles: ["admin"] },
];
const DEFAULT_ACCOUNT_USERS = [
  { id: 0, fullName: "Admin Nam Phong", username: "admin", password: import.meta.env.VITE_DEFAULT_ADMIN_PASSWORD || "Admin@2024!", phone: "", role: "admin", status: "active" },
  { id: -1, fullName: "Điều phối Export", username: "export", password: import.meta.env.VITE_DEFAULT_EXPORT_PASSWORD || "Export@2024!", phone: "", role: "dispatcher", status: "active", orderType: "export", scopeTripsByUser: false },
  { id: -2, fullName: "Điều phối Import", username: "import", password: import.meta.env.VITE_DEFAULT_IMPORT_PASSWORD || "Import@2024!", phone: "", role: "dispatcher", status: "active", orderType: "import", scopeTripsByUser: false },
  { id: -3, fullName: "Điều phối Domestic", username: "domestic", password: import.meta.env.VITE_DEFAULT_DOMESTIC_PASSWORD || "Domestic@2024!", phone: "", role: "dispatcher", status: "active", orderType: "domestic", scopeTripsByUser: false },
  { id: 1, fullName: "Nguyễn Văn A", username: "laixe01", password: "Driver@2024!", phone: "", role: "driver", status: "active" },
  { id: 2, fullName: "Trần Văn B", username: "dieuphoi01", password: "Dispatcher@2024!", phone: "", role: "dispatcher", status: "active" },
  { id: 3, fullName: "Lê Văn C", username: "ketoan01", password: "Accountant@2024!", phone: "", role: "accountant", status: "locked" },
];
const TRANSPORT_RATE_COLUMNS = [
  { key: "customer", label: "Khách hàng" },
  { key: "route", label: "Tuyến đường" },
  { key: "km", label: "Km" },
  { key: "rate125", label: "1.25T" },
  { key: "rate25", label: "2.5T" },
  { key: "rate35", label: "3.5T" },
  { key: "rate5", label: "5T" },
  { key: "rate7", label: "7T" },
  { key: "rate8", label: "8T" },
  { key: "rate10", label: "10T" },
  { key: "rate15", label: "15T" },
  { key: "rate20", label: "20T" },
  { key: "cont20", label: "Cont 20" },
  { key: "cont40", label: "Cont 40" },
  { key: "cont45", label: "Cont 45" },
];
const WEBLOG_RATE_FEE_COLUMNS = [
  { key: "content", label: "Nội dung" },
  { key: "gia_1_25t", label: "1.25T", type: "money" },
  { key: "gia_2_5t", label: "2.5T", type: "money" },
  { key: "gia_3_5t", label: "3.5T", type: "money" },
  { key: "gia_5t", label: "5T", type: "money" },
  { key: "gia_7t", label: "7T", type: "money" },
  { key: "gia_8t", label: "8T", type: "money" },
  { key: "gia_10t", label: "10T", type: "money" },
  { key: "gia_15t", label: "15T", type: "money" },
  { key: "gia_20t", label: "20T", type: "money" },
  { key: "gia_cont_20", label: "Cont 20", type: "money" },
  { key: "gia_cont_40", label: "Cont 40", type: "money" },
  { key: "gia_cont_45", label: "Cont 45", type: "money" },
];
const FUEL_SURCHARGE_COLUMNS = [
  { key: "content", label: "Nội dung" },
  { key: "dateFrom", label: "Từ ngày" },
  { key: "dateTo", label: "Đến ngày" },
  { key: "percent", label: "% phụ phí" },
  { key: "note", label: "Ghi chú" },
];
const DEFAULT_WEBLOG_TRANSPORT_FEES = [
  {
    id: "transport-fee-default-1",
    content: "Kiểm hóa",
    gia_1_25t: "100000",
    gia_2_5t: "100000",
    gia_3_5t: "100000",
    gia_5t: "200000",
    gia_8t: "200000",
    gia_10t: "300000",
    gia_cont_40: "500000",
    gia_cont_45: "500000",
  },
  {
    id: "transport-fee-default-2",
    content: "Miễn phí chờ (từ điểm A đến điểm B)",
    gia_1_25t: "3",
    gia_2_5t: "3",
    gia_3_5t: "3",
    gia_5t: "3",
    gia_8t: "4",
    gia_10t: "4",
    gia_cont_40: "6",
    gia_cont_45: "6",
  },
  {
    id: "transport-fee-default-3",
    content: "Giờ chờ",
    gia_1_25t: "50000",
    gia_2_5t: "50000",
    gia_3_5t: "50000",
    gia_5t: "60000",
    gia_8t: "100000",
    gia_10t: "100000",
    gia_cont_40: "100000",
    gia_cont_45: "100000",
  },
  {
    id: "transport-fee-default-4",
    content: "Lưu ca xe",
    gia_1_25t: "500000",
    gia_2_5t: "600000",
    gia_3_5t: "600000",
    gia_5t: "700000",
    gia_8t: "1000000",
    gia_10t: "1000000",
    gia_cont_40: "1000000",
    gia_cont_45: "1200000",
  },
];
const WEBLOG_SALARY_CONFIG_COLUMNS = [
  { key: "baseSalary", label: "Lương cơ bản", type: "money" },
  { key: "mealAllowance", label: "PC ăn uống", type: "money" },
  { key: "phoneAllowance", label: "PC điện thoại", type: "money" },
  { key: "kpiUnder5Km", label: "KPI <5km", type: "money" },
  { key: "kpiUnder60Km", label: "KPI <60km", type: "money" },
  { key: "kpi60To80Km", label: "KPI 60-80km", type: "money" },
  { key: "kpi80To100Km", label: "KPI 80-100km", type: "money" },
  { key: "kpi100To150Km", label: "KPI 100-150km", type: "money" },
  { key: "loadingBonus", label: "Thưởng bốc xếp", type: "money" },
  { key: "overnightBonus", label: "Thưởng lưu đêm", type: "money" },
  { key: "overtimeDayBonus", label: "Thưởng vượt công", type: "money" },
  { key: "bonus65Trips", label: "Thưởng 65 chuyến", type: "money" },
  { key: "bonus75Trips", label: "Thưởng 75 chuyến", type: "money" },
  { key: "bonus85Trips", label: "Thưởng 85 chuyến", type: "money" },
  { key: "bonus90Trips", label: "Thưởng 90 chuyến", type: "money" },
  { key: "socialInsuranceEmployee", label: "BHXH NV %" },
  { key: "healthInsuranceEmployee", label: "BHYT NV %" },
  { key: "unemploymentInsuranceEmployee", label: "BHTN NV %" },
  { key: "socialInsuranceCompany", label: "BHXH CTY %" },
  { key: "healthInsuranceCompany", label: "BHYT CTY %" },
  { key: "unemploymentInsuranceCompany", label: "BHTN CTY %" },
  { key: "personalDeduction", label: "Giảm trừ bản thân", type: "money" },
  { key: "dependentDeduction", label: "Giảm trừ phụ thuộc", type: "money" },
  { key: "updatedAt", label: "Ngày cập nhật" },
];
const WEBLOG_SALARY_CONFIG_GROUPS = [
  {
    title: "Nhóm 1: Lương CB và phụ cấp",
    fields: [
      { key: "baseSalary", label: "LUONG CO BAN", type: "money" },
      { key: "mealAllowance", label: "PHU CAP AN UONG", type: "money" },
      { key: "phoneAllowance", label: "PHU CAP DIEN THOAI", type: "money" },
    ],
  },
  {
    title: "Nhóm 2: KPI theo KM",
    fields: [
      { key: "kpiUnder5Km", label: "KPI DUOI 5KM", type: "money" },
      { key: "kpiUnder60Km", label: "KPI DUOI 60KM", type: "money" },
      { key: "kpi60To80Km", label: "KPI 60 80KM", type: "money" },
      { key: "kpi80To100Km", label: "KPI 80 100KM", type: "money" },
      { key: "kpi100To150Km", label: "KPI 100 150KM", type: "money" },
    ],
  },
  {
    title: "Nhóm 3: Thưởng phụ",
    fields: [
      { key: "loadingBonus", label: "THUONG BOC XEP", type: "money" },
      { key: "overnightBonus", label: "THUONG LUU DEM", type: "money" },
      { key: "overtimeDayBonus", label: "THUONG VUOT CONG", type: "money" },
    ],
  },
  {
    title: "Nhóm 4: Thưởng bổ sung tháng",
    fields: [
      { key: "bonus65Trips", label: "THUONG 65 CHUYEN", type: "money" },
      { key: "bonus75Trips", label: "THUONG 75 CHUYEN", type: "money" },
      { key: "bonus85Trips", label: "THUONG 85 CHUYEN", type: "money" },
      { key: "bonus90Trips", label: "THUONG 90 CHUYEN", type: "money" },
    ],
  },
  {
    title: "Nhóm 5: Bảo hiểm NV đóng (%)",
    fields: [
      { key: "socialInsuranceEmployee", label: "BHXH NV" },
      { key: "healthInsuranceEmployee", label: "BHYT NV" },
      { key: "unemploymentInsuranceEmployee", label: "BHTN NV" },
    ],
  },
  {
    title: "Nhóm 6: Giảm trừ thuế TNCN",
    fields: [
      { key: "personalDeduction", label: "GIAM TRU BAN THAN", type: "money" },
      { key: "dependentDeduction", label: "GIAM TRU PHU THUOC", type: "money" },
    ],
  },
  {
    title: "Nhóm 7: BH công ty đóng (%)",
    fields: [
      { key: "socialInsuranceCompany", label: "BHXH CTY" },
      { key: "healthInsuranceCompany", label: "BHYT CTY" },
      { key: "unemploymentInsuranceCompany", label: "BHTN CTY" },
    ],
  },
];

function todayInputValue() {
  return toLocalDateInput(new Date());
}

function toDateInput(value) {
  if (!value) return todayInputValue();
  return toLocalDateInput(new Date(value));
}

function toLocalDateInput(date) {
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function toTimeInput(value) {
  if (!value) return "08:00";
  return new Date(value).toTimeString().slice(0, 5);
}

function toOptionalTimeInput(value) {
  if (!value) return "";
  return toTimeInput(value);
}

function combineDateTime(date, time) {
  if (!time) return "";
  return `${date || todayInputValue()}T${time}`;
}

function displayCargoWeight(value) {
  if (!value) return "-";
  const text = String(value).trim();
  const container = text.match(/^cont(40|45)t?$/i);
  if (container) return `Cont${container[1]}`;
  return /\d$/.test(text) ? `${text}T` : text;
}

function locationNameForOption(value, locations = []) {
  const text = String(value || "").trim();
  if (!text) return "";
  const location = locations.find((item) => item.code === text || item.name === text);
  return location?.name || text;
}

function routeOptionLabel(route, locations = []) {
  const factoryOrWarehouse = locationNameForOption(route?.from, locations);
  return `${route.routeCode}${factoryOrWarehouse ? ` (${factoryOrWarehouse})` : ""}`;
}

function defaultPermissions() {
  return Object.fromEntries(
    PERMISSION_ROWS.map((permission) => [
      permission.key,
      Object.fromEntries(ACCOUNT_ROLES.map((role) => [role.key, permission.roles.includes(role.key)])),
    ]),
  );
}

function normalizePermissions(value = {}) {
  const fallback = defaultPermissions();
  return Object.fromEntries(
    PERMISSION_ROWS.map((permission) => [
      permission.key,
      {
        ...fallback[permission.key],
        ...(value?.[permission.key] || {}),
        admin: true,
      },
    ]),
  );
}

function defaultAccountAdminState() {
  return {
    users: DEFAULT_ACCOUNT_USERS,
    permissions: defaultPermissions(),
  };
}

function loadAccountAdminState() {
  return defaultAccountAdminState();
}

function defaultAccountForm() {
  return { id: "", fullName: "", username: "", password: "", phone: "", role: "driver", status: "active" };
}

function defaultReportTemplate() {
  return {
    id: "default-report-template",
    name: "Đối soát JUSDA",
    filters: Object.fromEntries(REPORT_FILTER_FIELDS.map((field) => [field.key, true])),
    filterValues: {
      ...Object.fromEntries(REPORT_FILTER_FIELDS.map((field) => [field.key, ""])),
      plannedDateFrom: "",
      plannedDateTo: "",
    },
    columns: Object.fromEntries(REPORT_COLUMNS.map((column) => [column.key, true])),
  };
}

function normalizeReportTemplate(value) {
  const fallback = defaultReportTemplate();
  return {
    id: value?.id || fallback.id,
    name: value?.name || fallback.name,
    filters: { ...fallback.filters, ...(value?.filters || {}) },
    filterValues: { ...fallback.filterValues, ...(value?.filterValues || {}) },
    columns: { ...fallback.columns, ...(value?.columns || {}) },
  };
}

function loadReportTemplateState() {
  const template = defaultReportTemplate();
  return { templates: [template], selectedId: template.id };
}

function transportQuery(filters) {
  return new URLSearchParams({
    customer: filters.customer || "",
    status: filters.status || "",
    q: filters.q || "",
    special: filters.special || "",
    orderType: filters.orderType || "",
    createdBy: filters.createdBy || "",
  }).toString();
}

function transportFiltersForUser(user, fallback = DEFAULT_TRANSPORT_FILTERS) {
  return {
    ...fallback,
    orderType: user?.orderType || fallback.orderType || "",
    createdBy: user?.scopeTripsByUser ? user.username : fallback.createdBy || "",
  };
}

function normalizeTimeEntry(value) {
  const clean = value.replace(/[^\d:]/g, "").slice(0, 5);
  if (!clean.includes(":") && clean.length > 2) return `${clean.slice(0, 2)}:${clean.slice(2, 4)}`;
  return clean;
}

function formatMoneyInput(value) {
  const clean = cleanMoneyInput(value);
  if (!clean) return "";
  const number = Number(clean);
  return Number.isFinite(number) ? plainNumber.format(number) : "";
}

function formatRateCell(value) {
  const clean = cleanMoneyInput(value);
  if (!clean) return "";
  const number = Number(clean);
  return Number.isFinite(number) ? plainNumber.format(number) : String(value || "");
}

function formatWeblogCell(value, type) {
  if (value === null || value === undefined || value === "") return "";
  if (type === "money") {
    const number = Number(value);
    return Number.isFinite(number) ? plainNumber.format(number) : String(value);
  }
  return String(value);
}

function formatStatementMoney(value) {
  const number = moneyAmount(value);
  return number ? plainNumber.format(number) : "";
}

function formatStatementNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number ? plainNumber.format(number) : "";
}

function formatPayrollMoney(value) {
  const number = Number(value) || 0;
  return plainNumber.format(Math.round(number));
}

function formatFuelNumber(value, fractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return plainNumber.format(Number(number.toFixed(fractionDigits)));
}

function formatSignedFuelNumber(value, fractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const formatted = formatFuelNumber(Math.abs(number), fractionDigits);
  if (number > 0) return `+${formatted}`;
  if (number < 0) return `-${formatted}`;
  return formatted;
}

function currentMonthDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: toLocalDateInput(start), to: toLocalDateInput(end) };
}

function monthBounds(monthValue) {
  const [year, month] = String(monthValue || todayInputValue().slice(0, 7)).split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const today = new Date();
  const sameMonth = today.getFullYear() === year && today.getMonth() === month - 1;
  return {
    from: toLocalDateInput(start),
    to: toLocalDateInput(sameMonth ? today : end),
    fullMonthTo: toLocalDateInput(end),
  };
}

function workdaysUntil(monthValue) {
  const { from, to } = monthBounds(monthValue);
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  let count = 0;
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    if (date.getDay() !== 0) count += 1;
  }
  return count;
}

function WeblogSalaryConfigGroup({ group, config }) {
  return (
    <section className="salary-config-group">
      <h3>{group.title}</h3>
      {group.fields.map((field) => (
        <label className="salary-config-field" key={field.key}>
          <span>{field.label}</span>
          <input value={formatWeblogCell(config?.[field.key], field.type)} readOnly />
        </label>
      ))}
    </section>
  );
}

function WeblogSalaryConfigPanel({ rows }) {
  const config = rows[0] || null;

  if (!config) {
    return (
      <section className="salary-config-container">
        <div className="salary-config-empty">Không có dữ liệu cấu hình lương từ weblog.</div>
      </section>
    );
  }

  return (
    <section className="salary-config-container">
      <div className="salary-config-header">
        <h2>Cấu hình lương</h2>
        <button
          className="btn btn-primary salary-config-save"
          type="button"
          title="Dữ liệu hiện đang đọc từ weblog"
        >
          Lưu cấu hình
        </button>
      </div>
      <div className="salary-config-grid">
        {WEBLOG_SALARY_CONFIG_GROUPS.map((group) => (
          <WeblogSalaryConfigGroup group={group} config={config} key={group.title} />
        ))}
      </div>
      <p className="salary-config-note">Thay đổi không ảnh hưởng kỳ lương đã duyệt.</p>
    </section>
  );
}

function preventFormEnter(event) {
  if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
    event.preventDefault();
  }
}

function DateStepperField({ label, value, onChange, onStep, required = false, disabled = false }) {
  return (
    <label className="form-field date-step-field">
      {label}
      <div className="date-step-row">
        <button type="button" className="date-step-btn" onClick={() => onStep(-1)} disabled={disabled} aria-label={`Giảm ${label}`}>
          <Minus size={12} />
        </button>
        <input required={required} disabled={disabled} type="date" value={value || ""} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="date-step-btn" onClick={() => onStep(1)} disabled={disabled} aria-label={`Tăng ${label}`}>
          <Plus size={12} />
        </button>
      </div>
    </label>
  );
}

function TripPointDateTimeField({
  label,
  side = "arrival",
  dateValue,
  timeValue,
  onDateChange,
  onDateStep,
  onTimeChange,
  disabled = false,
  placeholder = "HH:mm",
}) {
  return (
    <label className={`form-field point-time-field ${side}`}>
      {label}
      <div className="point-time-row">
        <button type="button" className="date-step-btn" onClick={() => onDateStep(-1)} disabled={disabled} aria-label={`Giảm ngày ${label}`}>
          <Minus size={12} />
        </button>
        <input className="point-date-input" disabled={disabled} type="date" value={disabled ? "" : dateValue || ""} onChange={(event) => onDateChange(event.target.value)} />
        <button type="button" className="date-step-btn" onClick={() => onDateStep(1)} disabled={disabled} aria-label={`Tăng ngày ${label}`}>
          <Plus size={12} />
        </button>
        <input
          className="point-time-input"
          type="text"
          inputMode="numeric"
          maxLength="5"
          pattern={TIME_PATTERN}
          placeholder={placeholder}
          disabled={disabled}
          value={disabled ? "" : timeValue || ""}
          onChange={(event) => onTimeChange(normalizeTimeEntry(event.target.value))}
        />
      </div>
    </label>
  );
}

function MoneyInput({ value, onChange, disabled = false }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={formatMoneyInput(value)}
      disabled={disabled}
      onChange={(event) => onChange(cleanMoneyInput(event.target.value))}
    />
  );
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function formatPlan(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function reportWaybillValue(trip, key) {
  const rows = cleanWaybillRows(trip.waybills || []);
  if (!rows.length) return trip[key] || "";
  return rows.map((row) => row[key]).filter((value) => value !== undefined && value !== "").join("; ");
}

function reportOtherFeesValue(trip) {
  return cleanOtherFeeRows(trip.otherFees || [])
    .map((row) => `${row.description || "Phụ phí"}: ${plainNumber.format(moneyAmount(row.amount))}`)
    .join("; ");
}

function reportTotalSurcharge(trip) {
  const handling = moneyAmount(trip.handlingFeeAmount);
  const other = cleanOtherFeeRows(trip.otherFees || []).reduce((sum, row) => sum + moneyAmount(row.amount), 0);
  return handling + other;
}

function normalizeFeeDescription(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function otherFeeAmountByKind(trip, kind) {
  return cleanOtherFeeRows(trip.otherFees || []).reduce((sum, row) => {
    const description = normalizeFeeDescription(row.description);
    const matches =
      (kind === "warehouse" && description.includes("kho")) ||
      (kind === "highway" && description.includes("cao")) ||
      (kind === "overnight" && (description.includes("luu") || description.includes("dem") || description.includes("lai xe"))) ||
      (kind === "other" && description.includes("khac"));
    return matches ? sum + moneyAmount(row.amount) : sum;
  }, 0);
}

function isNoHandlingFeeSide(value) {
  const raw = String(value || "").trim().toLowerCase();
  const folded = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return !raw || folded === "khong" || raw === "khÃ´ng".toLowerCase();
}

function reportFieldValue(trip, key) {
  if (key === "plannedDate") return formatDateOnly(trip.requiredArrivalAt);
  if (key === "plannedTime") return toTimeInput(trip.requiredArrivalAt);
  if (key === "cargoWeight") return displayCargoWeight(trip.cargoWeight);
  if (WAYBILL_FIELDS.includes(key)) return reportWaybillValue(trip, key);
  if (key === "handlingFee") {
    const side = trip.handlingFeeSide || "Không";
    const amount = moneyAmount(trip.handlingFeeAmount);
    return isNoHandlingFeeSide(side) && !amount ? "" : `${side}: ${plainNumber.format(amount)}`;
  }
  if (key === "otherFees") return reportOtherFeesValue(trip);
  if (key === "totalSurcharge") {
    const total = reportTotalSurcharge(trip);
    return total ? plainNumber.format(total) : "";
  }
  if (key.endsWith("At")) return formatDateTime(trip[key]);
  return trip[key] || "";
}

function reportFilterValue(trip, key) {
  if (key === "plannedDate") return toDateInput(trip.requiredArrivalAt);
  if (key === "cargoWeight") return displayCargoWeight(trip.cargoWeight);
  return String(trip[key] || "");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toDateTimeLocalInput(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

async function api(path, options) {
  const token = localStorage.getItem("auth_token");
  const headers = {
    "Content-Type": "application/json",
    ...(options?.headers || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (response.status === 401) {
    localStorage.removeItem("auth_token");
    window.dispatchEvent(new Event("webnp:auth-expired"));
    throw new Error("Session expired");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function DriverTripPage({ orderCode }) {
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reporting, setReporting] = useState(null);
  const [reportDraft, setReportDraft] = useState({ amount: "", note: "", attachmentName: "", attachmentDataUrl: "" });
  const [saving, setSaving] = useState(false);

  async function loadDriverTrip() {
    setLoading(true);
    setError("");
    try {
      setTrip(await api(`/api/driver-trips/${encodeURIComponent(orderCode)}`));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDriverTrip();
  }, [orderCode]);

  async function submitEvent(payload) {
    setSaving(true);
    setError("");
    try {
      const data = await api(`/api/driver-trips/${encodeURIComponent(orderCode)}/events`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTrip(data.trip);
      setConfirming(null);
      setEditing(null);
      setReporting(null);
      setReportDraft({ amount: "", note: "", attachmentName: "", attachmentDataUrl: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function eventLabel(eventType) {
    return eventType === "arrival" ? "Đã đến" : "Rời đi";
  }

  function actionLabel(eventType) {
    return eventType === "arrival" ? "Xác nhận Đến" : "Xác nhận Rời";
  }

  function currentConfirmTime() {
    const value = toDateTimeLocalInput(new Date());
    return {
      eventDate: value.slice(0, 10),
      eventTime: value.slice(11, 16),
    };
  }

  function eventPayloadFromTime(stopNo, eventType, eventDate, eventTime, editReason = "") {
    return {
      stopNo,
      eventType,
      eventTime: `${eventDate}T${eventTime}`,
      editReason,
    };
  }

  function startReport(reportType, stopNo) {
    setConfirming(null);
    setEditing(null);
    setReporting({ reportType, stopNo });
    setReportDraft({ amount: "", note: "", attachmentName: "", attachmentDataUrl: "" });
  }

  function readReportFile(file) {
    if (!file) {
      setReportDraft((current) => ({ ...current, attachmentName: "", attachmentDataUrl: "" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setReportDraft((current) => ({
        ...current,
        attachmentName: file.name || "driver-photo.jpg",
        attachmentDataUrl: String(reader.result || ""),
      }));
    };
    reader.readAsDataURL(file);
  }

  function submitReport(event) {
    event.preventDefault();
    if (!reporting?.stopNo) return;
    submitEvent(buildDriverReportPayload({
      stopNo: reporting.stopNo,
      reportType: reporting.reportType,
      ...reportDraft,
    }));
  }

  function confirmEventPayload(stopNo, eventType) {
    return eventPayloadFromTime(stopNo, eventType, confirming.eventDate, confirming.eventTime);
  }

  function stopPurpose(stop, index) {
    if (stop.isVsip) return "Giao/nhận hàng";
    if (index === 0) return "Lấy hàng";
    return "Điểm đến";
  }

  function stopIcon(stop, index, completed) {
    if (completed) return "✅";
    if (index === 0) return "🎯";
    return "⏳";
  }

  function startEdit(stop, eventType) {
    const currentValue = eventType === "arrival" ? stop.arrivalAt : stop.departAt;
    const localValue = toDateTimeLocalInput(currentValue || new Date());
    setConfirming(null);
    setEditing({
      stopNo: stop.stopNo,
      eventType,
      eventDate: localValue.slice(0, 10),
      eventTime: localValue.slice(11, 16),
      editReason: "",
    });
  }

  if (loading) return <main className="driver-shell"><div className="driver-loading">Đang tải chuyến...</div></main>;

  const completedStops = trip?.stops?.filter((stop) => stop.arrivalAt && stop.departAt).length || 0;
  const totalStops = trip?.stops?.length || 0;
  const remainingStops = Math.max(totalStops - completedStops, 0);
  const progressPercent = totalStops ? Math.round((completedStops / totalStops) * 100) : 0;
  const currentStop = driverNextStop(trip?.stops || []);
  const activeStopNo = currentStop?.stopNo || totalStops;

  return (
    <main className="driver-shell">
      {error ? <div className="driver-alert">{error}</div> : null}
      {!trip ? (
        <section className="driver-card">
          <h1>Không tìm thấy chuyến</h1>
          <p>Vui lòng kiểm tra lại mã đơn trong đường link.</p>
        </section>
      ) : (
        <>
          <section className="driver-hero">
            <div className="driver-hero-top">
              <span className="driver-truck-icon">🚚</span>
              <strong>Lộ Trình Giao Nhận</strong>
              <span className="driver-date-chip">{new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date())}</span>
            </div>
            <div className="driver-route-chips">
              {trip.stops.map((stop, index) => (
                <React.Fragment key={stop.stopNo}>
                  {index > 0 ? <span className="driver-chip-sep">›</span> : null}
                  <span className="driver-route-chip">{stop.name}</span>
                </React.Fragment>
              ))}
            </div>
            <div className="driver-driver-line">
              <span>👤 Lái xe: {trip.driverName || "-"}</span>
              <span>|</span>
              <span>🚛 {trip.plateNumber || "-"}</span>
            </div>
          </section>

          <section className="driver-progress-block">
            <div className="driver-progress-label">
              <span>Tiến độ lộ trình</span>
              <strong>{completedStops} / {totalStops} điểm hoàn thành</strong>
            </div>
            <div className="driver-progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
          </section>

          <section className="driver-mobile-card driver-contact-strip">
            <a href={trip.driverPhone ? `tel:${trip.driverPhone}` : undefined}>
              <span>SDT lai xe</span>
              <strong>{trip.driverPhone || "-"}</strong>
            </a>
            <a href={trip.dispatcherPhone ? `tel:${trip.dispatcherPhone}` : undefined}>
              <span>Dieu phoi</span>
              <strong>{trip.dispatcherPhone || "-"}</strong>
            </a>
          </section>

          <section className="driver-mobile-card driver-quick-actions">
            <div>
              <span>Dang o diem</span>
              <strong>{currentStop?.name || "Da hoan thanh"}</strong>
            </div>
            <div className="driver-quick-grid">
              <button className="driver-btn primary" type="button" onClick={() => startReport("document", activeStopNo)}>Chup chung tu</button>
              <button className="driver-btn secondary" type="button" onClick={() => startReport("waiting", activeStopNo)}>Cho lau</button>
              <button className="driver-btn secondary" type="button" onClick={() => startReport("handling", activeStopNo)}>Boc xep</button>
              <button className="driver-btn secondary" type="button" onClick={() => startReport("toll", activeStopNo)}>Ve cau duong</button>
              <button className="driver-btn danger" type="button" onClick={() => startReport("incident", activeStopNo)}>Su co</button>
            </div>
          </section>

          <section className="driver-summary">
            <h2>📊 Tổng kết hôm nay</h2>
            <div className="driver-summary-grid">
              <div><strong>{totalStops}</strong><span>Điểm dừng</span></div>
              <div><strong>{completedStops}</strong><span>Đã xong</span></div>
              <div><strong>{remainingStops}</strong><span>Còn lại</span></div>
            </div>
          </section>

          <section className="driver-stop-list">
            {trip.stops.map((stop, index) => {
              const isActive = stop.stopNo === activeStopNo;
              const completed = Boolean(stop.arrivalAt && stop.departAt);
              return (
              <article className={`driver-stop ${isActive ? "active" : ""}`} key={stop.stopNo}>
                <div className="driver-stop-title">
                  <span>{stop.stopNo}</span>
                  <div>
                    <strong>{stop.name}</strong>
                        <small>{stop.isVsip ? "Điểm giao nhận" : trip.routeCode}</small>
                    <em>{stopPurpose(stop, index)}</em>
                  </div>
                  <b>{stopIcon(stop, index, completed)}</b>
                </div>

                <a
                  className="driver-map-link"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Xem dia chi / ban do
                </a>

                <div className="driver-time-grid">
                  {["arrival", "depart"].map((eventType) => {
                  const value = eventType === "arrival" ? stop.arrivalAt : stop.departAt;
                  const status = eventType === "arrival" ? stop.arrivalStatus : stop.departStatus;
                  const isBlocked = eventType === "depart" && !stop.arrivalAt;
                  const isConfirming = confirming?.stopNo === stop.stopNo && confirming?.eventType === eventType;
                  const isEditing = editing?.stopNo === stop.stopNo && editing?.eventType === eventType;
                  return (
                    <div className="driver-event-row" key={eventType}>
                      <div className="driver-event-meta">
                        <strong>{eventType === "arrival" ? "🟢 Đến nơi" : "🔴 Rời đi"}</strong>
                        <span>
                          {value ? formatDateTime(value) : "--:--"}
                          {status === "draft" ? " (nháp)" : ""}
                        </span>
                      </div>

                      {isEditing ? (
                        <form
                          className="driver-edit-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            submitEvent(eventPayloadFromTime(editing.stopNo, editing.eventType, editing.eventDate, editing.eventTime, editing.editReason));
                          }}
                        >
                          <input
                            type="date"
                            value={editing.eventDate}
                            onChange={(event) => setEditing({ ...editing, eventDate: event.target.value })}
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength="5"
                            pattern={TIME_PATTERN}
                            placeholder="18:25"
                            value={editing.eventTime}
                            onChange={(event) => setEditing({ ...editing, eventTime: normalizeTimeEntry(event.target.value) })}
                          />
                          <input
                            value={editing.editReason}
                            onChange={(event) => setEditing({ ...editing, editReason: event.target.value })}
                            placeholder="Lý do sửa giờ"
                          />
                          <div className="driver-action-grid">
                            <button className="driver-btn primary" type="submit" disabled={saving}>Lưu giờ</button>
                            <button className="driver-btn ghost" type="button" onClick={() => setEditing(null)}>Hủy</button>
                          </div>
                        </form>
                      ) : isConfirming ? (
                        null
                      ) : (
                        <div className="driver-action-grid">
                          <button
                            className="driver-btn primary"
                            type="button"
                            disabled={saving || isBlocked}
                            onClick={() => setConfirming({ stopNo: stop.stopNo, eventType, ...currentConfirmTime() })}
                          >
                            {eventLabel(eventType)}
                          </button>
                          <button className="driver-btn secondary" type="button" disabled={saving || isBlocked} onClick={() => startEdit(stop, eventType)}>Sửa giờ</button>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
                {confirming?.stopNo === stop.stopNo ? (
                  <div className="driver-confirm-panel">
                    <div className="driver-confirm-handle" />
                    <div className="driver-pin">📍</div>
                    <h3>{eventLabel(confirming.eventType)}: {stop.name}</h3>
                    <p>Ngày hiện tại: {new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${confirming.eventDate}T00:00`))}</p>
                    <label className="driver-confirm-time">
                      <span>Giờ xác nhận</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength="5"
                        pattern={TIME_PATTERN}
                        placeholder="18:25"
                        value={confirming.eventTime}
                        onChange={(event) => setConfirming({ ...confirming, eventTime: normalizeTimeEntry(event.target.value) })}
                      />
                    </label>
                    <div className="driver-confirm-actions">
                      <button className="driver-btn ghost" type="button" onClick={() => setConfirming(null)}>Hủy</button>
                      <button className="driver-btn primary" type="button" disabled={saving || !confirming.eventTime} onClick={() => submitEvent(confirmEventPayload(stop.stopNo, confirming.eventType))}>
                        ✅ {actionLabel(confirming.eventType)}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );})}
          </section>

          {reporting ? (
            <section className="driver-mobile-card driver-report-panel">
              <div className="driver-report-head">
                <strong>{driverReportLabel(reporting.reportType)}</strong>
                <button className="mini-btn" type="button" onClick={() => setReporting(null)}>Dong</button>
              </div>
              <form className="driver-report-form" onSubmit={submitReport}>
                {reporting.reportType !== "document" ? (
                  <label>
                    <span>So tien</span>
                    <input
                      inputMode="numeric"
                      value={reportDraft.amount}
                      onChange={(event) => setReportDraft({ ...reportDraft, amount: event.target.value })}
                      placeholder="VD: 120000"
                    />
                  </label>
                ) : null}
                <label>
                  <span>Ghi chu</span>
                  <textarea
                    value={reportDraft.note}
                    onChange={(event) => setReportDraft({ ...reportDraft, note: event.target.value })}
                    placeholder="Nhap ngan gon cho dieu phoi"
                  />
                </label>
                <label>
                  <span>Anh chung tu</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => readReportFile(event.target.files?.[0])}
                  />
                </label>
                {reportDraft.attachmentName ? <div className="driver-file-chip">{reportDraft.attachmentName}</div> : null}
                <button className="driver-btn primary" type="submit" disabled={saving}>
                  Gui cho dieu phoi
                </button>
              </form>
            </section>
          ) : null}

          <section className="driver-mobile-card driver-report-history">
            <div className="driver-report-head">
              <strong>Chung tu / phat sinh da gui</strong>
              <span>{trip.reports?.length || 0}</span>
            </div>
            {(trip.reports || []).slice(0, 8).map((report) => (
              <div className="driver-report-row" key={report.id || `${report.eventType}-${report.createdAt}`}>
                <div>
                  <strong>{driverReportLabel(report.reportType)}</strong>
                  <span>{report.note || report.attachmentName || "-"}</span>
                </div>
                <small>{formatDateTime(report.createdAt)}</small>
              </div>
            ))}
            {!(trip.reports || []).length ? <p>Chua co chung tu/phat sinh.</p> : null}
          </section>
        </>
      )}
    </main>
  );
}

function KpiChip({ tone, icon, value, label }) {
  return (
    <span className={`kpi-chip ${tone}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function PointCell({ arrival, depart }) {
  return (
    <div className="point-cell">
      <span>Đến: {formatDateTime(arrival) || "-"}</span>
      <span>Rời: {formatDateTime(depart) || "-"}</span>
    </div>
  );
}

function routeHasThirdPoint(route) {
  return Boolean(String(route?.via || "").trim());
}

function DriverCell({ name, phone }) {
  return (
    <div className="driver-cell">
      <span>{name || <span className="muted">Cần phân công</span>}</span>
      {phone ? <small>{phone}</small> : null}
    </div>
  );
}

function SurchargeCell({ trip }) {
  const handlingSide = trip.handlingFeeSide || "Không";
  const handlingAmount = moneyAmount(trip.handlingFeeAmount);
  const hasHandlingFee = !isNoHandlingFeeSide(handlingSide) || handlingAmount > 0;
  const handlingText = !hasHandlingFee
    ? ""
    : [!isNoHandlingFeeSide(handlingSide) ? handlingSide : "", handlingAmount ? plainNumber.format(handlingAmount) : ""].filter(Boolean).join(": ");
  const otherFeesText = reportOtherFeesValue(trip);

  return (
    <div className="surcharge-cell" title={[handlingText ? `Bốc xếp: ${handlingText}` : "", otherFeesText ? `Phí khác: ${otherFeesText}` : ""].filter(Boolean).join(" | ")}>
      {handlingText || otherFeesText ? (
        <>
          {handlingText ? <span>Bốc xếp: {handlingText}</span> : null}
          {otherFeesText ? <span>Khác: {otherFeesText}</span> : null}
        </>
      ) : <span className="muted">-</span>}
    </div>
  );
}

function MoneyCell({ amount }) {
  const value = moneyAmount(amount);
  return value ? plainNumber.format(value) : <span className="muted">-</span>;
}

function RouteTypeCell({ routeCode }) {
  return (
    <div className="route-type-cell" title={routeCode || ""}>
      <span>{routeCode || "-"}</span>
    </div>
  );
}

function VehicleWeightCell({ vehicleType, cargoWeight }) {
  return (
    <div className="vehicle-weight-cell">
      <span>{displayCargoWeight(cargoWeight)}</span>
      <small>{vehicleType || "Thường"}</small>
    </div>
  );
}

function waybillRowsFromTrip(item) {
  if (Array.isArray(item?.waybills) && item.waybills.length) {
    return item.waybills.map((row) => ({ packageCount: row.packageCount || "", grossWeight: row.grossWeight || "" }));
  }
  if (item?.packageCount || item?.grossWeight) {
    return [{ packageCount: item.packageCount || "", grossWeight: item.grossWeight || "" }];
  }
  return [{ packageCount: "", grossWeight: "" }];
}

function cleanWaybillRows(rows) {
  return rows
    .map((row) => ({ packageCount: row.packageCount || "", grossWeight: row.grossWeight || "" }))
    .filter((row) => row.packageCount || row.grossWeight);
}

function isFilledRow(row, fields) {
  return fields.some((field) => String(row?.[field] || "").trim());
}

function otherFeeRowsFromTrip(item) {
  if (Array.isArray(item?.otherFees) && item.otherFees.length) return item.otherFees;
  return [{ description: "", amount: "" }];
}

function cleanOtherFeeRows(rows) {
  return rows.filter((row) => row.description || row.amount);
}

function WaybillCell({ waybills }) {
  const rows = cleanWaybillRows(waybills || []);
  return (
    <div className="waybill-cell">
      {rows.length ? rows.map((item, index) => (
        <span key={`${item.packageCount}-${item.grossWeight}-${index}`}>{[item.packageCount, item.grossWeight].filter(Boolean).join(" / ") || "-"}</span>
      )) : <span>-</span>}
    </div>
  );
}

function StackCell({ rows, field }) {
  const cleanRows = cleanWaybillRows(rows || []);
  return (
    <div className="stack-cell">
      {cleanRows.length ? cleanRows.map((item, index) => (
        <span key={`${field}-${index}`}>{item[field] || ""}</span>
      )) : <span />}
    </div>
  );
}

function fieldValue(item, key) {
  return item?.[key] || "";
}

function locationCodeForValue(value, locations) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = locations.find((item) => item.name === text || item.code === text.toUpperCase());
  return match?.code || text.toUpperCase();
}

function routeCodeFromPoints(form, locations) {
  return [form.from, form.to, form.via]
    .map((value) => locationCodeForValue(value, locations))
    .filter(Boolean)
    .join(" - ");
}

function formatMeters(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters)) return "-";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function GpsMapView({ dashboard, onRefresh, onRunDemo }) {
  const mapEl = React.useRef(null);
  const mapRef = React.useRef(null);
  const layersRef = React.useRef({ zones: null, vehicles: null });
  const vehicles = dashboard?.vehicles || [];
  const locations = dashboard?.locations || [];
  const activeTrips = dashboard?.trips || [];
  const events = dashboard?.events || [];

  useEffect(() => {
    if (!mapEl.current || !window.L) return;
    if (!mapRef.current) {
      mapRef.current = window.L.map(mapEl.current, { zoomControl: true }).setView([21.077013, 105.97963], 11);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current);
      layersRef.current.zones = window.L.layerGroup().addTo(mapRef.current);
      layersRef.current.vehicles = window.L.layerGroup().addTo(mapRef.current);
    }

    const { zones, vehicles: vehicleLayer } = layersRef.current;
    zones.clearLayers();
    vehicleLayer.clearLayers();
    const bounds = [];

    locations.forEach((location) => {
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const radiusM = Number(location.radiusM || 500);
      bounds.push([lat, lng]);
      window.L.circle([lat, lng], {
        radius: radiusM,
        color: "#0f4c81",
        weight: 2,
        fillColor: "#1a6bb5",
        fillOpacity: 0.08,
      }).addTo(zones).bindTooltip(location.name, {
        permanent: true,
        direction: "center",
        className: "gps-zone-label",
      });
    });

    plannedTripMarkerPositions(activeTrips).forEach(({ trip, lat, lng }) => {
      const target = trip.targetStop;
      if (!target) return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      bounds.push([lat, lng]);
      window.L.marker([lat, lng], {
        icon: window.L.divIcon({
          className: "gps-target-pin",
          html: `<span>${String(trip.plateNumber || "").replace(/[<>&"']/g, "")}</span>`,
          iconSize: [86, 24],
          iconAnchor: [43, 12],
        }),
      }).addTo(zones).bindPopup(`<strong>${trip.plateNumber}</strong><br>${trip.routeCode}<br>Xe kế hoạch<br>Đích: ${target.name}`);
    });

    vehicles.forEach((vehicle) => {
      const lat = Number(vehicle.lat);
      const lng = Number(vehicle.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      bounds.push([lat, lng]);
      window.L.marker([lat, lng], {
        icon: window.L.divIcon({
          className: "gps-vehicle-pin",
          html: `<span>${String(vehicle.plateNumber || "").replace(/[<>&"']/g, "")}</span>`,
          iconSize: [82, 26],
          iconAnchor: [41, 13],
        }),
      }).addTo(vehicleLayer).bindPopup(`<strong>${vehicle.plateNumber}</strong><br>${vehicle.provider || "GPS"}<br>${vehicle.matchedRouteCode || ""}`);
    });

    setTimeout(() => {
      mapRef.current.invalidateSize();
      if (bounds.length) {
        mapRef.current.fitBounds(window.L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
      }
    }, 80);
  }, [dashboard]);

  return (
    <section className="gps-layout">
      <div className="gps-map-panel">
        <div ref={mapEl} className="gps-map" />
      </div>
      <aside className="gps-side-panel">
        <div className="gps-side-actions">
          <button className="btn btn-primary" type="button" onClick={onRefresh}>Làm mới</button>
          <button className="btn btn-secondary" type="button" onClick={onRunDemo}>Nạp demo GPS</button>
        </div>
        <div className="gps-stat-grid">
          <div><strong>{vehicles.length}</strong><span>xe GPS</span></div>
          <div><strong>{locations.length}</strong><span>vùng kho</span></div>
          <div><strong>{activeTrips.filter((trip) => trip.targetStop).length}</strong><span>đích đang chạy</span></div>
        </div>
        <div className="gps-list-title">Xe theo BKS kế hoạch</div>
        <div className="gps-list">
          {activeTrips.map((trip) => (
            <article className="gps-trip-row" key={trip.id}>
              <div><strong>{trip.plateNumber}</strong><span>{trip.routeCode}</span></div>
              <div>{trip.targetStop ? `${trip.targetStop.name} (${formatMeters(trip.targetStop.radiusM)})` : "Chưa có tọa độ đích"}</div>
              <small>{trip.statusLabel}</small>
            </article>
          ))}
          {!activeTrips.length ? <div className="gps-empty">Chưa có chuyến có BKS đang hoạt động.</div> : null}
        </div>
        <div className="gps-list-title">Sự kiện GPS</div>
        <div className="gps-event-list">
          {events.slice(0, 10).map((event) => (
            <div className="gps-event-row" key={event.id || `${event.tripId}-${event.eventTime}-${event.eventType}`}>
              <strong>{event.eventType === "arrival" ? "Đến" : "Rời"} {event.stopName}</strong>
              <span>{event.orderCode} - {formatDateTime(event.eventTime)}</span>
            </div>
          ))}
          {!events.length ? <div className="gps-empty">Chưa có sự kiện vào/rời vùng.</div> : null}
        </div>
      </aside>
    </section>
  );
}

function GpsTrackerFrame() {
  return (
    <section className="gps-tracker-frame">
      <iframe title="ALSE Vehicle Tracker" src="/gps/als-vehicle-tracker.html" />
    </section>
  );
}

function loadRememberedLogin() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOGIN_CREDENTIALS_KEY) || "null");
    return {
      username: saved?.username || "",
      password: saved?.password || "",
      rememberPassword: Boolean(saved?.username && saved?.password),
    };
  } catch {
    return { username: "", password: "", rememberPassword: false };
  }
}

function App() {
  const initialReportTemplateState = useMemo(() => loadReportTemplateState(), []);
  const initialAccountAdminState = useMemo(() => loadAccountAdminState(), []);
  const rememberedLogin = useMemo(() => loadRememberedLogin(), []);
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: rememberedLogin.username, password: rememberedLogin.password });
  const [rememberPassword, setRememberPassword] = useState(rememberedLogin.rememberPassword);
  const [loginError, setLoginError] = useState("");
  const [activeView, setActiveView] = useState("transport");
  const [master, setMaster] = useState({ customers: [], partners: [], routes: [], locations: [], statuses: [] });
  const [dashboard, setDashboard] = useState(null);
  const [trips, setTrips] = useState([]);
  const [allTrips, setAllTrips] = useState([]);
  const [customerDeliveries, setCustomerDeliveries] = useState([]);
  const [allCustomerDeliveries, setAllCustomerDeliveries] = useState([]);
  const [costs, setCosts] = useState([]);
  const [gateLogs, setGateLogs] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_TRANSPORT_FILTERS);
  const [statementFilters, setStatementFilters] = useState({ customerCode: "", fromDate: "", toDate: "" });
  const [statementAppliedFilters, setStatementAppliedFilters] = useState(null);
  const [reconciliationFilters, setReconciliationFilters] = useState({ status: "", customerCode: "" });
  const [scheduleDate, setScheduleDate] = useState(() => todayInputValue());
  const [scheduleMode, setScheduleMode] = useState("vehicle");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [deliveryFilters, setDeliveryFilters] = useState({ customer: "", partner: "", status: "", q: "" });
  const [gateFilters, setGateFilters] = useState({ q: "", status: "" });
  const [reportTemplates, setReportTemplates] = useState(() => initialReportTemplateState.templates);
  const [selectedReportTemplateId, setSelectedReportTemplateId] = useState(() => initialReportTemplateState.selectedId);
  const [reportTemplate, setReportTemplate] = useState(() => {
    const selected = initialReportTemplateState.templates.find((template) => template.id === initialReportTemplateState.selectedId);
    return selected || initialReportTemplateState.templates[0] || defaultReportTemplate();
  });
  const [reportPreviewVisible, setReportPreviewVisible] = useState(false);
  const [reportSaveMessage, setReportSaveMessage] = useState("");
  const [tripModal, setTripModal] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState(null);
  const [gateModal, setGateModal] = useState(false);
  const [vehicleModal, setVehicleModal] = useState(null);
  const [driverModal, setDriverModal] = useState(null);
  const [driverAttendanceModal, setDriverAttendanceModal] = useState(null);
  const [fuelModal, setFuelModal] = useState(null);
  const [transportRateModal, setTransportRateModal] = useState(null);
  const [fuelSurchargeModal, setFuelSurchargeModal] = useState(null);
  const [salaryAdvanceModal, setSalaryAdvanceModal] = useState(null);
  const [standardFuelPriceModal, setStandardFuelPriceModal] = useState(null);
  const [catalogModal, setCatalogModal] = useState(null);
  const [routeModal, setRouteModal] = useState(null);
  const [locationModal, setLocationModal] = useState(null);
  const [tripForm, setTripForm] = useState({});
  const [appliedDriverSuggestionPlate, setAppliedDriverSuggestionPlate] = useState("");
  const [deliveryForm, setDeliveryForm] = useState({});
  const [gateForm, setGateForm] = useState({});
  const [vehicleForm, setVehicleForm] = useState({});
  const [driverForm, setDriverForm] = useState({});
  const [driverAttendanceForm, setDriverAttendanceForm] = useState({});
  const [fuelForm, setFuelForm] = useState({});
  const [fuelSurchargeForm, setFuelSurchargeForm] = useState({});
  const [salaryAdvanceForm, setSalaryAdvanceForm] = useState({});
  const [standardFuelPriceForm, setStandardFuelPriceForm] = useState({});
  const [transportRateRows, setTransportRateRows] = useState([]);
  const [catalogForm, setCatalogForm] = useState({});
  const [routeForm, setRouteForm] = useState({});
  const [locationForm, setLocationForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [gpsDashboard, setGpsDashboard] = useState({ vehicles: [], locations: [], trips: [], events: [] });
  const [accountUsers, setAccountUsers] = useState(() => initialAccountAdminState.users);
  const [accountPermissions, setAccountPermissions] = useState(() => normalizePermissions(initialAccountAdminState.permissions));
  const [accountForm, setAccountForm] = useState(() => defaultAccountForm());
  const [accountMessage, setAccountMessage] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);
  const [npVehicles, setNpVehicles] = useState([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [npDrivers, setNpDrivers] = useState([]);
  const [driverSearch, setDriverSearch] = useState("");
  const [npDriverAttendance, setNpDriverAttendance] = useState([]);
  const [driverAttendanceMonth, setDriverAttendanceMonth] = useState(() => todayInputValue().slice(0, 7));
  const [npFuelLogs, setNpFuelLogs] = useState([]);
  const [fuelPlateFilter, setFuelPlateFilter] = useState("");
  const [fuelDriverFilter, setFuelDriverFilter] = useState("");
  const [fuelSummaryRange, setFuelSummaryRange] = useState(() => currentMonthDateRange());
  const [fuelSummaryGrouped, setFuelSummaryGrouped] = useState(true);
  const [salaryTab, setSalaryTab] = useState("payroll");
  const [rateTab, setRateTab] = useState("transportRates");
  const [payrollMonth, setPayrollMonth] = useState(() => todayInputValue().slice(0, 7));
  const [payrollDriverFilter, setPayrollDriverFilter] = useState("");
  const [payrollStatusFilter, setPayrollStatusFilter] = useState("");
  const [npTransportRates, setNpTransportRates] = useState([]);
  const [npFuelSurcharges, setNpFuelSurcharges] = useState([]);
  const [npSalaryAdvances, setNpSalaryAdvances] = useState([]);
  const [npStandardFuelPrices, setNpStandardFuelPrices] = useState([]);
  const [transportRateSearch, setTransportRateSearch] = useState("");
  const [weblogDriverData, setWeblogDriverData] = useState({
    driverAttendance: [],
    transportFees: [],
    fuelFees: [],
    salaryConfig: [],
  });

  const query = useMemo(() => transportQuery(filters), [filters]);
  const deliveryQuery = useMemo(() => new URLSearchParams(deliveryFilters).toString(), [deliveryFilters]);
  const gateQuery = useMemo(() => new URLSearchParams(gateFilters).toString(), [gateFilters]);
  const metrics = dashboard?.metrics || {};
  const dispatchAlertModel = useMemo(
    () => buildDispatchAlertModel({ trips: allTrips, gateLogs, gpsDashboard, now }),
    [allTrips, gateLogs, gpsDashboard, now],
  );
  const dispatchSummary = dispatchAlertModel.summary;
  const waitingUnloadRows = useMemo(
    () => buildWaitingUnloadRows({ deliveries: allCustomerDeliveries, trips: allTrips }),
    [allCustomerDeliveries, allTrips],
  );
  const gateCandidates = useMemo(
    () => buildGateRegistrationCandidates({
      waitingUnloadRows,
      deliveries: allCustomerDeliveries,
      trips: allTrips,
      gateLogs,
      now,
    }),
    [waitingUnloadRows, allCustomerDeliveries, allTrips, gateLogs, now],
  );
  const selectedReportColumns = useMemo(
    () => REPORT_COLUMNS.filter((column) => reportTemplate.columns[column.key]),
    [reportTemplate.columns],
  );
  const reportRows = useMemo(
    () =>
      allTrips.filter((trip) =>
        REPORT_FILTER_FIELDS.every((field) => {
          if (!reportTemplate.filters[field.key]) return true;
          if (field.type === "dateRange") {
            const value = reportFilterValue(trip, field.key);
            const from = reportTemplate.filterValues[`${field.key}From`] || "";
            const to = reportTemplate.filterValues[`${field.key}To`] || "";
            if (from && value < from) return false;
            if (to && value > to) return false;
            return true;
          }
          const filterValue = String(reportTemplate.filterValues[field.key] || "").trim().toLowerCase();
          if (!filterValue) return true;
          const value = String(reportFilterValue(trip, field.key) || "").toLowerCase();
          return value.includes(filterValue);
        }),
      ),
    [allTrips, reportTemplate.filters, reportTemplate.filterValues],
  );
  const visibleTransportFees = weblogDriverData.transportFees.length ? weblogDriverData.transportFees : DEFAULT_WEBLOG_TRANSPORT_FEES;
  const statementRows = useMemo(
    () => statementAppliedFilters
      ? buildStatementRows({ trips: allTrips, rates: npTransportRates, transportFees: visibleTransportFees, fuelSurcharges: npFuelSurcharges, filters: statementAppliedFilters })
      : [],
    [allTrips, npTransportRates, visibleTransportFees, npFuelSurcharges, statementAppliedFilters],
  );
  const statementTotalAmount = useMemo(
    () => statementRows.reduce((sum, row) => sum + row.totalAmount, 0),
    [statementRows],
  );
  const statementTotals = useMemo(
    () => statementColumnTotals(statementRows),
    [statementRows],
  );
  const financialReadinessModel = useMemo(
    () => buildFinancialReadinessModel({
      trips: allTrips,
      rates: npTransportRates,
      routes: master.routes,
      filters: reconciliationFilters,
    }),
    [allTrips, npTransportRates, master.routes, reconciliationFilters],
  );
  const dailyScheduleModel = useMemo(
    () => buildDailyDispatchScheduleModel({
      trips: allTrips,
      routes: master.routes,
      transportRates: npTransportRates,
      date: scheduleDate,
    }),
    [allTrips, master.routes, npTransportRates, scheduleDate],
  );
  const scheduleGroups = useMemo(() => {
    const queryText = scheduleSearch.trim().toLowerCase();
    const groups = scheduleMode === "driver" ? dailyScheduleModel.driverGroups : dailyScheduleModel.vehicleGroups;
    if (!queryText) return groups;
    return groups
      .map((group) => ({
        ...group,
        trips: group.trips.filter((trip) =>
          [trip.orderCode, trip.customerCode, trip.routeCode, trip.plateNumber, trip.driverName]
            .join(" ")
            .toLowerCase()
            .includes(queryText),
        ),
      }))
      .filter((group) => group.trips.length);
  }, [dailyScheduleModel.driverGroups, dailyScheduleModel.vehicleGroups, scheduleMode, scheduleSearch]);
  const visibleNpVehicles = useMemo(() => officialNpVehicles(npVehicles), [npVehicles]);
  const filteredNpVehicles = useMemo(() => {
    const queryText = vehicleSearch.trim().toLowerCase();
    if (!queryText) return visibleNpVehicles;
    return visibleNpVehicles.filter((item) =>
      [item.plateNumber, item.loadCapacity, item.length, item.width, item.height, item.doorCount, item.registrationNumber, item.fuelNorm]
        .some((value) => String(value || "").toLowerCase().includes(queryText)),
    );
  }, [visibleNpVehicles, vehicleSearch]);
  const visibleNpDrivers = useMemo(() => officialNpDrivers(npDrivers), [npDrivers]);
  const filteredNpDrivers = useMemo(() => {
    const queryText = driverSearch.trim().toLowerCase();
    const matchedDrivers = queryText
      ? visibleNpDrivers.filter((item) =>
          [
            item.name,
            item.employeeCode,
            item.position,
            item.licenseType || item.license,
            item.dateOfBirth,
            item.identityNumber,
            item.phone,
            item.address,
            item.contractStart,
            item.contractEnd,
            item.familyDeduction,
            item.bankAccount,
            item.bankName,
            driverDocumentStatusLabel(item.applicationFileOnHand),
            driverDocumentStatusLabel(item.hardCopyContractOnHand),
          ].some((value) => String(value || "").toLowerCase().includes(queryText)),
        )
      : visibleNpDrivers;
    return sortDriversForManagement(matchedDrivers);
  }, [visibleNpDrivers, driverSearch]);
  const driverAttendanceAllRows = useMemo(
    () => [...npDriverAttendance, ...weblogDriverData.driverAttendance.map((row) => ({ ...row, source: row.source || "weblog" }))].sort((a, b) => {
      const byDate = fuelDateKey(b.leaveDate).localeCompare(fuelDateKey(a.leaveDate));
      if (byDate) return byDate;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    }),
    [npDriverAttendance, weblogDriverData.driverAttendance],
  );
  const driverAttendanceModel = useMemo(
    () => buildDriverAttendanceModel({ rows: driverAttendanceAllRows, drivers: visibleNpDrivers, monthValue: driverAttendanceMonth }),
    [driverAttendanceAllRows, driverAttendanceMonth, visibleNpDrivers],
  );
  const driverAttendanceBounds = driverAttendanceModel.bounds;
  const driverAttendanceRows = driverAttendanceModel.monthLeaveRows;
  const driverAttendanceListRows = useMemo(
    () => driverAttendanceDetailRows(driverAttendanceModel),
    [driverAttendanceModel],
  );
  const driverAttendanceSummary = useMemo(() => {
    return driverAttendanceModel.summary;
  }, [driverAttendanceModel.summary]);
  const driverAttendanceTotals = useMemo(
    () => driverAttendanceSummary.reduce((sum, row) => ({
      workdays: sum.workdays + row.workdays,
      leaveDays: sum.leaveDays + row.leaveDays,
    }), { workdays: 0, leaveDays: 0 }),
    [driverAttendanceSummary],
  );
  const driverAttendanceDriverOptions = useMemo(
    () => selectableAttendanceDrivers(visibleNpDrivers, driverAttendanceForm.leaveDate || driverAttendanceMonth),
    [driverAttendanceForm.leaveDate, driverAttendanceMonth, visibleNpDrivers],
  );
  const payrollAttendanceModel = useMemo(
    () => buildDriverAttendanceModel({ rows: driverAttendanceAllRows, drivers: visibleNpDrivers, monthValue: payrollMonth }),
    [driverAttendanceAllRows, payrollMonth, visibleNpDrivers],
  );
  const payrollCompanyDrivers = useMemo(
    () => selectableAttendanceDrivers(visibleNpDrivers, payrollMonth),
    [payrollMonth, visibleNpDrivers],
  );
  const fuelRows = useMemo(() => enrichFuelLogs(npFuelLogs, visibleNpVehicles), [npFuelLogs, visibleNpVehicles]);
  const payrollRows = useMemo(
    () => buildDriverPayrollRows({
      monthValue: payrollMonth,
      drivers: payrollCompanyDrivers,
      attendanceSummary: payrollAttendanceModel.summary,
      trips: allTrips,
      transportRates: npTransportRates,
      routes: master.routes,
      salaryConfig: weblogDriverData.salaryConfig,
      fuelLogs: fuelRows,
      standardFuelPrices: npStandardFuelPrices,
      salaryAdvances: npSalaryAdvances,
      manualAdjustments: {},
    }),
    [allTrips, fuelRows, master.routes, npSalaryAdvances, npStandardFuelPrices, npTransportRates, payrollAttendanceModel.summary, payrollCompanyDrivers, payrollMonth, weblogDriverData.salaryConfig],
  );
  const filteredPayrollRows = useMemo(
    () => payrollRows.filter((row) =>
      (!payrollDriverFilter || row.driverName === payrollDriverFilter) &&
      (!payrollStatusFilter || row.status === payrollStatusFilter),
    ),
    [payrollDriverFilter, payrollRows, payrollStatusFilter],
  );
  const payrollTotals = useMemo(() => driverPayrollTotals(filteredPayrollRows), [filteredPayrollRows]);
  const payrollDriverOptions = useMemo(() => payrollRows.map((row) => row.driverName), [payrollRows]);
  const salaryAdvanceDetailRows = useMemo(
    () => npSalaryAdvances
      .filter((item) => !payrollDriverFilter || item.driverName === payrollDriverFilter)
      .sort((a, b) => {
        const byDate = fuelDateKey(b.date).localeCompare(fuelDateKey(a.date));
        if (byDate) return byDate;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      }),
    [npSalaryAdvances, payrollDriverFilter],
  );
  const monthlySalaryAdvances = useMemo(
    () => salaryAdvanceDetailRows.filter((item) => fuelDateKey(item.date).startsWith(payrollMonth)),
    [payrollMonth, salaryAdvanceDetailRows],
  );
  const salaryAdvanceSummaryRows = useMemo(() => {
    const rowsByDriver = new Map();
    for (const item of monthlySalaryAdvances) {
      const driverName = item.driverName || "Chưa có tên lái xe";
      const current = rowsByDriver.get(driverName) || { driverName, count: 0, total: 0 };
      current.count += 1;
      current.total += moneyAmount(item.amount);
      rowsByDriver.set(driverName, current);
    }
    return [...rowsByDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName, "vi"));
  }, [monthlySalaryAdvances]);
  const salaryAdvanceSummaryTotal = useMemo(
    () => salaryAdvanceSummaryRows.reduce((sum, row) => sum + row.total, 0),
    [salaryAdvanceSummaryRows],
  );
  const filteredStandardFuelPrices = useMemo(
    () => [...npStandardFuelPrices].sort((a, b) => String(b.month || "").localeCompare(String(a.month || ""))),
    [npStandardFuelPrices],
  );
  const fuelPlateOptions = useMemo(
    () => [...new Set(fuelRows.map((item) => item.plateNumber).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
    [fuelRows],
  );
  const fuelDriverOptions = useMemo(
    () => [...new Set(fuelRows.map((item) => item.driverName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
    [fuelRows],
  );
  const filteredFuelRows = useMemo(
    () => fuelRows
      .filter((item) =>
        (!fuelPlateFilter || item.plateNumber === fuelPlateFilter) &&
        (!fuelDriverFilter || item.driverName === fuelDriverFilter),
      )
      .sort((a, b) => {
        const byDate = fuelDateKey(b.date).localeCompare(fuelDateKey(a.date));
        if (byDate) return byDate;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      }),
    [fuelRows, fuelPlateFilter, fuelDriverFilter],
  );
  const fuelDraft = useMemo(
    () => calculateFuelDraft(fuelForm, npFuelLogs.filter((item) => Number(item.id) !== Number(fuelForm.id)), visibleNpVehicles),
    [fuelForm, npFuelLogs, visibleNpVehicles],
  );
  const fuelTotals = useMemo(
    () => filteredFuelRows.reduce((totals, item) => ({
      liters: totals.liters + (Number(item.liters) || 0),
      amount: totals.amount + (Number(item.amount) || 0),
      delta: totals.delta + (Number(item.fuelDelta) || 0),
    }), { liters: 0, amount: 0, delta: 0 }),
    [filteredFuelRows],
  );
  const fuelSummaryRows = useMemo(() => {
    const from = fuelSummaryRange.from || "";
    const to = fuelSummaryRange.to || "";
    return filteredFuelRows
      .filter((item) => {
        const key = fuelDateKey(item.date);
        if (from && key < from) return false;
        if (to && key > to) return false;
        return true;
      })
      .sort((a, b) => {
        const byDate = fuelDateKey(b.date).localeCompare(fuelDateKey(a.date));
        if (byDate) return byDate;
        return (Number(b.id) || 0) - (Number(a.id) || 0);
      });
  }, [filteredFuelRows, fuelSummaryRange.from, fuelSummaryRange.to]);
  const fuelSummaryTotals = useMemo(
    () => fuelSummaryRows.reduce((totals, item) => ({
      liters: totals.liters + (Number(item.liters) || 0),
      normLiters: totals.normLiters + (Number(item.normLiters) || 0),
      amount: totals.amount + (Number(item.amount) || 0),
      delta: totals.delta + (Number(item.fuelDelta) || 0),
      count: totals.count + 1,
    }), { liters: 0, normLiters: 0, amount: 0, delta: 0, count: 0 }),
    [fuelSummaryRows],
  );
  const groupedFuelSummaryRows = useMemo(() => {
    const byDriver = new Map();
    for (const item of fuelSummaryRows) {
      const driverName = item.driverName || "Chưa có tên";
      const row = byDriver.get(driverName) || { driverName, count: 0, liters: 0, normLiters: 0, amount: 0, delta: 0 };
      row.count += 1;
      row.liters += Number(item.liters) || 0;
      row.normLiters += Number(item.normLiters) || 0;
      row.amount += Number(item.amount) || 0;
      row.delta += Number(item.fuelDelta) || 0;
      byDriver.set(driverName, row);
    }
    return [...byDriver.values()].sort((a, b) => a.driverName.localeCompare(b.driverName, "vi"));
  }, [fuelSummaryRows]);
  const groupedFuelVehicleSummaryRows = useMemo(() => {
    const byVehicleDriver = new Map();
    for (const item of fuelSummaryRows) {
      const plateNumber = item.plateNumber || "Chưa có biển";
      const driverName = item.driverName || "Chưa có tên";
      const key = `${plateNumber}|${driverName}`;
      const row = byVehicleDriver.get(key) || { plateNumber, driverName, count: 0, liters: 0, amount: 0, delta: 0 };
      row.count += 1;
      row.liters += Number(item.liters) || 0;
      row.amount += Number(item.amount) || 0;
      row.delta += Number(item.fuelDelta) || 0;
      byVehicleDriver.set(key, row);
    }
    return [...byVehicleDriver.values()].sort((a, b) => {
      const byPlate = a.plateNumber.localeCompare(b.plateNumber, "vi");
      return byPlate || a.driverName.localeCompare(b.driverName, "vi");
    });
  }, [fuelSummaryRows]);
  const filteredNpTransportRates = useMemo(() => {
    const queryText = transportRateSearch.trim().toLowerCase();
    const rows = npTransportRates || [];
    if (!queryText) return rows;
    return rows.filter((item) =>
      TRANSPORT_RATE_COLUMNS.some((column) => String(item[column.key] || "").toLowerCase().includes(queryText)),
    );
  }, [npTransportRates, transportRateSearch]);
  const generatedRouteCode = routeCodeFromPoints(routeForm, master.locations);
  const selectedTripRoute = useMemo(
    () =>
      master.routes.find((item) => String(item.id) === String(tripForm.routeId)) ||
      master.routes.find((item) => item.routeCode === tripForm.routeText && (!tripForm.customerCode || item.customerCode === tripForm.customerCode)),
    [master.routes, tripForm.customerCode, tripForm.routeId, tripForm.routeText],
  );
  const tripRouteOptions = useMemo(
    () => routeOptionsForCustomer(npTransportRates, tripForm.customerCode),
    [npTransportRates, tripForm.customerCode],
  );
  const latestDriverSuggestion = useMemo(
    () => {
      if (appliedDriverSuggestionPlate && appliedDriverSuggestionPlate === tripForm.plateNumber) return null;
      return findLatestDriverByPlate(allTrips, tripForm.plateNumber, { excludeTripId: tripForm.id });
    },
    [allTrips, appliedDriverSuggestionPlate, tripForm.id, tripForm.plateNumber],
  );
  const tripHasThirdPoint = !selectedTripRoute || routeHasThirdPoint(selectedTripRoute);
  const currentRole = currentUser?.role || "customer";
  const can = (permissionKey) => currentRole === "admin" || Boolean(accountPermissions[permissionKey]?.[currentRole]);
  const canView = (view) => {
    if (["deliveries", "waitingUnload", "gate"].includes(view)) return false;
    if (currentRole === "admin") return true;
    if (["alerts", "schedule", "transport", "vehicles", "drivers", "rates", "fuel", "salary", "gps", "statement"].includes(view)) return can("viewTrips");
    if (["customersPartners", "routes"].includes(view)) return can("editTransport") || can("viewTrips");
    if (view === "reconciliation") return can("exportExcel") || can("viewTrips");
    if (view === "reports") return can("exportExcel") || can("createReportTemplate");
    if (view === "accounts") return can("createAccount") || can("assignPermissions");
    return true;
  };

  function login(event) {
    event.preventDefault();
    const username = loginForm.username.trim().toLowerCase();
    const password = loginForm.password;
    
    fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Sai tài khoản hoặc mật khẩu");
        return response.json();
      })
      .then((data) => {
        const user = normalizeAuthenticatedUser(data.user);
        if (!user) throw new Error("Khong doc duoc thong tin tai khoan");
        localStorage.setItem("auth_token", data.token);
        if (rememberPassword) {
          localStorage.setItem(LOGIN_CREDENTIALS_KEY, JSON.stringify({ username: loginForm.username.trim(), password }));
        } else {
          localStorage.removeItem(LOGIN_CREDENTIALS_KEY);
        }
        setCurrentUser(user);
        setAuthReady(true);
        setFilters(transportFiltersForUser(user));
        setLoginError("");
      })
      .catch((err) => {
        setLoginError(err.message);
      });
  }

  function logout() {
    localStorage.removeItem("auth_token");
    setCurrentUser(null);
    setAuthReady(true);
    if (!rememberPassword) setLoginForm({ username: "", password: "" });
  }

  function defaultVehicleForm(item = null) {
    return {
      id: item?.id || "",
      plateNumber: fieldValue(item, "plateNumber"),
      loadCapacity: fieldValue(item, "loadCapacity") || fieldValue(item, "type"),
      length: fieldValue(item, "length"),
      width: fieldValue(item, "width"),
      height: fieldValue(item, "height"),
      doorCount: fieldValue(item, "doorCount"),
      registrationNumber: fieldValue(item, "registrationNumber"),
      fuelNorm: fieldValue(item, "fuelNorm"),
    };
  }

  function openVehicleModal(item = null) {
    setVehicleModal({ item });
    setVehicleForm(defaultVehicleForm(item));
  }

  async function saveVehicle(event) {
    event.preventDefault();
    const payload = {
      ...vehicleForm,
      plateNumber: String(vehicleForm.plateNumber || "").trim().toUpperCase(),
    };
    if (!payload.plateNumber) {
      setError("Cần nhập biển kiểm soát.");
      return;
    }
    try {
      await api(vehicleModal?.item ? `/api/operations/vehicles/${vehicleModal.item.id}` : "/api/operations/vehicles", {
        method: vehicleModal?.item ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setVehicleModal(null);
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteVehicle(item) {
    if (!window.confirm(`Xóa xe ${item.plateNumber}?`)) return;
    try {
      await api(`/api/operations/vehicles/${item.id}`, { method: "DELETE" });
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function defaultDriverForm(item = null) {
    return {
      id: item?.id || "",
      name: fieldValue(item, "name"),
      employeeCode: fieldValue(item, "employeeCode"),
      position: fieldValue(item, "position") || "Lái xe",
      licenseType: fieldValue(item, "licenseType") || fieldValue(item, "license"),
      dateOfBirth: fieldValue(item, "dateOfBirth"),
      identityNumber: fieldValue(item, "identityNumber"),
      phone: fieldValue(item, "phone"),
      address: fieldValue(item, "address"),
      contractStart: fieldValue(item, "contractStart"),
      contractEnd: fieldValue(item, "contractEnd"),
      familyDeduction: fieldValue(item, "familyDeduction"),
      bankAccount: fieldValue(item, "bankAccount"),
      bankName: fieldValue(item, "bankName"),
      applicationFileOnHand: Boolean(item?.applicationFileOnHand),
      hardCopyContractOnHand: Boolean(item?.hardCopyContractOnHand),
    };
  }

  function openDriverModal(mode = "edit", item = null) {
    setDriverModal({ mode, item });
    setDriverForm(defaultDriverForm(item));
  }

  async function saveDriver(event) {
    event.preventDefault();
    const payload = {
      ...driverForm,
      employeeCode: String(driverForm.employeeCode || "").trim().toUpperCase(),
    };
    if (!payload.name) {
      setError("Cần nhập họ và tên tài xế.");
      return;
    }
    if (!payload.employeeCode) {
      setError("Cần nhập mã nhân viên.");
      return;
    }
    try {
      await api(driverModal?.item ? `/api/operations/drivers/${driverModal.item.id}` : "/api/operations/drivers", {
        method: driverModal?.item ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setDriverModal(null);
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDriver(item) {
    if (!window.confirm(`Xóa tài xế ${item.name}?`)) return;
    try {
      await api(`/api/operations/drivers/${item.id}`, { method: "DELETE" });
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function defaultDriverAttendanceForm(item = null) {
    return {
      id: item?.id || "",
      driverName: fieldValue(item, "driverName"),
      leaveDate: fuelDateInputValue(fieldValue(item, "leaveDate")),
      reason: fieldValue(item, "reason"),
      note: fieldValue(item, "note"),
    };
  }

  function openDriverAttendanceModal(item = null) {
    setDriverAttendanceModal({ item });
    setDriverAttendanceForm(defaultDriverAttendanceForm(item));
  }

  async function saveDriverAttendance(event) {
    event.preventDefault();
    const payload = {
      ...driverAttendanceForm,
      driverName: String(driverAttendanceForm.driverName || "").trim(),
    };
    if (!payload.driverName) {
      setError("Cần nhập tên lái xe.");
      return;
    }
    if (!payload.leaveDate) {
      setError("Cần nhập ngày nghỉ.");
      return;
    }
    try {
      await api(driverAttendanceModal?.item ? `/api/operations/driver-attendance/${driverAttendanceModal.item.id}` : "/api/operations/driver-attendance", {
        method: driverAttendanceModal?.item ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setDriverAttendanceMonth(attendanceMonthForLeaveDate(payload.leaveDate, driverAttendanceMonth));
      setDriverAttendanceModal(null);
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDriverAttendance(item) {
    if (item.source === "weblog") {
      setError("Dòng từ weblog chỉ xem tại WebNP, chưa xóa trực tiếp được.");
      return;
    }
    if (!window.confirm(`Xóa ngày nghỉ ${item.driverName} - ${item.leaveDate}?`)) return;
    try {
      await api(`/api/operations/driver-attendance/${item.id}`, { method: "DELETE" });
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function fuelDateInputValue(value) {
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    return text || todayInputValue();
  }

  function defaultFuelForm(item = null) {
    return {
      id: item?.id || "",
      date: fuelDateInputValue(fieldValue(item, "date")),
      plateNumber: fieldValue(item, "plateNumber"),
      driverName: fieldValue(item, "driverName"),
      amount: fieldValue(item, "amount"),
      kmReading: fieldValue(item, "kmReading"),
      liters: fieldValue(item, "liters"),
      fuelNorm: fieldValue(item, "fuelNorm"),
    };
  }

  function openFuelModal(item = null) {
    setFuelModal({ item });
    setFuelForm(defaultFuelForm(item));
  }

  function updateFuelForm(field, value) {
    if (field === "plateNumber") {
      const plateNumber = value.toUpperCase();
      const vehicle = visibleNpVehicles.find((item) => String(item.plateNumber || "").toUpperCase() === plateNumber);
      setFuelForm((form) => ({
        ...form,
        plateNumber,
        driverName: form.driverName || vehicle?.driverName || "",
        fuelNorm: form.fuelNorm || vehicle?.fuelNorm || "",
      }));
      return;
    }
    setFuelForm((form) => ({ ...form, [field]: value }));
  }

  async function saveFuelLog(event) {
    event.preventDefault();
    const payload = {
      ...fuelForm,
      plateNumber: String(fuelForm.plateNumber || "").trim().toUpperCase(),
    };
    if (!payload.date) {
      setError("Cần nhập ngày đổ dầu.");
      return;
    }
    if (!payload.plateNumber) {
      setError("Cần nhập biển số xe.");
      return;
    }
    if (!payload.driverName) {
      setError("Cần nhập tên lái xe.");
      return;
    }
    try {
      await api(fuelModal?.item ? `/api/operations/fuel-logs/${fuelModal.item.id}` : "/api/operations/fuel-logs", {
        method: fuelModal?.item ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setFuelModal(null);
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteFuelLog(item) {
    if (!window.confirm(`Xóa lượt đổ dầu ${item.plateNumber} ngày ${item.date}?`)) return;
    try {
      await api(`/api/operations/fuel-logs/${item.id}`, { method: "DELETE" });
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function defaultTransportRateForm(item = null) {
    return createEmptyTransportRateRow(
      Object.fromEntries(TRANSPORT_RATE_COLUMNS.map((column) => [column.key, fieldValue(item, column.key)])),
    );
  }

  function openTransportRateModal(item = null) {
    setTransportRateModal({ item });
    setTransportRateRows(item ? [defaultTransportRateForm(item)] : createEmptyTransportRateRows(10));
  }

  function updateTransportRateRow(index, key, value) {
    setTransportRateRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  }

  function addTransportRateRow() {
    setTransportRateRows((rows) => [...rows, createEmptyTransportRateRow()]);
  }

  function removeTransportRateRow(index) {
    setTransportRateRows((rows) => (rows.length > 1 ? rows.filter((_, rowIndex) => rowIndex !== index) : rows));
  }

  async function saveTransportRate(event) {
    event.preventDefault();
    const { payloads, errors } = normalizeTransportRateRows(transportRateRows, transportRateModal?.item?.status || "active");
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    if (!payloads.length) {
      setError("Cần nhập ít nhất một dòng bảng giá.");
      return;
    }
    try {
      if (transportRateModal?.item) {
        await api(`/api/operations/transport-rates/${transportRateModal.item.id}`, {
          method: "PUT",
          body: JSON.stringify(payloads[0]),
        });
      } else {
        await Promise.all(payloads.map((payload) => api("/api/operations/transport-rates", {
          method: "POST",
          body: JSON.stringify(payload),
        })));
      }
      setTransportRateModal(null);
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTransportRate(item) {
    if (!window.confirm(`Xóa bảng giá ${item.customer} - ${item.route}?`)) return;
    try {
      await api(`/api/operations/transport-rates/${item.id}`, { method: "DELETE" });
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function openFuelSurchargeModal(item = null) {
    setFuelSurchargeModal({ item });
    setFuelSurchargeForm({
      id: item?.id || "",
      content: fieldValue(item, "content"),
      dateFrom: fieldValue(item, "dateFrom"),
      dateTo: fieldValue(item, "dateTo"),
      percent: fieldValue(item, "percent"),
      note: fieldValue(item, "note"),
    });
  }

  async function saveFuelSurcharge(event) {
    event.preventDefault();
    const payload = {
      ...fuelSurchargeForm,
      content: String(fuelSurchargeForm.content || "").trim(),
      percent: String(fuelSurchargeForm.percent || "").trim(),
    };
    if (!payload.content) {
      setError("Cần nhập nội dung phụ phí xăng dầu.");
      return;
    }
    if (!payload.percent) {
      setError("Cần nhập phần trăm phụ phí.");
      return;
    }
    try {
      await api(fuelSurchargeModal?.item ? `/api/operations/fuel-surcharges/${fuelSurchargeModal.item.id}` : "/api/operations/fuel-surcharges", {
        method: fuelSurchargeModal?.item ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setFuelSurchargeModal(null);
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteFuelSurcharge(item) {
    if (!window.confirm(`Xóa phụ phí xăng dầu ${item.content}?`)) return;
    try {
      await api(`/api/operations/fuel-surcharges/${item.id}`, { method: "DELETE" });
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function openSalaryAdvanceModal(item = null) {
    setSalaryAdvanceModal({ item });
    setSalaryAdvanceForm({
      id: item?.id || "",
      date: fuelDateInputValue(fieldValue(item, "date")) || todayInputValue(),
      driverName: fieldValue(item, "driverName"),
      amount: fieldValue(item, "amount"),
      note: fieldValue(item, "note"),
    });
  }

  async function saveSalaryAdvance(event) {
    event.preventDefault();
    const payload = {
      ...salaryAdvanceForm,
      driverName: String(salaryAdvanceForm.driverName || "").trim(),
    };
    if (!payload.date || !payload.driverName || !payload.amount) {
      setError("Cần nhập ngày ứng, lái xe và số tiền ứng.");
      return;
    }
    try {
      await api(salaryAdvanceModal?.item ? `/api/operations/salary-advances/${salaryAdvanceModal.item.id}` : "/api/operations/salary-advances", {
        method: salaryAdvanceModal?.item ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setSalaryAdvanceModal(null);
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteSalaryAdvance(item) {
    if (!window.confirm(`Xóa ứng lương ${item.driverName} - ${item.date}?`)) return;
    try {
      await api(`/api/operations/salary-advances/${item.id}`, { method: "DELETE" });
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function openStandardFuelPriceModal(item = null) {
    setStandardFuelPriceModal({ item });
    setStandardFuelPriceForm({
      id: item?.id || "",
      month: fieldValue(item, "month") || payrollMonth,
      unitPrice: fieldValue(item, "unitPrice"),
      note: fieldValue(item, "note"),
    });
  }

  async function saveStandardFuelPrice(event) {
    event.preventDefault();
    const payload = { ...standardFuelPriceForm, month: String(standardFuelPriceForm.month || "").slice(0, 7) };
    if (!payload.month || !payload.unitPrice) {
      setError("Cần nhập tháng và giá dầu tiêu chuẩn.");
      return;
    }
    try {
      await api(standardFuelPriceModal?.item ? `/api/operations/standard-fuel-prices/${standardFuelPriceModal.item.id}` : "/api/operations/standard-fuel-prices", {
        method: standardFuelPriceModal?.item ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setStandardFuelPriceModal(null);
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteStandardFuelPrice(item) {
    if (!window.confirm(`Xóa giá dầu tiêu chuẩn tháng ${item.month}?`)) return;
    try {
      await api(`/api/operations/standard-fuel-prices/${item.id}`, { method: "DELETE" });
      await loadAll();
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [
        masterData,
        dashboardData,
        tripData,
        costData,
        deliveryData,
        allTripData,
        allDeliveryData,
        gateData,
        gpsData,
        accountAdminData,
        auditLogData,
        reportTemplateData,
        operationsData,
        weblogData,
      ] = await Promise.all([
        api("/api/master-data"),
        api(`/api/dashboard?${query}`),
        api(transportTripsPath(query)),
        api("/api/costs"),
        api(`/api/customer-deliveries?${deliveryQuery}`),
        api("/api/trips"),
        api("/api/customer-deliveries"),
        api(`/api/gate-logs?${gateQuery}`),
        api("/api/gps/dashboard"),
        api("/api/account-admin"),
        api("/api/audit-logs?limit=100"),
        api("/api/report-templates"),
        api("/api/operations"),
        api("/api/weblog-driver-data").catch((err) => {
          return { driverAttendance: [], transportFees: [], fuelFees: [], salaryConfig: [], _error: err.message };
        }),
      ]);
      setMaster({ locations: [], ...masterData });
      setDashboard(dashboardData);
      setTrips(Array.isArray(tripData) ? tripData : tripData.rows || []);
      setAllTrips(allTripData);
      setCosts(costData);
      setCustomerDeliveries(deliveryData);
      setAllCustomerDeliveries(allDeliveryData);
      setGateLogs(gateData);
      setGpsDashboard(gpsData);
      setAccountUsers(Array.isArray(accountAdminData?.users) ? accountAdminData.users : DEFAULT_ACCOUNT_USERS);
      setAccountPermissions(normalizePermissions(accountAdminData?.permissions));
      setAuditLogs(Array.isArray(auditLogData) ? auditLogData : []);
      setNpVehicles(Array.isArray(operationsData?.vehicles) ? operationsData.vehicles : []);
      setNpDrivers(Array.isArray(operationsData?.drivers) ? operationsData.drivers : []);
      setNpDriverAttendance(Array.isArray(operationsData?.driverAttendance) ? operationsData.driverAttendance : []);
      setNpFuelLogs(Array.isArray(operationsData?.fuelLogs) ? operationsData.fuelLogs : []);
      setNpTransportRates(Array.isArray(operationsData?.transportRates) ? operationsData.transportRates : []);
      setNpFuelSurcharges(Array.isArray(operationsData?.fuelSurcharges) ? operationsData.fuelSurcharges : []);
      setNpSalaryAdvances(Array.isArray(operationsData?.salaryAdvances) ? operationsData.salaryAdvances : []);
      setNpStandardFuelPrices(Array.isArray(operationsData?.standardFuelPrices) ? operationsData.standardFuelPrices : []);
      setWeblogDriverData({
        driverAttendance: Array.isArray(weblogData?.driverAttendance) ? weblogData.driverAttendance : [],
        transportFees: Array.isArray(weblogData?.transportFees) ? weblogData.transportFees : [],
        fuelFees: Array.isArray(weblogData?.fuelFees) ? weblogData.fuelFees : [],
        salaryConfig: Array.isArray(weblogData?.salaryConfig) ? weblogData.salaryConfig : [],
      });
      if (weblogData?._error) setError(weblogData._error);
      if (Array.isArray(reportTemplateData?.templates) && reportTemplateData.templates.length) {
        const templates = reportTemplateData.templates.map(normalizeReportTemplate);
        const selectedId = reportTemplateData.selectedId || templates[0].id;
        const selected = templates.find((template) => template.id === selectedId) || templates[0];
        setReportTemplates(templates);
        setSelectedReportTemplateId(selected.id);
        setReportTemplate(selected);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function handleAuthExpired() {
      setCurrentUser(null);
      setAuthReady(true);
    }
    window.addEventListener("webnp:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("webnp:auth-expired", handleAuthExpired);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setAuthReady(true);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error("Session expired");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        const user = normalizeAuthenticatedUser(data.user);
        if (!user) throw new Error("Invalid user");
        setCurrentUser(user);
        setFilters(transportFiltersForUser(user));
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("auth_token");
        setCurrentUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!shouldLoadAppData({ authReady, currentUser })) {
      setLoading(false);
      return;
    }
    loadAll();
  }, [authReady, currentUser, query, deliveryQuery, gateQuery]);

  useEffect(() => {
    if (!shouldAutoRefreshTransport({ activeView, currentUser })) return undefined;
    const timer = window.setInterval(() => {
      loadAll();
    }, TRANSPORT_AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [activeView, currentUser, query, deliveryQuery, gateQuery]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentUser && !canView(activeView)) setActiveView("transport");
  }, [accountPermissions, activeView, currentUser]);

  function routeForTrip(trip) {
    return master.routes.find((route) => route.routeCode === trip.routeCode && route.customerCode === trip.customerCode);
  }

  function defaultTripForm(item = null) {
    const route = item ? routeForTrip(item) : null;
    const plannedDateTime = defaultPlannedDateTime(item, todayInputValue);
    const pointDates = tripScheduleDatesFromItem(item, plannedDateTime.plannedDate);
    const bulkRow = {
      customerCode: "",
      routeText: "",
      cargoWeight: "",
      vehicleType: "Thường",
      plannedDate: plannedDateTime.plannedDate,
      plannedTime: plannedDateTime.plannedTime,
      partnerCode: "",
      plateNumber: "",
      driverName: "",
      driverPhone: "",
      note: "",
    };
    return {
      count: 5,
      bulkRows: Array.from({ length: 10 }, () => ({ ...bulkRow })),
      completedBulkRows: createCompletedBulkTripRows(10),
      id: item?.id || "",
      orderCode: fieldValue(item, "orderCode"),
      customerCode: item ? fieldValue(item, "customerCode") || route?.customerCode || "" : "",
      routeId: route?.id || "",
      routeText: route?.routeCode || fieldValue(item, "routeCode"),
      cargoWeight: item && fieldValue(item, "cargoWeight") ? displayCargoWeight(fieldValue(item, "cargoWeight")) : "",
      vehicleType: fieldValue(item, "vehicleType") || "Thường",
      plannedDate: plannedDateTime.plannedDate,
      plannedTime: plannedDateTime.plannedTime,
      partnerCode: item ? fieldValue(item, "partnerCode") : "",
      plateNumber: fieldValue(item, "plateNumber"),
      driverName: fieldValue(item, "driverName"),
      driverPhone: fieldValue(item, "driverPhone"),
      waybills: waybillRowsFromTrip(item),
      handlingFeeSide: fieldValue(item, "handlingFeeSide") || "Không",
      handlingFeeAmount: fieldValue(item, "handlingFeeAmount"),
      otherFees: otherFeeRowsFromTrip(item),
      ...pointDates,
      point1ArrivalTime: toOptionalTimeInput(item?.point1ArrivalAt),
      point1DepartTime: toOptionalTimeInput(item?.point1DepartAt),
      point2ArrivalTime: toOptionalTimeInput(item?.point2ArrivalAt),
      point2DepartTime: toOptionalTimeInput(item?.point2DepartAt),
      point3ArrivalTime: toOptionalTimeInput(item?.point3ArrivalAt),
      point3DepartTime: toOptionalTimeInput(item?.point3DepartAt),
      note: fieldValue(item, "note"),
    };
  }

  function openTripModal(mode, item = null) {
    if ((mode === "single" || mode === "bulk" || mode === "bulkCompleted") && !can("createTransport")) {
      setError("Bạn không có quyền tạo kế hoạch vận chuyển.");
      return;
    }
    if (mode === "edit" && !can("editTransport") && !can("updateArrival")) {
      setError("Bạn không có quyền sửa hoặc cập nhật giờ chuyến xe.");
      return;
    }
    setTripModal({ mode, item });
    setAppliedDriverSuggestionPlate("");
    setTripForm(defaultTripForm(item));
  }

  function updateTripScheduleField(field, value) {
    setTripForm((current) => normalizeTripScheduleOrder({ ...current, [field]: value }));
  }

  function updateTripScheduleDate(field, value) {
    setTripForm((current) => setTripScheduleDate(current, field, value));
  }

  function stepTripScheduleDate(field, days) {
    setTripForm((current) => adjustTripScheduleDate(current, field, days));
  }

  function driverLinkForOrder(orderCode) {
    if (!orderCode) return "";
    return `${window.location.origin}/driver/${encodeURIComponent(orderCode)}`;
  }

  function applyLatestDriverSuggestion() {
    if (!latestDriverSuggestion) return;
    setTripForm((current) => ({
      ...current,
      driverName: latestDriverSuggestion.driverName || current.driverName,
      driverPhone: latestDriverSuggestion.driverPhone || current.driverPhone,
    }));
    setAppliedDriverSuggestionPlate(tripForm.plateNumber || "");
  }

  function dismissLatestDriverSuggestion() {
    setAppliedDriverSuggestionPlate(tripForm.plateNumber || "");
  }

  async function copyDriverLink() {
    const link = driverLinkForOrder(tripForm.orderCode);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy link gửi lái xe", link);
    }
  }

  function updateWaybill(index, key, value) {
    const waybills = [...(tripForm.waybills || [])];
    waybills[index] = { ...waybills[index], [key]: value };
    setTripForm({ ...tripForm, waybills });
  }

  function pasteWaybills(startIndex, startField, text) {
    const rows = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));
    if (!rows.length) return;

    const startCol = Math.max(0, WAYBILL_FIELDS.indexOf(startField));
    const waybills = [...(tripForm.waybills || [])];
    rows.forEach((cells, rowOffset) => {
      const rowIndex = startIndex + rowOffset;
      waybills[rowIndex] = { packageCount: "", grossWeight: "", ...waybills[rowIndex] };
      if (cells.length === 1) {
        const value = cells[0].trim();
        waybills[rowIndex][startField] = value;
        return;
      }
      cells.forEach((cell, cellOffset) => {
        const field = WAYBILL_FIELDS[startCol + cellOffset];
        if (!field) return;
        const value = cell.trim();
        waybills[rowIndex][field] = value;
      });
    });
    setTripForm({ ...tripForm, waybills });
  }

  function handleWaybillPaste(event, index, field) {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    pasteWaybills(index, field, text);
  }

  function addWaybillRow() {
    setTripForm({
      ...tripForm,
      waybills: [...(tripForm.waybills || []), { packageCount: "", grossWeight: "" }],
    });
  }

  function removeWaybillRow(index) {
    const waybills = (tripForm.waybills || []).filter((_, rowIndex) => rowIndex !== index);
    setTripForm({ ...tripForm, waybills: waybills.length ? waybills : [{ packageCount: "", grossWeight: "" }] });
  }

  function updateOtherFee(index, key, value) {
    const otherFees = [...(tripForm.otherFees || [])];
    otherFees[index] = { ...otherFees[index], [key]: value };
    setTripForm({ ...tripForm, otherFees });
  }

  function addOtherFeeRow() {
    setTripForm({
      ...tripForm,
      otherFees: [...(tripForm.otherFees || []), { description: "", amount: "" }],
    });
  }

  function removeOtherFeeRow(index) {
    const otherFees = (tripForm.otherFees || []).filter((_, rowIndex) => rowIndex !== index);
    setTripForm({ ...tripForm, otherFees: otherFees.length ? otherFees : [{ description: "", amount: "" }] });
  }

  function updateBulkTripRow(index, key, value) {
    const bulkRows = [...(tripForm.bulkRows || [])];
    const upperFields = ["customerCode", "partnerCode", "plateNumber"];
    bulkRows[index] = {
      ...bulkRows[index],
      [key]: upperFields.includes(key) ? value.toUpperCase() : key === "plannedTime" ? normalizeTimeEntry(value) : value,
    };
    setTripForm({ ...tripForm, bulkRows });
  }

  function addBulkTripRows(count = 5) {
    const base = defaultTripForm().bulkRows[0];
    setTripForm({
      ...tripForm,
      bulkRows: [...(tripForm.bulkRows || []), ...Array.from({ length: count }, () => ({ ...base }))],
    });
  }

  function removeBulkTripRow(index) {
    const bulkRows = (tripForm.bulkRows || []).filter((_, rowIndex) => rowIndex !== index);
    setTripForm({ ...tripForm, bulkRows: bulkRows.length ? bulkRows : [{ ...defaultTripForm().bulkRows[0] }] });
  }

  function pasteBulkTripRows(startIndex, startField, text) {
    const rows = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));
    if (!rows.length) return;

    const startCol = Math.max(0, BULK_TRIP_FIELDS.indexOf(startField));
    const bulkRows = [...(tripForm.bulkRows || [])];
    const base = defaultTripForm().bulkRows[0];
    rows.forEach((cells, rowOffset) => {
      const rowIndex = startIndex + rowOffset;
      bulkRows[rowIndex] = { ...base, ...bulkRows[rowIndex] };
      cells.forEach((cell, cellOffset) => {
        const field = BULK_TRIP_FIELDS[startCol + cellOffset];
        if (!field) return;
        const value = cell.trim();
        if (["customerCode", "partnerCode", "plateNumber"].includes(field)) {
          bulkRows[rowIndex][field] = value.toUpperCase();
        } else if (field === "plannedTime") {
          bulkRows[rowIndex][field] = normalizeTimeEntry(value);
        } else {
          bulkRows[rowIndex][field] = value;
        }
      });
    });
    setTripForm({ ...tripForm, bulkRows });
  }

  function handleBulkTripPaste(event, index, field) {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    pasteBulkTripRows(index, field, text);
  }

  function updateCompletedBulkTripRow(index, key, value) {
    const rows = [...(tripForm.completedBulkRows || [])];
    rows[index] = {
      ...rows[index],
      [key]: ["customerCode", "partnerCode", "plateNumber", "routeText"].includes(key) ? value.toUpperCase() : value,
    };
    setTripForm({ ...tripForm, completedBulkRows: rows });
  }

  function addCompletedBulkTripRows(count = 5) {
    const base = createCompletedBulkTripRows(1)[0];
    setTripForm({
      ...tripForm,
      completedBulkRows: [...(tripForm.completedBulkRows || []), ...Array.from({ length: count }, () => ({ ...base }))],
    });
  }

  function removeCompletedBulkTripRow(index) {
    const rows = (tripForm.completedBulkRows || []).filter((_, rowIndex) => rowIndex !== index);
    const base = createCompletedBulkTripRows(1)[0];
    setTripForm({ ...tripForm, completedBulkRows: rows.length ? rows : [{ ...base }] });
  }

  function pasteCompletedBulkTripRows(startIndex, startField, text) {
    const rows = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));
    if (!rows.length) return;

    const startCol = Math.max(0, COMPLETED_BULK_TRIP_FIELDS.indexOf(startField));
    const bulkRows = [...(tripForm.completedBulkRows || [])];
    const base = createCompletedBulkTripRows(1)[0];
    rows.forEach((cells, rowOffset) => {
      const rowIndex = startIndex + rowOffset;
      bulkRows[rowIndex] = { ...base, ...bulkRows[rowIndex] };
      cells.forEach((cell, cellOffset) => {
        const field = COMPLETED_BULK_TRIP_FIELDS[startCol + cellOffset];
        if (!field) return;
        const value = cell.trim();
        bulkRows[rowIndex][field] = ["customerCode", "partnerCode", "plateNumber", "routeText"].includes(field) ? value.toUpperCase() : value;
      });
    });
    setTripForm({ ...tripForm, completedBulkRows: bulkRows });
  }

  function handleCompletedBulkTripPaste(event, index, field) {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    pasteCompletedBulkTripRows(index, field, text);
  }

  function defaultDeliveryForm(item = null) {
    const plan = item?.requiredArrivalAt || new Date(`${todayInputValue()}T08:00:00`).toISOString();
    return {
      id: item?.id || "",
      customerCode: fieldValue(item, "customerCode"),
      plannedDate: toDateInput(plan),
      plannedTime: toTimeInput(plan),
      partnerCode: fieldValue(item, "partnerCode"),
      plateNumber: fieldValue(item, "plateNumber"),
      driverName: fieldValue(item, "driverName"),
      driverPhone: fieldValue(item, "driverPhone"),
      waybills: waybillRowsFromTrip(item),
      vsipArrivalTime: toOptionalTimeInput(item?.vsipArrivalAt),
      vsipDepartTime: toOptionalTimeInput(item?.vsipDepartAt),
      note: fieldValue(item, "note"),
    };
  }

  function openDeliveryModal(item = null) {
    if (item && !can("editTransport") && !can("updateArrival")) {
      setError("Bạn không có quyền sửa hoặc cập nhật xe giao hàng.");
      return;
    }
    if (!item && !can("createTransport")) {
      setError("Bạn không có quyền tạo xe giao hàng.");
      return;
    }
    setDeliveryModal({ item });
    setDeliveryForm(defaultDeliveryForm(item));
  }

  function updateDeliveryWaybill(index, key, value) {
    const waybills = [...(deliveryForm.waybills || [])];
    waybills[index] = { ...waybills[index], [key]: value };
    setDeliveryForm({ ...deliveryForm, waybills });
  }

  function pasteDeliveryWaybills(startIndex, startField, text) {
    const rows = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));
    if (!rows.length) return;

    const startCol = Math.max(0, WAYBILL_FIELDS.indexOf(startField));
    const waybills = [...(deliveryForm.waybills || [])];
    rows.forEach((cells, rowOffset) => {
      const rowIndex = startIndex + rowOffset;
      waybills[rowIndex] = { packageCount: "", grossWeight: "", ...waybills[rowIndex] };
      cells.forEach((cell, cellOffset) => {
        const field = WAYBILL_FIELDS[startCol + cellOffset];
        if (!field) return;
        const value = cell.trim();
        waybills[rowIndex][field] = value;
      });
    });
    setDeliveryForm({ ...deliveryForm, waybills });
  }

  function handleDeliveryWaybillPaste(event, index, field) {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    pasteDeliveryWaybills(index, field, text);
  }

  function addDeliveryWaybillRow() {
    setDeliveryForm({
      ...deliveryForm,
      waybills: [...(deliveryForm.waybills || []), { packageCount: "", grossWeight: "" }],
    });
  }

  function removeDeliveryWaybillRow(index) {
    const waybills = (deliveryForm.waybills || []).filter((_, rowIndex) => rowIndex !== index);
    setDeliveryForm({ ...deliveryForm, waybills: waybills.length ? waybills : [{ packageCount: "", grossWeight: "" }] });
  }

  async function saveTrip(event) {
    event.preventDefault();
    if ((tripModal.mode === "bulk" || tripModal.mode === "bulkCompleted") && !can("createTransport")) {
      setError("Bạn không có quyền tạo kế hoạch vận chuyển.");
      return;
    }
    if (tripModal.mode === "edit" && !can("editTransport") && !can("updateArrival")) {
      setError("Bạn không có quyền sửa hoặc cập nhật giờ chuyến xe.");
      return;
    }
    if (tripModal.mode !== "edit" && tripModal.mode !== "bulk" && tripModal.mode !== "bulkCompleted" && !can("createTransport")) {
      setError("Bạn không có quyền tạo kế hoạch vận chuyển.");
      return;
    }
    if (tripModal.mode === "bulkCompleted") {
      let rows = [];
      try {
        rows = prepareCompletedBulkTripRows(tripForm.completedBulkRows || [], master.routes, currentUser.username);
      } catch (err) {
        if (err.message === "MISSING_REQUIRED_COMPLETED_BULK_TRIP_ROW") {
          setError("Cac dong co du lieu can du Ngay ke hoach, Khach hang, DV van tai, BKS, Lai xe, Hanh trinh, Diem 1 va Diem 2.");
          return;
        }
        throw err;
      }
      if (!rows.length) {
        setError("Vui long nhap it nhat 1 dong don hoan thanh.");
        return;
      }
      try {
        await api("/api/trips/bulk-completed", {
          method: "POST",
          body: JSON.stringify({ rows }),
        });
        setTripModal(null);
        await loadAll();
      } catch (err) {
        setError(err.message);
      }
      return;
    }
    if (tripModal.mode === "bulk") {
      let rows = [];
      try {
        rows = prepareBulkTripRows(tripForm.bulkRows || [], master.routes, currentUser.username);
      } catch (err) {
        if (err.message === "MISSING_REQUIRED_BULK_TRIP_ROW") {
          setError("Các dòng có dữ liệu cần đủ Khách hàng, Tuyến, Ngày kế hoạch và Giờ kế hoạch.");
          return;
        }
        throw err;
      }
      if (!rows.length) {
        setError("Vui lòng nhập ít nhất 1 dòng đơn vận chuyển.");
        return;
      }
      try {
        await api("/api/trips/bulk", {
          method: "POST",
          body: JSON.stringify({ rows }),
        });
        setTripModal(null);
        await loadAll();
      } catch (err) {
        setError(err.message);
      }
      return;
    }

    const route = master.routes.find((item) => String(item.id) === String(tripForm.routeId));
    const routeByText = master.routes.find((item) => item.routeCode === tripForm.routeText && (!tripForm.customerCode || item.customerCode === tripForm.customerCode));
    const selectedRoute = route || routeByText;
    const hasThirdPoint = !selectedRoute || routeHasThirdPoint(selectedRoute);
    const payload = {
      ...tripForm,
      routeId: selectedRoute?.id || "",
      routeCode: selectedRoute?.routeCode || tripForm.routeText,
      orderType: selectedRoute?.type,
      customerCode: tripForm.customerCode || selectedRoute?.customerCode,
      createdBy: tripForm.createdBy || currentUser.username,
      waybills: cleanWaybillRows(tripForm.waybills || []),
      otherFees: cleanOtherFeeRows(tripForm.otherFees || []),
      point1ArrivalAt: combineDateTime(tripForm.point1ArrivalDate, tripForm.point1ArrivalTime),
      point1DepartAt: combineDateTime(tripForm.point1DepartDate, tripForm.point1DepartTime),
      point2ArrivalAt: combineDateTime(tripForm.point2ArrivalDate, tripForm.point2ArrivalTime),
      point2DepartAt: combineDateTime(tripForm.point2DepartDate, tripForm.point2DepartTime),
      point3ArrivalAt: hasThirdPoint ? combineDateTime(tripForm.point3ArrivalDate, tripForm.point3ArrivalTime) : "",
      point3DepartAt: hasThirdPoint ? combineDateTime(tripForm.point3DepartDate, tripForm.point3DepartTime) : "",
    };
    try {
      if (tripModal.mode === "edit") {
        await api(`/api/trips/${tripForm.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api(tripModal.mode === "bulk" ? "/api/trips/bulk" : "/api/trips", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setTripModal(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTrip(item) {
    if (!can("deleteTransport")) {
      setError("Bạn không có quyền xóa kế hoạch vận chuyển.");
      return false;
    }
    if (!window.confirm(`Xóa đơn ${item.orderCode}?`)) return;
    try {
      await api(`/api/trips/${item.id}`, { method: "DELETE" });
      setTripModal(null);
      await loadAll();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function saveDelivery(event) {
    event.preventDefault();
    if (deliveryForm.id && !can("editTransport") && !can("updateArrival")) {
      setError("Bạn không có quyền sửa hoặc cập nhật xe giao hàng.");
      return;
    }
    if (!deliveryForm.id && !can("createTransport")) {
      setError("Bạn không có quyền tạo xe giao hàng.");
      return;
    }
    const payload = {
      ...deliveryForm,
      createdBy: deliveryForm.createdBy || currentUser.username,
      waybills: cleanWaybillRows(deliveryForm.waybills || []),
      vsipArrivalAt: combineDateTime(deliveryForm.plannedDate, deliveryForm.vsipArrivalTime),
      vsipDepartAt: combineDateTime(deliveryForm.plannedDate, deliveryForm.vsipDepartTime),
    };
    const path = deliveryForm.id ? `/api/customer-deliveries/${deliveryForm.id}` : "/api/customer-deliveries";
    try {
      await api(path, { method: deliveryForm.id ? "PUT" : "POST", body: JSON.stringify(payload) });
      setDeliveryModal(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteDelivery(item) {
    if (!can("deleteTransport")) {
      setError("Bạn không có quyền xóa xe giao hàng.");
      return;
    }
    if (!window.confirm(`Xóa xe giao hàng ${item.customerCode || ""} ${item.plateNumber || ""}?`)) return;
    try {
      await api(`/api/customer-deliveries/${item.id}`, { method: "DELETE" });
      setDeliveryModal(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function openGateModal() {
    setGateForm({ plateNumber: "", driverName: "", driverPhone: "", note: "" });
    setGateModal(true);
  }

  async function saveGateLog(event) {
    event.preventDefault();
    try {
      await api("/api/gate-logs", { method: "POST", body: JSON.stringify({ ...gateForm, createdBy: currentUser.username }) });
      setGateModal(false);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function registerGateCandidate(item) {
    try {
      const registeredAt = item.actualArrivalAt || new Date().toISOString();
      await api("/api/gate-logs", {
        method: "POST",
        body: JSON.stringify({
          source: item.source,
          sourceId: item.sourceId,
          plateNumber: item.plateNumber,
          driverName: item.driverName,
          driverPhone: item.driverPhone,
          registeredAt,
          createdBy: currentUser.username,
          note: `${item.purposeLabel}${item.routeText ? ` - ${item.routeText}` : ""}`,
        }),
      });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function markGateLog(id, action) {
    try {
      await api(`/api/gate-logs/${id}/${action}`, { method: "POST" });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelGateLog(id) {
    try {
      await api(`/api/gate-logs/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadGpsDashboard() {
    try {
      setGpsDashboard(await api("/api/gps/dashboard"));
    } catch (err) {
      setError(err.message);
    }
  }

  async function runGpsDemo() {
    try {
      const data = await api("/api/gps/demo", { method: "POST", body: JSON.stringify({}) });
      setGpsDashboard(data.dashboard);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function openCatalogModal(type, item = null) {
    if (!can("editTransport")) {
      setError("Bạn không có quyền sửa danh mục vận chuyển.");
      return;
    }
    setCatalogModal({ type, item });
    setCatalogForm({
      id: item?.id || "",
      code: item?.code || "",
      name: item?.name || "",
      contact: item?.contact || "",
      phone: item?.phone || "",
      email: item?.email || "",
    });
  }

  async function saveCatalog(event) {
    event.preventDefault();
    const basePath = catalogModal.type === "customers" ? "/api/customers" : "/api/partners";
    const path = catalogForm.id ? `${basePath}/${catalogForm.id}` : basePath;
    try {
      await api(path, { method: catalogForm.id ? "PUT" : "POST", body: JSON.stringify(catalogForm) });
      setCatalogModal(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteCatalog(type, item) {
    if (!window.confirm(`Xóa ${item.code} - ${item.name}?`)) return;
    try {
      await api(`${type === "customers" ? "/api/customers" : "/api/partners"}/${item.id}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function openRouteModal(item = null) {
    if (!can("editTransport")) {
      setError("Bạn không có quyền sửa tuyến đường.");
      return;
    }
    setRouteModal({ item });
    setRouteForm({
      id: item?.id || "",
      customerCode: item?.customerCode || master.customers[0]?.code || "",
      routeCode: item?.routeCode || "",
      from: item?.from || "",
      to: item?.to || "",
      via: item?.via || "",
      km: item?.km || "",
      type: item?.type || "import",
    });
  }

  async function saveRoute(event) {
    event.preventDefault();
    const path = routeForm.id ? `/api/routes/${routeForm.id}` : "/api/routes";
    const payload = {
      ...routeForm,
      routeCode: generatedRouteCode || routeForm.routeCode,
    };
    try {
      await api(path, { method: routeForm.id ? "PUT" : "POST", body: JSON.stringify(payload) });
      setRouteModal(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteRoute(item) {
    if (!window.confirm(`Xóa tuyến ${item.customerCode} - ${item.routeCode}?`)) return;
    try {
      await api(`/api/routes/${item.id}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function openLocationModal(item = null) {
    if (!can("editTransport")) {
      setError("Bạn không có quyền sửa địa điểm.");
      return;
    }
    setLocationModal({ item });
    setLocationForm({
      id: item?.id || "",
      name: item?.name || "",
      address: item?.address || "",
      code: item?.code || "",
      lat: item?.lat ?? "",
      lng: item?.lng ?? "",
      radiusM: item?.radiusM || 500,
    });
  }

  async function saveLocation(event) {
    event.preventDefault();
    const path = locationForm.id ? `/api/locations/${locationForm.id}` : "/api/locations";
    try {
      await api(path, { method: locationForm.id ? "PUT" : "POST", body: JSON.stringify(locationForm) });
      setLocationModal(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteLocation(item) {
    if (!window.confirm(`Xóa mã địa điểm ${item.code} - ${item.name}?`)) return;
    try {
      await api(`/api/locations/${item.id}`, { method: "DELETE" });
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  }

  function changeView(nextView) {
    if (!canView(nextView)) {
      setError("Bạn không có quyền truy cập chức năng này.");
      return;
    }
    if (nextView !== "transport") {
      setFilters((current) => (current.special ? { ...current, special: "" } : current));
    }
    setActiveView(nextView);
  }

  async function saveAccountConfig(nextUsers = accountUsers, nextPermissions = accountPermissions) {
    try {
      const permissionsToSave = normalizePermissions(nextPermissions);
      const saved = await api("/api/account-admin", { method: "PUT", body: JSON.stringify({ users: nextUsers, permissions: permissionsToSave }) });
      setAccountUsers(Array.isArray(saved?.users) ? saved.users : nextUsers);
      setAccountPermissions(normalizePermissions(saved?.permissions || permissionsToSave));
      setAccountMessage("Đã lưu cấu hình tài khoản và phân quyền vào cơ sở dữ liệu.");
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  function resetAccountForm() {
    setAccountForm(defaultAccountForm());
    setAccountMessage("");
  }

  function submitAccount(event) {
    event.preventDefault();
    if (!can("createAccount")) {
      setAccountMessage("Bạn không có quyền tạo hoặc sửa tài khoản.");
      return;
    }
    if (!accountForm.fullName.trim() || !accountForm.username.trim()) {
      setAccountMessage("Vui lòng nhập họ tên và tên đăng nhập.");
      return;
    }
    const cleanUser = {
      id: accountForm.id || Date.now(),
      fullName: accountForm.fullName.trim(),
      username: accountForm.username.trim(),
      password: accountForm.password || accountUsers.find((user) => user.id === accountForm.id)?.password || "123456",
      phone: accountForm.phone.trim(),
      role: accountForm.role,
      status: accountForm.status,
    };
    const nextUsers = accountForm.id
      ? accountUsers.map((user) => (user.id === accountForm.id ? cleanUser : user))
      : [...accountUsers, cleanUser];
    setAccountUsers(nextUsers);
    saveAccountConfig(nextUsers, accountPermissions);
    setAccountForm(defaultAccountForm());
  }

  function editAccount(user) {
    setAccountForm({ ...defaultAccountForm(), ...user, password: "" });
    setAccountMessage(`Đang sửa tài khoản ${user.username}.`);
  }

  function toggleAccountStatus(user) {
    if (!can("createAccount")) {
      setAccountMessage("Bạn không có quyền khóa hoặc mở khóa tài khoản.");
      return;
    }
    const nextStatus = user.status === "locked" ? "active" : "locked";
    const nextUsers = accountUsers.map((item) => (item.id === user.id ? { ...item, status: nextStatus } : item));
    setAccountUsers(nextUsers);
    saveAccountConfig(nextUsers, accountPermissions);
  }

  function resetAccountPassword(user) {
    if (!can("createAccount")) {
      setAccountMessage("Bạn không có quyền reset mật khẩu.");
      return;
    }
    const nextUsers = accountUsers.map((item) => (item.id === user.id ? { ...item, password: "123456" } : item));
    setAccountUsers(nextUsers);
    saveAccountConfig(nextUsers, accountPermissions);
    setAccountMessage(`Đã reset mật khẩu tạm cho ${user.username}: 123456`);
  }

  function togglePermission(permissionKey, roleKey) {
    if (!can("assignPermissions")) {
      setAccountMessage("Bạn không có quyền phân quyền tài khoản.");
      return;
    }
    if (roleKey === "admin") {
      setAccountMessage("Admin mặc định có toàn bộ quyền và không thể chỉnh sửa.");
      return;
    }
    const nextPermissions = {
      ...accountPermissions,
      [permissionKey]: {
        ...accountPermissions[permissionKey],
        [roleKey]: !accountPermissions[permissionKey]?.[roleKey],
        admin: true,
      },
    };
    setAccountPermissions(normalizePermissions(nextPermissions));
    setAccountMessage("Có thay đổi phân quyền, bấm Lưu cấu hình để lưu.");
  }

  function roleLabel(roleKey) {
    return ACCOUNT_ROLES.find((role) => role.key === roleKey)?.label || roleKey;
  }

  async function persistReportTemplates(templates, selectedId) {
    try {
      await api("/api/report-templates", {
        method: "PUT",
        body: JSON.stringify({ templates, selectedId }),
      });
    } catch (err) {
      setError(`Không lưu được template báo cáo vào CSDL: ${err.message}`);
    }
  }

  function updateReportTemplate(updates) {
    setReportSaveMessage("");
    setReportTemplate((current) => normalizeReportTemplate({ ...current, ...updates }));
  }

  function selectReportTemplate(id) {
    const template = reportTemplates.find((item) => item.id === id);
    if (!template) return;
    setSelectedReportTemplateId(id);
    setReportTemplate(normalizeReportTemplate(template));
    setReportPreviewVisible(false);
    setReportSaveMessage("");
    void persistReportTemplates(reportTemplates, id);
  }

  function createReportTemplate() {
    if (!can("createReportTemplate")) {
      setReportSaveMessage("Bạn không có quyền tạo template báo cáo.");
      return;
    }
    const template = normalizeReportTemplate({
      ...defaultReportTemplate(),
      id: `report-template-${Date.now()}`,
      name: "Template mới",
    });
    const templates = [...reportTemplates, template];
    setReportTemplates(templates);
    setSelectedReportTemplateId(template.id);
    setReportTemplate(template);
    setReportPreviewVisible(false);
    setReportSaveMessage("Đã tạo template mới, chỉnh thông tin rồi bấm Lưu Template.");
    void persistReportTemplates(templates, template.id);
  }

  function deleteReportTemplate() {
    if (!can("createReportTemplate")) {
      setReportSaveMessage("Bạn không có quyền xóa template báo cáo.");
      return;
    }
    const currentName = reportTemplate.name || "template này";
    if (!window.confirm(`Xóa template "${currentName}"?`)) return;
    const remaining = reportTemplates.filter((template) => template.id !== selectedReportTemplateId);
    const templates = remaining.length ? remaining : [defaultReportTemplate()];
    const selected = templates[0];
    setReportTemplates(templates);
    setSelectedReportTemplateId(selected.id);
    setReportTemplate(normalizeReportTemplate(selected));
    setReportPreviewVisible(false);
    setReportSaveMessage(`Đã xóa template "${currentName}".`);
    void persistReportTemplates(templates, selected.id);
  }

  function toggleReportFilter(key) {
    setReportSaveMessage("");
    setReportTemplate((current) =>
      normalizeReportTemplate({
        ...current,
        filters: { ...current.filters, [key]: !current.filters[key] },
      }),
    );
  }

  function updateReportFilterValue(key, value) {
    setReportSaveMessage("");
    setReportTemplate((current) =>
      normalizeReportTemplate({
        ...current,
        filterValues: { ...current.filterValues, [key]: value },
      }),
    );
  }

  function toggleReportColumn(key) {
    setReportSaveMessage("");
    setReportTemplate((current) =>
      normalizeReportTemplate({
        ...current,
        columns: { ...current.columns, [key]: !current.columns[key] },
      }),
    );
  }

  function saveReportTemplate() {
    if (!can("createReportTemplate")) {
      setReportSaveMessage("Bạn không có quyền lưu template báo cáo.");
      return;
    }
    const cleanTemplate = normalizeReportTemplate(reportTemplate);
    const templates = reportTemplates.some((template) => template.id === cleanTemplate.id)
      ? reportTemplates.map((template) => (template.id === cleanTemplate.id ? cleanTemplate : template))
      : [...reportTemplates, cleanTemplate];
    setReportTemplates(templates);
    setSelectedReportTemplateId(cleanTemplate.id);
    setReportTemplate(cleanTemplate);
    void persistReportTemplates(templates, cleanTemplate.id);
    setReportSaveMessage(`Đã lưu template "${cleanTemplate.name}".`);
    setError("");
  }

  function exportReportCsv() {
    if (!can("exportExcel")) {
      setError("Bạn không có quyền xuất Excel.");
      return;
    }
    if (!selectedReportColumns.length) {
      setError("Vui lòng chọn ít nhất 1 cột xuất Excel.");
      return;
    }
    const header = selectedReportColumns.map((column) => column.label);
    const rows = reportRows.map((trip) => selectedReportColumns.map((column) => reportFieldValue(trip, column.key)));
    const filenameBase = (reportTemplate.name || "bao-cao-van-chuyen").replace(/[\\/:*?"<>|]+/g, "-").trim() || "bao-cao-van-chuyen";
    downloadCsv(`${filenameBase}.csv`, [header, ...rows]);
  }

  function applyStatementFilters() {
    setStatementAppliedFilters({ ...statementFilters });
    setError("");
  }

  function exportStatementCsv() {
    if (!can("exportExcel")) {
      setError("Bạn không có quyền xuất Excel.");
      return;
    }
    if (!statementAppliedFilters) {
      setError("Vui lòng bấm Lọc trước khi xuất Excel bảng kê.");
      return;
    }
    if (!statementRows.length) {
      setError("Không có dữ liệu bảng kê để xuất Excel.");
      return;
    }
    const from = statementAppliedFilters.fromDate || "tat-ca";
    const to = statementAppliedFilters.toDate || "tat-ca";
    downloadCsv(`bang-ke-${from}-${to}.csv`, statementExportRows(statementRows));
  }

  function exportDriverPayrollCsv() {
    if (!can("exportExcel")) {
      setError("Bạn không có quyền xuất Excel.");
      return;
    }
    if (!filteredPayrollRows.length) {
      setError("Không có dữ liệu bảng lương để xuất Excel.");
      return;
    }
    downloadCsv(`bang-luong-tai-xe-${payrollMonth}.csv`, driverPayrollExportRows(filteredPayrollRows));
  }

  if (!authReady) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <img className="brand-logo login-logo" src="/logo.png" alt="Nam Phong Logistics" />
          </div>
          <div>Dang kiem tra phien dang nhap...</div>
        </div>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={login}>
          <div className="login-brand">
            <img className="brand-logo login-logo" src="/logo.png" alt="Nam Phong Logistics" />
          </div>
          <label className="form-field">Tài khoản
            <input value={loginForm.username} onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })} autoFocus />
          </label>
          <label className="form-field">Mật khẩu
            <input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
          </label>
          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberPassword}
              onChange={(event) => {
                setRememberPassword(event.target.checked);
                if (!event.target.checked) localStorage.removeItem(LOGIN_CREDENTIALS_KEY);
              }}
            />
            <span>Lưu mật khẩu đăng nhập</span>
          </label>
          {loginError ? <div className="login-error">{loginError}</div> : null}
          <button className="btn btn-primary login-submit" type="submit"><LogIn size={14} /> Đăng nhập</button>
        </form>
      </main>
    );
  }

  return (
    <main className="tms-shell">
      <nav className="top-nav">
        <div className="nav-brand">
          <img className="brand-logo nav-logo" src="/logo.png" alt="Nam Phong Logistics" />
          <span className="brand-text">Nam Phong<span> Logistics</span></span>
        </div>
        <div className="nav-sep" />
        {canView("transport") ? <button className={`nav-item ${activeView === "transport" ? "active" : ""}`} type="button" onClick={() => changeView("transport")}>
          <Truck size={15} /> Vận chuyển
        </button> : null}
        {canView("alerts") ? <button className={`nav-item ${activeView === "alerts" ? "active" : ""}`} type="button" onClick={() => changeView("alerts")}>
          <Bell size={15} /> Canh bao
        </button> : null}
        {canView("reconciliation") ? <button className={`nav-item ${activeView === "reconciliation" ? "active" : ""}`} type="button" onClick={() => changeView("reconciliation")}>
          <BarChart3 size={15} /> Doi soat
        </button> : null}
        {canView("schedule") ? <button className={`nav-item ${activeView === "schedule" ? "active" : ""}`} type="button" onClick={() => changeView("schedule")}>
          <Truck size={15} /> Lich xe
        </button> : null}
        {canView("vehicles") ? <button className={`nav-item ${activeView === "vehicles" ? "active" : ""}`} type="button" onClick={() => changeView("vehicles")}>
          <Truck size={15} /> Quản lý xe
        </button> : null}
        {canView("drivers") ? <button className={`nav-item ${activeView === "drivers" ? "active" : ""}`} type="button" onClick={() => changeView("drivers")}>
          <UserRound size={15} /> Lái xe
        </button> : null}
        {canView("rates") ? <button className={`nav-item ${activeView === "rates" ? "active" : ""}`} type="button" onClick={() => changeView("rates")}>
          <BarChart3 size={15} /> Bảng giá
        </button> : null}
        {canView("fuel") ? <button className={`nav-item ${activeView === "fuel" ? "active" : ""}`} type="button" onClick={() => changeView("fuel")}>
          <BarChart3 size={15} /> Dầu
        </button> : null}
        {canView("salary") ? <button className={`nav-item ${activeView === "salary" ? "active" : ""}`} type="button" onClick={() => changeView("salary")}>
          <BarChart3 size={15} /> Lương
        </button> : null}
        {canView("gps") ? <button className={`nav-item ${activeView === "gps" ? "active" : ""}`} type="button" onClick={() => changeView("gps")}>
          <MapPinned size={15} /> Bản đồ GPS
        </button> : null}
        {canView("customersPartners") ? <button className={`nav-item ${activeView === "customersPartners" ? "active" : ""}`} type="button" onClick={() => changeView("customersPartners")}>
          <Building2 size={15} /> KH & DT
        </button> : null}
        {canView("routes") ? <button className={`nav-item ${activeView === "routes" ? "active" : ""}`} type="button" onClick={() => changeView("routes")}>
          <MapPinned size={15} /> Tuyến đường
        </button> : null}
        {canView("statement") ? <button className={`nav-item ${activeView === "statement" ? "active" : ""}`} type="button" onClick={() => changeView("statement")}>
          <BarChart3 size={15} /> Bảng kê
        </button> : null}
        {canView("reports") ? <button className={`nav-item ${activeView === "reports" ? "active" : ""}`} type="button" onClick={() => changeView("reports")}>
          <BarChart3 size={15} /> Báo cáo
        </button> : null}
        {canView("accounts") ? <button className={`nav-item ${activeView === "accounts" ? "active" : ""}`} type="button" onClick={() => changeView("accounts")}>
          <UserRound size={15} /> Tài khoản
        </button> : null}
        <div className="nav-right">
          <button className="nav-user" type="button" onClick={logout}>
            <span className="nav-avatar">{currentUser.label.slice(0, 2).toUpperCase()}</span>
            <span>{currentUser.label}</span>
            <LogOut size={14} />
          </button>
        </div>
      </nav>

      {activeView === "alerts" ? (
        <section className="toolbar alert-toolbar">
          <span className="toolbar-title">Dieu phoi hom nay</span>
          <div className="toolbar-sep" />
          <span>Canh bao <strong>{dispatchSummary.totalAlerts}</strong> muc can xu ly</span>
          <div className="toolbar-right">
            <span>{formatDateOnly(now)} • Dang chay <strong>{dispatchSummary.activeTrips}</strong> • Hoan thanh <strong>{dispatchSummary.completedTrips}</strong></span>
          </div>
        </section>
      ) : null}

      {activeView === "reconciliation" ? (
        <section className="toolbar finance-toolbar">
          <span className="toolbar-title">Doi soat tai chinh chuyen</span>
          <div className="toolbar-sep" />
          <select className="filter-select" value={reconciliationFilters.status} onChange={(event) => setReconciliationFilters({ ...reconciliationFilters, status: event.target.value })}>
            <option value="">Tat ca trang thai</option>
            <option value="ready_to_statement">San sang bang ke</option>
            <option value="missing_rate">Thieu bang gia</option>
            <option value="missing_data">Thieu du lieu</option>
            <option value="loss_risk">Rui ro lo</option>
          </select>
          <select className="filter-select" value={reconciliationFilters.customerCode} onChange={(event) => setReconciliationFilters({ ...reconciliationFilters, customerCode: event.target.value })}>
            <option value="">Tat ca khach</option>
            {master.customers.map((customer) => <option value={customer.code} key={customer.code}>{customer.code} - {customer.name}</option>)}
          </select>
          <div className="toolbar-right">
            <span>San sang <strong>{financialReadinessModel.summary.readyToStatement}</strong> / <strong>{financialReadinessModel.summary.totalCompleted}</strong> chuyen</span>
          </div>
        </section>
      ) : null}

      {activeView === "schedule" ? (
        <section className="toolbar schedule-toolbar">
          <span className="toolbar-title">Lich dieu xe theo ngay</span>
          <div className="toolbar-sep" />
          <label className="month-filter-field">Ngay<input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></label>
          <div className="schedule-mode-toggle">
            <button className={`btn ${scheduleMode === "vehicle" ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => setScheduleMode("vehicle")}>Theo xe</button>
            <button className={`btn ${scheduleMode === "driver" ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => setScheduleMode("driver")}>Theo tai xe</button>
          </div>
          <label className="search-field"><Search size={14} /><input value={scheduleSearch} onChange={(event) => setScheduleSearch(event.target.value)} placeholder="Tim xe, tai xe, khach, tuyen..." /></label>
          <div className="toolbar-right">
            <span><strong>{dailyScheduleModel.summary.tripCount}</strong> chuyen • <strong>{dailyScheduleModel.conflicts.length}</strong> canh bao</span>
          </div>
        </section>
      ) : null}

      {activeView === "transport" ? (
        <section className="toolbar">
          <span className="toolbar-title">Quản lý vận chuyển</span>
          <div className="toolbar-sep" />
          {can("createTransport") ? <button className="btn btn-primary" type="button" onClick={() => openTripModal("single")}><Plus size={14} /> Thêm đơn</button> : null}
          {can("createTransport") ? <button className="btn btn-secondary" type="button" onClick={() => openTripModal("bulk")}><PackagePlus size={14} /> Thêm nhiều đơn</button> : null}
          {can("createTransport") ? <button className="btn btn-secondary" type="button" onClick={() => openTripModal("bulkCompleted")}><PackagePlus size={14} /> Thêm nhiều đơn hoàn thành</button> : null}
          <label className="search-field"><Search size={14} /><input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Tìm mã đơn, BKS, lái xe..." /></label>
          <select className="filter-select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">Tất cả trạng thái</option>
            {master.statuses.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}
          </select>
          <select className="filter-select" value={filters.customer} onChange={(event) => setFilters({ ...filters, customer: event.target.value })}>
            <option value="">Tất cả khách</option>
            {master.customers.map((customer) => <option value={customer.code} key={customer.code}>{customer.code} - {customer.name}</option>)}
          </select>
          <select className="filter-select" value={filters.createdBy} onChange={(event) => setFilters({ ...filters, createdBy: event.target.value })}>
            <option value="">Tất cả người nhập</option>
            {accountUsers
              .filter((user) => user.status !== "locked")
              .map((user) => <option value={user.username} key={user.id || user.username}>{user.fullName || user.username}</option>)}
          </select>
          <div className="toolbar-right">
            <span>Hiển thị <strong>1-{trips.length || 0}</strong> / <strong>{master.routes.length}</strong> tuyến</span>
          </div>
        </section>
      ) : null}

      {activeView === "vehicles" ? (
        <section className="toolbar vehicle-toolbar">
          <span className="toolbar-title">Quản lý xe</span>
          <div className="toolbar-right vehicle-toolbar-actions">
            <input
              className="vehicle-search-input"
              value={vehicleSearch}
              onChange={(event) => setVehicleSearch(event.target.value)}
              placeholder="Tìm kiếm..."
            />
            <button className="btn btn-primary" type="button" onClick={() => openVehicleModal()}>Thêm mới</button>
          </div>
        </section>
      ) : null}

      {activeView === "drivers" ? (
        <section className="toolbar vehicle-toolbar">
          <span className="toolbar-title">Quản lý Tài xế</span>
          <div className="toolbar-right vehicle-toolbar-actions">
            <input
              className="vehicle-search-input"
              value={driverSearch}
              onChange={(event) => setDriverSearch(event.target.value)}
              placeholder="Tìm kiếm..."
            />
            <button className="btn btn-primary" type="button" onClick={() => openDriverModal("create")}>Thêm mới</button>
          </div>
        </section>
      ) : null}

      {activeView === "rates" ? (
        <section className="toolbar vehicle-toolbar">
          <span className="toolbar-title">Quản lý Bảng giá</span>
          <div className="salary-tabs rate-tabs">
            <button className={`salary-tab ${rateTab === "transportRates" ? "active" : ""}`} type="button" onClick={() => setRateTab("transportRates")}>Bảng giá vận tải</button>
            <button className={`salary-tab ${rateTab === "fuelSurcharges" ? "active" : ""}`} type="button" onClick={() => setRateTab("fuelSurcharges")}>PP xăng dầu</button>
          </div>
          <div className="toolbar-right vehicle-toolbar-actions">
            {rateTab === "transportRates" ? (
              <input
                className="vehicle-search-input"
                value={transportRateSearch}
                onChange={(event) => setTransportRateSearch(event.target.value)}
                placeholder="Tìm kiếm..."
              />
            ) : null}
            <button className="btn btn-primary" type="button" onClick={() => (rateTab === "transportRates" ? openTransportRateModal() : openFuelSurchargeModal())}>Thêm mới</button>
          </div>
        </section>
      ) : null}

      {["fuel", "salary"].includes(activeView) ? (
        <section className="toolbar">
          <span className="toolbar-title">
            {activeView === "fuel" ? "Quản lý dầu" : "Lương tài xế"}
          </span>
          <div className="toolbar-sep" />
          {activeView === "fuel" ? (
            <button className="btn btn-primary" type="button" onClick={() => openFuelModal()}><Plus size={14} /> Thêm mới</button>
          ) : (
            <button className={`btn ${salaryTab === "payroll" ? "btn-primary" : "btn-secondary"}`} type="button" onClick={() => setSalaryTab("payroll")}>
              <BarChart3 size={14} /> Bảng lương
            </button>
          )}
          {activeView === "fuel" ? <button className="btn btn-outline" type="button">Xuất Excel</button> : null}
          {activeView === "fuel" ? (
            <>
              <select className="filter-select" value={fuelPlateFilter} onChange={(event) => setFuelPlateFilter(event.target.value)}>
                <option value="">Tất cả xe</option>
                {fuelPlateOptions.map((plate) => <option value={plate} key={plate}>{plate}</option>)}
              </select>
              <select className="filter-select" value={fuelDriverFilter} onChange={(event) => setFuelDriverFilter(event.target.value)}>
                <option value="">Tất cả lái xe</option>
                {fuelDriverOptions.map((driver) => <option value={driver} key={driver}>{driver}</option>)}
              </select>
              {fuelPlateFilter || fuelDriverFilter ? (
                <button className="btn btn-outline" type="button" onClick={() => { setFuelPlateFilter(""); setFuelDriverFilter(""); }}>Xóa lọc</button>
              ) : null}
            </>
          ) : null}
          <div className="toolbar-right">
            {activeView === "fuel" ? <span>Tổng dầu <strong>{formatFuelNumber(fuelTotals.liters)}</strong> lít • Chi phí <strong>{money.format(fuelTotals.amount)}</strong> • Âm/dương <strong>{formatSignedFuelNumber(fuelTotals.delta)}</strong> lít</span> : null}
            {activeView === "salary" && salaryTab === "attendance" ? <span>Nghỉ tháng này <strong>{driverAttendanceRows.length}</strong> dòng • Tính <strong>{driverAttendanceTotals.leaveDays}</strong> ngày nghỉ</span> : null}
            {activeView === "salary" && salaryTab === "advances" ? <span>Ứng lương tháng <strong>{monthlySalaryAdvances.length}</strong> dòng • Tổng <strong>{formatPayrollMoney(salaryAdvanceSummaryTotal)}</strong></span> : null}
            {activeView === "salary" && salaryTab === "fuelPrices" ? <span>Giá dầu tiêu chuẩn <strong>{filteredStandardFuelPrices.length}</strong> tháng</span> : null}
            {activeView === "salary" && ["payroll", "config"].includes(salaryTab) ? <span>Tổng <strong>{filteredPayrollRows.length}</strong> tài xế • Thực lĩnh <strong>{formatPayrollMoney(payrollTotals.netSalary)}</strong></span> : null}
          </div>
        </section>
      ) : null}

      {["customersPartners", "routes"].includes(activeView) ? (
        <section className="toolbar">
          <span className="toolbar-title">
            {activeView === "customersPartners" ? "KH & DT" : "Quản lý tuyến đường theo khách hàng"}
          </span>
          <div className="toolbar-sep" />
          {activeView === "routes" && can("editTransport") ? (
            <>
              <button className="btn btn-primary" type="button" onClick={() => openRouteModal()}>
                <Plus size={14} /> Thêm tuyến
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => openLocationModal()}>
                <Plus size={14} /> Thêm địa điểm
              </button>
            </>
          ) : can("editTransport") ? (
            <>
              <button className="btn btn-primary" type="button" onClick={() => openCatalogModal("customers")}>
                <Plus size={14} /> Thêm khách hàng
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {activeView === "statement" ? (
        <section className="toolbar">
          <span className="toolbar-title">Bảng kê</span>
          <div className="toolbar-sep" />
          <select className="filter-select" value={statementFilters.customerCode} onChange={(event) => setStatementFilters({ ...statementFilters, customerCode: event.target.value })}>
            <option value="">Tất cả khách hàng</option>
            {master.customers.map((customer) => <option value={customer.code} key={customer.code}>{customer.code} - {customer.name}</option>)}
          </select>
          <label className="month-filter-field">Từ ngày<input type="date" value={statementFilters.fromDate} onChange={(event) => setStatementFilters({ ...statementFilters, fromDate: event.target.value })} /></label>
          <label className="month-filter-field">Đến ngày<input type="date" value={statementFilters.toDate} onChange={(event) => setStatementFilters({ ...statementFilters, toDate: event.target.value })} /></label>
          <button className="btn btn-primary" type="button" onClick={applyStatementFilters}>Lọc</button>
          {can("exportExcel") ? (
            <button className="btn btn-secondary" type="button" onClick={exportStatementCsv} disabled={!statementAppliedFilters || !statementRows.length}>Xuất Excel</button>
          ) : null}
          <div className="toolbar-right">
            {statementAppliedFilters ? (
              <span><strong>{statementRows.length}</strong> dòng • Tổng tiền <strong>{money.format(statementTotalAmount)}</strong></span>
            ) : (
              <span>Chọn điều kiện rồi bấm <strong>Lọc</strong></span>
            )}
          </div>
        </section>
      ) : null}

      {error ? <div className="app-alert"><Bell size={14} /> {error}</div> : null}

      {activeView === "alerts" ? (
        <section className="dispatch-alert-page">
          <div className="dispatch-alert-hero">
            <div>
              <span className="dispatch-alert-eyebrow">Trung tam dieu phoi</span>
              <h1>Dieu phoi hom nay</h1>
            </div>
            <div className="dispatch-alert-hero-stats">
              <div><span>Canh bao</span><strong>{dispatchSummary.totalAlerts}</strong></div>
              <div><span>Dang chay</span><strong>{dispatchSummary.activeTrips}</strong></div>
              <div><span>Hoan thanh</span><strong>{dispatchSummary.completedTrips}</strong></div>
            </div>
          </div>

          <div className="dispatch-alert-metrics">
            <div className="dispatch-alert-metric danger"><span>Tre gio</span><strong>{dispatchSummary.lateArrival}</strong></div>
            <div className="dispatch-alert-metric"><span>Thieu xe/tai xe</span><strong>{dispatchSummary.missingAssignment}</strong></div>
            <div className="dispatch-alert-metric"><span>Cho qua lau</span><strong>{dispatchSummary.longWaiting}</strong></div>
            <div className="dispatch-alert-metric"><span>GPS bat thuong</span><strong>{dispatchSummary.gpsStale}</strong></div>
            <div className="dispatch-alert-metric"><span>Cong/yard</span><strong>{dispatchSummary.gateWaiting}</strong></div>
          </div>

          <section className="dispatch-alert-section">
            <div className="dispatch-alert-section-head">
              <h2>Canh bao uu tien</h2>
              <span>{dispatchSummary.criticalAlerts} nghiem trong • {dispatchSummary.highAlerts} cao</span>
            </div>
            <div className="dispatch-alert-list">
              {dispatchAlertModel.alerts.slice(0, 30).map((alert) => (
                <article className={`dispatch-alert-card ${alert.severity}`} key={alert.id}>
                  <div className="dispatch-alert-card-main">
                    <div className="dispatch-alert-card-title">
                      <span className={`dispatch-alert-severity ${alert.severity}`}>{alert.severity}</span>
                      <strong>{alert.orderCode || alert.plateNumber || alert.title}</strong>
                    </div>
                    <div className="dispatch-alert-card-message">{alert.title} • {alert.message}</div>
                    <div className="dispatch-alert-card-meta">
                      <span>{alert.customerCode || "Khong ro khach"}</span>
                      <span>{alert.routeCode || "Khong ro tuyen"}</span>
                      <span>{alert.plateNumber || "Chua co BKS"}</span>
                      <span>{alert.driverName || "Chua co lai xe"}</span>
                    </div>
                  </div>
                  {alert.tripId ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => {
                        const targetTrip = allTrips.find((trip) => Number(trip.id) === Number(alert.tripId));
                        if (targetTrip) openTripModal("edit", targetTrip);
                      }}
                    >
                      Xem chuyen
                    </button>
                  ) : null}
                </article>
              ))}
              {!dispatchAlertModel.alerts.length ? <div className="dispatch-alert-empty">Khong co canh bao uu tien.</div> : null}
            </div>
          </section>

          <section className="dispatch-alert-section">
            <div className="dispatch-alert-section-head">
              <h2>Chuyen dang van hanh</h2>
              <span>{dispatchAlertModel.activeTripRows.length} chuyen dang mo</span>
            </div>
            <div className="dispatch-active-table-wrap">
              <table className="dispatch-active-table">
                <thead>
                  <tr>
                    <th>Ma chuyen</th>
                    <th>Khach</th>
                    <th>Tuyen</th>
                    <th>BKS</th>
                    <th>Lai xe</th>
                    <th>Trang thai</th>
                    <th>Gio yeu cau</th>
                    <th>Canh bao</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatchAlertModel.activeTripRows.slice(0, 80).map((trip) => (
                    <tr key={trip.id}>
                      <td><button className="link-button" type="button" onClick={() => openTripModal("edit", trip)}>{trip.orderCode}</button></td>
                      <td>{trip.customerCode}</td>
                      <td>{trip.routeCode}</td>
                      <td>{trip.plateNumber || "-"}</td>
                      <td>{trip.driverName || "-"}</td>
                      <td><span className={`status-pill ${statusClass[trip.status] || ""}`}>{trip.statusLabel || trip.status}</span></td>
                      <td>{formatDateTime(trip.requiredArrivalAt)}</td>
                      <td><span className={`dispatch-warning-pill ${trip.highestSeverity}`}>{trip.warningCount}</span></td>
                    </tr>
                  ))}
                  {!dispatchAlertModel.activeTripRows.length ? <tr><td colSpan="8" className="empty-row">Khong co chuyen dang van hanh.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}

      {activeView === "reconciliation" ? (
        <section className="finance-page">
          <div className="finance-metrics">
            <div><span>Hoan thanh</span><strong>{financialReadinessModel.summary.totalCompleted}</strong></div>
            <div><span>San sang bang ke</span><strong>{financialReadinessModel.summary.readyToStatement}</strong></div>
            <div><span>Thieu bang gia</span><strong>{financialReadinessModel.summary.missingRate}</strong></div>
            <div><span>Thieu du lieu</span><strong>{financialReadinessModel.summary.missingData}</strong></div>
            <div><span>Rui ro lo</span><strong>{financialReadinessModel.summary.lossRisk}</strong></div>
            <div><span>Chenh lech</span><strong>{money.format(financialReadinessModel.summary.variance)}</strong></div>
          </div>
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Ma chuyen</th>
                  <th>Khach</th>
                  <th>Tuyen</th>
                  <th>Xe / tai xe</th>
                  <th>Doanh thu</th>
                  <th>Chi phi du kien</th>
                  <th>Chenh lech</th>
                  <th>Trang thai</th>
                  <th>Van de</th>
                </tr>
              </thead>
              <tbody>
                {financialReadinessModel.rows.map((row) => (
                  <tr key={row.tripId}>
                    <td><button className="link-button" type="button" onClick={() => openTripModal("edit", row.trip)}>{row.orderCode}</button></td>
                    <td>{row.customerCode}</td>
                    <td>{row.routeCode}</td>
                    <td><strong>{row.plateNumber || "-"}</strong><span>{row.driverName || "-"}</span></td>
                    <td>{money.format(row.totalRevenue)}</td>
                    <td>{money.format(row.expectedCost)}</td>
                    <td className={row.variance < 0 ? "finance-negative" : "finance-positive"}>{money.format(row.variance)}</td>
                    <td><span className={`finance-status ${row.status}`}>{row.statusLabel}</span></td>
                    <td>{row.issues.length ? row.issues.join(", ") : "-"}</td>
                  </tr>
                ))}
                {!financialReadinessModel.rows.length ? <tr><td colSpan="9" className="empty-row">Khong co chuyen phu hop bo loc.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeView === "schedule" ? (
        <section className="schedule-page">
          <div className="schedule-metrics">
            <div><span>Tong chuyen</span><strong>{dailyScheduleModel.summary.tripCount}</strong></div>
            <div><span>Da gan</span><strong>{dailyScheduleModel.summary.assignedTrips}</strong></div>
            <div><span>Thieu gan</span><strong>{dailyScheduleModel.summary.missingAssignment}</strong></div>
            <div><span>Trung xe</span><strong>{dailyScheduleModel.summary.vehicleOverlap}</strong></div>
            <div><span>Trung tai xe</span><strong>{dailyScheduleModel.summary.driverOverlap}</strong></div>
            <div><span>Quay dau ngan</span><strong>{dailyScheduleModel.summary.shortTurnaround}</strong></div>
          </div>
          <section className="schedule-conflicts">
            <div className="schedule-section-title">Canh bao lich</div>
            <div className="schedule-conflict-list">
              {dailyScheduleModel.conflicts.slice(0, 20).map((conflict) => (
                <div className={`schedule-conflict ${conflict.severity}`} key={conflict.id}>
                  <strong>{conflict.type}</strong>
                  <span>{conflict.message}</span>
                  <span>{conflict.tripIds.map((tripId) => {
                    const row = dailyScheduleModel.trips.find((item) => Number(item.tripId) === Number(tripId));
                    return row?.orderCode || tripId;
                  }).join(" / ")}</span>
                </div>
              ))}
              {!dailyScheduleModel.conflicts.length ? <div className="schedule-empty">Khong co xung dot lich.</div> : null}
            </div>
          </section>
          <section className="schedule-groups">
            {scheduleGroups.map((group) => (
              <article className="schedule-group" key={group.key}>
                <div className="schedule-group-head">
                  <strong>{group.label}</strong>
                  <span>{group.trips.length} chuyen</span>
                </div>
                <div className="schedule-trip-list">
                  {group.trips.map((row) => (
                    <button className="schedule-trip-row" type="button" key={`${group.key}-${row.tripId}`} onClick={() => openTripModal("edit", row.trip)}>
                      <span className="schedule-trip-time">{formatDateTime(row.startAt)} - {formatDateTime(row.endAt)}</span>
                      <strong>{row.orderCode}</strong>
                      <span>{row.customerCode} • {row.routeCode}</span>
                      <span>{row.plateNumber || "Chua gan xe"} • {row.driverName || "Chua gan tai xe"}</span>
                      <span className={`schedule-warning-count ${row.conflicts.length ? "has-warning" : ""}`}>{row.conflicts.length}</span>
                    </button>
                  ))}
                </div>
              </article>
            ))}
            {!scheduleGroups.length ? <div className="schedule-empty">Khong co chuyen trong ngay da chon.</div> : null}
          </section>
        </section>
      ) : null}

      {activeView === "transport" ? (
        <section className="table-container">
          <table className="transport-table">
            <thead>
              <tr>
                <th className="col-status">Trạng thái</th>
                <th className="col-cust">Khách hàng</th>
                <th className="col-route">Tuyến đường</th>
                <th className="col-weight">Tải trọng xe</th>
                <th className="col-plan">Ngày giờ KH</th>
                <th className="col-team">ĐV vận tải</th>
                <th className="col-plate">Biển số xe</th>
                <th className="col-driver">Lái xe</th>
                <th className="col-point">Điểm 1</th>
                <th className="col-point">Điểm 2</th>
                <th className="col-point">Điểm 3</th>
                <th className="col-pieces">Số kiện</th>
                <th className="col-gross">Trọng lượng</th>
                <th className="col-fee">Bốc xếp</th>
                <th className="col-fee">Vé kho</th>
                <th className="col-fee">Vé cao tốc</th>
                <th className="col-fee">Lưu đêm lái xe</th>
                <th className="col-fee">Phí khác</th>
                <th className="col-note">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => {
                  const tripRoute = routeForTrip(trip);
                  const hasThirdPoint = routeHasThirdPoint(tripRoute);
                  return (
                    <tr key={trip.id}>
                      <td className="col-status">
                        {can("editTransport") || can("updateArrival") ? (
                          <button className={`status-button badge ${statusClass[trip.status] || "s-plan"}`} type="button" onClick={() => openTripModal("edit", trip)}>
                            {trip.statusLabel}
                          </button>
                        ) : (
                          <span className={`status-button badge ${statusClass[trip.status] || "s-plan"}`}>{trip.statusLabel}</span>
                        )}
                      </td>
                      <td className="col-cust">{trip.customerCode}</td>
                      <td className="col-route"><RouteTypeCell routeCode={trip.routeCode} /></td>
                      <td className="col-weight"><VehicleWeightCell vehicleType={trip.vehicleType} cargoWeight={trip.cargoWeight} /></td>
                      <td className="col-plan">{formatPlan(trip.requiredArrivalAt)}</td>
                      <td className="col-team" title={trip.partnerName}>{trip.partnerCode}</td>
                      <td className="col-plate">{trip.plateNumber || <span className="muted">Chưa có</span>}</td>
                      <td className="col-driver"><DriverCell name={trip.driverName} phone={trip.driverPhone} /></td>
                      <td className="col-point"><PointCell arrival={trip.point1ArrivalAt} depart={trip.point1DepartAt} /></td>
                      <td className="col-point"><PointCell arrival={trip.point2ArrivalAt} depart={trip.point2DepartAt} /></td>
                      <td className="col-point">{hasThirdPoint ? <PointCell arrival={trip.point3ArrivalAt} depart={trip.point3DepartAt} /> : null}</td>
                      <td className="col-pieces"><StackCell rows={waybillRowsFromTrip(trip)} field="packageCount" /></td>
                      <td className="col-gross"><StackCell rows={waybillRowsFromTrip(trip)} field="grossWeight" /></td>
                      <td className="col-fee"><MoneyCell amount={trip.handlingFeeAmount} /></td>
                      <td className="col-fee"><MoneyCell amount={otherFeeAmountByKind(trip, "warehouse")} /></td>
                      <td className="col-fee"><MoneyCell amount={otherFeeAmountByKind(trip, "highway")} /></td>
                      <td className="col-fee"><MoneyCell amount={otherFeeAmountByKind(trip, "overnight")} /></td>
                      <td className="col-fee"><MoneyCell amount={otherFeeAmountByKind(trip, "other")} /></td>
                      <td className="col-note">{trip.note || ""}</td>
                    </tr>
                  );
                })}
              {!loading && trips.length === 0 ? <tr><td colSpan="19" className="empty-row">Không có chuyến nào khớp bộ lọc.</td></tr> : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {activeView === "statement" ? (
        <section className="table-container statement-table-container">
          <table className="transport-table statement-table">
            <colgroup>
              <col className="statement-col-stt" />
              <col className="statement-col-date" />
              <col className="statement-col-plate" />
              <col className="statement-col-driver" />
              <col className="statement-col-weight" />
              <col className="statement-col-route" />
              <col className="statement-col-datetime" />
              <col className="statement-col-datetime" />
              <col className="statement-col-datetime" />
              <col className="statement-col-datetime" />
              <col className="statement-col-count" />
              <col className="statement-col-count" />
              <col className="statement-col-money" />
              <col className="statement-col-money" />
              <col className="statement-col-money" />
              <col className="statement-col-money" />
              <col className="statement-col-money" />
              <col className="statement-col-money" />
              <col className="statement-col-money" />
              <col className="statement-col-money" />
              <col className="statement-col-note" />
            </colgroup>
            <thead>
              {statementRows.length ? (
                <tr className="statement-total-row">
                  <th colSpan="12">Tổng</th>
                  <th className="numeric-cell"><strong>{formatStatementMoney(statementTotals.freightRate)}</strong></th>
                  <th className="numeric-cell"><strong>{formatStatementMoney(statementTotals.fuelSurchargeFee)}</strong></th>
                  <th className="numeric-cell"><strong>{formatStatementMoney(statementTotals.parkingFee)}</strong></th>
                  <th className="numeric-cell"><strong>{formatStatementMoney(statementTotals.waitingFee)}</strong></th>
                  <th className="numeric-cell"><strong>{formatStatementMoney(statementTotals.handlingFee)}</strong></th>
                  <th className="numeric-cell"><strong>{formatStatementMoney(statementTotals.warehouseTicketFee)}</strong></th>
                  <th className="numeric-cell"><strong>{formatStatementMoney(statementTotals.otherFee)}</strong></th>
                  <th className="numeric-cell"><strong>{formatStatementMoney(statementTotals.totalAmount)}</strong></th>
                  <th />
                </tr>
              ) : null}
              <tr>
                <th>STT</th>
                <th>Ngày</th>
                <th>Biển kiểm soát</th>
                <th>Lái xe</th>
                <th>Tải trọng</th>
                <th>Tuyến đường</th>
                <th>Đến điểm 1</th>
                <th>Rời điểm 1</th>
                <th>Đến điểm 2</th>
                <th>Rời điểm 2</th>
                <th>Lưu đêm</th>
                <th>Số giờ chờ</th>
                <th>Giá cước</th>
                <th>Phụ phí xăng dầu</th>
                <th>Phí lưu xe</th>
                <th>Phí chờ giờ</th>
                <th>Phí bốc xếp</th>
                <th>Vé kho</th>
                <th>Phí khác</th>
                <th>Tổng tiền</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {statementRows.map((row) => (
                <tr key={row.id || row.index}>
                  <td>{row.index}</td>
                  <td>{row.date}</td>
                  <td>{row.plateNumber}</td>
                  <td>{row.driverName}</td>
                  <td>{row.cargoWeight}</td>
                  <td>{row.routeCode}</td>
                  <td>{row.point1ArrivalAt}</td>
                  <td>{row.point1DepartAt}</td>
                  <td>{row.point2ArrivalAt}</td>
                  <td>{row.point2DepartAt}</td>
                  <td className="numeric-cell">{formatStatementNumber(row.overnightCount)}</td>
                  <td className="numeric-cell">{formatStatementNumber(row.waitingHours)}</td>
                  <td className="numeric-cell">{formatStatementMoney(row.freightRate)}</td>
                  <td className="numeric-cell">{formatStatementMoney(row.fuelSurchargeFee)}</td>
                  <td className="numeric-cell">{formatStatementMoney(row.parkingFee)}</td>
                  <td className="numeric-cell">{formatStatementMoney(row.waitingFee)}</td>
                  <td className="numeric-cell">{formatStatementMoney(row.handlingFee)}</td>
                  <td className="numeric-cell">{formatStatementMoney(row.warehouseTicketFee)}</td>
                  <td className="numeric-cell">{formatStatementMoney(row.otherFee)}</td>
                  <td className="numeric-cell"><strong>{formatStatementMoney(row.totalAmount)}</strong></td>
                  <td>{row.note}</td>
                </tr>
              ))}
              {!statementAppliedFilters ? (
                <tr><td colSpan="21" className="empty-row">Chọn điều kiện và bấm Lọc để xem bảng kê.</td></tr>
              ) : !statementRows.length ? (
                <tr><td colSpan="21" className="empty-row">Không có dữ liệu phù hợp bộ lọc.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {activeView === "vehicles" ? (
        <section className="table-container vehicle-table-container">
          <table className="vehicle-management-table">
            <thead>
              <tr>
                <th>Biển kiểm soát</th>
                <th>Tải trọng</th>
                <th>Dài</th>
                <th>Rộng</th>
                <th>Cao</th>
                <th>Số cửa</th>
                <th>SĐKX</th>
                <th>Định mức dầu (lít/100km)</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredNpVehicles.map((item) => (
                <tr key={item.id}>
                  <td>{item.plateNumber}</td>
                  <td>{item.loadCapacity || item.type}</td>
                  <td>{item.length}</td>
                  <td>{item.width}</td>
                  <td>{item.height}</td>
                  <td>{item.doorCount}</td>
                  <td>{item.registrationNumber}</td>
                  <td>{item.fuelNorm}</td>
                  <td>
                    <div className="vehicle-row-actions">
                      <button className="vehicle-edit-btn" type="button" onClick={() => openVehicleModal(item)}>Sửa</button>
                      <button className="vehicle-delete-btn" type="button" onClick={() => deleteVehicle(item)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredNpVehicles.length ? <tr><td colSpan="9" className="empty-row">Không có xe nào khớp tìm kiếm.</td></tr> : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {activeView === "drivers" ? (
        <section className="table-container vehicle-table-container">
          <table className="driver-management-table">
            <thead>
              <tr>
                <th>Họ và tên</th>
                <th>Mã nhân viên</th>
                <th>Chức vụ</th>
                <th>Loại bằng</th>
                <th>Ngày sinh</th>
                <th>Số CCCD</th>
                <th>Số điện thoại</th>
                <th>Địa chỉ</th>
                <th>Ngày bắt đầu HĐ</th>
                <th>Ngày kết thúc HĐ</th>
                <th>Giảm trừ gia cảnh</th>
                <th>Số TK ngân hàng</th>
                <th>Ngân hàng</th>
                <th>Hồ sơ xin việc</th>
                <th>HĐ bản cứng</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredNpDrivers.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.employeeCode}</td>
                  <td>{item.position}</td>
                  <td>{item.licenseType || item.license}</td>
                  <td>{item.dateOfBirth}</td>
                  <td>{item.identityNumber}</td>
                  <td>{item.phone}</td>
                  <td>{item.address}</td>
                  <td>{item.contractStart}</td>
                  <td>{item.contractEnd}</td>
                  <td className="numeric-cell">{item.familyDeduction}</td>
                  <td>{item.bankAccount}</td>
                  <td>{item.bankName}</td>
                  <td>{driverDocumentStatusLabel(item.applicationFileOnHand)}</td>
                  <td>{driverDocumentStatusLabel(item.hardCopyContractOnHand)}</td>
                  <td>
                    <div className="vehicle-row-actions">
                      <button className="vehicle-detail-btn" type="button" onClick={() => openDriverModal("detail", item)}>Chi tiết</button>
                      <button className="vehicle-edit-btn" type="button" onClick={() => openDriverModal("edit", item)}>Sửa</button>
                      <button className="vehicle-delete-btn" type="button" onClick={() => deleteDriver(item)}>Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredNpDrivers.length ? <tr><td colSpan="16" className="empty-row">Không có tài xế nào khớp tìm kiếm.</td></tr> : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {activeView === "rates" ? (
        <section className="table-container vehicle-table-container rates-stack-container">
          {rateTab === "transportRates" ? (
            <>
              <div className="rate-main-scroll">
                <table className="rate-management-table">
                  <thead>
                    <tr>
                      {TRANSPORT_RATE_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNpTransportRates.map((item) => (
                      <tr key={item.id} className={item.status === "inactive" ? "inactive-rate-row" : ""}>
                        {TRANSPORT_RATE_COLUMNS.map((column) => (
                          <td key={column.key} className={column.key !== "customer" && column.key !== "route" ? "numeric-cell" : ""}>
                            {column.key.startsWith("rate") || column.key.startsWith("cont") ? formatRateCell(item[column.key]) : item[column.key]}
                          </td>
                        ))}
                        <td>
                          <div className="vehicle-row-actions">
                            <button className="vehicle-edit-btn" type="button" onClick={() => openTransportRateModal(item)}>Sửa</button>
                            <button className="vehicle-delete-btn" type="button" onClick={() => deleteTransportRate(item)}>Xóa</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredNpTransportRates.length ? <tr><td colSpan={TRANSPORT_RATE_COLUMNS.length + 1} className="empty-row">Không có bảng giá nào khớp tìm kiếm.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <div className="rate-subtable-title">Quản lý Phụ phí vận chuyển</div>
              <table className="np-management-table weblog-data-table weblog-rate-table rate-surcharge-table">
                <thead>
                  <tr>
                    {WEBLOG_RATE_FEE_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTransportFees.map((item) => (
                    <tr key={item.id}>
                      {WEBLOG_RATE_FEE_COLUMNS.map((column) => <td key={column.key}>{formatWeblogCell(item[column.key], column.type)}</td>)}
                      <td>
                        <div className="vehicle-row-actions">
                          <button className="vehicle-edit-btn" type="button">Sửa</button>
                          <button className="vehicle-delete-btn" type="button">Xóa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <div className="rate-main-scroll fuel-surcharge-scroll">
              <table className="np-management-table weblog-data-table fuel-surcharge-table">
                <thead>
                  <tr>
                    {FUEL_SURCHARGE_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {npFuelSurcharges.map((item) => (
                    <tr key={item.id}>
                      {FUEL_SURCHARGE_COLUMNS.map((column) => <td key={column.key}>{item[column.key] || ""}</td>)}
                      <td>
                        <div className="vehicle-row-actions">
                          <button className="vehicle-edit-btn" type="button" onClick={() => openFuelSurchargeModal(item)}>Sửa</button>
                          <button className="vehicle-delete-btn" type="button" onClick={() => deleteFuelSurcharge(item)}>Xóa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!npFuelSurcharges.length ? <tr><td colSpan={FUEL_SURCHARGE_COLUMNS.length + 1} className="empty-row">Chưa có phụ phí xăng dầu nào.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeView === "fuel" ? (
        <section className="fuel-layout">
          <div className="fuel-log-panel">
            <div className="split-panel-title">Bảng nhập dầu</div>
            <div className="fuel-table-scroll">
              <table className="np-management-table fuel-log-table">
                <thead>
                  <tr>
                    <th>Ngày đổ dầu</th>
                    <th>Biển số xe</th>
                    <th>Tên lái xe</th>
                    <th>Số tiền đổ (VND)</th>
                    <th>KM đang đổ (km)</th>
                    <th>Số KM chạy (km)</th>
                    <th>Số lít dầu (lít)</th>
                    <th>Định mức (lít/100km)</th>
                    <th>Lít định mức (lít)</th>
                    <th>Dầu lần trước (lít)</th>
                    <th>Âm/dương (lít)</th>
                    <th>Tổng tháng (lít)</th>
                    {can("editTransport") ? <th>Thao tác</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredFuelRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.date}</td>
                      <td><strong>{item.plateNumber}</strong></td>
                      <td>{item.driverName}</td>
                      <td><strong>{money.format(item.amount)}</strong></td>
                      <td>{formatFuelNumber(item.kmReading, 1)}</td>
                      <td>{formatFuelNumber(item.kmRun, 1)}</td>
                      <td>{formatFuelNumber(item.liters)}</td>
                      <td>{formatFuelNumber(item.fuelNorm)}</td>
                      <td>{formatFuelNumber(item.normLiters)}</td>
                      <td>{formatFuelNumber(item.previousLiters)}</td>
                      <td><span className={`fuel-delta ${Number(item.fuelDelta) > 0 ? "positive" : Number(item.fuelDelta) < 0 ? "negative" : ""}`}>{formatSignedFuelNumber(item.fuelDelta)}</span></td>
                      <td><strong>{formatSignedFuelNumber(item.monthlyDelta)}</strong></td>
                      {can("editTransport") ? <td>
                        <div className="vehicle-row-actions">
                          <button className="vehicle-edit-btn" type="button" onClick={() => openFuelModal(item)}>Sửa</button>
                          <button className="vehicle-delete-btn" type="button" onClick={() => deleteFuelLog(item)}>Xóa</button>
                        </div>
                      </td> : null}
                    </tr>
                  ))}
                  {!filteredFuelRows.length ? <tr><td colSpan={can("editTransport") ? 13 : 12} className="empty-row">Không có dữ liệu đổ dầu phù hợp bộ lọc.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="fuel-summary-panel">
            <div className="split-panel-title">Quản lý dầu</div>
            <div className="fuel-summary-filters">
              <label className="form-field">Từ ngày<input type="date" value={fuelSummaryRange.from} onChange={(event) => setFuelSummaryRange((range) => ({ ...range, from: event.target.value }))} /></label>
              <label className="form-field">Đến ngày<input type="date" value={fuelSummaryRange.to} onChange={(event) => setFuelSummaryRange((range) => ({ ...range, to: event.target.value }))} /></label>
              <label className="fuel-group-toggle"><input type="checkbox" checked={fuelSummaryGrouped} onChange={(event) => setFuelSummaryGrouped(event.target.checked)} /> Tích gộp theo nhân viên</label>
            </div>
            <div className="fuel-company-total">
              <span>Cả công ty</span>
              <strong>{formatFuelNumber(fuelSummaryTotals.liters)} lít</strong>
              <em>{formatSignedFuelNumber(fuelSummaryTotals.delta)} lít âm/dương</em>
            </div>
            <div className="fuel-summary-scroll">
              <div className="fuel-summary-subtitle">Theo lái xe</div>
              <table className="fuel-summary-table">
                <thead>
                  {fuelSummaryGrouped ? (
                    <tr><th>Nhân viên</th><th>Lượt</th><th>Dầu (lít)</th><th>Âm/dương</th></tr>
                  ) : (
                    <tr><th>Ngày</th><th>Nhân viên</th><th>Dầu (lít)</th><th>Âm/dương</th></tr>
                  )}
                </thead>
                <tbody>
                  {fuelSummaryGrouped ? groupedFuelSummaryRows.map((row) => (
                    <tr key={row.driverName}>
                      <td>{row.driverName}</td>
                      <td>{row.count}</td>
                      <td>{formatFuelNumber(row.liters)}</td>
                      <td><span className={`fuel-delta ${row.delta > 0 ? "positive" : row.delta < 0 ? "negative" : ""}`}>{formatSignedFuelNumber(row.delta)}</span></td>
                    </tr>
                  )) : fuelSummaryRows.map((row) => (
                    <tr key={`${row.id}-${row.date}`}>
                      <td>{row.date}</td>
                      <td>{row.driverName}</td>
                      <td>{formatFuelNumber(row.liters)}</td>
                      <td><span className={`fuel-delta ${Number(row.fuelDelta) > 0 ? "positive" : Number(row.fuelDelta) < 0 ? "negative" : ""}`}>{formatSignedFuelNumber(row.fuelDelta)}</span></td>
                    </tr>
                  ))}
                  {fuelSummaryGrouped && !groupedFuelSummaryRows.length ? <tr><td colSpan="4" className="empty-row">Không có dữ liệu trong khoảng ngày.</td></tr> : null}
                  {!fuelSummaryGrouped && !fuelSummaryRows.length ? <tr><td colSpan="4" className="empty-row">Không có dữ liệu trong khoảng ngày.</td></tr> : null}
                </tbody>
              </table>
              <div className="fuel-summary-subtitle">Theo biển số xe</div>
              <table className="fuel-summary-table">
                <thead>
                  <tr>
                    <th>Biển số</th>
                    <th>Lái xe</th>
                    <th>Lượt</th>
                    <th>Dầu (lít)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedFuelVehicleSummaryRows.map((row) => (
                    <tr key={`${row.plateNumber}-${row.driverName}`}>
                      <td><strong>{row.plateNumber}</strong></td>
                      <td>{row.driverName}</td>
                      <td>{row.count}</td>
                      <td>{formatFuelNumber(row.liters)}</td>
                    </tr>
                  ))}
                  {!groupedFuelVehicleSummaryRows.length ? <tr><td colSpan="4" className="empty-row">Không có dữ liệu trong khoảng ngày.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </aside>
        </section>
      ) : null}

      {activeView === "salary" ? (
        <section className="payroll-layout">
          <div className="salary-tabs">
            <button className={`salary-tab ${salaryTab === "payroll" ? "active" : ""}`} type="button" onClick={() => setSalaryTab("payroll")}>Bảng lương</button>
            <button className={`salary-tab ${salaryTab === "attendance" ? "active" : ""}`} type="button" onClick={() => setSalaryTab("attendance")}>Chấm nghỉ lái xe</button>
            <button className={`salary-tab ${salaryTab === "advances" ? "active" : ""}`} type="button" onClick={() => setSalaryTab("advances")}>Ứng lương</button>
            <button className={`salary-tab ${salaryTab === "fuelPrices" ? "active" : ""}`} type="button" onClick={() => setSalaryTab("fuelPrices")}>Giá dầu tiêu chuẩn</button>
            <button className={`salary-tab ${salaryTab === "config" ? "active" : ""}`} type="button" onClick={() => setSalaryTab("config")}>Cấu hình</button>
          </div>
          {salaryTab === "payroll" ? (
            <div className="payroll-controls">
              <label className="month-filter-field">Tháng lương<input type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} /></label>
              <select className="filter-select" value={payrollDriverFilter} onChange={(event) => setPayrollDriverFilter(event.target.value)}>
                <option value="">Tất cả tài xế</option>
                {payrollDriverOptions.map((driver) => <option value={driver} key={driver}>{driver}</option>)}
              </select>
              <select className="filter-select" value={payrollStatusFilter} onChange={(event) => setPayrollStatusFilter(event.target.value)}>
                <option value="">Tất cả trạng thái</option>
                <option value="draft">Nháp</option>
                <option value="checked">Đã kiểm tra</option>
                <option value="closed">Đã chốt</option>
              </select>
              <button className="btn btn-outline" type="button" onClick={exportDriverPayrollCsv} disabled={!filteredPayrollRows.length}>Xuất Excel</button>
            </div>
          ) : salaryTab === "attendance" ? (
            <div className="payroll-controls">
              <button className="btn btn-primary" type="button" onClick={() => openDriverAttendanceModal()}><Plus size={14} /> Thêm ngày nghỉ</button>
              <label className="month-filter-field">Tháng tính công<input type="month" value={driverAttendanceMonth} onChange={(event) => setDriverAttendanceMonth(event.target.value)} /></label>
            </div>
          ) : salaryTab === "advances" ? (
            <div className="payroll-controls">
              <button className="btn btn-primary" type="button" onClick={() => openSalaryAdvanceModal()}><Plus size={14} /> Thêm ứng lương</button>
              <select className="filter-select" value={payrollDriverFilter} onChange={(event) => setPayrollDriverFilter(event.target.value)}>
                <option value="">Tất cả tài xế</option>
                {payrollDriverOptions.map((driver) => <option value={driver} key={driver}>{driver}</option>)}
              </select>
            </div>
          ) : salaryTab === "fuelPrices" ? (
            <div className="payroll-controls">
              <button className="btn btn-primary" type="button" onClick={() => openStandardFuelPriceModal()}><Plus size={14} /> Thêm giá dầu</button>
              <label className="month-filter-field">Tháng lương<input type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} /></label>
            </div>
          ) : null}
          {salaryTab === "config" ? (
            <WeblogSalaryConfigPanel rows={weblogDriverData.salaryConfig} />
          ) : salaryTab === "advances" ? (
            <section className="salary-advance-layout">
              <div className="salary-advance-detail-panel">
                <div className="split-panel-title">Chi tiết các lần ứng</div>
                <div className="fuel-table-scroll">
                  <table className="np-management-table weblog-data-table attendance-table salary-advance-detail-table">
                    <thead>
                      <tr>
                        <th>Ngày ứng</th>
                        <th>Lái xe</th>
                        <th>Số tiền</th>
                        <th>Ghi chú</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaryAdvanceDetailRows.map((item) => (
                        <tr key={item.id}>
                          <td>{item.date}</td>
                          <td><strong>{item.driverName}</strong></td>
                          <td className="payroll-money-cell">{formatPayrollMoney(item.amount)}</td>
                          <td>{item.note}</td>
                          <td>
                            <div className="vehicle-row-actions">
                              <button className="vehicle-edit-btn" type="button" onClick={() => openSalaryAdvanceModal(item)}>Sửa</button>
                              <button className="vehicle-delete-btn" type="button" onClick={() => deleteSalaryAdvance(item)}>Xóa</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!salaryAdvanceDetailRows.length ? <tr><td colSpan="5" className="empty-row">Chưa có lần ứng lương nào.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <aside className="salary-advance-summary-panel">
                <div className="split-panel-title">Tổng lương ứng trong tháng {payrollMonth}</div>
                <div className="salary-advance-summary-filters">
                  <label className="month-filter-field">Tháng ứng<input type="month" value={payrollMonth} onChange={(event) => setPayrollMonth(event.target.value)} /></label>
                </div>
                <div className="fuel-company-total">
                  <span>{salaryAdvanceSummaryRows.length} lái xe • {monthlySalaryAdvances.length} lần ứng</span>
                  <strong>{formatPayrollMoney(salaryAdvanceSummaryTotal)}</strong>
                </div>
                <div className="fuel-summary-scroll">
                  <table className="fuel-summary-table salary-advance-summary-table">
                    <thead>
                      <tr>
                        <th>Lái xe</th>
                        <th>Số lần</th>
                        <th>Tổng ứng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaryAdvanceSummaryRows.map((row) => (
                        <tr key={row.driverName}>
                          <td>{row.driverName}</td>
                          <td>{row.count}</td>
                          <td className="payroll-money-cell"><strong>{formatPayrollMoney(row.total)}</strong></td>
                        </tr>
                      ))}
                      {!salaryAdvanceSummaryRows.length ? <tr><td colSpan="3" className="empty-row">Chưa có ứng lương trong tháng đang lọc.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </aside>
            </section>
          ) : salaryTab === "fuelPrices" ? (
            <section className="table-container vehicle-table-container">
              <table className="np-management-table weblog-data-table attendance-table">
                <thead>
                  <tr>
                    <th>Tháng</th>
                    <th>Giá dầu tiêu chuẩn / lít</th>
                    <th>Ghi chú</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStandardFuelPrices.map((item) => (
                    <tr key={item.id}>
                      <td>{item.month}</td>
                      <td className="payroll-money-cell"><strong>{formatPayrollMoney(item.unitPrice)}</strong></td>
                      <td>{item.note}</td>
                      <td>
                        <div className="vehicle-row-actions">
                          <button className="vehicle-edit-btn" type="button" onClick={() => openStandardFuelPriceModal(item)}>Sửa</button>
                          <button className="vehicle-delete-btn" type="button" onClick={() => deleteStandardFuelPrice(item)}>Xóa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredStandardFuelPrices.length ? <tr><td colSpan="4" className="empty-row">Chưa có giá dầu tiêu chuẩn.</td></tr> : null}
                </tbody>
              </table>
            </section>
          ) : salaryTab === "attendance" ? (
            <section className="attendance-layout">
              <div className="attendance-panel">
                <div className="split-panel-title">Danh sách ngày nghỉ lái xe</div>
                <div className="fuel-table-scroll">
                  <table className="np-management-table weblog-data-table attendance-table">
                    <thead>
                      <tr>
                        <th>Ngày nghỉ</th>
                        <th>Lái xe</th>
                        <th>Lý do</th>
                        <th>Ghi chú</th>
                        <th>Ngày tạo</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverAttendanceListRows.map((item) => (
                        <tr key={`${item.source || "webnp"}-${item.id}`}>
                          <td>{item.leaveDate}</td>
                          <td><strong>{item.driverName}</strong></td>
                          <td>{item.reason}</td>
                          <td>{item.note}</td>
                          <td>{item.createdAt}</td>
                          <td>
                            <div className="vehicle-row-actions">
                              {item.source === "weblog" ? <span className="muted">weblog</span> : <button className="vehicle-edit-btn" type="button" onClick={() => openDriverAttendanceModal(item)}>Sửa</button>}
                              {item.source === "weblog" ? null : <button className="vehicle-delete-btn" type="button" onClick={() => deleteDriverAttendance(item)}>Xóa</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!driverAttendanceListRows.length ? <tr><td colSpan="6" className="empty-row">Tháng này chưa có ngày nghỉ nào; các ngày làm chuẩn được tính là đi làm.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
              <aside className="attendance-summary-panel">
                <div className="split-panel-title">Bảng công tự tính tháng {driverAttendanceMonth}</div>
                <div className="fuel-company-total">
                  <span>Không chấm nghỉ = đi làm, tính đến {driverAttendanceBounds.to}</span>
                  <strong>{driverAttendanceTotals.workdays} công</strong>
                  <em>{driverAttendanceTotals.leaveDays} ngày nghỉ</em>
                </div>
                <div className="fuel-summary-scroll">
                  <table className="fuel-summary-table">
                    <thead>
                      <tr>
                        <th>Lái xe</th>
                        <th>Ngày làm chuẩn</th>
                        <th>Ngày nghỉ</th>
                        <th>Ngày công</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driverAttendanceSummary.map((row) => (
                        <tr key={row.driverName}>
                          <td>{row.driverName}</td>
                          <td>{row.standardWorkdays}</td>
                          <td>{row.leaveDays}</td>
                          <td><strong>{row.workdays}</strong></td>
                        </tr>
                      ))}
                      {!driverAttendanceSummary.length ? <tr><td colSpan="4" className="empty-row">Chưa có danh sách lái xe.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </aside>
            </section>
          ) : !weblogDriverData.salaryConfig.length ? (
            <div className="salary-config-empty">Chưa có cấu hình lương, cần cấu hình trước khi tính bảng lương.</div>
          ) : (
            <div className="payroll-table-wrap">
              <table className="payroll-table">
                <colgroup>
                  <col className="payroll-col-index" />
                  <col className="payroll-col-code" />
                  <col className="payroll-col-driver" />
                  <col className="payroll-col-day" />
                  <col className="payroll-col-day" />
                  <col className="payroll-col-day" />
                  <col className="payroll-col-day" />
                  <col className="payroll-col-count" />
                  <col className="payroll-col-count" />
                  <col className="payroll-col-count" />
                  <col className="payroll-col-count" />
                  <col className="payroll-col-count" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-money" />
                  <col className="payroll-col-total" />
                  <col className="payroll-col-total" />
                  <col className="payroll-col-total" />
                  <col className="payroll-col-total" />
                  <col className="payroll-col-total" />
                  <col className="payroll-col-total" />
                  <col className="payroll-col-total" />
                  <col className="payroll-col-total" />
                  <col className="payroll-col-note" />
                </colgroup>
                <thead>
                  <tr className="payroll-total-row">
                    <th colSpan="26">Tổng {filteredPayrollRows.length} tài xế • {payrollTotals.tripCount} chuyến</th>
                    <th className="payroll-money-cell">{formatPayrollMoney(payrollTotals.grossIncome)}</th>
                    <th className="payroll-money-cell">{formatPayrollMoney(payrollTotals.totalDeductions)}</th>
                    <th className="payroll-money-cell">{formatPayrollMoney(payrollTotals.netSalary)}</th>
                    <th className="payroll-money-cell">{formatPayrollMoney(payrollTotals.positiveFuelAmount)}</th>
                    <th className="payroll-money-cell">{formatPayrollMoney(payrollTotals.negativeFuelAmount)}</th>
                    <th className="payroll-money-cell">{formatPayrollMoney(payrollTotals.ticketAmount)}</th>
                    <th className="payroll-money-cell">{formatPayrollMoney(payrollTotals.salaryAdvanceAmount)}</th>
                    <th className="payroll-money-cell">{formatPayrollMoney(payrollTotals.cashPaymentTotal)}</th>
                    <th>{payrollTotals.missingKmTripCount ? `${payrollTotals.missingKmTripCount} thiếu KM` : ""}</th>
                  </tr>
                  <tr className="payroll-group-row">
                    <th colSpan="3">Nhóm 1: Thông tin tài xế/lái xe</th>
                    <th colSpan="4">Nhóm 2: Thông tin công</th>
                    <th colSpan="5">Nhóm 3: Thông tin KPI chuyến</th>
                    <th colSpan="2">Nhóm 4: Lương cơ bản</th>
                    <th colSpan="5">Nhóm 5: Lương theo chuyến</th>
                    <th colSpan="4">Thưởng khác</th>
                    <th colSpan="2">Nhóm 6: Bảo hiểm khấu trừ</th>
                    <th colSpan="1">Nhóm 7: Thuế TNCN miễn trừ</th>
                    <th colSpan="3">Nhóm 8: Tổng lương thực nhận</th>
                    <th colSpan="5">Thanh toán tiền mặt</th>
                    <th colSpan="1">Ghi chú</th>
                  </tr>
                  <tr>
                    <th>STT</th>
                    <th>Mã NV</th>
                    <th>Tài xế</th>
                    <th>Công chuẩn</th>
                    <th>Nghỉ</th>
                    <th>Công tính</th>
                    <th>Công thừa</th>
                    <th>Chuyến &lt;5km</th>
                    <th>Chuyến 5-60km</th>
                    <th>Chuyến 60-80km</th>
                    <th>Chuyến 80-100km</th>
                    <th>Chuyến 100-150km</th>
                    <th>Lương cơ bản</th>
                    <th>Phụ cấp</th>
                    <th>KPI &lt;5km</th>
                    <th>KPI 5-60km</th>
                    <th>KPI 60-80km</th>
                    <th>KPI 80-100km</th>
                    <th>KPI 100-150km</th>
                    <th>Bốc xếp</th>
                    <th>Lưu đêm</th>
                    <th>Thưởng công vượt</th>
                    <th>Thưởng mốc/khác</th>
                    <th>Bảo hiểm</th>
                    <th>Khấu trừ khác</th>
                    <th>Thuế TNCN</th>
                    <th>Tổng thu nhập</th>
                    <th>Khấu trừ</th>
                    <th>Thực lĩnh</th>
                    <th>Dương dầu</th>
                    <th>Âm dầu</th>
                    <th>Vé</th>
                    <th>Ứng lương</th>
                    <th>Tổng thanh toán tiền mặt</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayrollRows.map((row) => (
                    <tr key={row.driverName}>
                      <td>{row.index}</td>
                      <td>{row.employeeCode}</td>
                      <td className="payroll-driver-cell"><strong>{row.driverName}</strong><span>{row.position}</span></td>
                      <td>{row.standardWorkdays}</td>
                      <td>{row.leaveDays}</td>
                      <td><strong>{row.workdays}</strong></td>
                      <td>{row.excessWorkdays}</td>
                      <td>{row.kpiUnder5TripCount}</td>
                      <td>{row.kpi5To60TripCount}</td>
                      <td>{row.kpi60To80TripCount}</td>
                      <td>{row.kpi80To100TripCount}</td>
                      <td>{row.kpi100To150TripCount}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.workdaySalary)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.allowancesTotal)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.kpiUnder5Amount)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.kpi5To60Amount)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.kpi60To80Amount)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.kpi80To100Amount)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.kpi100To150Amount)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.loadingBonus)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.overnightBonus)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.excessWorkdaySalary)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.milestoneBonus + row.otherBonus)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.insuranceDeduction)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.otherDeductionsTotal)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.personalIncomeTax)}</td>
                      <td className="payroll-money-cell"><strong>{formatPayrollMoney(row.grossIncome)}</strong></td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.totalDeductions)}</td>
                      <td className="payroll-money-cell"><strong>{formatPayrollMoney(row.netSalary)}</strong></td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.positiveFuelAmount)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.negativeFuelAmount)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.ticketAmount)}</td>
                      <td className="payroll-money-cell">{formatPayrollMoney(row.salaryAdvanceAmount)}</td>
                      <td className="payroll-money-cell"><strong>{formatPayrollMoney(row.cashPaymentTotal)}</strong></td>
                      <td>{row.warnings.length ? <span className="payroll-warning">{row.warnings.join("; ")}</span> : row.note}</td>
                    </tr>
                  ))}
                  {!filteredPayrollRows.length ? <tr><td colSpan="35" className="empty-row">Không có dữ liệu bảng lương phù hợp.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {false ? (
        <section className="attendance-layout">
          <div className="attendance-panel">
            <div className="split-panel-title">Danh sách ngày nghỉ lái xe</div>
            <div className="fuel-table-scroll">
              <table className="np-management-table weblog-data-table attendance-table">
                <thead>
                  <tr>
                    <th>Ngày nghỉ</th>
                    <th>Lái xe</th>
                    <th>Lý do</th>
                    <th>Ghi chú</th>
                    <th>Ngày tạo</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {driverAttendanceListRows.map((item) => (
                    <tr key={`${item.source || "webnp"}-${item.id}`}>
                      <td>{item.leaveDate}</td>
                      <td><strong>{item.driverName}</strong></td>
                      <td>{item.reason}</td>
                      <td>{item.note}</td>
                      <td>{item.createdAt}</td>
                      <td>
                        <div className="vehicle-row-actions">
                          {item.source === "weblog" ? <span className="muted">weblog</span> : <button className="vehicle-edit-btn" type="button" onClick={() => openDriverAttendanceModal(item)}>Sửa</button>}
                          {item.source === "weblog" ? null : <button className="vehicle-delete-btn" type="button" onClick={() => deleteDriverAttendance(item)}>Xóa</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!driverAttendanceListRows.length ? <tr><td colSpan="6" className="empty-row">Tháng này chưa có ngày nghỉ nào; các ngày làm chuẩn được tính là đi làm.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
          <aside className="attendance-summary-panel">
            <div className="split-panel-title">Bảng công tự tính tháng {driverAttendanceMonth}</div>
            <div className="fuel-company-total">
              <span>Không chấm nghỉ = đi làm, tính đến {driverAttendanceBounds.to}</span>
              <strong>{driverAttendanceTotals.workdays} công</strong>
              <em>{driverAttendanceTotals.leaveDays} ngày nghỉ</em>
            </div>
            <div className="fuel-summary-scroll">
              <table className="fuel-summary-table">
                <thead>
                  <tr>
                    <th>Lái xe</th>
                    <th>Ngày làm chuẩn</th>
                    <th>Ngày nghỉ</th>
                    <th>Ngày công</th>
                  </tr>
                </thead>
                <tbody>
                  {driverAttendanceSummary.map((row) => (
                    <tr key={row.driverName}>
                      <td>{row.driverName}</td>
                      <td>{row.standardWorkdays}</td>
                      <td>{row.leaveDays}</td>
                      <td><strong>{row.workdays}</strong></td>
                    </tr>
                  ))}
                  {!driverAttendanceSummary.length ? <tr><td colSpan="4" className="empty-row">Chưa có danh sách lái xe.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </aside>
        </section>
      ) : null}

      {activeView === "reports" ? (
        <section className="toolbar">
          <span className="toolbar-title">Template báo cáo vận chuyển</span>
          <div className="toolbar-sep" />
          <span>Preview <strong>{reportPreviewVisible ? reportRows.length : 0}</strong> dòng</span>
          <div className="toolbar-right">
            <span>Đã chọn <strong>{selectedReportColumns.length}</strong> cột xuất Excel</span>
          </div>
        </section>
      ) : null}

      {activeView === "accounts" ? (
        <section className="toolbar account-toolbar">
          <span className="toolbar-title">Quản trị tài khoản & phân quyền</span>
          <div className="toolbar-sep" />
          <button className="btn btn-primary" type="button" onClick={resetAccountForm}><Plus size={14} /> Tạo tài khoản mới</button>
          <button className="btn btn-outline" type="button" onClick={() => document.querySelector(".role-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Quản lý vai trò</button>
          {can("assignPermissions") || can("createAccount") ? <button className="btn btn-secondary" type="button" onClick={() => saveAccountConfig()}><ShieldCheck size={14} /> Lưu cấu hình</button> : null}
        </section>
      ) : null}

      {activeView === "accounts" ? (
        <section className="account-admin-container">
          {accountMessage ? <div className="account-message">{accountMessage}</div> : null}
          <section className="account-section">
            <div className="account-section-title">1. Danh sách tài khoản</div>
            <div className="account-table-scroll">
              <table className="account-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Họ tên</th>
                    <th>Tài khoản</th>
                    <th>Mật khẩu</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {accountUsers.map((user, index) => (
                    <tr key={user.id}>
                      <td>{index + 1}</td>
                      <td>{user.fullName}</td>
                      <td><strong>{user.username}</strong></td>
                      <td>{user.password || ""}</td>
                      <td>{roleLabel(user.role)}</td>
                      <td><span className={`account-status ${user.status === "locked" ? "locked" : "active"}`}>{user.status === "locked" ? "Khóa" : "Đang dùng"}</span></td>
                      <td className="account-actions">
                        <button className="mini-btn" type="button" onClick={() => editAccount(user)}>Sửa</button>
                        <button className="mini-btn danger" type="button" onClick={() => toggleAccountStatus(user)}>{user.status === "locked" ? "Mở khóa" : "Khóa tài khoản"}</button>
                        <button className="mini-btn" type="button" onClick={() => resetAccountPassword(user)}>Reset mật khẩu</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {can("createAccount") ? <section className="account-section">
            <div className="account-section-title">2. Tạo tài khoản mới</div>
            <form className="account-form" onSubmit={submitAccount}>
              <label>Họ tên<input value={accountForm.fullName} onChange={(event) => setAccountForm({ ...accountForm, fullName: event.target.value })} /></label>
              <label>Tên đăng nhập<input value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} /></label>
              <label>Mật khẩu<input type="password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder={accountForm.id ? "Để trống nếu không đổi" : ""} /></label>
              <label>Số điện thoại<input value={accountForm.phone} onChange={(event) => setAccountForm({ ...accountForm, phone: event.target.value })} /></label>
              <label>Vai trò<select value={accountForm.role} onChange={(event) => setAccountForm({ ...accountForm, role: event.target.value })}>{ACCOUNT_ROLES.map((role) => <option value={role.key} key={role.key}>{role.label}</option>)}</select></label>
              <label>Trạng thái<select value={accountForm.status} onChange={(event) => setAccountForm({ ...accountForm, status: event.target.value })}><option value="active">Đang hoạt động</option><option value="locked">Khóa</option></select></label>
              <div className="account-form-actions">
                <button className="btn btn-primary" type="submit">{accountForm.id ? "Lưu tài khoản" : "Tạo tài khoản"}</button>
                {accountForm.id ? <button className="btn btn-outline" type="button" onClick={resetAccountForm}>Hủy sửa</button> : null}
              </div>
            </form>
          </section> : null}

          <section className="account-section role-section">
            <div className="account-section-title">3. Vai trò sử dụng</div>
            <table className="account-table role-table">
              <thead>
                <tr><th>Vai trò</th><th>Mô tả quyền</th></tr>
              </thead>
              <tbody>
                {ACCOUNT_ROLES.map((role) => (
                  <tr key={role.key}><td><strong>{role.label}</strong></td><td>{role.description}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          {can("assignPermissions") ? <section className="account-section">
            <div className="account-section-title">4. Kiểm duyệt quyền theo chức năng</div>
            <div className="permission-scroll">
              <table className="permission-table">
                <thead>
                  <tr>
                    <th>Chức năng</th>
                    {ACCOUNT_ROLES.map((role) => <th key={role.key}>{role.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_ROWS.map((permission) => (
                    <tr key={permission.key}>
                      <td>{permission.label}</td>
                      {ACCOUNT_ROLES.map((role) => (
                        <td key={role.key}>
                          <input
                            type="checkbox"
                            checked={role.key === "admin" || Boolean(accountPermissions[permission.key]?.[role.key])}
                            disabled={role.key === "admin"}
                            onChange={() => togglePermission(permission.key, role.key)}
                            aria-label={`${permission.label} - ${role.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section> : null}

          <section className="account-section">
            <div className="account-section-title">5. Nhật ký thao tác gần đây</div>
            <div className="account-table-scroll">
              <table className="account-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Tài khoản</th>
                    <th>Thao tác</th>
                    <th>Chức năng</th>
                    <th>Đối tượng</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.at)}</td>
                      <td><strong>{log.actor}</strong></td>
                      <td>{log.action}</td>
                      <td>{log.module}</td>
                      <td>{log.target || log.path}</td>
                    </tr>
                  ))}
                  {!auditLogs.length ? <tr><td colSpan="5" className="empty-row">Chưa có nhật ký thao tác.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}

      {activeView === "customersPartners" ? (
        <section className="customer-partner-grid">
          {[
            { type: "customers", title: "Quản lý khách hàng", rows: master.customers },
            { type: "partners", title: "Quản lý đối tác", rows: master.partners },
          ].map((panel) => (
            <div className="split-panel" key={panel.type}>
              <div className="split-panel-title">
                <span>{panel.title}</span>
                {panel.type === "partners" && can("editTransport") ? (
                  <button className="mini-btn" type="button" onClick={() => openCatalogModal("partners")}>
                    Thêm đối tác
                  </button>
                ) : null}
              </div>
              <div className="split-table-scroll">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Tên công ty</th>
                      <th>Người liên hệ</th>
                      <th>Điện thoại</th>
                      <th>Email</th>
                      {can("editTransport") ? <th>Thao tác</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {panel.rows.map((item) => (
                      <tr key={item.id}>
                        <td><strong className="code-link">{item.code}</strong></td>
                        <td>{item.name}</td>
                        <td>{item.contact || ""}</td>
                        <td>{item.phone || ""}</td>
                        <td>{item.email || ""}</td>
                        {can("editTransport") ? <td>
                          <button className="mini-btn" type="button" onClick={() => openCatalogModal(panel.type, item)}>Sửa</button>
                          <button className="mini-btn danger" type="button" onClick={() => deleteCatalog(panel.type, item)}>Xóa</button>
                        </td> : null}
                      </tr>
                    ))}
                    {!panel.rows.length ? <tr><td colSpan={can("editTransport") ? 6 : 5} className="empty-row">Không có dữ liệu.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {activeView === "routes" ? (
        <section className="route-split-grid">
          <div className="split-panel">
            <div className="split-panel-title">Tuyến đường theo khách hàng</div>
            <div className="split-table-scroll">
              <table className="route-table">
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th>Mã tuyến</th>
                    <th>Điểm 1</th>
                    <th>Điểm 2</th>
                    <th>Điểm 3</th>
                    <th>Km</th>
                    <th>Loại</th>
                    {can("editTransport") ? <th>Thao tác</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {master.routes.map((route) => (
                    <tr key={route.id}>
                      <td>{route.customerCode}</td>
                      <td><strong>{route.routeCode}</strong></td>
                      <td>{route.from || ""}</td>
                      <td>{route.to || ""}</td>
                      <td>{route.via || ""}</td>
                      <td>{route.km || ""}</td>
                      <td>{route.type}</td>
                      {can("editTransport") ? <td>
                        <button className="mini-btn" type="button" onClick={() => openRouteModal(route)}>Sửa</button>
                        <button className="mini-btn danger" type="button" onClick={() => deleteRoute(route)}>Xóa</button>
                      </td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="split-panel">
            <div className="split-panel-title">Mã địa điểm</div>
            <div className="split-table-scroll">
              <table className="location-table">
                <thead>
                  <tr>
                    <th>Tên nhà máy (kho)</th>
                    <th>Địa chỉ</th>
                    <th>Mã địa điểm</th>
                    <th>Vùng map</th>
                    {can("editTransport") ? <th>Thao tác</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {master.locations.map((location) => (
                    <tr key={location.id}>
                      <td>{location.name}</td>
                      <td>{location.address || ""}</td>
                      <td><strong>{location.code}</strong></td>
                      <td>{location.lat !== null && location.lat !== undefined && location.lng !== null && location.lng !== undefined ? `${location.lat}, ${location.lng} / ${location.radiusM || 500}m` : <span className="muted">Chưa có</span>}</td>
                      {can("editTransport") ? <td>
                        <button className="mini-btn" type="button" onClick={() => openLocationModal(location)}>Sửa</button>
                        <button className="mini-btn danger" type="button" onClick={() => deleteLocation(location)}>Xóa</button>
                      </td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeView === "gps" ? (
        <GpsTrackerFrame />
      ) : null}

      {activeView === "reports" ? (
        <section className="report-layout">
          <div className="report-template-panel">
            <div className="report-panel-title">TEMPLATE BÁO CÁO VẬN CHUYỂN</div>
            <div className="report-template-picker">
              <label className="form-field">
                Template đã lưu
                <select value={selectedReportTemplateId} onChange={(event) => selectReportTemplate(event.target.value)}>
                  {reportTemplates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
                </select>
              </label>
              {can("createReportTemplate") ? <button type="button" className="mini-btn" onClick={createReportTemplate}><Plus size={12} /> Tạo mới</button> : null}
              {can("createReportTemplate") ? <button type="button" className="mini-btn danger" onClick={deleteReportTemplate}><Trash2 size={12} /> Xóa</button> : null}
            </div>
            <label className="form-field report-template-name">
              Tên Template
              <input value={reportTemplate.name} onChange={(event) => updateReportTemplate({ name: event.target.value })} />
            </label>
            {reportSaveMessage ? <div className="report-save-message">{reportSaveMessage}</div> : null}
            <div className="report-section">
              <div className="report-section-title">Bộ lọc dữ liệu</div>
              <div className="report-check-grid">
                {REPORT_FILTER_FIELDS.map((field) => (
                  <label className="report-check" key={field.key}>
                    <input type="checkbox" checked={Boolean(reportTemplate.filters[field.key])} onChange={() => toggleReportFilter(field.key)} />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="report-section">
              <div className="report-section-title">Giá trị lọc</div>
              <div className="report-filter-grid">
                {REPORT_FILTER_FIELDS.filter((field) => reportTemplate.filters[field.key]).map((field) => (
                  <label className={`form-field ${field.type === "dateRange" ? "report-date-range-field" : ""}`} key={field.key}>
                    {field.label}
                    {field.source === "customers" ? (
                      <select value={reportTemplate.filterValues[field.key] || ""} onChange={(event) => updateReportFilterValue(field.key, event.target.value)}>
                        <option value="">Tất cả</option>
                        {master.customers.map((item) => <option value={item.code} key={item.code}>{item.code} - {item.name}</option>)}
                      </select>
                    ) : field.source === "routes" ? (
                      <select value={reportTemplate.filterValues[field.key] || ""} onChange={(event) => updateReportFilterValue(field.key, event.target.value)}>
                        <option value="">Tất cả</option>
                        {master.routes.map((item) => <option value={item.routeCode} key={item.id}>{item.routeCode}</option>)}
                      </select>
                    ) : field.source === "partners" ? (
                      <select value={reportTemplate.filterValues[field.key] || ""} onChange={(event) => updateReportFilterValue(field.key, event.target.value)}>
                        <option value="">Tất cả</option>
                        {master.partners.map((item) => <option value={item.code} key={item.code}>{item.code} - {item.name}</option>)}
                      </select>
                    ) : field.type === "dateRange" ? (
                      <div className="report-date-range">
                        <input type="date" value={reportTemplate.filterValues[`${field.key}From`] || ""} onChange={(event) => updateReportFilterValue(`${field.key}From`, event.target.value)} aria-label={`${field.label} từ ngày`} />
                        <input type="date" value={reportTemplate.filterValues[`${field.key}To`] || ""} onChange={(event) => updateReportFilterValue(`${field.key}To`, event.target.value)} aria-label={`${field.label} đến ngày`} />
                      </div>
                    ) : (
                      <input type={field.type} value={reportTemplate.filterValues[field.key] || ""} onChange={(event) => updateReportFilterValue(field.key, event.target.value)} placeholder="Để trống = tất cả" />
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="report-section">
              <div className="report-section-title">Chọn cột xuất Excel</div>
              {REPORT_COLUMN_GROUPS.map((group) => (
                <div className="report-column-group" key={group.title}>
                  <div className="report-column-title">{group.title}</div>
                  <div className="report-check-grid">
                    {group.columns.map((column) => (
                      <label className="report-check" key={column.key}>
                        <input type="checkbox" checked={Boolean(reportTemplate.columns[column.key])} onChange={() => toggleReportColumn(column.key)} />
                        <span>{column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="report-actions">
              {can("createReportTemplate") ? <button type="button" className="btn btn-outline" onClick={saveReportTemplate}>Lưu Template</button> : null}
              <button type="button" className="btn btn-secondary" onClick={() => setReportPreviewVisible(true)}>Xem trước</button>
              {can("exportExcel") ? <button type="button" className="btn btn-primary" onClick={exportReportCsv}>Xuất Excel</button> : null}
            </div>
          </div>
          <div className="report-preview-panel">
            <div className="report-panel-title">Xem trước</div>
            {!reportPreviewVisible ? (
              <div className="report-empty">Bấm Xem trước để kiểm tra dữ liệu trước khi xuất Excel.</div>
            ) : selectedReportColumns.length ? (
              <div className="report-preview-scroll">
                <table className="report-preview-table">
                  <thead>
                    <tr>
                      {selectedReportColumns.map((column) => <th key={column.key}>{column.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.slice(0, 100).map((trip) => (
                      <tr key={trip.id}>
                        {selectedReportColumns.map((column) => <td key={column.key}>{reportFieldValue(trip, column.key)}</td>)}
                      </tr>
                    ))}
                    {!reportRows.length ? (
                      <tr><td colSpan={selectedReportColumns.length}>Không có dữ liệu phù hợp bộ lọc.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="report-empty">Vui lòng chọn ít nhất 1 cột xuất Excel.</div>
            )}
          </div>
        </section>
      ) : null}

      {!["transport", "accounts", "customersPartners", "routes"].includes(activeView) ? <footer className="pagination">
        <span>
          {activeView === "vehicles" ? (
            <>Tổng <strong>{visibleNpVehicles.length}</strong> xe • Hiển thị <strong>{filteredNpVehicles.length}</strong></>
          ) : activeView === "drivers" ? (
            <>Tổng <strong>{visibleNpDrivers.length}</strong> tài xế • Hiển thị <strong>{filteredNpDrivers.length}</strong></>
          ) : activeView === "rates" ? (
            <>Tổng <strong>{npTransportRates.length}</strong> dòng bảng giá • Hiển thị <strong>{filteredNpTransportRates.length}</strong></>
          ) : activeView === "fuel" ? (
            <>Tổng <strong>{formatFuelNumber(fuelTotals.liters)}</strong> lít dầu • Chi phí <strong>{money.format(fuelTotals.amount)}</strong> • Âm/dương <strong>{formatSignedFuelNumber(fuelTotals.delta)}</strong> lít</>
          ) : activeView === "salary" && salaryTab === "attendance" ? (
            <>Chấm nghỉ <strong>{driverAttendanceRows.length}</strong> dòng • Tính <strong>{driverAttendanceTotals.leaveDays}</strong> ngày nghỉ</>
          ) : activeView === "salary" ? (
            <>Bảng lương <strong>{filteredPayrollRows.length}</strong> tài xế • Thực lĩnh <strong>{formatPayrollMoney(payrollTotals.netSalary)}</strong></>
          ) : activeView === "gps" ? (
            <>GPS <strong>{gpsDashboard.vehicles?.length || 0}</strong> xe • <strong>{gpsDashboard.locations?.length || 0}</strong> vùng map</>
          ) : activeView === "statement" ? (
            <>Bảng kê <strong>{statementRows.length}</strong> dòng • Tổng tiền <strong>{money.format(statementTotalAmount)}</strong></>
          ) : activeView === "reports" ? (
            <>Báo cáo <strong>{reportRows.length}</strong> dòng • <strong>{selectedReportColumns.length}</strong> cột</>
          ) : (
            <>Tổng <strong>{trips.length}</strong> chuyến • <strong>{metrics.totalRoutes ?? master.routes.length}</strong> tuyến • Chi phí <strong>{money.format(metrics.totalCost || 0)}</strong></>
          )}
        </span>
        <div className="pg-right">
          <button className="pg-btn active" type="button">1</button>
        </div>
      </footer> : null}

      {tripModal ? (
        <div className="modal-overlay">
          <form className={`modal large ${["bulk", "bulkCompleted"].includes(tripModal.mode) ? "bulk-trip-modal" : ""}`} onSubmit={saveTrip} onKeyDown={preventFormEnter}>
            <div className="modal-header">
              <strong>{tripModal.mode === "bulkCompleted" ? "Thêm nhiều đơn hoàn thành" : tripModal.mode === "bulk" ? "Thêm nhiều đơn vận chuyển" : tripModal.mode === "edit" ? "Sửa đơn vận chuyển" : "Thêm đơn vận chuyển"}</strong>
              <div className="modal-actions">
                {tripModal.mode === "edit" && can("deleteTransport") ? <button type="button" className="btn btn-danger" onClick={() => deleteTrip(tripModal.item)}><Trash2 size={14} /> Xóa</button> : null}
                <button type="button" className="btn btn-outline" onClick={() => setTripModal(null)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu</button>
              </div>
            </div>
            <div className={["bulk", "bulkCompleted"].includes(tripModal.mode) ? "modal-body bulk-modal-body" : "modal-body"}>
              {tripModal.mode === "bulkCompleted" ? (
                <div className="bulk-trip-editor">
                  <div className="bulk-trip-head">
                    <span>Dán dữ liệu từ Excel hoặc nhập trực tiếp từng ô</span>
                    <button type="button" className="mini-btn" onClick={() => addCompletedBulkTripRows(5)}><Plus size={12} /> Thêm 5 dòng</button>
                  </div>
                  <div className="bulk-trip-scroll">
                    <table className="bulk-trip-table completed-bulk-trip-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          {COMPLETED_BULK_TRIP_FIELDS.map((field) => <th key={field}>{COMPLETED_BULK_TRIP_LABELS[field]}</th>)}
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(tripForm.completedBulkRows || []).map((row, index) => (
                          <tr key={`completed-bulk-trip-${index}`}>
                            <td>{index + 1}</td>
                            {COMPLETED_BULK_TRIP_FIELDS.map((field) => (
                              <td key={field}>
                                <input
                                  list={field === "customerCode" ? "customer-options" : field === "partnerCode" ? "partner-options" : field === "cargoWeight" ? "cargo-weight-options" : field === "routeText" ? `completed-bulk-route-options-${index}` : undefined}
                                  type="text"
                                  inputMode={["handlingFeeAmount", "warehouseTicketFee", "highwayTicketFee", "driverOvernightFee", "otherFeeAmount"].includes(field) ? "decimal" : undefined}
                                  placeholder={field === "plannedDate" ? "DD/MM/YYYY" : ["point1At", "point1DepartAt", "point2At", "point2DepartAt", "point3At", "point3DepartAt"].includes(field) ? "DD/MM/YYYY HH:mm" : undefined}
                                  value={row[field] || ""}
                                  onPaste={(e) => handleCompletedBulkTripPaste(e, index, field)}
                                  onChange={(e) => updateCompletedBulkTripRow(index, field, e.target.value)}
                                />
                                {field === "routeText" ? <datalist id={`completed-bulk-route-options-${index}`}>{master.routes.filter((route) => !row.customerCode || route.customerCode === row.customerCode).map((item) => <option value={item.routeCode} key={item.id}>{item.customerCode}</option>)}</datalist> : null}
                              </td>
                            ))}
                            <td><button type="button" className="mini-btn danger icon-only" onClick={() => removeCompletedBulkTripRow(index)}><Trash2 size={12} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <datalist id="customer-options">{master.customers.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</datalist>
                  <datalist id="cargo-weight-options">{CARGO_WEIGHT_OPTIONS.map((item) => <option value={item} key={item} />)}</datalist>
                  <datalist id="partner-options">{master.partners.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</datalist>
                </div>
              ) : tripModal.mode === "bulk" ? (
                <div className="bulk-trip-editor">
                  <div className="bulk-trip-head">
                    <span>Dán dữ liệu từ Excel hoặc nhập trực tiếp từng ô</span>
                    <button type="button" className="mini-btn" onClick={() => addBulkTripRows(5)}><Plus size={12} /> Thêm 5 dòng</button>
                  </div>
                  <div className="bulk-trip-scroll">
                    <table className="bulk-trip-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Khách hàng</th>
                          <th>Tuyến</th>
                          <th>Tải trọng</th>
                          <th>Loại xe</th>
                          <th>Ngày KH</th>
                          <th>Giờ KH</th>
                          <th>ĐV vận tải</th>
                          <th>Biển số</th>
                          <th>Lái xe</th>
                          <th>SĐT lái xe</th>
                          <th>Ghi chú</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(tripForm.bulkRows || []).map((row, index) => (
                          <tr key={`bulk-trip-${index}`}>
                            <td>{index + 1}</td>
                            <td><input list="customer-options" value={row.customerCode || ""} onPaste={(e) => handleBulkTripPaste(e, index, "customerCode")} onChange={(e) => updateBulkTripRow(index, "customerCode", e.target.value)} /></td>
                            <td><input list={`bulk-route-options-${index}`} value={row.routeText || ""} onPaste={(e) => handleBulkTripPaste(e, index, "routeText")} onChange={(e) => updateBulkTripRow(index, "routeText", e.target.value)} /><datalist id={`bulk-route-options-${index}`}>{master.routes.filter((route) => !row.customerCode || route.customerCode === row.customerCode).map((item) => <option value={item.routeCode} key={item.id}>{item.customerCode}</option>)}</datalist></td>
                            <td><input list="cargo-weight-options" value={row.cargoWeight || ""} onPaste={(e) => handleBulkTripPaste(e, index, "cargoWeight")} onChange={(e) => updateBulkTripRow(index, "cargoWeight", e.target.value)} /></td>
                            <td><input list="vehicle-type-options" value={row.vehicleType || ""} onPaste={(e) => handleBulkTripPaste(e, index, "vehicleType")} onChange={(e) => updateBulkTripRow(index, "vehicleType", e.target.value)} /></td>
                            <td><input type="date" value={row.plannedDate || ""} onPaste={(e) => handleBulkTripPaste(e, index, "plannedDate")} onChange={(e) => updateBulkTripRow(index, "plannedDate", e.target.value)} /></td>
                            <td><input type="text" inputMode="numeric" maxLength="5" pattern={TIME_PATTERN} placeholder="HH:mm" value={row.plannedTime || ""} onPaste={(e) => handleBulkTripPaste(e, index, "plannedTime")} onChange={(e) => updateBulkTripRow(index, "plannedTime", e.target.value)} /></td>
                            <td><input list="partner-options" value={row.partnerCode || ""} onPaste={(e) => handleBulkTripPaste(e, index, "partnerCode")} onChange={(e) => updateBulkTripRow(index, "partnerCode", e.target.value)} /></td>
                            <td><input value={row.plateNumber || ""} onPaste={(e) => handleBulkTripPaste(e, index, "plateNumber")} onChange={(e) => updateBulkTripRow(index, "plateNumber", e.target.value)} /></td>
                            <td><input value={row.driverName || ""} onPaste={(e) => handleBulkTripPaste(e, index, "driverName")} onChange={(e) => updateBulkTripRow(index, "driverName", e.target.value)} /></td>
                            <td><input value={row.driverPhone || ""} onPaste={(e) => handleBulkTripPaste(e, index, "driverPhone")} onChange={(e) => updateBulkTripRow(index, "driverPhone", e.target.value)} /></td>
                            <td><input value={row.note || ""} onPaste={(e) => handleBulkTripPaste(e, index, "note")} onChange={(e) => updateBulkTripRow(index, "note", e.target.value)} /></td>
                            <td><button type="button" className="mini-btn danger icon-only" onClick={() => removeBulkTripRow(index)}><Trash2 size={12} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <datalist id="customer-options">{master.customers.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</datalist>
                  <datalist id="cargo-weight-options">{CARGO_WEIGHT_OPTIONS.map((item) => <option value={item} key={item} />)}</datalist>
                  <datalist id="vehicle-type-options">{VEHICLE_TYPE_OPTIONS.map((item) => <option value={item} key={item} />)}</datalist>
                  <datalist id="partner-options">{master.partners.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</datalist>
                </div>
              ) : (
                <>
              <label className="form-field">Khách hàng<input required list="customer-options" value={tripForm.customerCode} onChange={(e) => setTripForm({ ...tripForm, customerCode: e.target.value.toUpperCase(), routeId: "", routeText: "" })} placeholder="Chọn hoặc nhập mã khách" /><datalist id="customer-options">{master.customers.map((item) => <option value={item.code} key={item.code} />)}</datalist></label>
              <label className="form-field">Tuyến<select required value={tripForm.routeText || ""} disabled={!tripForm.customerCode} onChange={(e) => {
                const routeText = e.target.value;
                const nextRoute = master.routes.find((route) => route.routeCode === routeText && route.customerCode === tripForm.customerCode);
                setTripForm({
                  ...tripForm,
                  routeText,
                  routeId: nextRoute?.id || "",
                  point3ArrivalTime: nextRoute && !routeHasThirdPoint(nextRoute) ? "" : tripForm.point3ArrivalTime,
                  point3DepartTime: nextRoute && !routeHasThirdPoint(nextRoute) ? "" : tripForm.point3DepartTime,
                });
              }}><option value="">{tripForm.customerCode ? "Chọn tuyến theo bảng giá" : "Chọn khách hàng trước"}</option>{tripRouteOptions.map((item) => <option value={item.routeCode} key={item.routeCode}>{item.routeCode}</option>)}</select></label>
              <div className="form-row four span2">
                <label className="form-field">Tải trọng xe<input required list="cargo-weight-options" value={tripForm.cargoWeight} onChange={(e) => setTripForm({ ...tripForm, cargoWeight: e.target.value })} placeholder="Chọn hoặc nhập tải trọng" /><datalist id="cargo-weight-options">{CARGO_WEIGHT_OPTIONS.map((item) => <option value={item} key={item} />)}</datalist></label>
                <label className="form-field">Loại xe<input list="vehicle-type-options" value={tripForm.vehicleType} onChange={(e) => setTripForm({ ...tripForm, vehicleType: e.target.value })} /><datalist id="vehicle-type-options">{VEHICLE_TYPE_OPTIONS.map((item) => <option value={item} key={item} />)}</datalist></label>
                <DateStepperField label="Ngày kế hoạch" required value={tripForm.plannedDate} onChange={(value) => updateTripScheduleDate("plannedDate", value)} onStep={(days) => stepTripScheduleDate("plannedDate", days)} />
                <label className="form-field">Giờ kế hoạch<input required type="text" inputMode="numeric" maxLength="5" pattern={TIME_PATTERN} placeholder="HH:mm" value={tripForm.plannedTime} onChange={(e) => updateTripScheduleField("plannedTime", normalizeTimeEntry(e.target.value))} /></label>
              </div>
              <div className="form-row four driver-row span2">
                <label className="form-field">Đơn vị vận tải<input list="partner-options" value={tripForm.partnerCode} onChange={(e) => setTripForm({ ...tripForm, partnerCode: e.target.value.toUpperCase() })} placeholder="Chọn hoặc nhập mã ĐVVT" /><datalist id="partner-options">{master.partners.map((item) => <option value={item.code} key={item.code} />)}</datalist></label>
                <label className="form-field">Biển số xe<input value={tripForm.plateNumber} onChange={(e) => setTripForm({ ...tripForm, plateNumber: e.target.value.toUpperCase() })} /></label>
                <label className="form-field">Lái xe<input value={tripForm.driverName} onChange={(e) => setTripForm({ ...tripForm, driverName: e.target.value })} /></label>
                <label className="form-field">SĐT lái xe<input value={tripForm.driverPhone} onChange={(e) => setTripForm({ ...tripForm, driverPhone: e.target.value })} /></label>
              </div>
              {latestDriverSuggestion ? (
                <div className="driver-suggestion span2">
                  <div>
                    <span>Gợi ý theo biển số gần nhất</span>
                    <strong>
                      {latestDriverSuggestion.driverName || "Chưa có tên"}{latestDriverSuggestion.driverPhone ? ` - ${latestDriverSuggestion.driverPhone}` : ""}
                    </strong>
                    <small>
                      {latestDriverSuggestion.orderCode ? `Đơn ${latestDriverSuggestion.orderCode}` : "Lịch sử chuyến xe"}
                      {latestDriverSuggestion.requiredArrivalAt ? ` • ${formatDateTime(latestDriverSuggestion.requiredArrivalAt)}` : ""}
                    </small>
                  </div>
                  <div className="driver-suggestion-actions">
                    <button type="button" className="mini-btn" onClick={applyLatestDriverSuggestion}>Áp dụng</button>
                    <button type="button" className="mini-btn" onClick={dismissLatestDriverSuggestion}>Hủy</button>
                  </div>
                </div>
              ) : null}
              <div className="form-field span2 waybill-editor">
                <div className="waybill-editor-head">
                  <span>Vận đơn</span>
                  <button type="button" className="mini-btn" onClick={addWaybillRow}><Plus size={12} /> Thêm dòng</button>
                </div>
                <table className="waybill-edit-table">
                  <thead>
                    <tr>
                      <th>Số kiện</th>
                      <th>Trọng lượng</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(tripForm.waybills || []).map((row, index) => (
                      <tr key={`waybill-${index}`}>
                        <td><input type="number" min="0" step="1" value={row.packageCount || ""} onPaste={(e) => handleWaybillPaste(e, index, "packageCount")} onChange={(e) => updateWaybill(index, "packageCount", e.target.value)} /></td>
                        <td><input type="number" min="0" step="0.1" value={row.grossWeight || ""} onPaste={(e) => handleWaybillPaste(e, index, "grossWeight")} onChange={(e) => updateWaybill(index, "grossWeight", e.target.value)} /></td>
                        <td><button type="button" className="mini-btn danger icon-only" onClick={() => removeWaybillRow(index)}><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TripPointDateTimeField label="Điểm 1 đến" side="arrival" dateValue={tripForm.point1ArrivalDate} timeValue={tripForm.point1ArrivalTime} onDateChange={(value) => updateTripScheduleDate("point1ArrivalDate", value)} onDateStep={(days) => stepTripScheduleDate("point1ArrivalDate", days)} onTimeChange={(value) => updateTripScheduleField("point1ArrivalTime", value)} />
              <TripPointDateTimeField label="Điểm 1 rời" side="depart" dateValue={tripForm.point1DepartDate} timeValue={tripForm.point1DepartTime} onDateChange={(value) => updateTripScheduleDate("point1DepartDate", value)} onDateStep={(days) => stepTripScheduleDate("point1DepartDate", days)} onTimeChange={(value) => updateTripScheduleField("point1DepartTime", value)} />
              <TripPointDateTimeField label="Điểm 2 đến" side="arrival" dateValue={tripForm.point2ArrivalDate} timeValue={tripForm.point2ArrivalTime} onDateChange={(value) => updateTripScheduleDate("point2ArrivalDate", value)} onDateStep={(days) => stepTripScheduleDate("point2ArrivalDate", days)} onTimeChange={(value) => updateTripScheduleField("point2ArrivalTime", value)} />
              <TripPointDateTimeField label="Điểm 2 rời" side="depart" dateValue={tripForm.point2DepartDate} timeValue={tripForm.point2DepartTime} onDateChange={(value) => updateTripScheduleDate("point2DepartDate", value)} onDateStep={(days) => stepTripScheduleDate("point2DepartDate", days)} onTimeChange={(value) => updateTripScheduleField("point2DepartTime", value)} />
              <TripPointDateTimeField label="Điểm 3 đến" side="arrival" disabled={!tripHasThirdPoint} placeholder={tripHasThirdPoint ? "HH:mm" : "Không áp dụng"} dateValue={tripForm.point3ArrivalDate} timeValue={tripForm.point3ArrivalTime} onDateChange={(value) => updateTripScheduleDate("point3ArrivalDate", value)} onDateStep={(days) => stepTripScheduleDate("point3ArrivalDate", days)} onTimeChange={(value) => updateTripScheduleField("point3ArrivalTime", value)} />
              <TripPointDateTimeField label="Điểm 3 rời" side="depart" disabled={!tripHasThirdPoint} placeholder={tripHasThirdPoint ? "HH:mm" : "Không áp dụng"} dateValue={tripForm.point3DepartDate} timeValue={tripForm.point3DepartTime} onDateChange={(value) => updateTripScheduleDate("point3DepartDate", value)} onDateStep={(days) => stepTripScheduleDate("point3DepartDate", days)} onTimeChange={(value) => updateTripScheduleField("point3DepartTime", value)} />
              <div className="form-field span2 fee-editor">
                <div className="waybill-editor-head">
                  <span>Phụ phí</span>
                </div>
                <div className="fee-handling-row">
                  <label className="form-field">Phí bốc xếp<select value={tripForm.handlingFeeSide || "Không"} onChange={(e) => setTripForm({ ...tripForm, handlingFeeSide: e.target.value, handlingFeeAmount: e.target.value === "Không" ? "" : tripForm.handlingFeeAmount })}>{HANDLING_FEE_SIDE_OPTIONS.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
                  <label className="form-field">Số tiền<MoneyInput value={tripForm.handlingFeeAmount || ""} disabled={(tripForm.handlingFeeSide || "Không") === "Không"} onChange={(value) => setTripForm({ ...tripForm, handlingFeeAmount: value })} /></label>
                </div>
                <div className="fee-other-head">
                  <span>Phí khác</span>
                  <button type="button" className="mini-btn" onClick={addOtherFeeRow}><Plus size={12} /> Thêm phí khác</button>
                </div>
                <table className="waybill-edit-table fee-edit-table">
                  <thead>
                    <tr>
                      <th>Nội dung phí</th>
                      <th>Số tiền</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(tripForm.otherFees || []).map((row, index) => (
                      <tr key={`other-fee-${index}`}>
                        <td><input value={row.description || ""} onChange={(e) => updateOtherFee(index, "description", e.target.value)} /></td>
                        <td><MoneyInput value={row.amount || ""} onChange={(value) => updateOtherFee(index, "amount", value)} /></td>
                        <td><button type="button" className="mini-btn danger icon-only" onClick={() => removeOtherFeeRow(index)}><Trash2 size={12} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="form-field span2">Ghi chú<input value={tripForm.note} onChange={(e) => setTripForm({ ...tripForm, note: e.target.value })} /></label>
              {tripModal.mode === "edit" && tripForm.orderCode ? (
                <div className="form-field span2 driver-link-field">
                  <span>Link web lái xe</span>
                  <div className="driver-link-row">
                    <input readOnly value={driverLinkForOrder(tripForm.orderCode)} />
                    <button type="button" className="mini-btn" onClick={copyDriverLink}>Copy</button>
                  </div>
                </div>
              ) : null}
                </>
              )}
            </div>
          </form>
        </div>
      ) : null}

      {transportRateModal ? (
        <div className="modal-overlay">
          <form className="modal rate-entry-modal" onSubmit={saveTransportRate}>
            <div className="modal-header">
              <strong>{transportRateModal.item ? "Sửa bảng giá" : "Thêm bảng giá mới"}</strong>
              <div className="rate-entry-header-actions">
                {!transportRateModal.item ? (
                  <button className="mini-btn" type="button" onClick={addTransportRateRow}><Plus size={12} /> Thêm dòng</button>
                ) : null}
                <button type="button" className="btn btn-outline" onClick={() => setTransportRateModal(null)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu</button>
                <button type="button" className="close-btn" onClick={() => setTransportRateModal(null)}>×</button>
              </div>
            </div>
            <div className="modal-body rate-modal-body">
              <div className="rate-entry-table-wrap">
                <table className="rate-entry-table">
                  <thead>
                    <tr>
                      <th>STT</th>
                      {TRANSPORT_RATE_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
                      {!transportRateModal.item ? <th className="rate-entry-action-col" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {transportRateRows.map((row, rowIndex) => (
                      <tr key={`rate-entry-${rowIndex}`}>
                        <td>{rowIndex + 1}</td>
                        {TRANSPORT_RATE_COLUMNS.map((column) => (
                          <td key={column.key}>
                            {column.key.startsWith("rate") || column.key.startsWith("cont") ? (
                              <MoneyInput value={row[column.key] || ""} onChange={(value) => updateTransportRateRow(rowIndex, column.key, value)} />
                            ) : (
                              <input
                                value={row[column.key] || ""}
                                onChange={(event) => updateTransportRateRow(rowIndex, column.key, column.key === "customer" || column.key === "route" ? event.target.value.toUpperCase() : event.target.value)}
                              />
                            )}
                          </td>
                        ))}
                        {!transportRateModal.item ? (
                          <td className="rate-entry-action-col">
                            <button className="mini-btn danger icon-only" type="button" onClick={() => removeTransportRateRow(rowIndex)} disabled={transportRateRows.length <= 1}>
                              <Trash2 size={12} />
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {fuelModal ? (
        <div className="modal-overlay">
          <form className="modal small" onSubmit={saveFuelLog}>
            <div className="modal-header">
              <strong>{fuelModal.item ? "Sửa lượt đổ dầu" : "Thêm lượt đổ dầu"}</strong>
              <button type="button" className="close-btn" onClick={() => setFuelModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-field">Ngày đổ dầu<input required type="date" value={fuelForm.date || ""} onChange={(e) => updateFuelForm("date", e.target.value)} /></label>
              <label className="form-field">Biển số xe<input required list="fuel-plate-options" value={fuelForm.plateNumber || ""} onChange={(e) => updateFuelForm("plateNumber", e.target.value)} /></label>
              <label className="form-field">Tên lái xe<input required value={fuelForm.driverName || ""} onChange={(e) => updateFuelForm("driverName", e.target.value)} /></label>
              <label className="form-field">Số tiền đổ<MoneyInput value={fuelForm.amount || ""} onChange={(value) => updateFuelForm("amount", value)} /></label>
              <label className="form-field">Số KM đang đổ<input required type="number" min="0" step="0.1" value={fuelForm.kmReading || ""} onChange={(e) => updateFuelForm("kmReading", e.target.value)} /></label>
              <label className="form-field">Số lít dầu<input required type="number" min="0" step="0.01" value={fuelForm.liters || ""} onChange={(e) => updateFuelForm("liters", e.target.value)} /></label>
              <label className="form-field">Định mức / 100km<input value={fuelForm.fuelNorm || ""} onChange={(e) => updateFuelForm("fuelNorm", e.target.value)} placeholder="VD: 11.5" /></label>
              <label className="form-field">Số KM chạy<input readOnly value={formatFuelNumber(fuelDraft.kmRun, 1)} /></label>
              <label className="form-field">Số lít định mức<input readOnly value={formatFuelNumber(fuelDraft.normLiters)} /></label>
              <label className="form-field">Dầu lần trước<input readOnly value={formatFuelNumber(fuelDraft.previousLiters)} /></label>
              <label className="form-field">Âm/dương dầu<input readOnly value={formatSignedFuelNumber(fuelDraft.fuelDelta)} /></label>
              <label className="form-field">Tổng âm/dương trong tháng<input readOnly value={formatSignedFuelNumber(fuelDraft.monthlyDelta)} /></label>
              <datalist id="fuel-plate-options">{visibleNpVehicles.map((item) => <option value={item.plateNumber} key={item.id || item.plateNumber}>{item.driverName || item.fuelNorm || ""}</option>)}</datalist>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setFuelModal(null)}>Hủy</button>
              <button type="submit" className="btn btn-primary">Lưu</button>
            </div>
          </form>
        </div>
      ) : null}

      {driverAttendanceModal ? (
        <div className="modal-overlay">
          <form className="modal small driver-attendance-modal" onSubmit={saveDriverAttendance}>
            <div className="modal-header">
              <strong>{driverAttendanceModal.item ? "Sửa ngày nghỉ lái xe" : "Thêm ngày nghỉ lái xe"}</strong>
              <button type="button" className="close-btn" onClick={() => setDriverAttendanceModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-field">Ngày nghỉ<input required type="date" value={driverAttendanceForm.leaveDate || ""} onChange={(e) => setDriverAttendanceForm({ ...driverAttendanceForm, leaveDate: e.target.value })} /></label>
              <label className="form-field">Tên lái xe<input required list="attendance-driver-options" value={driverAttendanceForm.driverName || ""} onChange={(e) => setDriverAttendanceForm({ ...driverAttendanceForm, driverName: e.target.value })} /></label>
              <label className="form-field span2">Lý do<input value={driverAttendanceForm.reason || ""} onChange={(e) => setDriverAttendanceForm({ ...driverAttendanceForm, reason: e.target.value })} /></label>
              <label className="form-field span2">Ghi chú<input value={driverAttendanceForm.note || ""} onChange={(e) => setDriverAttendanceForm({ ...driverAttendanceForm, note: e.target.value })} /></label>
              <datalist id="attendance-driver-options">{driverAttendanceDriverOptions.map((item) => <option value={item.name} key={item.id || item.name} />)}</datalist>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setDriverAttendanceModal(null)}>Hủy</button>
              <button type="submit" className="btn btn-primary">Lưu</button>
            </div>
          </form>
        </div>
      ) : null}

      {fuelSurchargeModal ? (
        <div className="modal-overlay">
          <form className="modal small" onSubmit={saveFuelSurcharge}>
            <div className="modal-header">
              <strong>{fuelSurchargeModal.item ? "Sửa phụ phí xăng dầu" : "Thêm phụ phí xăng dầu"}</strong>
              <button type="button" className="close-btn" onClick={() => setFuelSurchargeModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-field span2">Nội dung<input required value={fuelSurchargeForm.content || ""} onChange={(e) => setFuelSurchargeForm({ ...fuelSurchargeForm, content: e.target.value })} /></label>
              <label className="form-field">Từ ngày<input type="date" value={fuelSurchargeForm.dateFrom || ""} onChange={(e) => setFuelSurchargeForm({ ...fuelSurchargeForm, dateFrom: e.target.value })} /></label>
              <label className="form-field">Đến ngày<input type="date" value={fuelSurchargeForm.dateTo || ""} onChange={(e) => setFuelSurchargeForm({ ...fuelSurchargeForm, dateTo: e.target.value })} /></label>
              <label className="form-field">% phụ phí<input required inputMode="decimal" value={fuelSurchargeForm.percent || ""} onChange={(e) => setFuelSurchargeForm({ ...fuelSurchargeForm, percent: e.target.value })} /></label>
              <label className="form-field span2">Ghi chú<input value={fuelSurchargeForm.note || ""} onChange={(e) => setFuelSurchargeForm({ ...fuelSurchargeForm, note: e.target.value })} /></label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setFuelSurchargeModal(null)}>Hủy</button>
              <button type="submit" className="btn btn-primary">Lưu</button>
            </div>
          </form>
        </div>
      ) : null}

      {salaryAdvanceModal ? (
        <div className="modal-overlay">
          <form className="modal small" onSubmit={saveSalaryAdvance}>
            <div className="modal-header">
              <strong>{salaryAdvanceModal.item ? "Sửa ứng lương" : "Thêm ứng lương"}</strong>
              <button type="button" className="close-btn" onClick={() => setSalaryAdvanceModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-field">Ngày ứng<input required type="date" value={salaryAdvanceForm.date || ""} onChange={(e) => setSalaryAdvanceForm({ ...salaryAdvanceForm, date: e.target.value })} /></label>
              <label className="form-field">Lái xe<input required list="salary-advance-driver-options" value={salaryAdvanceForm.driverName || ""} onChange={(e) => setSalaryAdvanceForm({ ...salaryAdvanceForm, driverName: e.target.value })} /></label>
              <label className="form-field">Số tiền ứng<MoneyInput value={salaryAdvanceForm.amount || ""} onChange={(value) => setSalaryAdvanceForm({ ...salaryAdvanceForm, amount: value })} /></label>
              <label className="form-field span2">Ghi chú<input value={salaryAdvanceForm.note || ""} onChange={(e) => setSalaryAdvanceForm({ ...salaryAdvanceForm, note: e.target.value })} /></label>
              <datalist id="salary-advance-driver-options">{payrollDriverOptions.map((driver) => <option value={driver} key={driver} />)}</datalist>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setSalaryAdvanceModal(null)}>Hủy</button>
              <button type="submit" className="btn btn-primary">Lưu</button>
            </div>
          </form>
        </div>
      ) : null}

      {standardFuelPriceModal ? (
        <div className="modal-overlay">
          <form className="modal small" onSubmit={saveStandardFuelPrice}>
            <div className="modal-header">
              <strong>{standardFuelPriceModal.item ? "Sửa giá dầu tiêu chuẩn" : "Thêm giá dầu tiêu chuẩn"}</strong>
              <button type="button" className="close-btn" onClick={() => setStandardFuelPriceModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-field">Tháng<input required type="month" value={standardFuelPriceForm.month || ""} onChange={(e) => setStandardFuelPriceForm({ ...standardFuelPriceForm, month: e.target.value })} /></label>
              <label className="form-field">Giá dầu tiêu chuẩn / lít<MoneyInput value={standardFuelPriceForm.unitPrice || ""} onChange={(value) => setStandardFuelPriceForm({ ...standardFuelPriceForm, unitPrice: value })} /></label>
              <label className="form-field span2">Ghi chú<input value={standardFuelPriceForm.note || ""} onChange={(e) => setStandardFuelPriceForm({ ...standardFuelPriceForm, note: e.target.value })} /></label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setStandardFuelPriceModal(null)}>Hủy</button>
              <button type="submit" className="btn btn-primary">Lưu</button>
            </div>
          </form>
        </div>
      ) : null}

      {vehicleModal ? (
        <div className="modal-overlay">
          <form className="modal small" onSubmit={saveVehicle}>
            <div className="modal-header">
              <strong>{vehicleModal.item ? "Sửa xe" : "Thêm xe mới"}</strong>
              <button type="button" className="close-btn" onClick={() => setVehicleModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-field">Biển kiểm soát<input required value={vehicleForm.plateNumber || ""} onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value.toUpperCase() })} /></label>
              <label className="form-field">Tải trọng<input value={vehicleForm.loadCapacity || ""} onChange={(e) => setVehicleForm({ ...vehicleForm, loadCapacity: e.target.value })} placeholder="10T" /></label>
              <label className="form-field">Dài<input value={vehicleForm.length || ""} onChange={(e) => setVehicleForm({ ...vehicleForm, length: e.target.value })} placeholder="9,9" /></label>
              <label className="form-field">Rộng<input value={vehicleForm.width || ""} onChange={(e) => setVehicleForm({ ...vehicleForm, width: e.target.value })} placeholder="2,45" /></label>
              <label className="form-field">Cao<input value={vehicleForm.height || ""} onChange={(e) => setVehicleForm({ ...vehicleForm, height: e.target.value })} placeholder="2,51" /></label>
              <label className="form-field">Số cửa<input value={vehicleForm.doorCount || ""} onChange={(e) => setVehicleForm({ ...vehicleForm, doorCount: e.target.value })} /></label>
              <label className="form-field">Định mức dầu (lít/100km)<input value={vehicleForm.fuelNorm || ""} onChange={(e) => setVehicleForm({ ...vehicleForm, fuelNorm: e.target.value })} placeholder="11.5" /></label>
              <label className="form-field span2">SĐKX<input value={vehicleForm.registrationNumber || ""} onChange={(e) => setVehicleForm({ ...vehicleForm, registrationNumber: e.target.value })} /></label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setVehicleModal(null)}>Hủy</button>
              <button type="submit" className="btn btn-primary">Lưu</button>
            </div>
          </form>
        </div>
      ) : null}

      {driverModal ? (
        <div className="modal-overlay">
          <form className="modal" onSubmit={saveDriver}>
            <div className="modal-header">
              <strong>{driverModal.mode === "detail" ? "Chi tiết tài xế" : driverModal.item ? "Sửa tài xế" : "Thêm tài xế mới"}</strong>
              <button type="button" className="close-btn" onClick={() => setDriverModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-field">Họ và tên<input required readOnly={driverModal.mode === "detail"} value={driverForm.name || ""} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} /></label>
              <label className="form-field">Mã nhân viên<input required readOnly={driverModal.mode === "detail"} value={driverForm.employeeCode || ""} onChange={(e) => setDriverForm({ ...driverForm, employeeCode: e.target.value.toUpperCase() })} /></label>
              <label className="form-field">Chức vụ<input readOnly={driverModal.mode === "detail"} value={driverForm.position || ""} onChange={(e) => setDriverForm({ ...driverForm, position: e.target.value })} /></label>
              <label className="form-field">Loại bằng<input readOnly={driverModal.mode === "detail"} value={driverForm.licenseType || ""} onChange={(e) => setDriverForm({ ...driverForm, licenseType: e.target.value.toUpperCase() })} /></label>
              <label className="form-field">Ngày sinh<input readOnly={driverModal.mode === "detail"} value={driverForm.dateOfBirth || ""} onChange={(e) => setDriverForm({ ...driverForm, dateOfBirth: e.target.value })} placeholder="dd/mm/yyyy" /></label>
              <label className="form-field">Số CCCD<input readOnly={driverModal.mode === "detail"} value={driverForm.identityNumber || ""} onChange={(e) => setDriverForm({ ...driverForm, identityNumber: e.target.value })} /></label>
              <label className="form-field">Số điện thoại<input readOnly={driverModal.mode === "detail"} value={driverForm.phone || ""} onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })} /></label>
              <label className="form-field">Địa chỉ<input readOnly={driverModal.mode === "detail"} value={driverForm.address || ""} onChange={(e) => setDriverForm({ ...driverForm, address: e.target.value })} /></label>
              <label className="form-field">Ngày bắt đầu HĐ<input readOnly={driverModal.mode === "detail"} value={driverForm.contractStart || ""} onChange={(e) => setDriverForm({ ...driverForm, contractStart: e.target.value })} placeholder="dd/mm/yyyy" /></label>
              <label className="form-field">Ngày kết thúc HĐ<input readOnly={driverModal.mode === "detail"} value={driverForm.contractEnd || ""} onChange={(e) => setDriverForm({ ...driverForm, contractEnd: e.target.value })} placeholder="dd/mm/yyyy" /></label>
              <label className="form-field">Giảm trừ gia cảnh<input readOnly={driverModal.mode === "detail"} value={driverForm.familyDeduction || ""} onChange={(e) => setDriverForm({ ...driverForm, familyDeduction: e.target.value })} /></label>
              <label className="form-field">Số TK ngân hàng<input readOnly={driverModal.mode === "detail"} value={driverForm.bankAccount || ""} onChange={(e) => setDriverForm({ ...driverForm, bankAccount: e.target.value })} /></label>
              <label className="form-field span2">Ngân hàng<input readOnly={driverModal.mode === "detail"} value={driverForm.bankName || ""} onChange={(e) => setDriverForm({ ...driverForm, bankName: e.target.value })} /></label>
              <label className="form-field checkbox-field">Hồ sơ xin việc<input disabled={driverModal.mode === "detail"} type="checkbox" checked={Boolean(driverForm.applicationFileOnHand)} onChange={(e) => setDriverForm({ ...driverForm, applicationFileOnHand: e.target.checked })} /></label>
              <label className="form-field checkbox-field">HĐ bản cứng<input disabled={driverModal.mode === "detail"} type="checkbox" checked={Boolean(driverForm.hardCopyContractOnHand)} onChange={(e) => setDriverForm({ ...driverForm, hardCopyContractOnHand: e.target.checked })} /></label>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setDriverModal(null)}>{driverModal.mode === "detail" ? "Đóng" : "Hủy"}</button>
              {driverModal.mode !== "detail" ? <button type="submit" className="btn btn-primary">Lưu</button> : null}
            </div>
          </form>
        </div>
      ) : null}

      {catalogModal ? (
        <div className="modal-overlay">
          <form className="modal small" onSubmit={saveCatalog}>
            <div className="modal-header"><strong>{catalogModal.type === "customers" ? "Khách hàng" : "Đơn vị vận tải"}</strong><button type="button" className="close-btn" onClick={() => setCatalogModal(null)}>×</button></div>
            <div className="modal-body">
              <label className="form-field">Mã<input required value={catalogForm.code} onChange={(e) => setCatalogForm({ ...catalogForm, code: e.target.value.toUpperCase() })} /></label>
              <label className="form-field">Tên công ty<input required value={catalogForm.name} onChange={(e) => setCatalogForm({ ...catalogForm, name: e.target.value })} /></label>
              <label className="form-field">Người liên hệ<input value={catalogForm.contact} onChange={(e) => setCatalogForm({ ...catalogForm, contact: e.target.value })} /></label>
              <label className="form-field">Điện thoại<input value={catalogForm.phone} onChange={(e) => setCatalogForm({ ...catalogForm, phone: e.target.value })} /></label>
              <label className="form-field span2">Email<input type="email" value={catalogForm.email} onChange={(e) => setCatalogForm({ ...catalogForm, email: e.target.value })} /></label>
            </div>
            <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={() => setCatalogModal(null)}>Hủy</button><button type="submit" className="btn btn-primary">Lưu</button></div>
          </form>
        </div>
      ) : null}

      {locationModal ? (
        <div className="modal-overlay">
          <form className="modal small" onSubmit={saveLocation}>
            <div className="modal-header"><strong>Mã địa điểm</strong><button type="button" className="close-btn" onClick={() => setLocationModal(null)}>×</button></div>
            <div className="modal-body">
              <label className="form-field">Tên nhà máy (kho)<input required value={locationForm.name} onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })} /></label>
              <label className="form-field">Mã địa điểm<input required value={locationForm.code} onChange={(e) => setLocationForm({ ...locationForm, code: e.target.value.toUpperCase() })} /></label>
              <label className="form-field span2">Địa chỉ<input value={locationForm.address} onChange={(e) => setLocationForm({ ...locationForm, address: e.target.value })} /></label>
              <label className="form-field">Vĩ độ (Lat)<input type="number" step="0.000001" value={locationForm.lat} onChange={(e) => setLocationForm({ ...locationForm, lat: e.target.value })} /></label>
              <label className="form-field">Kinh độ (Lng)<input type="number" step="0.000001" value={locationForm.lng} onChange={(e) => setLocationForm({ ...locationForm, lng: e.target.value })} /></label>
              <label className="form-field span2">Bán kính vùng map (m)<input type="number" min="50" step="10" value={locationForm.radiusM} onChange={(e) => setLocationForm({ ...locationForm, radiusM: e.target.value })} /></label>
            </div>
            <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={() => setLocationModal(null)}>Hủy</button><button type="submit" className="btn btn-primary">Lưu</button></div>
          </form>
        </div>
      ) : null}

      {routeModal ? (
        <div className="modal-overlay">
          <form className="modal" onSubmit={saveRoute}>
            <div className="modal-header"><strong>Tuyến đường theo khách hàng</strong><button type="button" className="close-btn" onClick={() => setRouteModal(null)}>×</button></div>
            <div className="modal-body">
              <label className="form-field">Khách hàng<select value={routeForm.customerCode} onChange={(e) => setRouteForm({ ...routeForm, customerCode: e.target.value })}>{master.customers.map((item) => <option value={item.code} key={item.code}>{item.code} - {item.name}</option>)}</select></label>
              <label className="form-field">Loại<select value={routeForm.type} onChange={(e) => setRouteForm({ ...routeForm, type: e.target.value })}><option value="export">export</option><option value="import">import</option><option value="domestic">domestic</option></select></label>
              <label className="form-field">Điểm 1<input required list="location-options" value={routeForm.from} onChange={(e) => setRouteForm({ ...routeForm, from: e.target.value })} placeholder="Chọn mã địa điểm" /></label>
              <label className="form-field">Điểm 2<input required list="location-options" value={routeForm.to} onChange={(e) => setRouteForm({ ...routeForm, to: e.target.value })} placeholder="Chọn mã địa điểm" /></label>
              <label className="form-field">Điểm 3<input list="location-options" value={routeForm.via} onChange={(e) => setRouteForm({ ...routeForm, via: e.target.value })} placeholder="Chọn mã địa điểm nếu có" /></label>
              <label className="form-field">Km<input type="number" step="0.1" value={routeForm.km} onChange={(e) => setRouteForm({ ...routeForm, km: e.target.value })} /></label>
              <label className="form-field">Mã tuyến<input required readOnly value={generatedRouteCode || routeForm.routeCode} /></label>
              <datalist id="location-options">{master.locations.map((item) => <option value={item.name} key={item.id}>{item.code}</option>)}</datalist>
            </div>
            <div className="modal-footer"><button type="button" className="btn btn-outline" onClick={() => setRouteModal(null)}>Hủy</button><button type="submit" className="btn btn-primary">Lưu</button></div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

const driverMatch = window.location.pathname.match(/^\/driver\/([^/]+)/);
const appRootElement = document.getElementById("root");
globalThis.__webNpRoot ||= createRoot(appRootElement);
globalThis.__webNpRoot.render(
  driverMatch ? <DriverTripPage orderCode={decodeURIComponent(driverMatch[1])} /> : <App />,
);
