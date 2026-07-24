import mysql from "mysql2/promise";
import fs from "fs";

export const WEBLOG_RATE_COLUMNS = [
  "gia_1_25t",
  "gia_2_5t",
  "gia_3_5t",
  "gia_5t",
  "gia_8t",
  "gia_10t",
  "gia_15t",
  "gia_20t",
  "gia_cont_20",
  "gia_cont_40",
  "gia_cont_45",
];

export function mapWeblogDriverData(rows = {}) {
  return {
    driverAttendance: (rows.driverAttendance || []).map((row) => ({
      id: row.id,
      driverName: row.ten_lai_xe || "",
      leaveDate: row.ngay_xin_nghi || "",
      reason: row.ly_do || "",
      note: row.ghi_chu || "",
      createdAt: row.ngay_tao || "",
    })),
    transportFees: (rows.transportFees || []).map((row) => ({
      id: row.id,
      content: row.noi_dung || "",
      ...Object.fromEntries(WEBLOG_RATE_COLUMNS.map((key) => [key, row[key] ?? ""])),
      createdAt: row.ngay_tao || "",
    })),
    fuelFees: (rows.fuelFees || []).map((row) => ({
      id: row.id,
      content: row.noi_dung || "",
      dateFrom: row.tu_ngay || "",
      dateTo: row.den_ngay || "",
      percent: row.phan_tram_phu_phi ?? "",
      createdAt: row.ngay_tao || "",
    })),
    salaryConfig: (rows.salaryConfig || []).map((row) => ({
      id: row.id,
      baseSalary: row.luong_co_ban ?? "",
      mealAllowance: row.phu_cap_an_uong ?? "",
      phoneAllowance: row.phu_cap_dien_thoai ?? "",
      kpiUnder5Km: row.kpi_duoi_5km ?? "",
      kpiUnder60Km: row.kpi_duoi_60km ?? "",
      kpi60To80Km: row.kpi_60_80km ?? "",
      kpi80To100Km: row.kpi_80_100km ?? "",
      kpi100To150Km: row.kpi_100_150km ?? "",
      loadingBonus: row.thuong_boc_xep ?? "",
      overnightBonus: row.thuong_luu_dem ?? "",
      overtimeDayBonus: row.thuong_vuot_cong ?? "",
      bonus65Trips: row.thuong_65_chuyen ?? "",
      bonus75Trips: row.thuong_75_chuyen ?? "",
      bonus85Trips: row.thuong_85_chuyen ?? "",
      bonus90Trips: row.thuong_90_chuyen ?? "",
      socialInsuranceEmployee: row.bhxh_nv ?? "",
      healthInsuranceEmployee: row.bhyt_nv ?? "",
      unemploymentInsuranceEmployee: row.bhtn_nv ?? "",
      socialInsuranceCompany: row.bhxh_cty ?? "",
      healthInsuranceCompany: row.bhyt_cty ?? "",
      unemploymentInsuranceCompany: row.bhtn_cty ?? "",
      personalDeduction: row.giam_tru_ban_than ?? "",
      dependentDeduction: row.giam_tru_phu_thuoc ?? "",
      updatedAt: row.ngay_cap_nhat || "",
    })),
  };
}

function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

export function weblogDbConfigFromEnv(env = process.env) {
  const weblogEnv = parseEnvFile(env.WEBLOG_ENV_PATH || "D:\\Cosodulieu\\weblog\\.env");
  return {
    host: env.WEBLOG_DB_HOST || weblogEnv.DB_HOST || env.DB_HOST || env.MYSQL_HOST || "127.0.0.1",
    port: Number(env.WEBLOG_DB_PORT || weblogEnv.DB_PORT || env.DB_PORT || env.MYSQL_PORT || 3306),
    user: env.WEBLOG_DB_USER || weblogEnv.DB_USER || env.DB_USER || env.MYSQL_USER || "root",
    password: env.WEBLOG_DB_PASSWORD || weblogEnv.DB_PASSWORD || env.DB_PASSWORD || env.MYSQL_PASSWORD || "",
    database: env.WEBLOG_DB_NAME || weblogEnv.DB_NAME || "nam_phong_logistics",
    waitForConnections: true,
    connectionLimit: 3,
    dateStrings: true,
  };
}

export async function loadWeblogDriverData(config = weblogDbConfigFromEnv()) {
  const pool = mysql.createPool(config);
  try {
    const [driverAttendance] = await pool.query(`
      SELECT id, ten_lai_xe, ngay_xin_nghi, ly_do, ghi_chu, ngay_tao
        FROM cham_cong_lai_xe
       ORDER BY ngay_xin_nghi DESC, id DESC
    `);
    const [transportFees] = await pool.query(`
      SELECT id, noi_dung, gia_1_25t, gia_2_5t, gia_3_5t, gia_5t, gia_8t,
             gia_10t, gia_15t, gia_20t, gia_cont_20, gia_cont_40, gia_cont_45, ngay_tao
        FROM phu_phi_van_chuyen
       ORDER BY id
    `);
    const [fuelFees] = await pool.query(`
      SELECT id, noi_dung, tu_ngay, den_ngay, phan_tram_phu_phi, ngay_tao
        FROM phu_phi_xang_dau
       ORDER BY tu_ngay ASC, den_ngay ASC, id ASC
    `);
    const [salaryConfig] = await pool.query(`
      SELECT *
        FROM cau_hinh_luong
       ORDER BY id DESC
       LIMIT 1
    `);
    return mapWeblogDriverData({ driverAttendance, transportFees, fuelFees, salaryConfig });
  } finally {
    await pool.end();
  }
}
