import test from "node:test";
import assert from "node:assert/strict";
import { mapWeblogDriverData, weblogDbConfigFromEnv } from "./weblogDriverData.js";

test("mapWeblogDriverData maps weblog driver tables to WebNP view models", () => {
  const data = mapWeblogDriverData({
    driverAttendance: [{ id: 1, ten_lai_xe: "Nguyen Van A", ngay_xin_nghi: "2026-06-01", ly_do: "Nghi phep", ghi_chu: "OK" }],
    transportFees: [{ id: 2, noi_dung: "Boc xep", gia_1_25t: "100000", gia_cont_45: "450000" }],
    fuelFees: [{ id: 3, noi_dung: "Thang 6", tu_ngay: "2026-06-01", den_ngay: "2026-06-30", phan_tram_phu_phi: "8.5" }],
    salaryConfig: [{ id: 4, luong_co_ban: "5000000", phu_cap_an_uong: "600000", bhxh_nv: "8.00", giam_tru_ban_than: "15500000" }],
  });

  assert.equal(data.driverAttendance[0].driverName, "Nguyen Van A");
  assert.equal(data.transportFees[0].gia_1_25t, "100000");
  assert.equal(data.transportFees[0].gia_cont_45, "450000");
  assert.equal(data.fuelFees[0].percent, "8.5");
  assert.equal(data.salaryConfig[0].baseSalary, "5000000");
  assert.equal(data.salaryConfig[0].socialInsuranceEmployee, "8.00");
  assert.equal(data.salaryConfig[0].personalDeduction, "15500000");
});

test("weblogDbConfigFromEnv prefers WEBLOG database variables", () => {
  const config = weblogDbConfigFromEnv({
    DB_HOST: "main-host",
    DB_USER: "main-user",
    WEBLOG_DB_HOST: "weblog-host",
    WEBLOG_DB_USER: "weblog-user",
    WEBLOG_DB_PASSWORD: "secret",
    WEBLOG_DB_NAME: "nam_phong_logistics",
  });

  assert.equal(config.host, "weblog-host");
  assert.equal(config.user, "weblog-user");
  assert.equal(config.password, "secret");
  assert.equal(config.database, "nam_phong_logistics");
});
