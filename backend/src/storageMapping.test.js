import test from "node:test";
import assert from "node:assert/strict";
import { databaseRowsToStore, storeToDatabaseRows } from "./storageMapping.js";

test("storeToDatabaseRows splits business store into normalized row groups", () => {
  const rows = storeToDatabaseRows({
    customers: [{ id: 1, code: "DHL", name: "DHL Global", contact: "A", phone: "1", email: "a@example.com" }],
    partners: [{ id: 2, code: "DH", name: "Dai Huy", contact: "B", phone: "2", email: "b@example.com" }],
    locations: [{ id: 3, code: "ALSE", name: "ALSE", address: "VSIP", lat: 21.1, lng: 105.9, radiusM: 500 }],
    routes: [{ id: 4, customerCode: "DHL", routeCode: "ALSE - NBA", from: "ALSE", to: "Noi Bai", via: "", km: 45, type: "export" }],
    trips: [
      {
        id: 5,
        orderCode: "260616001",
        orderType: "export",
        customerCode: "DHL",
        routeCode: "ALSE - NBA",
        partnerCode: "DH",
        requiredArrivalAt: "2026-06-16T08:00:00.000Z",
        plateNumber: "29H-123.45",
        driverName: "Driver",
        driverPhone: "090",
        cargoWeight: "1.2T",
        vehicleType: "Thuong",
        status: "plan",
        statusLabel: "Plan",
        estimatedCost: 100,
        note: "n",
        waybills: [{ hawb: "H1", mawb: "M1", packageCount: "2", grossWeight: "3.5" }],
        handlingFeeSide: "Dau nhan",
        handlingFeeAmount: "10",
        otherFees: [{ description: "Cho", amount: "20" }],
      },
    ],
    customerDeliveries: [{ id: 6, customerCode: "DHL", plateNumber: "99H" }],
    gateLogs: [{ id: 7, plateNumber: "99H", registeredAt: "2026-06-16T08:00:00.000Z" }],
    costs: [{ id: 8, tripId: 5, orderCode: "260616001", type: "Phu phi", amount: 20, description: "Cho", status: "Can duyet" }],
    tripStopEvents: [{ id: 9, tripId: 5, orderCode: "260616001", stopNo: 1, stopName: "ALSE", eventType: "arrival", eventTime: "2026-06-16T08:00:00.000Z" }],
    gpsVehiclesByPlate: { "29H12345": { plateNumber: "29H-123.45" } },
    gpsVehicleStates: { "29H12345": { inside: true } },
    gpsEvents: [{ id: "e1" }],
    gpsConfig: { provider: "gotrack" },
    accountAdmin: { users: [{ username: "admin" }], permissions: { viewTrips: { admin: true } } },
    auditLogs: [{ id: 1, actor: "admin", action: "CREATE", module: "transport" }],
    reportTemplates: [{ id: "r1", name: "Bao cao" }],
  });

  assert.equal(rows.customers[0].code, "DHL");
  assert.equal(rows.transportPartners[0].code, "DH");
  assert.equal(rows.routes[0].customerCode, "DHL");
  assert.equal(rows.trips[0].routeCode, "ALSE - NBA");
  assert.equal(rows.tripWaybills[0].hawb, "H1");
  assert.equal(rows.tripCosts.length, 3);
  assert.equal(rows.appSettings.find((row) => row.settingKey === "gps_config").data.provider, "gotrack");
  assert.equal(rows.appSettings.find((row) => row.settingKey === "audit_logs").data[0].actor, "admin");
  assert.equal(rows.reportTemplates[0].name, "Bao cao");
});

test("databaseRowsToStore restores API-shaped store from normalized rows", () => {
  const store = databaseRowsToStore({
    customers: [{ id: 1, code: "DHL", name: "DHL Global", contact: "", phone: "", email: "" }],
    transportPartners: [{ id: 2, code: "DH", name: "Dai Huy", contact: "", phone: "", email: "" }],
    locations: [{ id: 3, code: "ALSE", name: "ALSE", address: "VSIP", lat: 21.1, lng: 105.9, radiusM: 500 }],
    routes: [{ id: 4, customerCode: "DHL", routeCode: "ALSE - NBA", from: "ALSE", to: "Noi Bai", via: "", km: 45, type: "export" }],
    transportRates: [{ id: 10, customer: "DHL", route: "ALSE - NBA", km: "45", rate_7: "770000", status: "active" }],
    trips: [{ id: 5, orderCode: "260616001", customerCode: "DHL", routeCode: "ALSE - NBA", partnerCode: "DH", requiredArrivalAt: "2026-06-16T08:00:00.000Z", status: "plan" }],
    tripWaybills: [{ tripId: 5, lineNo: 1, hawb: "H1", mawb: "M1", packageCount: "2", grossWeight: "3.5" }],
    tripCosts: [
      { id: 1, tripId: 5, orderCode: "260616001", type: "handling", amount: "10", description: "Dau nhan", status: "recorded" },
      { id: 2, tripId: 5, orderCode: "260616001", type: "other", amount: "20", description: "Cho", status: "recorded" },
    ],
    customerDeliveries: [{ id: 6, data: { id: 6, customerCode: "DHL" } }],
    gateLogs: [{ id: 7, data: { id: 7, plateNumber: "99H" } }],
    tripStopEvents: [{ id: 9, tripId: 5, orderCode: "260616001", stopNo: 1, stopName: "ALSE", eventType: "arrival", eventTime: "2026-06-16T08:00:00.000Z" }],
    appSettings: [
      { settingKey: "gps_config", data: { provider: "gotrack" } },
      { settingKey: "account_admin", data: { users: [{ username: "admin" }], permissions: {} } },
      { settingKey: "audit_logs", data: [{ id: 1, actor: "admin", action: "CREATE", module: "transport" }] },
    ],
    reportTemplates: [{ id: "r1", name: "Bao cao", data: { id: "r1", name: "Bao cao", columns: {} } }],
  });

  assert.equal(store.customers[0].code, "DHL");
  assert.equal(store.partners[0].code, "DH");
  assert.equal(store.routes[0].customerCode, "DHL");
  assert.equal(store.transportRates[0].rate7, "770000");
  assert.deepEqual(store.trips[0].waybills, [{ hawb: "H1", mawb: "M1", packageCount: "2", grossWeight: "3.5" }]);
  assert.equal(store.trips[0].handlingFeeAmount, "10");
  assert.deepEqual(store.trips[0].otherFees, [{ description: "Cho", amount: "20" }]);
  assert.equal(store.gpsConfig.provider, "gotrack");
  assert.equal(store.accountAdmin.users[0].username, "admin");
  assert.equal(store.auditLogs[0].module, "transport");
  assert.equal(store.reportTemplates[0].name, "Bao cao");
});

test("databaseRowsToStore restores driver document checklist fields", () => {
  const store = databaseRowsToStore({
    drivers: [
      {
        id: 1,
        full_name: "Nguyen Van A",
        employee_code: "LX001",
        application_file_on_hand: 1,
        hard_copy_contract_on_hand: 0,
      },
    ],
  });

  assert.equal(store.drivers[0].applicationFileOnHand, true);
  assert.equal(store.drivers[0].hardCopyContractOnHand, false);
});

test("storeToDatabaseRows removes duplicate customer route codes before saving", () => {
  const rows = storeToDatabaseRows({
    routes: [
      { id: 8, customerCode: "ALSE", routeCode: "NBA - VSIP", from: "Noi Bai", to: "ALSE", via: "", km: null, type: "import" },
      { id: 9, customerCode: "ALSE", routeCode: "NBA - VSIP", from: "Noi Bai", to: "ALSE", via: "", km: null, type: "import" },
    ],
  });

  assert.equal(rows.routes.length, 1);
  assert.equal(rows.routes[0].id, 8);
});

test("storeToDatabaseRows keeps the latest duplicate transport rate before saving", () => {
  const rows = storeToDatabaseRows({
    transportRates: [
      { id: 1, customer: "NP", route: "NOI BAI - VSIP BAC NINH", km: "45", rate10: "1450000" },
      { id: 2, customer: " np ", route: " noi bai - vsip bac ninh ", km: "45", rate10: "1500000" },
    ],
  });

  assert.equal(rows.transportRates.length, 1);
  assert.equal(rows.transportRates[0].id, 2);
  assert.equal(rows.transportRates[0].rate10, "1500000");
});

test("databaseRowsToStore restores fuel surcharge rows", () => {
  const store = databaseRowsToStore({
    fuelSurcharges: [
      {
        id: 1,
        content: "Phu phi thang 7",
        date_from: "2026-07-01",
        date_to: "2026-07-31",
        percent: "8.5",
        note: "Ap dung noi dia",
      },
    ],
  });

  assert.deepEqual(store.fuelSurcharges, [
    {
      id: 1,
      content: "Phu phi thang 7",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      percent: "8.5",
      note: "Ap dung noi dia",
    },
  ]);
});
