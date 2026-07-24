import express from "express";
import cors from "cors";
import morgan from "morgan";
import jwt from "jsonwebtoken";
import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { ensureCoreLoginUsers, normalizeAccountPasswords, verifyPassword } from "./accountAdmin.js";
import { ensureBusinessSchema, loadStoreFromDatabase, saveStoreToDatabase } from "./mysqlStore.js";
import { paginateTrips, saveTripsDirectly, shouldPersistWholeStore } from "./tripStore.js";
import { shouldRejectRequestWithoutDatabase } from "./storageGuard.js";
import { upsertTransportRate } from "./transportRates.js";
import { buildCompletedTripPayload, shouldSyncCompletedTripDriver, shouldSyncCompletedTripVehicle } from "./completedTripRows.js";
import {
  CARGO_WEIGHT_OPTIONS,
  applyDriverStopEvent,
  buildGateLog,
  createAuditFields,
  buildDriverTripView,
  deriveTripStatus,
  formatOrderCode,
  gateLogStatus,
  markGateIn,
  markGateOut,
  nextDailyOrderSequence,
  nextId,
  normalizeCargoWeight,
  normalizeTripFees,
  normalizeVehicleType,
  normalizeWaybills,
  shouldSyncUnloadArrivalFromGate,
  sortTripsForBoard,
  TRIP_STATUS_FLOW,
  TRIP_STATUS_LABELS,
  localMysqlDateTime,
} from "./domain.js";
import {
  applyGpsPointToTrips,
  gpsDashboard,
  normalizeGpsVehicle,
  normalizePlate,
  normalizeText,
  removeGpsPlateData,
  removeGpsProviderData,
} from "./gpsGeofence.js";
import { loadWeblogDriverData } from "./weblogDriverData.js";
import { ensureTripRoute, tripRouteFields } from "./tripRoutes.js";

const PORT = Number(process.env.PORT || 4100);
const JWT_SECRET = process.env.JWT_SECRET || "change_this_to_a_random_secret_string";
const JWT_EXPIRES_IN = "24h";
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:5174,http://127.0.0.1:5174")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DB_NAME = process.env.DB_NAME || process.env.MYSQL_DATABASE || "nam_phong_logistics";
const DB_CONFIG = {
  host: process.env.DB_HOST || process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
  user: process.env.DB_USER || process.env.MYSQL_USER || "",
  password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || "",
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
};
const SHOULD_USE_MYSQL =
  process.env.USE_MYSQL === "1" || Boolean(process.env.MYSQL_URL || process.env.DB_USER || process.env.MYSQL_USER);

let dbPool = null;
let fallbackOperationsCache = null;

let store = {
  loadedAt: null,
  source: "memory",
  customers: [],
  partners: [],
  routes: [],
  locations: [],
  trips: [],
  customerDeliveries: [],
  gateLogs: [],
  tripStopEvents: [],
  gpsVehiclesByPlate: {},
  gpsVehicleStates: {},
  gpsEvents: [],
  gpsConfig: {},
  costs: [],
  accountAdmin: null,
  auditLogs: [],
  reportTemplates: [],
  vehicles: [],
  drivers: [],
  fuelLogs: [],
  salaryRates: [],
  transportRates: [],
  fuelSurcharges: [],
  salaryAdvances: [],
  standardFuelPrices: [],
  driverAttendance: [],
};

function defaultAccountAdmin() {
  return {
    users: [
      { id: 1, username: "admin", password: process.env.DEFAULT_ADMIN_PASSWORD || "Admin@2024!", name: "Admin", role: "admin", status: "active" },
      { id: 2, username: "ops", password: process.env.DEFAULT_OPS_PASSWORD || "Ops@2024!", name: "Operations", role: "operator", status: "active" },
    ],
  };
}

function defaultVehicleCatalog() {
  return fallbackOperationsData().vehicles || [];
}

function defaultDriverCatalog() {
  return fallbackOperationsData().drivers || [];
}

function defaultTransportRateCatalog() {
  return fallbackOperationsData().transportRates || [];
}

function defaultDriverAttendance() {
  return fallbackOperationsData().driverAttendance || [];
}

function ensureDefaultDriverAttendance(storeData = store) {
  storeData.driverAttendance = Array.isArray(storeData.driverAttendance) ? storeData.driverAttendance : [];
}

function fallbackOperationsData() {
  if (fallbackOperationsCache) return fallbackOperationsCache;
  try {
    const file = new URL("../../backup/operations-before-attendance-restart.json", import.meta.url);
    fallbackOperationsCache = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    fallbackOperationsCache = {};
  }
  return fallbackOperationsCache;
}

function defaultOperationsData() {
  const fallback = fallbackOperationsData();
  return {
    vehicles: defaultVehicleCatalog(),
    drivers: defaultDriverCatalog(),
    fuelLogs: [],
    salaryRates: fallback.salaryRates || [],
    transportRates: defaultTransportRateCatalog(),
    fuelSurcharges: fallback.fuelSurcharges || [],
    salaryAdvances: fallback.salaryAdvances || [],
    standardFuelPrices: fallback.standardFuelPrices || [],
    driverAttendance: defaultDriverAttendance(),
  };
}

function routeType(routeCode) {
  const upper = routeCode.toUpperCase();
  if (upper.includes("Ná»˜I BÃ€I")) return "export";
  if (upper.includes("CHUYá»‚N KHO")) return "domestic";
  return "import";
}

function normalizeRouteText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function routeStops(route, trip) {
  const codeStops = String(trip.routeCode || route?.routeCode || "")
    .split("-")
    .map((item) => item.trim())
    .filter(Boolean);
  if (codeStops.length >= 2) return codeStops;
  const explicitStops = [route?.from || trip.from, route?.to || trip.to, route?.via || trip.via].filter(Boolean);
  if (explicitStops.length >= 2) return explicitStops;
  return [];
}

function isNbaStop(value) {
  return value.includes("NBA") || value.includes("NOI BAI");
}

function isVsipStop(value) {
  return value.includes("VSIP") || value.includes("ALSE");
}

function isOpenVsipNbaTrip(trip) {
  if (trip.status === "completed") return false;
  const route = store.routes.find((item) => item.routeCode === trip.routeCode && item.customerCode === trip.customerCode);
  const stops = routeStops(route, trip).map(normalizeRouteText);
  const vsipIndex = stops.findIndex((stop, index) => isVsipStop(stop) && isNbaStop(stops[index + 1] || ""));
  if (vsipIndex === -1) return false;
  return vsipIndex === 0 ? !trip.point1DepartAt : !trip.point2DepartAt;
}

function locationCodeFromName(name, index) {
  const prefix = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 4)
    .toUpperCase();
  return `${prefix || "LOC"}${String(index + 1).padStart(3, "0")}`;
}

function seedLocations(routes) {
  const seen = new Set();
  const names = [];
  routes.forEach((route) => {
    [route.from, route.to, route.via].forEach((name) => {
      const clean = String(name || "").trim();
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) return;
      seen.add(key);
      names.push(clean);
    });
  });
  return names.map((name, index) => ({
    id: index + 1,
    name,
    address: "",
    code: locationCodeFromName(name, index),
    lat: null,
    lng: null,
    radiusM: 500,
  }));
}

function fallbackData() {
  const customers = [
    { id: 1, name: "DHL Global", code: "DHL", contact: "", phone: "", email: "" },
    { id: 2, name: "Kuehne Nagel", code: "KN", contact: "", phone: "", email: "" },
    { id: 3, name: "Expeditor", code: "EI", contact: "", phone: "", email: "" },
  ];
  const partners = [
    { id: 1, name: "Cong ty TNHH Van tai Dai Huy", code: "DH", contact: "", phone: "", email: "" },
    { id: 2, name: "Cong ty TNHH ACE", code: "ACE", contact: "", phone: "", email: "" },
    { id: 3, name: "Cong ty TNHH Duong Anh", code: "DA", contact: "", phone: "", email: "" },
  ];
  const locations = [
    { id: 1, name: "Compal", address: "KCN Ba Thien, Vinh Phuc", code: "VP", lat: 21.212137, lng: 105.808189, radiusM: 900 },
    { id: 2, name: "Jusda", address: "KCN Que Vo, Bac Ninh", code: "QV3", lat: 21.156443, lng: 106.179482, radiusM: 700 },
    { id: 3, name: "ALSE", address: "KCN VSIP Bac Ninh", code: "ALSE", lat: 21.077013, lng: 105.97963, radiusM: 500 },
    { id: 4, name: "Noi Bai", address: "San bay Noi Bai", code: "NBA", lat: 21.214184, lng: 105.802005, radiusM: 1000 },
  ];
  const routes = [
    { id: 1, customerCode: "DHL", routeCode: "VP - ALSE", from: "Compal", to: "ALSE", via: "", km: 65, type: "import" },
    { id: 2, customerCode: "DHL", routeCode: "QV3 - ALSE", from: "Jusda", to: "ALSE", via: "", km: 22, type: "import" },
    { id: 3, customerCode: "EI", routeCode: "ALSE - NBA", from: "ALSE", to: "Noi Bai", via: "", km: 45, type: "export" },
  ];
  const trips = seedTrips(routes, partners);
  const costs = trips.slice(0, 8).map((trip, index) => ({
    id: index + 1,
    tripId: trip.id,
    orderCode: trip.orderCode,
    type: index % 2 ? "Phu phi" : "Cuoc van tai",
    amount: Math.round(trip.estimatedCost * (index % 2 ? 0.12 : 1)),
    description: index % 2 ? "Cho boc xep / km vuot" : trip.routeCode,
    status: index % 3 === 0 ? "Can duyet" : "Da ghi nhan",
  }));
  return {
    customers,
    partners,
    routes,
    locations,
    trips,
    customerDeliveries: [],
    gateLogs: [],
    tripStopEvents: [],
    costs,
    accountAdmin: defaultAccountAdmin(),
    auditLogs: [],
    reportTemplates: [],
    ...defaultOperationsData(),
  };
}

function deliveryStatus(times = {}) {
  if (times.vsipDepartAt) return { status: "completed", label: "HoÃ n thÃ nh" };
  if (times.vsipArrivalAt) return { status: "arrived_1", label: "ÄÃ£ Ä‘áº¿n VSIP" };
  return { status: "plan", label: "ChÆ°a Ä‘áº¿n" };
}

function seedTrips(routes, partners) {
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const plates = ["29H-123.45", "99C-246.80", "30H-567.89", "98C-112.23", "29C-778.90"];
  const drivers = ["Nguyá»…n VÄƒn Minh", "Tráº§n Äá»©c Anh", "LÃª HoÃ ng Nam", "Pháº¡m Quá»‘c Huy", "Äá»— VÄƒn KiÃªn"];
  const driverPhones = ["0912345678", "0987654321", "0904123456", "0978123456", "0966123456"];

  return routes.slice(0, 12).map((route, index) => {
    const partner = partners[index % Math.max(partners.length, 1)];
    const requiredArrivalAt = new Date(`${today}T${String(8 + (index % 9)).padStart(2, "0")}:00:00`);
    const point1ArrivalAt = new Date(requiredArrivalAt);
    const point1DepartAt = new Date(point1ArrivalAt.getTime() + 30 * 60000);
    const point2ArrivalAt = new Date(point1DepartAt.getTime() + Math.max(route.km || 20, 20) * 60000);
    const point2DepartAt = new Date(point2ArrivalAt.getTime() + 30 * 60000);
    const point3ArrivalAt = route.via ? new Date(point2DepartAt.getTime() + 45 * 60000) : null;
    const point3DepartAt = point3ArrivalAt ? new Date(point3ArrivalAt.getTime() + 30 * 60000) : null;
    const demoStep = index % 7;
    const hasThirdPoint = Boolean(route.via);
    const pointTimes = {
      point1ArrivalAt: demoStep >= 1 ? point1ArrivalAt.toISOString() : "",
      point1DepartAt: demoStep >= 2 ? point1DepartAt.toISOString() : "",
      point2ArrivalAt: demoStep >= 3 ? point2ArrivalAt.toISOString() : "",
      point2DepartAt: demoStep >= 4 ? point2DepartAt.toISOString() : "",
      point3ArrivalAt: hasThirdPoint && demoStep >= 5 ? point3ArrivalAt.toISOString() : "",
      point3DepartAt: hasThirdPoint && demoStep >= 6 ? point3DepartAt.toISOString() : "",
    };
    const plannedPlate = demoStep === 0 ? "" : plates[index % plates.length];
    const plannedDriverName = demoStep === 0 ? "" : drivers[index % drivers.length];
    const plannedDriverPhone = demoStep === 0 ? "" : driverPhones[index % driverPhones.length];
    const { status, label: statusLabel } = deriveTripStatus({ ...pointTimes, plateNumber: plannedPlate }, hasThirdPoint);
    const baseCost = route.km ? route.km * 18000 : 850000;
    const waybills = [
      {
        hawb: `HAWB${today.slice(2, 4)}${String(5100 + index)}`,
        mawb: `MAWB${String(88000000 + index * 11)}`,
        packageCount: String(12 + index * 3),
        grossWeight: String(Number((85 + index * 12.5).toFixed(1))),
      },
    ];
    if (index % 4 === 1) {
      waybills.push({
        hawb: `HAWB${today.slice(2, 4)}${String(6100 + index)}`,
        mawb: `MAWB${String(88100000 + index * 11)}`,
        packageCount: String(4 + index),
        grossWeight: String(Number((28 + index * 4.5).toFixed(1))),
      });
    }
    return {
      id: index + 1,
      orderCode: formatOrderCode(todayDate, index + 1),
      orderType: route.type,
      customerCode: route.customerCode,
      routeCode: route.routeCode,
      from: route.from || route.routeCode.split(" - ")[0] || "VSIP Báº¯c Ninh",
      to: route.to || route.routeCode.split(" - ").slice(1).join(" - ") || "Ná»™i BÃ i",
      via: route.via,
      km: route.km,
      requiredArrivalAt: requiredArrivalAt.toISOString(),
      ...pointTimes,
      partnerCode: partner?.code || "DH",
      partnerName: partner?.name || "CÃ´ng ty TNHH Váº­n táº£i Äáº¡i Huy",
      plateNumber: plannedPlate,
      driverName: plannedDriverName,
      driverPhone: plannedDriverPhone,
      cargoDescription: index % 3 === 0 ? "HÃ ng xuáº¥t air" : index % 3 === 1 ? "HÃ ng nháº­p kho" : "Chuyá»ƒn kho ná»™i bá»™",
      cargoWeight: CARGO_WEIGHT_OPTIONS[index % CARGO_WEIGHT_OPTIONS.length],
      vehicleType: index % 5 === 0 ? "Láº¡nh" : index % 7 === 0 ? "BÃ³ng hÆ¡i" : "ThÆ°á»ng",
      doorNumber: `D${(index % 6) + 1}`,
      waybills,
      hawb: waybills[0]?.hawb || "",
      mawb: waybills[0]?.mawb || "",
      packageCount: waybills.reduce((sum, item) => sum + (Number(item.packageCount) || 0), 0),
      grossWeight: Number(waybills.reduce((sum, item) => sum + (Number(item.grossWeight) || 0), 0).toFixed(1)),
      status,
      statusLabel,
      estimatedCost: baseCost,
      note: "",
      updatedAt: new Date().toISOString(),
    };
  });
}

function buildTrip(payload = {}) {
  const id = Number(payload.id) || nextId(store.trips);
  const route = ensureTripRoute(store, payload) || {};
  const partner =
    store.partners.find((item) => item.code === payload.partnerCode) ||
    store.partners.find((item) => String(item.id) === String(payload.partnerId)) ||
    {};
  const plannedDate = payload.plannedDate || new Date().toISOString().slice(0, 10);
  const plannedTime = payload.plannedTime || "08:00";
  const requiredArrivalAt = new Date(`${plannedDate}T${plannedTime}:00`);
  const point1ArrivalAt = payload.point1ArrivalAt ? new Date(payload.point1ArrivalAt) : null;
  const point1DepartAt = payload.point1DepartAt ? new Date(payload.point1DepartAt) : null;
  const sequence = Number(payload.sequence) || nextDailyOrderSequence(store.trips, requiredArrivalAt);
  const pointTimes = {
    point1ArrivalAt: point1ArrivalAt ? point1ArrivalAt.toISOString() : "",
    point1DepartAt: point1DepartAt ? point1DepartAt.toISOString() : "",
    point2ArrivalAt: payload.point2ArrivalAt || "",
    point2DepartAt: payload.point2DepartAt || "",
    point3ArrivalAt: payload.point3ArrivalAt || "",
    point3DepartAt: payload.point3DepartAt || "",
  };
  const plateNumber = String(payload.plateNumber || "").trim().toUpperCase();
  const hasThirdPoint = Boolean(route.via || pointTimes.point3ArrivalAt || pointTimes.point3DepartAt);
  const { status, label: statusLabel } = deriveTripStatus({ ...pointTimes, plateNumber }, hasThirdPoint);
  const waybills = normalizeWaybills(payload);
  const tripFees = normalizeTripFees(payload);
  const routeFields = tripRouteFields(route, payload);
  const packageTotal = waybills.reduce((sum, item) => sum + (Number(item.packageCount) || 0), 0);
  const grossTotal = waybills.reduce((sum, item) => sum + (Number(item.grossWeight) || 0), 0);
  const audit = createAuditFields(payload);

  return {
    id,
    ...audit,
    orderCode: payload.orderCode || formatOrderCode(requiredArrivalAt, sequence),
    ...routeFields,
    requiredArrivalAt: requiredArrivalAt.toISOString(),
    ...pointTimes,
    partnerCode: payload.partnerCode || "",
    partnerName: payload.partnerCode ? partner.name || payload.partnerName || "" : "",
    plateNumber,
    driverName: payload.driverName || "",
    driverPhone: payload.driverPhone || "",
    cargoDescription: payload.cargoDescription || "",
    cargoWeight: normalizeCargoWeight(payload.cargoWeight),
    vehicleType: normalizeVehicleType(payload.vehicleType),
    doorNumber: payload.doorNumber || "",
    waybills,
    ...tripFees,
    hawb: waybills[0]?.hawb || "",
    mawb: waybills[0]?.mawb || "",
    packageCount: packageTotal || "",
    grossWeight: grossTotal ? Number(grossTotal.toFixed(1)) : "",
    shipmentRef: payload.shipmentRef || "",
    status,
    statusLabel,
    estimatedCost: Number(payload.estimatedCost) || ((Number(payload.km || route.km) || 0) * 18000),
    note: payload.note || "",
    updatedAt: new Date().toISOString(),
  };
}

function updateTripFromPayload(trip, payload = {}) {
  const updated = buildTrip({
    ...trip,
    ...payload,
    id: trip.id,
    orderCode: trip.orderCode,
    sequence: Number(trip.orderCode.slice(-3)) || trip.id,
  });
  Object.assign(trip, updated, {
    id: trip.id,
    orderCode: trip.orderCode,
    updatedAt: new Date().toISOString(),
  });
  return trip;
}

function routeParts(routeCode) {
  const parts = String(routeCode || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    from: parts[0] || "",
    to: parts[1] || "",
    via: parts.slice(2).join(" - "),
  };
}

function ensureCompletedTripRoute(row = {}) {
  store.routes = store.routes || [];
  const customerCode = String(row.customerCode || "").trim().toUpperCase();
  const routeCode = String(row.routeCode || row.routeText || "").trim().toUpperCase();
  let route =
    store.routes.find((item) => String(item.id) === String(row.routeId)) ||
    store.routes.find((item) => item.customerCode === customerCode && item.routeCode === routeCode);
  if (route) return route;

  const parts = routeParts(routeCode);
  route = {
    id: nextId(store.routes),
    customerCode,
    routeCode,
    from: row.from || parts.from,
    to: row.to || parts.to,
    via: row.via || parts.via,
    km: Number(row.km) || null,
    type: row.orderType || routeType(routeCode),
  };
  store.routes.push(route);
  return route;
}

function ensureCompletedTripVehicle(row = {}) {
  if (!shouldSyncCompletedTripVehicle(row)) return null;
  const plateNumber = String(row.plateNumber || "").trim().toUpperCase();
  if (!plateNumber) return null;
  store.vehicles = store.vehicles || [];
  let vehicle = store.vehicles.find((item) => String(item.plateNumber || "").trim().toUpperCase() === plateNumber);
  if (vehicle) {
    if (row.cargoWeight && !vehicle.loadCapacity) vehicle.loadCapacity = row.cargoWeight;
    if (row.cargoWeight && !vehicle.type) vehicle.type = row.cargoWeight;
    if (row.driverName && !vehicle.driverName) vehicle.driverName = row.driverName;
    return vehicle;
  }

  vehicle = {
    id: nextId(store.vehicles),
    plateNumber,
    loadCapacity: String(row.cargoWeight || "").trim(),
    type: String(row.cargoWeight || "").trim(),
    owner: "",
    driverName: String(row.driverName || "").trim(),
    status: "San sang",
    route: String(row.routeCode || row.routeText || "").trim().toUpperCase(),
    fuelNorm: "",
    registryDue: "",
  };
  store.vehicles.push(vehicle);
  return vehicle;
}

function ensureCompletedTripDriver(row = {}) {
  if (!shouldSyncCompletedTripDriver(row)) return null;
  const driverName = String(row.driverName || "").trim();
  if (!driverName) return null;
  store.drivers = store.drivers || [];
  let driver = store.drivers.find((item) => String(item.name || "").trim().toLowerCase() === driverName.toLowerCase());
  if (driver) {
    if (row.plateNumber && !driver.vehicle) driver.vehicle = String(row.plateNumber || "").trim().toUpperCase();
    return driver;
  }

  const id = nextId(store.drivers);
  driver = {
    id,
    name: driverName,
    employeeCode: `AUTO${String(id).padStart(4, "0")}`,
    position: "Lai xe",
    licenseType: "",
    license: "",
    dateOfBirth: "",
    identityNumber: "",
    phone: String(row.driverPhone || "").trim(),
    address: "",
    status: "San sang",
    vehicle: String(row.plateNumber || "").trim().toUpperCase(),
    trips: 0,
    safety: "",
  };
  store.drivers.push(driver);
  return driver;
}

function buildCompletedTripFromRow(row = {}, id, sequence) {
  const route = ensureCompletedTripRoute(row);
  ensureCompletedTripVehicle(row);
  ensureCompletedTripDriver(row);
  return buildTrip({
    ...buildCompletedTripPayload(row),
    id,
    sequence,
    routeId: route.id,
    routeCode: route.routeCode,
    orderType: route.type,
  });
}

function buildCustomerDelivery(payload = {}) {
  const id = Number(payload.id) || nextId(store.customerDeliveries);
  const partner =
    store.partners.find((item) => item.code === payload.partnerCode) ||
    store.partners.find((item) => String(item.id) === String(payload.partnerId)) ||
    {};
  const plannedDate = payload.plannedDate || new Date().toISOString().slice(0, 10);
  const plannedTime = payload.plannedTime || "08:00";
  const requiredArrivalAt = new Date(`${plannedDate}T${plannedTime}:00`);
  const waybills = normalizeWaybills(payload);
  const packageTotal = waybills.reduce((sum, item) => sum + (Number(item.packageCount) || 0), 0);
  const grossTotal = waybills.reduce((sum, item) => sum + (Number(item.grossWeight) || 0), 0);
  const times = {
    vsipArrivalAt: payload.vsipArrivalAt || "",
    vsipDepartAt: payload.vsipDepartAt || "",
  };
  const { status, label: statusLabel } = deliveryStatus(times);
  const audit = createAuditFields(payload);

  return {
    id,
    ...audit,
    customerCode: String(payload.customerCode || "").trim().toUpperCase(),
    requiredArrivalAt: requiredArrivalAt.toISOString(),
    ...times,
    partnerCode: String(payload.partnerCode || "").trim().toUpperCase(),
    partnerName: payload.partnerCode ? partner.name || payload.partnerName || "" : "",
    plateNumber: String(payload.plateNumber || "").trim().toUpperCase(),
    driverName: payload.driverName || "",
    driverPhone: payload.driverPhone || "",
    waybills,
    hawb: waybills[0]?.hawb || "",
    mawb: waybills[0]?.mawb || "",
    packageCount: packageTotal || "",
    grossWeight: grossTotal ? Number(grossTotal.toFixed(1)) : "",
    status,
    statusLabel,
    note: payload.note || "",
    updatedAt: new Date().toISOString(),
  };
}

function updateCustomerDeliveryFromPayload(delivery, payload = {}) {
  const updated = buildCustomerDelivery({
    ...delivery,
    ...payload,
    id: delivery.id,
  });
  Object.assign(delivery, updated, {
    id: delivery.id,
    updatedAt: new Date().toISOString(),
  });
  return delivery;
}

function vsipArrivalKeyForTrip(trip) {
  const route = store.routes.find((item) => item.routeCode === trip.routeCode && item.customerCode === trip.customerCode);
  const stops = routeStops(route, trip).map(normalizeRouteText);
  const vsipIndex = stops.findIndex((stop) => isVsipStop(stop));
  return vsipIndex >= 0 ? `point${vsipIndex + 1}ArrivalAt` : "";
}

function isVsipDriverStopEvent(trip, event) {
  if (event.eventType !== "arrival") return false;
  const stops = routeStops(null, trip).map(normalizeRouteText);
  const stopName = normalizeRouteText(event.stopName || stops[Number(event.stopNo) - 1] || "");
  return isVsipStop(stopName);
}

function ensureGateLogForDriverArrival(trip, event) {
  if (!isVsipDriverStopEvent(trip, event) || !trip.plateNumber) return null;
  store.gateLogs = store.gateLogs || [];
  const plateNumber = String(trip.plateNumber || "").trim().toUpperCase();
  const hasOpenLog = store.gateLogs.some((log) => {
    const samePlate = String(log.plateNumber || "").trim().toUpperCase() === plateNumber;
    return samePlate && gateLogStatus(log).status !== "completed";
  });
  if (hasOpenLog) return null;
  const log = buildGateLog(
    {
      source: "transport",
      sourceId: trip.id,
      plateNumber,
      driverName: trip.driverName || "",
      driverPhone: trip.driverPhone || "",
      registeredAt: event.eventTime,
      note: `TÃ i xáº¿ bÃ¡o Ä‘áº¿n VSIP - ${trip.routeCode || trip.orderCode || ""}`.trim(),
    },
    nextId(store.gateLogs),
    new Date(event.eventTime),
  );
  store.gateLogs.unshift(log);
  return log;
}

function syncGateRegistrationToSource(log) {
  if (!log.sourceId || !log.registeredAt) return;
  if (log.source === "delivery") {
    const delivery = (store.customerDeliveries || []).find((item) => item.id === Number(log.sourceId));
    if (!delivery) return;
    delivery.vsipArrivalAt = log.registeredAt;
    if (!delivery.plateNumber && log.plateNumber) delivery.plateNumber = log.plateNumber;
    if (!delivery.driverName && log.driverName) delivery.driverName = log.driverName;
    if (!delivery.driverPhone && log.driverPhone) delivery.driverPhone = log.driverPhone;
    const { status, label: statusLabel } = deliveryStatus(delivery);
    Object.assign(delivery, { status, statusLabel, updatedAt: new Date().toISOString() });
    return;
  }
  if (log.source === "transport") {
    const trip = (store.trips || []).find((item) => item.id === Number(log.sourceId));
    if (!trip) return;
    const arrivalKey = vsipArrivalKeyForTrip(trip);
    if (!arrivalKey) return;
    if (arrivalKey !== "point1ArrivalAt" && !shouldSyncUnloadArrivalFromGate(trip, log.registeredAt)) return;
    trip[arrivalKey] = log.registeredAt;
    if (!trip.plateNumber && log.plateNumber) trip.plateNumber = log.plateNumber;
    if (!trip.driverName && log.driverName) trip.driverName = log.driverName;
    if (!trip.driverPhone && log.driverPhone) trip.driverPhone = log.driverPhone;
    const times = {
      point1ArrivalAt: trip.point1ArrivalAt || "",
      point1DepartAt: trip.point1DepartAt || "",
      point2ArrivalAt: trip.point2ArrivalAt || "",
      point2DepartAt: trip.point2DepartAt || "",
      point3ArrivalAt: trip.point3ArrivalAt || "",
      point3DepartAt: trip.point3DepartAt || "",
      plateNumber: trip.plateNumber || "",
    };
    const hasThirdPoint = Boolean(trip.via || trip.point3ArrivalAt || trip.point3DepartAt);
    const { status, label: statusLabel } = deriveTripStatus(times, hasThirdPoint);
    Object.assign(trip, { status, statusLabel, updatedAt: new Date().toISOString() });
  }
}

function normalizeTripStatuses(storeData = store) {
  for (const trip of storeData.trips || []) {
    const times = {
      point1ArrivalAt: trip.point1ArrivalAt || "",
      point1DepartAt: trip.point1DepartAt || "",
      point2ArrivalAt: trip.point2ArrivalAt || "",
      point2DepartAt: trip.point2DepartAt || "",
      point3ArrivalAt: trip.point3ArrivalAt || "",
      point3DepartAt: trip.point3DepartAt || "",
      plateNumber: trip.plateNumber || "",
    };
    const hasThirdPoint = Boolean(trip.via || trip.point3ArrivalAt || trip.point3DepartAt);
    const { status, label: statusLabel } = deriveTripStatus(times, hasThirdPoint);
    Object.assign(trip, { status, statusLabel });
  }
}

async function loadWorkbookData() {
  store = {
    loadedAt: new Date().toISOString(),
    source: "local",
    ...fallbackData(),
  };
  normalizeTripStatuses(store);
}

function setLocalStore() {
  store = {
    loadedAt: new Date().toISOString(),
    source: "local",
    customers: [],
    partners: [],
    routes: [],
    locations: [],
    trips: [],
    customerDeliveries: [],
    gateLogs: [],
    tripStopEvents: [],
    gpsVehiclesByPlate: {},
    gpsVehicleStates: {},
    gpsEvents: [],
    gpsConfig: {},
    costs: [],
    accountAdmin: defaultAccountAdmin(),
    auditLogs: [],
    driverAttendance: [],
    reportTemplates: [],
    ...fallbackData(),
  };
  normalizeTripStatuses(store);
  ensureDefaultDriverAttendance(store);
}

function storeSnapshot() {
  return {
    customers: store.customers,
    partners: store.partners,
    routes: store.routes,
    locations: store.locations,
    trips: store.trips,
    customerDeliveries: store.customerDeliveries || [],
    gateLogs: store.gateLogs || [],
    tripStopEvents: store.tripStopEvents || [],
    gpsVehiclesByPlate: store.gpsVehiclesByPlate || {},
    gpsVehicleStates: store.gpsVehicleStates || {},
    gpsEvents: store.gpsEvents || [],
    gpsConfig: store.gpsConfig || {},
    costs: store.costs,
    accountAdmin: store.accountAdmin || defaultAccountAdmin(),
    auditLogs: store.auditLogs || [],
    driverAttendance: store.driverAttendance || [],
    reportTemplates: store.reportTemplates || [],
    reportTemplateSelectedId: store.reportTemplateSelectedId || "",
    vehicles: store.vehicles || [],
    drivers: store.drivers || [],
    fuelLogs: store.fuelLogs || [],
    salaryRates: store.salaryRates || [],
    transportRates: store.transportRates || [],
    fuelSurcharges: store.fuelSurcharges || [],
    salaryAdvances: store.salaryAdvances || [],
    standardFuelPrices: store.standardFuelPrices || [],
  };
}

function normalizeLocationPayload(payload = {}, existing = {}) {
  const lat = payload.lat === "" || payload.lat === null || payload.lat === undefined ? null : Number(payload.lat);
  const lng = payload.lng === "" || payload.lng === null || payload.lng === undefined ? null : Number(payload.lng);
  const radiusM = payload.radiusM === "" || payload.radiusM === null || payload.radiusM === undefined
    ? Number(existing.radiusM || existing.radius_m || 500)
    : Number(payload.radiusM);
  return {
    name: String(payload.name || existing.name || "").trim(),
    address: String(payload.address || "").trim(),
    code: String(payload.code || existing.code || "").trim().toUpperCase(),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    radiusM: Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 500,
  };
}

const DEFAULT_LOCATION_COORDINATES = [
  { keys: ["VP", "COMPAL"], lat: 21.212137, lng: 105.808189, radiusM: 900 },
  { keys: ["QV3", "JUSDA"], lat: 21.156443, lng: 106.179482, radiusM: 700 },
  { keys: ["VSIP", "ALSE"], lat: 21.077013, lng: 105.97963, radiusM: 500 },
  { keys: ["NBA", "NOI BAI"], lat: 21.214184, lng: 105.802005, radiusM: 1000 },
];

function enrichLocationsWithDefaultCoordinates(storeData = store) {
  for (const location of storeData.locations || []) {
    if (Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
      location.lat = Number(location.lat);
      location.lng = Number(location.lng);
      location.radiusM = Number(location.radiusM || location.radius_m || 500) || 500;
      continue;
    }
    const text = normalizeRouteText(`${location.code || ""} ${location.name || ""}`);
    const preset = DEFAULT_LOCATION_COORDINATES.find((item) => item.keys.some((key) => text.includes(key)));
    if (!preset) {
      location.lat = null;
      location.lng = null;
      location.radiusM = Number(location.radiusM || location.radius_m || 500) || 500;
      continue;
    }
    Object.assign(location, { lat: preset.lat, lng: preset.lng, radiusM: preset.radiusM });
  }
}

async function ensureDatabase() {
  if (process.env.MYSQL_URL) return;
  const connection = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
  });
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await connection.end();
}

async function connectDatabase() {
  await ensureDatabase();
  dbPool = process.env.MYSQL_URL ? mysql.createPool(process.env.MYSQL_URL) : mysql.createPool(DB_CONFIG);
  await ensureBusinessSchema(dbPool);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      data JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await dbPool.query(`
    CREATE TABLE IF NOT EXISTS trip_stop_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      trip_id BIGINT UNSIGNED NOT NULL,
      order_code VARCHAR(32) NOT NULL,
      stop_no TINYINT UNSIGNED NOT NULL,
      stop_name VARCHAR(255) NOT NULL,
      event_type ENUM('arrival', 'depart') NOT NULL,
      event_time DATETIME NOT NULL,
      source VARCHAR(32) NOT NULL DEFAULT 'driver',
      status ENUM('confirmed', 'draft') NOT NULL DEFAULT 'confirmed',
      edit_reason TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_trip_stop_events_trip_stop (trip_id, stop_no, event_type),
      KEY idx_trip_stop_events_order_code (order_code),
      KEY idx_trip_stop_events_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function mysqlDateTime(value) {
  return localMysqlDateTime(value);
}

function eventFromDbRow(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    orderCode: row.order_code,
    stopNo: row.stop_no,
    stopName: row.stop_name,
    eventType: row.event_type,
    eventTime: row.event_time ? new Date(row.event_time).toISOString() : "",
    source: row.source,
    status: row.status,
    editReason: row.edit_reason || "",
    reportType: row.report_type || "",
    amount: row.amount || "",
    note: row.note || "",
    attachmentName: row.attachment_name || "",
    attachmentDataUrl: row.attachment_data_url || "",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

async function loadTripStopEventsFromDb() {
  if (!dbPool) return;
  const [rows] = await dbPool.execute("SELECT * FROM trip_stop_events ORDER BY created_at DESC, id DESC");
  store.tripStopEvents = rows.map(eventFromDbRow);
}

async function saveTripStopEvent(event) {
  store.tripStopEvents = store.tripStopEvents || [];
  const localEvent = { id: nextId(store.tripStopEvents), ...event };
  store.tripStopEvents.unshift(localEvent);

  if (dbPool) {
    const [result] = await dbPool.execute(
      `INSERT INTO trip_stop_events
        (trip_id, order_code, stop_no, stop_name, event_type, event_time, source, status, edit_reason,
         report_type, amount, note, attachment_name, attachment_data_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.tripId,
        event.orderCode,
        event.stopNo,
        event.stopName,
        event.eventType,
        mysqlDateTime(event.eventTime),
        event.source,
        event.status,
        event.editReason || null,
        event.reportType || null,
        event.amount || null,
        event.note || null,
        event.attachmentName || null,
        event.attachmentDataUrl || null,
      ],
    );
    localEvent.id = result.insertId || localEvent.id;
  }

  return localEvent;
}

function driverEventsForTrip(tripId) {
  return (store.tripStopEvents || [])
    .filter((event) => Number(event.tripId) === Number(tripId))
    .sort((a, b) => new Date(b.createdAt || b.eventTime || 0).getTime() - new Date(a.createdAt || a.eventTime || 0).getTime());
}

async function saveStore() {
  if (!dbPool) return;
  await saveStoreToDatabase(dbPool, storeSnapshot());
}

async function saveTripsStore(req) {
  if (!dbPool) return;
  store.loadedAt = new Date().toISOString();
  appendAuditLog(req);
  await saveTripsDirectly(dbPool, storeSnapshot());
}

async function initializeStore() {
  setLocalStore();
  if (!SHOULD_USE_MYSQL) return;

  try {
    await connectDatabase();
    const normalizedStore = await loadStoreFromDatabase(dbPool);
    if (
      normalizedStore.customers.length ||
      normalizedStore.partners.length ||
      normalizedStore.routes.length ||
      normalizedStore.trips.length ||
      normalizedStore.vehicles.length ||
      normalizedStore.drivers.length ||
      normalizedStore.fuelLogs.length ||
      normalizedStore.salaryRates.length ||
      normalizedStore.transportRates.length ||
      normalizedStore.fuelSurcharges.length ||
      normalizedStore.salaryAdvances.length ||
      normalizedStore.standardFuelPrices.length
    ) {
      store = {
        loadedAt: new Date().toISOString(),
        source: "mysql",
        customers: [],
        partners: [],
        routes: [],
        locations: [],
        trips: [],
        customerDeliveries: [],
        gateLogs: [],
        tripStopEvents: [],
        gpsVehiclesByPlate: {},
        gpsVehicleStates: {},
        gpsEvents: [],
        gpsConfig: {},
        costs: [],
        accountAdmin: defaultAccountAdmin(),
        auditLogs: [],
        driverAttendance: [],
        reportTemplates: [],
        ...normalizedStore,
      };
      store.accountAdmin = ensureCoreLoginUsers(store.accountAdmin || defaultAccountAdmin());
      enrichLocationsWithDefaultCoordinates(store);
      normalizeTripStatuses(store);
      ensureDefaultDriverAttendance(store);
      recalculateFuelLogs();
      await saveStore();
      return;
    }

    const [rows] = await dbPool.execute("SELECT data, updated_at FROM app_state WHERE id = 1 LIMIT 1");
    if (rows.length) {
      const data = typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
      store = {
        loadedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : new Date().toISOString(),
        source: "mysql",
        customers: [],
        partners: [],
        routes: [],
        locations: [],
        trips: [],
        customerDeliveries: [],
        gateLogs: [],
        tripStopEvents: [],
        gpsVehiclesByPlate: {},
        gpsVehicleStates: {},
        gpsEvents: [],
        gpsConfig: {},
        costs: [],
        accountAdmin: defaultAccountAdmin(),
        auditLogs: [],
        driverAttendance: [],
        reportTemplates: [],
        ...data,
      };
      store.accountAdmin = ensureCoreLoginUsers(store.accountAdmin || defaultAccountAdmin());
      enrichLocationsWithDefaultCoordinates(store);
      normalizeTripStatuses(store);
      ensureDefaultDriverAttendance(store);
      await saveStoreToDatabase(dbPool, storeSnapshot());
      return;
    }

    store.source = "mysql";
    store.accountAdmin = ensureCoreLoginUsers(store.accountAdmin || defaultAccountAdmin());
    enrichLocationsWithDefaultCoordinates(store);
    normalizeTripStatuses(store);
    await saveStore();
  } catch (error) {
    dbPool = null;
    store.source = "local";
    console.error(`MySQL connection failed: ${error.message}`);
  }
}

function filterTrips(queryParams = {}) {
  const { customer = "", partner = "", status = "", q = "", special = "", orderType = "", createdBy = "" } = queryParams;
  const query = String(q).toLowerCase();
  const creator = String(createdBy || "").trim().toLowerCase();
  return store.trips.filter((trip) => {
    const matchesCustomer = !customer || trip.customerCode === customer;
    const matchesPartner = !partner || trip.partnerCode === partner;
    const matchesStatus = !status || trip.status === status;
    const matchesOrderType = !orderType || trip.orderType === orderType;
    const matchesCreatedBy = !creator || String(trip.createdBy || "").trim().toLowerCase() === creator;
    const matchesSpecial = special !== "open_vsip_nba" || isOpenVsipNbaTrip(trip);
    const matchesText =
      !query ||
      [
        trip.orderCode,
        trip.routeCode,
        trip.plateNumber,
        trip.driverName,
        trip.partnerCode,
        trip.hawb,
        trip.mawb,
        ...(trip.waybills || []).flatMap((item) => [item.hawb, item.mawb]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return matchesCustomer && matchesPartner && matchesStatus && matchesOrderType && matchesCreatedBy && matchesSpecial && matchesText;
  });
}

function dashboardSummary(trips = store.trips) {
  const totalCost = store.costs.reduce((sum, item) => sum + item.amount, 0);
  const activeTrips = trips.filter((trip) => trip.status !== "completed").length;
  const inGate = trips.filter((trip) =>
    ["arrived_1", "arrived_2", "arrived_3"].includes(trip.status),
  ).length;
  const completed = trips.filter((trip) => trip.status === "completed").length;
  const pending = trips.filter((trip) => trip.status === "plan").length;

  return {
    loadedAt: store.loadedAt,
    metrics: {
      activeTrips,
      pending,
      inGate,
      completed,
      totalRoutes: store.routes.length,
      totalCost,
    },
    byStatus: TRIP_STATUS_FLOW.map((status) => ({
      status,
      label: TRIP_STATUS_LABELS[status],
      count: trips.filter((trip) => trip.status === status).length,
    })),
    byCustomer: store.customers.map((customer) => ({
      code: customer.code,
      name: customer.name,
      trips: trips.filter((trip) => trip.customerCode === customer.code).length,
      routes: store.routes.filter((route) => route.customerCode === customer.code).length,
    })),
  };
}

function auditActor(req) {
  return String(req.get("x-alse-user") || req.body?.createdBy || req.query?.actor || "system").trim() || "system";
}

function auditModule(path) {
  if (path.startsWith("/api/trips")) return "Váº­n chuyá»ƒn";
  if (path.startsWith("/api/customer-deliveries")) return "Xe khÃ¡ch giao VSIP";
  if (path.startsWith("/api/gate-logs")) return "Xe ra vÃ o";
  if (path.startsWith("/api/customers")) return "KhÃ¡ch hÃ ng";
  if (path.startsWith("/api/partners")) return "ÄÆ¡n vá»‹ váº­n táº£i";
  if (path.startsWith("/api/routes")) return "Tuyáº¿n Ä‘Æ°á»ng";
  if (path.startsWith("/api/locations")) return "Äá»‹a Ä‘iá»ƒm";
  if (path.startsWith("/api/account-admin")) return "TÃ i khoáº£n";
  if (path.startsWith("/api/report-templates")) return "BÃ¡o cÃ¡o";
  if (path.startsWith("/api/config")) return "Cáº¥u hÃ¬nh GPS";
  return "Há»‡ thá»‘ng";
}

function auditAction(method) {
  if (method === "POST") return "Táº¡o má»›i";
  if (method === "PUT") return "Cáº­p nháº­t";
  if (method === "DELETE") return "XÃ³a";
  return method;
}

function auditTarget(req) {
  const body = req.body || {};
  if (req.path.includes("/bulk")) return `${Array.isArray(body.rows) ? body.rows.length : 0} Ä‘Æ¡n`;
  return (
    body.orderCode ||
    body.routeCode ||
    body.customerCode ||
    body.code ||
    body.username ||
    body.plateNumber ||
    req.params?.id ||
    req.params?.plateNumber ||
    ""
  );
}

function shouldAuditRequest(req) {
  if (!["POST", "PUT", "DELETE"].includes(req.method)) return false;
  if (req.path.startsWith("/proxy")) return false;
  if (req.path.startsWith("/api/gps/vehicles")) return false;
  if (req.path.startsWith("/api/gps/demo")) return false;
  if (req.path.startsWith("/api/audit-logs")) return false;
  return req.path.startsWith("/api/");
}

function appendAuditLog(req) {
  if (!shouldAuditRequest(req)) return;
  store.auditLogs = store.auditLogs || [];
  const entry = {
    id: nextId(store.auditLogs),
    at: new Date().toISOString(),
    actor: auditActor(req),
    action: auditAction(req.method),
    method: req.method,
    module: auditModule(req.path),
    target: String(auditTarget(req) || ""),
    path: req.originalUrl || req.path,
  };
  store.auditLogs.unshift(entry);
  store.auditLogs = store.auditLogs.slice(0, 1000);
}

setLocalStore();

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CORS_ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

function sanitizeString(value) {
  if (typeof value !== "string") return value;
  return value.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/on\w+\s*=\s*["'][^"']*["']/gi, "");
}

function sanitizeObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === "string" ? sanitizeString(value) : sanitizeObject(value);
  }
  return result;
}

app.use((req, res, next) => {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  next();
});
app.use(morgan("dev"));

function generateToken(user) {
  return jwt.sign(
    { username: user.username, role: user.role, fullName: user.fullName || user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  req.user = decoded;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

app.use((req, res, next) => {
  if (shouldRejectRequestWithoutDatabase({ path: req.path, mysqlConfigured: SHOULD_USE_MYSQL, dbConnected: Boolean(dbPool) })) {
    return res.status(503).json({ message: "MySQL chua ket noi, khong doc/ghi du lieu local" });
  }
  return next();
});

app.use((req, res, next) => {
  const shouldPersist = shouldPersistWholeStore(req, { directTripPersistence: Boolean(dbPool) });
  const originalJson = res.json.bind(res);
  const originalEnd = res.end.bind(res);
  let persisted = false;

  async function persistIfNeeded() {
    if (!shouldPersist || persisted || res.statusCode >= 400) return;
    persisted = true;
    store.loadedAt = new Date().toISOString();
    appendAuditLog(req);
    await saveStore();
  }

  res.json = (body) => {
    if (!shouldPersist || res.statusCode >= 400) return originalJson(body);
    persistIfNeeded()
      .then(() => originalJson(body))
      .catch(next);
    return res;
  };

  res.end = (...args) => {
    if (!shouldPersist || res.statusCode >= 400) return originalEnd(...args);
    persistIfNeeded()
      .then(() => originalEnd(...args))
      .catch(next);
    return res;
  };

  next();
});

app.post("/api/auth/login", async (req, res, next) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(422).json({ message: "Username and password required" });
  }
  try {
    const accountAdmin = ensureCoreLoginUsers(store.accountAdmin || defaultAccountAdmin());
    const user = (accountAdmin.users || []).find(
      (u) => String(u.username || "").trim().toLowerCase() === String(username).trim().toLowerCase()
    );
    if (!user || user.status === "locked" || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = generateToken(user);
    res.json({
      token,
      user: {
        username: user.username,
        fullName: user.fullName || user.name || user.username,
        role: user.role,
        orderType: user.orderType || "",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    loadedAt: store.loadedAt,
    source: store.source,
    mysqlConfigured: SHOULD_USE_MYSQL,
    dbConnected: Boolean(dbPool),
    database: dbPool ? DB_NAME : null,
  });
});

const PUBLIC_API_PATHS = ["/api/health", "/api/auth/login", "/api/auth/me", "/api/weblog-driver-data"];
app.use("/api", (req, res, next) => {
  if (PUBLIC_API_PATHS.includes(req.path)) return next();
  if (req.path.startsWith("/api/driver-trips/")) return next();
  return authenticateToken(req, res, next);
});

app.get("/api/master-data", (req, res) => {
  res.json({
    customers: store.customers,
    partners: store.partners,
    routes: store.routes,
    locations: store.locations,
    statuses: TRIP_STATUS_FLOW.map((status) => ({ value: status, label: TRIP_STATUS_LABELS[status] })),
  });
});

app.get("/api/operations", (req, res) => {
  res.json({
    vehicles: store.vehicles || [],
    drivers: store.drivers || [],
    fuelLogs: store.fuelLogs || [],
    salaryRates: store.salaryRates || [],
    transportRates: store.transportRates || [],
    fuelSurcharges: store.fuelSurcharges || [],
    salaryAdvances: store.salaryAdvances || [],
    standardFuelPrices: store.standardFuelPrices || [],
    driverAttendance: store.driverAttendance || [],
  });
});

app.get("/api/weblog-driver-data", async (req, res) => {
  try {
    res.json(await loadWeblogDriverData());
  } catch (err) {
    res.status(503).json({
      message: `KhÃ´ng Ä‘á»c Ä‘Æ°á»£c dá»¯ liá»‡u tá»« weblog: ${err.sqlMessage || err.message}`,
    });
  }
});

function normalizeVehicleCatalogPayload(payload = {}, existing = {}) {
  return {
    id: existing.id,
    plateNumber: String(payload.plateNumber ?? existing.plateNumber ?? "").trim().toUpperCase(),
    loadCapacity: String(payload.loadCapacity ?? existing.loadCapacity ?? existing.type ?? "").trim(),
    type: String(payload.loadCapacity ?? existing.loadCapacity ?? existing.type ?? "").trim(),
    length: String(payload.length ?? existing.length ?? "").trim(),
    width: String(payload.width ?? existing.width ?? "").trim(),
    height: String(payload.height ?? existing.height ?? "").trim(),
    doorCount: String(payload.doorCount ?? existing.doorCount ?? "").trim(),
    registrationNumber: String(payload.registrationNumber ?? existing.registrationNumber ?? "").trim(),
    fuelNorm: String(payload.fuelNorm ?? existing.fuelNorm ?? "").trim(),
  };
}

app.post("/api/operations/vehicles", (req, res) => {
  store.vehicles = store.vehicles || [];
  const vehicle = normalizeVehicleCatalogPayload(req.body);
  if (!vehicle.plateNumber) return res.status(422).json({ message: "Cáº§n nháº­p biá»ƒn kiá»ƒm soÃ¡t" });
  if (store.vehicles.some((item) => String(item.plateNumber || "").toUpperCase() === vehicle.plateNumber)) {
    return res.status(422).json({ message: "Biá»ƒn kiá»ƒm soÃ¡t Ä‘Ã£ tá»“n táº¡i" });
  }
  vehicle.id = nextId(store.vehicles);
  store.vehicles.push(vehicle);
  res.status(201).json(vehicle);
});

app.put("/api/operations/vehicles/:id", (req, res) => {
  store.vehicles = store.vehicles || [];
  const vehicle = store.vehicles.find((item) => Number(item.id) === Number(req.params.id));
  if (!vehicle) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y xe" });
  const updated = normalizeVehicleCatalogPayload(req.body, vehicle);
  if (!updated.plateNumber) return res.status(422).json({ message: "Cáº§n nháº­p biá»ƒn kiá»ƒm soÃ¡t" });
  if (store.vehicles.some((item) => Number(item.id) !== Number(vehicle.id) && String(item.plateNumber || "").toUpperCase() === updated.plateNumber)) {
    return res.status(422).json({ message: "Biá»ƒn kiá»ƒm soÃ¡t Ä‘Ã£ tá»“n táº¡i" });
  }
  Object.assign(vehicle, updated);
  res.json(vehicle);
});

app.delete("/api/operations/vehicles/:id", (req, res) => {
  store.vehicles = store.vehicles || [];
  const before = store.vehicles.length;
  store.vehicles = store.vehicles.filter((item) => Number(item.id) !== Number(req.params.id));
  if (store.vehicles.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y xe" });
  res.status(204).end();
});

function normalizeDriverCatalogPayload(payload = {}, existing = {}) {
  return {
    id: existing.id,
    name: String(payload.name ?? existing.name ?? "").trim(),
    employeeCode: String(payload.employeeCode ?? existing.employeeCode ?? "").trim().toUpperCase(),
    position: String(payload.position ?? existing.position ?? "LÃ¡i xe").trim(),
    licenseType: String(payload.licenseType ?? existing.licenseType ?? existing.license ?? "").trim().toUpperCase(),
    license: String(payload.licenseType ?? existing.licenseType ?? existing.license ?? "").trim().toUpperCase(),
    dateOfBirth: String(payload.dateOfBirth ?? existing.dateOfBirth ?? "").trim(),
    identityNumber: String(payload.identityNumber ?? existing.identityNumber ?? "").trim(),
    phone: String(payload.phone ?? existing.phone ?? "").trim(),
    address: String(payload.address ?? existing.address ?? "").trim(),
    status: String(payload.status ?? existing.status ?? "").trim(),
    contractStart: String(payload.contractStart ?? existing.contractStart ?? "").trim(),
    contractEnd: String(payload.contractEnd ?? existing.contractEnd ?? "").trim(),
    familyDeduction: String(payload.familyDeduction ?? existing.familyDeduction ?? "").trim(),
    bankAccount: String(payload.bankAccount ?? existing.bankAccount ?? "").trim(),
    bankName: String(payload.bankName ?? existing.bankName ?? "").trim(),
    applicationFileOnHand: Boolean(payload.applicationFileOnHand ?? existing.applicationFileOnHand),
    hardCopyContractOnHand: Boolean(payload.hardCopyContractOnHand ?? existing.hardCopyContractOnHand),
  };
}

app.post("/api/operations/drivers", (req, res) => {
  store.drivers = store.drivers || [];
  const driver = normalizeDriverCatalogPayload(req.body);
  if (!driver.name) return res.status(422).json({ message: "Cáº§n nháº­p há» vÃ  tÃªn tÃ i xáº¿" });
  if (!driver.employeeCode) return res.status(422).json({ message: "Cáº§n nháº­p mÃ£ nhÃ¢n viÃªn" });
  if (store.drivers.some((item) => String(item.employeeCode || "").toUpperCase() === driver.employeeCode)) {
    return res.status(422).json({ message: "MÃ£ nhÃ¢n viÃªn Ä‘Ã£ tá»“n táº¡i" });
  }
  driver.id = nextId(store.drivers);
  store.drivers.push(driver);
  res.status(201).json(driver);
});

app.put("/api/operations/drivers/:id", (req, res) => {
  store.drivers = store.drivers || [];
  const driver = store.drivers.find((item) => Number(item.id) === Number(req.params.id));
  if (!driver) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y tÃ i xáº¿" });
  const updated = normalizeDriverCatalogPayload(req.body, driver);
  if (!updated.name) return res.status(422).json({ message: "Cáº§n nháº­p há» vÃ  tÃªn tÃ i xáº¿" });
  if (!updated.employeeCode) return res.status(422).json({ message: "Cáº§n nháº­p mÃ£ nhÃ¢n viÃªn" });
  if (store.drivers.some((item) => Number(item.id) !== Number(driver.id) && String(item.employeeCode || "").toUpperCase() === updated.employeeCode)) {
    return res.status(422).json({ message: "MÃ£ nhÃ¢n viÃªn Ä‘Ã£ tá»“n táº¡i" });
  }
  Object.assign(driver, updated);
  res.json(driver);
});

app.delete("/api/operations/drivers/:id", (req, res) => {
  store.drivers = store.drivers || [];
  const before = store.drivers.length;
  store.drivers = store.drivers.filter((item) => Number(item.id) !== Number(req.params.id));
  if (store.drivers.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y tÃ i xáº¿" });
  res.status(204).end();
});

function normalizeDriverAttendancePayload(payload = {}, existing = {}) {
  return {
    id: existing.id,
    driverName: String(payload.driverName ?? existing.driverName ?? "").trim(),
    leaveDate: String(payload.leaveDate ?? payload.date ?? existing.leaveDate ?? "").trim(),
    reason: String(payload.reason ?? existing.reason ?? "").trim(),
    note: String(payload.note ?? existing.note ?? "").trim(),
    createdAt: existing.createdAt || new Date().toISOString(),
    source: existing.source || "webnp",
  };
}

app.post("/api/operations/driver-attendance", (req, res) => {
  store.driverAttendance = store.driverAttendance || [];
  const row = normalizeDriverAttendancePayload(req.body);
  if (!row.driverName) return res.status(422).json({ message: "Can nhap ten lai xe" });
  if (!row.leaveDate) return res.status(422).json({ message: "Can nhap ngay nghi" });
  row.id = nextId(store.driverAttendance);
  store.driverAttendance.unshift(row);
  res.status(201).json(row);
});

app.put("/api/operations/driver-attendance/:id", (req, res) => {
  store.driverAttendance = store.driverAttendance || [];
  const row = store.driverAttendance.find((item) => Number(item.id) === Number(req.params.id));
  if (!row) return res.status(404).json({ message: "Khong tim thay dong cham cong" });
  const updated = normalizeDriverAttendancePayload(req.body, row);
  if (!updated.driverName) return res.status(422).json({ message: "Can nhap ten lai xe" });
  if (!updated.leaveDate) return res.status(422).json({ message: "Can nhap ngay nghi" });
  Object.assign(row, updated);
  res.json(row);
});

app.delete("/api/operations/driver-attendance/:id", (req, res) => {
  store.driverAttendance = store.driverAttendance || [];
  const before = store.driverAttendance.length;
  store.driverAttendance = store.driverAttendance.filter((item) => Number(item.id) !== Number(req.params.id));
  if (store.driverAttendance.length === before) return res.status(404).json({ message: "Khong tim thay dong cham cong" });
  res.status(204).end();
});

function parseNumberInput(value) {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).trim();
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(/,/g, ".")
    : (text.match(/\./g) || []).length > 1
      ? text.replace(/\./g, "")
      : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parseFuelNormInput(value) {
  const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? parseNumberInput(match[0]) : parseNumberInput(value);
}

function fuelDateKey(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return text;
}

function recalculateFuelLogs() {
  const normByPlate = new Map((store.vehicles || []).map((vehicle) => [
    String(vehicle.plateNumber || "").trim().toUpperCase(),
    parseFuelNormInput(vehicle.fuelNorm),
  ]));
  const sorted = [...(store.fuelLogs || [])].sort((a, b) => {
    const dateOrder = fuelDateKey(a.date).localeCompare(fuelDateKey(b.date));
    if (dateOrder) return dateOrder;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  const previousByPlate = new Map();
  for (const log of sorted) {
    const plate = String(log.plateNumber || "").trim().toUpperCase();
    const previous = previousByPlate.get(plate);
    const kmReading = parseNumberInput(log.kmReading);
    const kmRun = previous && kmReading ? kmReading - parseNumberInput(previous.kmReading) : 0;
    const fuelNorm = parseFuelNormInput(log.fuelNorm) || normByPlate.get(plate) || 0;
    const normLiters = kmRun > 0 && fuelNorm > 0 ? Number(((kmRun * fuelNorm) / 100).toFixed(2)) : 0;
    const previousLiters = previous ? parseNumberInput(previous.liters) : 0;
    const fuelDelta = previous ? Number((normLiters - previousLiters).toFixed(2)) : 0;
    Object.assign(log, {
      kmReading,
      kmRun: Number(kmRun.toFixed(2)),
      fuelNorm,
      normLiters,
      previousLiters,
      fuelDelta,
    });
    previousByPlate.set(plate, log);
  }
}

function normalizeFuelLogPayload(payload = {}, existing = {}) {
  const liters = parseNumberInput(payload.liters ?? existing.liters);
  const amount = parseNumberInput(payload.amount ?? existing.amount);
  const unitPrice = liters > 0 ? Number((amount / liters).toFixed(2)) : parseNumberInput(payload.unitPrice ?? existing.unitPrice);
  return {
    id: existing.id,
    date: String(payload.date ?? existing.date ?? "").trim(),
    plateNumber: String(payload.plateNumber ?? existing.plateNumber ?? "").trim().toUpperCase(),
    driverName: String(payload.driverName ?? existing.driverName ?? "").trim(),
    liters,
    unitPrice,
    amount,
    kmReading: parseNumberInput(payload.kmReading ?? existing.kmReading),
    fuelNorm: parseFuelNormInput(payload.fuelNorm ?? existing.fuelNorm),
    station: String(payload.station ?? existing.station ?? "").trim(),
    status: String(payload.status ?? existing.status ?? "Hop le").trim() || "Hop le",
  };
}

app.post("/api/operations/fuel-logs", (req, res) => {
  store.fuelLogs = store.fuelLogs || [];
  const log = normalizeFuelLogPayload(req.body);
  if (!log.date) return res.status(422).json({ message: "Can nhap ngay do dau" });
  if (!log.plateNumber) return res.status(422).json({ message: "Can nhap bien so xe" });
  if (!log.driverName) return res.status(422).json({ message: "Can nhap ten lai xe" });
  log.id = nextId(store.fuelLogs);
  store.fuelLogs.push(log);
  recalculateFuelLogs();
  res.status(201).json(log);
});

app.put("/api/operations/fuel-logs/:id", (req, res) => {
  store.fuelLogs = store.fuelLogs || [];
  const log = store.fuelLogs.find((item) => Number(item.id) === Number(req.params.id));
  if (!log) return res.status(404).json({ message: "Khong tim thay luot do dau" });
  const updated = normalizeFuelLogPayload(req.body, log);
  if (!updated.date) return res.status(422).json({ message: "Can nhap ngay do dau" });
  if (!updated.plateNumber) return res.status(422).json({ message: "Can nhap bien so xe" });
  if (!updated.driverName) return res.status(422).json({ message: "Can nhap ten lai xe" });
  Object.assign(log, updated);
  recalculateFuelLogs();
  res.json(log);
});

app.delete("/api/operations/fuel-logs/:id", (req, res) => {
  store.fuelLogs = store.fuelLogs || [];
  const before = store.fuelLogs.length;
  store.fuelLogs = store.fuelLogs.filter((item) => Number(item.id) !== Number(req.params.id));
  if (store.fuelLogs.length === before) return res.status(404).json({ message: "Khong tim thay luot do dau" });
  recalculateFuelLogs();
  res.status(204).end();
});

function normalizeTransportRatePayload(payload = {}, existing = {}) {
  return {
    id: existing.id,
    customer: String(payload.customer ?? existing.customer ?? "").trim().toUpperCase(),
    route: String(payload.route ?? existing.route ?? "").trim().toUpperCase(),
    km: String(payload.km ?? existing.km ?? "").trim(),
    rate125: String(payload.rate125 ?? existing.rate125 ?? "").trim(),
    rate25: String(payload.rate25 ?? existing.rate25 ?? "").trim(),
    rate35: String(payload.rate35 ?? existing.rate35 ?? "").trim(),
    rate5: String(payload.rate5 ?? existing.rate5 ?? "").trim(),
    rate7: String(payload.rate7 ?? existing.rate7 ?? "").trim(),
    rate8: String(payload.rate8 ?? existing.rate8 ?? "").trim(),
    rate10: String(payload.rate10 ?? existing.rate10 ?? "").trim(),
    rate15: String(payload.rate15 ?? existing.rate15 ?? "").trim(),
    rate20: String(payload.rate20 ?? existing.rate20 ?? "").trim(),
    cont20: String(payload.cont20 ?? existing.cont20 ?? "").trim(),
    cont40: String(payload.cont40 ?? existing.cont40 ?? "").trim(),
    cont45: String(payload.cont45 ?? existing.cont45 ?? "").trim(),
    status: String(payload.status ?? existing.status ?? "active").trim() || "active",
  };
}

app.post("/api/operations/transport-rates", (req, res) => {
  store.transportRates = store.transportRates || [];
  const rate = normalizeTransportRatePayload(req.body);
  if (!rate.customer) return res.status(422).json({ message: "Cáº§n nháº­p khÃ¡ch hÃ ng" });
  if (!rate.route) return res.status(422).json({ message: "Cáº§n nháº­p tuyáº¿n Ä‘Æ°á»ng" });
  const result = upsertTransportRate(store.transportRates, rate, nextId);
  res.status(result.created ? 201 : 200).json(result.rate);
});

app.put("/api/operations/transport-rates/:id", (req, res) => {
  store.transportRates = store.transportRates || [];
  const rate = store.transportRates.find((item) => Number(item.id) === Number(req.params.id));
  if (!rate) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y dÃ²ng báº£ng giÃ¡" });
  const updated = normalizeTransportRatePayload(req.body, rate);
  if (!updated.customer) return res.status(422).json({ message: "Cáº§n nháº­p khÃ¡ch hÃ ng" });
  if (!updated.route) return res.status(422).json({ message: "Cáº§n nháº­p tuyáº¿n Ä‘Æ°á»ng" });
  Object.assign(rate, updated);
  res.json(rate);
});

app.delete("/api/operations/transport-rates/:id", (req, res) => {
  store.transportRates = store.transportRates || [];
  const before = store.transportRates.length;
  store.transportRates = store.transportRates.filter((item) => Number(item.id) !== Number(req.params.id));
  if (store.transportRates.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y dÃ²ng báº£ng giÃ¡" });
  res.status(204).end();
});

function normalizeFuelSurchargePayload(payload = {}, existing = {}) {
  return {
    id: existing.id,
    content: String(payload.content ?? existing.content ?? "").trim(),
    dateFrom: String(payload.dateFrom ?? existing.dateFrom ?? "").trim(),
    dateTo: String(payload.dateTo ?? existing.dateTo ?? "").trim(),
    percent: String(payload.percent ?? existing.percent ?? "").trim(),
    note: String(payload.note ?? existing.note ?? "").trim(),
  };
}

app.post("/api/operations/fuel-surcharges", (req, res) => {
  store.fuelSurcharges = store.fuelSurcharges || [];
  const surcharge = normalizeFuelSurchargePayload(req.body);
  if (!surcharge.content) return res.status(422).json({ message: "Cần nhập nội dung phụ phí xăng dầu" });
  if (!surcharge.percent) return res.status(422).json({ message: "Cần nhập phần trăm phụ phí" });
  surcharge.id = nextId(store.fuelSurcharges);
  store.fuelSurcharges.unshift(surcharge);
  res.status(201).json(surcharge);
});

app.put("/api/operations/fuel-surcharges/:id", (req, res) => {
  store.fuelSurcharges = store.fuelSurcharges || [];
  const surcharge = store.fuelSurcharges.find((item) => Number(item.id) === Number(req.params.id));
  if (!surcharge) return res.status(404).json({ message: "Không tìm thấy phụ phí xăng dầu" });
  const updated = normalizeFuelSurchargePayload(req.body, surcharge);
  if (!updated.content) return res.status(422).json({ message: "Cần nhập nội dung phụ phí xăng dầu" });
  if (!updated.percent) return res.status(422).json({ message: "Cần nhập phần trăm phụ phí" });
  Object.assign(surcharge, updated);
  res.json(surcharge);
});

app.delete("/api/operations/fuel-surcharges/:id", (req, res) => {
  store.fuelSurcharges = store.fuelSurcharges || [];
  const before = store.fuelSurcharges.length;
  store.fuelSurcharges = store.fuelSurcharges.filter((item) => Number(item.id) !== Number(req.params.id));
  if (store.fuelSurcharges.length === before) return res.status(404).json({ message: "Không tìm thấy phụ phí xăng dầu" });
  res.status(204).end();
});

function normalizeSalaryAdvancePayload(payload = {}, existing = {}) {
  return {
    id: existing.id,
    date: String(payload.date ?? existing.date ?? "").trim(),
    driverName: String(payload.driverName ?? existing.driverName ?? "").trim(),
    amount: parseNumberInput(payload.amount ?? existing.amount),
    note: String(payload.note ?? existing.note ?? "").trim(),
  };
}

app.post("/api/operations/salary-advances", (req, res) => {
  store.salaryAdvances = store.salaryAdvances || [];
  const advance = normalizeSalaryAdvancePayload(req.body);
  if (!advance.date) return res.status(422).json({ message: "Cần nhập ngày ứng lương" });
  if (!advance.driverName) return res.status(422).json({ message: "Cần nhập tên lái xe" });
  if (!advance.amount) return res.status(422).json({ message: "Cần nhập số tiền ứng" });
  advance.id = nextId(store.salaryAdvances);
  store.salaryAdvances.unshift(advance);
  res.status(201).json(advance);
});

app.put("/api/operations/salary-advances/:id", (req, res) => {
  store.salaryAdvances = store.salaryAdvances || [];
  const advance = store.salaryAdvances.find((item) => Number(item.id) === Number(req.params.id));
  if (!advance) return res.status(404).json({ message: "Không tìm thấy dòng ứng lương" });
  const updated = normalizeSalaryAdvancePayload(req.body, advance);
  if (!updated.date) return res.status(422).json({ message: "Cần nhập ngày ứng lương" });
  if (!updated.driverName) return res.status(422).json({ message: "Cần nhập tên lái xe" });
  if (!updated.amount) return res.status(422).json({ message: "Cần nhập số tiền ứng" });
  Object.assign(advance, updated);
  res.json(advance);
});

app.delete("/api/operations/salary-advances/:id", (req, res) => {
  store.salaryAdvances = store.salaryAdvances || [];
  const before = store.salaryAdvances.length;
  store.salaryAdvances = store.salaryAdvances.filter((item) => Number(item.id) !== Number(req.params.id));
  if (store.salaryAdvances.length === before) return res.status(404).json({ message: "Không tìm thấy dòng ứng lương" });
  res.status(204).end();
});

function normalizeStandardFuelPricePayload(payload = {}, existing = {}) {
  return {
    id: existing.id,
    month: String(payload.month ?? existing.month ?? "").trim().slice(0, 7),
    unitPrice: parseNumberInput(payload.unitPrice ?? existing.unitPrice),
    note: String(payload.note ?? existing.note ?? "").trim(),
  };
}

app.post("/api/operations/standard-fuel-prices", (req, res) => {
  store.standardFuelPrices = store.standardFuelPrices || [];
  const price = normalizeStandardFuelPricePayload(req.body);
  if (!price.month) return res.status(422).json({ message: "Cần nhập tháng giá dầu tiêu chuẩn" });
  if (!price.unitPrice) return res.status(422).json({ message: "Cần nhập đơn giá/lít" });
  const existing = store.standardFuelPrices.find((item) => String(item.month || "").slice(0, 7) === price.month);
  if (existing) {
    Object.assign(existing, price, { id: existing.id });
    return res.json(existing);
  }
  price.id = nextId(store.standardFuelPrices);
  store.standardFuelPrices.unshift(price);
  res.status(201).json(price);
});

app.put("/api/operations/standard-fuel-prices/:id", (req, res) => {
  store.standardFuelPrices = store.standardFuelPrices || [];
  const price = store.standardFuelPrices.find((item) => Number(item.id) === Number(req.params.id));
  if (!price) return res.status(404).json({ message: "Không tìm thấy giá dầu tiêu chuẩn" });
  const updated = normalizeStandardFuelPricePayload(req.body, price);
  if (!updated.month) return res.status(422).json({ message: "Cần nhập tháng giá dầu tiêu chuẩn" });
  if (!updated.unitPrice) return res.status(422).json({ message: "Cần nhập đơn giá/lít" });
  const duplicated = store.standardFuelPrices.some((item) => Number(item.id) !== Number(price.id) && String(item.month || "").slice(0, 7) === updated.month);
  if (duplicated) return res.status(422).json({ message: "Tháng này đã có giá dầu tiêu chuẩn" });
  Object.assign(price, updated);
  res.json(price);
});

app.delete("/api/operations/standard-fuel-prices/:id", (req, res) => {
  store.standardFuelPrices = store.standardFuelPrices || [];
  const before = store.standardFuelPrices.length;
  store.standardFuelPrices = store.standardFuelPrices.filter((item) => Number(item.id) !== Number(req.params.id));
  if (store.standardFuelPrices.length === before) return res.status(404).json({ message: "Không tìm thấy giá dầu tiêu chuẩn" });
  res.status(204).end();
});

app.post("/api/customers", (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const name = String(req.body?.name || "").trim();
  if (!code || !name) return res.status(422).json({ message: "Cáº§n nháº­p mÃ£ vÃ  tÃªn khÃ¡ch hÃ ng" });
  if (store.customers.some((item) => item.code === code)) {
    return res.status(422).json({ message: "MÃ£ khÃ¡ch hÃ ng Ä‘Ã£ tá»“n táº¡i" });
  }
  const customer = {
    id: nextId(store.customers),
    name,
    code,
    contact: req.body?.contact || "",
    phone: req.body?.phone || "",
    email: req.body?.email || "",
  };
  store.customers.push(customer);
  res.status(201).json(customer);
});

app.put("/api/customers/:id", (req, res) => {
  const customer = store.customers.find((item) => item.id === Number(req.params.id));
  if (!customer) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y khÃ¡ch hÃ ng" });
  Object.assign(customer, {
    name: String(req.body?.name || customer.name).trim(),
    code: String(req.body?.code || customer.code).trim().toUpperCase(),
    contact: req.body?.contact || "",
    phone: req.body?.phone || "",
    email: req.body?.email || "",
  });
  res.json(customer);
});

app.delete("/api/customers/:id", (req, res) => {
  const before = store.customers.length;
  store.customers = store.customers.filter((item) => item.id !== Number(req.params.id));
  if (store.customers.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y khÃ¡ch hÃ ng" });
  res.status(204).end();
});

app.post("/api/partners", (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const name = String(req.body?.name || "").trim();
  if (!code || !name) return res.status(422).json({ message: "Cáº§n nháº­p mÃ£ vÃ  tÃªn Ä‘Æ¡n vá»‹ váº­n táº£i" });
  if (store.partners.some((item) => item.code === code)) {
    return res.status(422).json({ message: "MÃ£ Ä‘Æ¡n vá»‹ váº­n táº£i Ä‘Ã£ tá»“n táº¡i" });
  }
  const partner = {
    id: nextId(store.partners),
    name,
    code,
    contact: req.body?.contact || "",
    phone: req.body?.phone || "",
    email: req.body?.email || "",
  };
  store.partners.push(partner);
  res.status(201).json(partner);
});

app.put("/api/partners/:id", (req, res) => {
  const partner = store.partners.find((item) => item.id === Number(req.params.id));
  if (!partner) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n vá»‹ váº­n táº£i" });
  Object.assign(partner, {
    name: String(req.body?.name || partner.name).trim(),
    code: String(req.body?.code || partner.code).trim().toUpperCase(),
    contact: req.body?.contact || "",
    phone: req.body?.phone || "",
    email: req.body?.email || "",
  });
  store.trips.forEach((trip) => {
    if (trip.partnerCode === partner.code) trip.partnerName = partner.name;
  });
  res.json(partner);
});

app.delete("/api/partners/:id", (req, res) => {
  const before = store.partners.length;
  store.partners = store.partners.filter((item) => item.id !== Number(req.params.id));
  if (store.partners.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n vá»‹ váº­n táº£i" });
  res.status(204).end();
});

app.post("/api/routes", (req, res) => {
  const customerCode = String(req.body?.customerCode || "").trim().toUpperCase();
  const routeCode = String(req.body?.routeCode || "").trim().toUpperCase();
  if (!customerCode || !routeCode) return res.status(422).json({ message: "Cáº§n nháº­p khÃ¡ch hÃ ng vÃ  mÃ£ tuyáº¿n" });
  const route = {
    id: nextId(store.routes),
    customerCode,
    routeCode,
    from: req.body?.from || "",
    to: req.body?.to || "",
    via: req.body?.via || "",
    km: Number(req.body?.km) || null,
    type: req.body?.type || routeType(routeCode),
  };
  store.routes.push(route);
  res.status(201).json(route);
});

app.put("/api/routes/:id", (req, res) => {
  const route = store.routes.find((item) => item.id === Number(req.params.id));
  if (!route) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y tuyáº¿n Ä‘Æ°á»ng" });
  Object.assign(route, {
    customerCode: String(req.body?.customerCode || route.customerCode).trim().toUpperCase(),
    routeCode: String(req.body?.routeCode || route.routeCode).trim().toUpperCase(),
    from: req.body?.from || "",
    to: req.body?.to || "",
    via: req.body?.via || "",
    km: Number(req.body?.km) || null,
    type: req.body?.type || route.type,
  });
  res.json(route);
});

app.delete("/api/routes/:id", (req, res) => {
  const before = store.routes.length;
  store.routes = store.routes.filter((item) => item.id !== Number(req.params.id));
  if (store.routes.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y tuyáº¿n Ä‘Æ°á»ng" });
  res.status(204).end();
});

app.post("/api/locations", (req, res) => {
  const payload = normalizeLocationPayload(req.body);
  const { name, code } = payload;
  if (!name || !code) return res.status(422).json({ message: "Cáº§n nháº­p tÃªn nhÃ  mÃ¡y/kho vÃ  mÃ£ Ä‘á»‹a Ä‘iá»ƒm" });
  if (store.locations.some((item) => item.code === code)) {
    return res.status(422).json({ message: "MÃ£ Ä‘á»‹a Ä‘iá»ƒm Ä‘Ã£ tá»“n táº¡i" });
  }
  const location = {
    id: nextId(store.locations),
    ...payload,
  };
  store.locations.push(location);
  res.status(201).json(location);
});

app.put("/api/locations/:id", (req, res) => {
  const location = store.locations.find((item) => item.id === Number(req.params.id));
  if (!location) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y mÃ£ Ä‘á»‹a Ä‘iá»ƒm" });
  const code = String(req.body?.code || location.code).trim().toUpperCase();
  if (store.locations.some((item) => item.id !== location.id && item.code === code)) {
    return res.status(422).json({ message: "MÃ£ Ä‘á»‹a Ä‘iá»ƒm Ä‘Ã£ tá»“n táº¡i" });
  }
  Object.assign(location, normalizeLocationPayload({ ...req.body, code }, location));
  res.json(location);
});

app.delete("/api/locations/:id", (req, res) => {
  const before = store.locations.length;
  store.locations = store.locations.filter((item) => item.id !== Number(req.params.id));
  if (store.locations.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y mÃ£ Ä‘á»‹a Ä‘iá»ƒm" });
  res.status(204).end();
});

app.get("/api/dashboard", (req, res) => {
  res.json(dashboardSummary(filterTrips(req.query)));
});

app.get("/api/audit-logs", (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  const actor = String(req.query.actor || "").trim().toLowerCase();
  const moduleName = String(req.query.module || "").trim().toLowerCase();
  const rows = (store.auditLogs || []).filter((row) => {
    const matchesActor = !actor || String(row.actor || "").toLowerCase().includes(actor);
    const matchesModule = !moduleName || String(row.module || "").toLowerCase().includes(moduleName);
    return matchesActor && matchesModule;
  });
  res.json(rows.slice(0, limit));
});

app.get("/api/trips", (req, res) => {
  res.json(paginateTrips(sortTripsForBoard(filterTrips(req.query)), req.query));
});

app.post("/api/trips", async (req, res, next) => {
  try {
    const trip = buildTrip(req.body);
    store.trips.unshift(trip);
    await saveTripsStore(req);
    res.status(201).json(trip);
  } catch (error) {
    next(error);
  }
});

app.put("/api/trips/:id", async (req, res, next) => {
  try {
    const trip = store.trips.find((item) => item.id === Number(req.params.id));
    if (!trip) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n" });
    const updated = updateTripFromPayload(trip, req.body);
    await saveTripsStore(req);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/trips/:id", async (req, res, next) => {
  try {
    const before = store.trips.length;
    store.trips = store.trips.filter((item) => item.id !== Number(req.params.id));
    if (store.trips.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n" });
    await saveTripsStore(req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/trips/bulk", async (req, res, next) => {
  try {
  const rows = Array.isArray(req.body?.rows)
    ? req.body.rows.filter((row) => Object.values(row || {}).some((value) => String(value || "").trim()))
    : [];
  if (rows.length) {
    const firstId = nextId(store.trips);
    const sequenceByDate = new Map();
    const trips = rows.slice(0, 50).map((row, index) => {
      const plannedDate = row.plannedDate || new Date().toISOString().slice(0, 10);
      const plannedTime = row.plannedTime || "08:00";
      const sequenceKey = plannedDate;
      const sequence = sequenceByDate.get(sequenceKey) || nextDailyOrderSequence(store.trips, new Date(`${plannedDate}T${plannedTime}:00`));
      sequenceByDate.set(sequenceKey, sequence + 1);
      return buildTrip({
        ...row,
        id: firstId + index,
        sequence,
      });
    });
    store.trips.unshift(...trips);
    await saveTripsStore(req);
    res.status(201).json(trips);
    return;
  }

  const count = Math.max(1, Math.min(Number(req.body?.count) || 1, 50));
  const firstId = nextId(store.trips);
  const plannedDate = req.body?.plannedDate || new Date().toISOString().slice(0, 10);
  const plannedTime = req.body?.plannedTime || "08:00";
  const sequenceStart = nextDailyOrderSequence(store.trips, new Date(`${plannedDate}T${plannedTime}:00`));
  const trips = Array.from({ length: count }, (_, index) =>
    buildTrip({
      ...req.body,
      id: firstId + index,
      sequence: sequenceStart + index,
      plannedTime: req.body?.plannedTime || `${String(8 + (index % 9)).padStart(2, "0")}:00`,
      note: req.body?.note || "",
    }),
  );
  store.trips.unshift(...trips);
  await saveTripsStore(req);
  res.status(201).json(trips);
  } catch (error) {
    next(error);
  }
});

app.post("/api/trips/bulk-completed", async (req, res, next) => {
  try {
  const rows = Array.isArray(req.body?.rows)
    ? req.body.rows.filter((row) => Object.values(row || {}).some((value) => String(value || "").trim()))
    : [];
  if (!rows.length) return res.status(422).json({ message: "Can nhap it nhat 1 dong don hoan thanh" });
  if (rows.length > 50) return res.status(422).json({ message: "Moi lan chi nhap toi da 50 dong" });

  const missingMaster = rows.find((row) => {
    const customerCode = String(row.customerCode || "").trim().toUpperCase();
    const partnerCode = String(row.partnerCode || "").trim().toUpperCase();
    return (
      !store.customers.some((customer) => customer.code === customerCode) ||
      !store.partners.some((partner) => partner.code === partnerCode)
    );
  });
  if (missingMaster) {
    return res.status(422).json({ message: "Ma khach hang hoac ma don vi van tai chua co trong CSDL" });
  }

  const firstId = nextId(store.trips);
  const sequenceByDate = new Map();
  const trips = rows.map((row, index) => {
    const payload = buildCompletedTripPayload(row);
    const plannedDate = payload.plannedDate || new Date().toISOString().slice(0, 10);
    const plannedTime = payload.plannedTime || "08:00";
    const sequenceKey = plannedDate;
    const sequence = sequenceByDate.get(sequenceKey) || nextDailyOrderSequence(store.trips, new Date(`${plannedDate}T${plannedTime}:00`));
    sequenceByDate.set(sequenceKey, sequence + 1);
    return buildCompletedTripFromRow(payload, firstId + index, sequence);
  });
  store.trips.unshift(...trips);
  await saveTripsStore(req);
  res.status(201).json(trips);
  } catch (error) {
    next(error);
  }
});

app.post("/api/trips/:id/status", async (req, res, next) => {
  try {
    const trip = store.trips.find((item) => item.id === Number(req.params.id));
    if (!trip) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n" });

    const currentIndex = TRIP_STATUS_FLOW.indexOf(trip.status);
    const requestedStatus = req.body?.status;
    const nextStatus = requestedStatus || TRIP_STATUS_FLOW[Math.min(currentIndex + 1, TRIP_STATUS_FLOW.length - 1)];
    if (!TRIP_STATUS_LABELS[nextStatus]) {
      return res.status(422).json({ message: "Tráº¡ng thÃ¡i khÃ´ng há»£p lá»‡" });
    }

    trip.status = nextStatus;
    trip.statusLabel = TRIP_STATUS_LABELS[nextStatus];
    trip.updatedAt = new Date().toISOString();
    await saveTripsStore(req);
    res.json(trip);
  } catch (error) {
    next(error);
  }
});

app.get("/api/driver-trips/:orderCode", (req, res) => {
  const orderCode = String(req.params.orderCode || "").trim();
  const trip = store.trips.find((item) => String(item.orderCode) === orderCode);
  if (!trip) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n xe" });
  res.json(buildDriverTripView(trip, driverEventsForTrip(trip.id)));
});

app.post("/api/driver-trips/:orderCode/events", async (req, res, next) => {
  try {
    const orderCode = String(req.params.orderCode || "").trim();
    const trip = store.trips.find((item) => String(item.orderCode) === orderCode);
    if (!trip) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y chuyáº¿n xe" });

    const { event } = applyDriverStopEvent(trip, req.body, driverEventsForTrip(trip.id), new Date());
    const savedEvent = await saveTripStopEvent(event);
    ensureGateLogForDriverArrival(trip, savedEvent);
    res.status(201).json({
      event: savedEvent,
      trip: buildDriverTripView(trip, driverEventsForTrip(trip.id)),
    });
  } catch (error) {
    const message = error.message || "KhÃ´ng thá»ƒ cáº­p nháº­t tráº¡ng thÃ¡i";
    if (message.includes("khÃ´ng há»£p lá»‡") || message.includes("không hợp lệ") || message.includes("ChÆ°a cÃ³ giá» Ä‘áº¿n") || message.includes("Chưa có giờ đến") || message.includes("Invalid driver report type")) {
      return res.status(422).json({ message });
    }
    next(error);
  }
});

app.get("/api/customer-deliveries", (req, res) => {
  const { customer = "", partner = "", status = "", q = "" } = req.query;
  const query = String(q).toLowerCase();
  const deliveries = (store.customerDeliveries || []).filter((delivery) => {
    const matchesCustomer = !customer || delivery.customerCode === customer;
    const matchesPartner = !partner || delivery.partnerCode === partner;
    const matchesStatus = !status || delivery.status === status;
    const matchesText =
      !query ||
      [
        delivery.customerCode,
        delivery.plateNumber,
        delivery.driverName,
        delivery.partnerCode,
        delivery.hawb,
        delivery.mawb,
        ...(delivery.waybills || []).flatMap((item) => [item.hawb, item.mawb]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    return matchesCustomer && matchesPartner && matchesStatus && matchesText;
  });
  res.json(sortTripsForBoard(deliveries));
});

app.post("/api/customer-deliveries", (req, res) => {
  const customerCode = String(req.body?.customerCode || "").trim();
  if (!customerCode) return res.status(422).json({ message: "Cáº§n nháº­p khÃ¡ch hÃ ng" });
  const delivery = buildCustomerDelivery(req.body);
  store.customerDeliveries.unshift(delivery);
  res.status(201).json(delivery);
});

app.put("/api/customer-deliveries/:id", (req, res) => {
  const delivery = (store.customerDeliveries || []).find((item) => item.id === Number(req.params.id));
  if (!delivery) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y xe giao hÃ ng" });
  res.json(updateCustomerDeliveryFromPayload(delivery, req.body));
});

app.delete("/api/customer-deliveries/:id", (req, res) => {
  const before = (store.customerDeliveries || []).length;
  store.customerDeliveries = (store.customerDeliveries || []).filter((item) => item.id !== Number(req.params.id));
  if (store.customerDeliveries.length === before) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y xe giao hÃ ng" });
  res.status(204).end();
});

app.get("/api/gate-logs", (req, res) => {
  const { q = "", status = "" } = req.query;
  const query = String(q).trim().toLowerCase();
  const logs = (store.gateLogs || [])
    .map((item) => Object.assign(item, gateLogStatus(item)))
    .filter((item) => {
      const matchesStatus = !status || item.status === status;
      const matchesQuery =
        !query ||
        [item.plateNumber, item.driverName]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesQuery;
    })
    .sort((a, b) => {
      const statusOrder = { waiting: 0, inside: 1, completed: 2 };
      const statusA = statusOrder[a.status] ?? 3;
      const statusB = statusOrder[b.status] ?? 3;
      if (statusA !== statusB) return statusA - statusB;
      return new Date(b.updatedAt || b.registeredAt || 0).getTime() - new Date(a.updatedAt || a.registeredAt || 0).getTime();
    });
  res.json(logs);
});

app.post("/api/gate-logs", (req, res) => {
  const plateNumber = String(req.body?.plateNumber || "").trim();
  if (!plateNumber) return res.status(422).json({ message: "Cáº§n nháº­p biá»ƒn sá»‘ xe" });
  store.gateLogs = store.gateLogs || [];
  const log = buildGateLog(req.body, nextId(store.gateLogs));
  syncGateRegistrationToSource(log);
  store.gateLogs.unshift(log);
  res.status(201).json(log);
});

app.post("/api/gate-logs/:id/in", (req, res) => {
  const log = (store.gateLogs || []).find((item) => item.id === Number(req.params.id));
  if (!log) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y lÆ°á»£t xe ra vÃ o" });
  res.json(markGateIn(log));
});

app.delete("/api/gate-logs/:id", (req, res) => {
  const log = (store.gateLogs || []).find((item) => item.id === Number(req.params.id));
  if (!log) return res.status(404).json({ message: "Khong tim thay luot xe ra vao" });
  if (gateLogStatus(log).status !== "waiting") {
    return res.status(409).json({ message: "Chi huy dang ky khi xe dang cho vao" });
  }
  store.gateLogs = (store.gateLogs || []).filter((item) => item.id !== Number(req.params.id));
  res.status(204).end();
});

app.post("/api/gate-logs/:id/out", (req, res) => {
  const log = (store.gateLogs || []).find((item) => item.id === Number(req.params.id));
  if (!log) return res.status(404).json({ message: "KhÃ´ng tÃ¬m tháº¥y lÆ°á»£t xe ra vÃ o" });
  res.json(markGateOut(log));
});

async function processGpsVehicles(rows, now = new Date()) {
  store.gpsVehiclesByPlate = store.gpsVehiclesByPlate || {};
  const allEvents = [];
  for (const row of rows) {
    const vehicle = normalizeGpsVehicle(row);
    const plateKey = normalizePlate(vehicle.plateNumber);
    if (!plateKey) continue;
    if (!gpsProviderCanUpdatePlate(vehicle, plateKey)) continue;
    const result = applyGpsPointToTrips(store, vehicle, now);
    const targetTrip = result.matchedTrips[0];
    store.gpsVehiclesByPlate[plateKey] = {
      ...vehicle,
      plateKey,
      lastUpdate: now.toISOString(),
      matchedTripId: targetTrip?.id || "",
      matchedOrderCode: targetTrip?.orderCode || "",
      matchedRouteCode: targetTrip?.routeCode || "",
    };

    for (const event of result.events) {
      allEvents.push(event);
      const trip = store.trips.find((item) => Number(item.id) === Number(event.tripId));
      if (trip) ensureGateLogForDriverArrival(trip, event);
      await saveTripStopEvent(event);
    }
  }
  await saveStore();
  return allEvents;
}

function gpsProviderCanUpdatePlate(vehicle, plateKey) {
  const providers = Array.isArray(store.gpsConfig?.providers) ? store.gpsConfig.providers : [];
  const owners = providers.filter((provider) =>
    String(provider.vehiclePlates || "")
      .split(/[,\n;]/)
      .some((plate) => normalizePlate(plate) === plateKey),
  );
  if (!owners.length) return true;

  const incoming = normalizeText(`${vehicle.provider || ""} ${vehicle.providerName || ""} ${vehicle.id || ""}`);
  return owners.some((provider) => {
    const owner = normalizeText(`${provider.name || ""} ${provider.id || ""}`);
    return incoming.includes(owner) || owner.includes(incoming);
  });
}

app.get("/api/gps/dashboard", (req, res) => {
  res.json(gpsDashboard(store));
});

app.get("/api/gps/config", (req, res) => {
  res.json(store.gpsConfig || {});
});

app.get("/api/config", (req, res) => {
  res.json(store.gpsConfig || {});
});

app.put("/api/gps/config", async (req, res, next) => {
  try {
    store.gpsConfig = {
      ...(store.gpsConfig || {}),
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    await saveStore();
    res.json(store.gpsConfig);
  } catch (error) {
    next(error);
  }
});

app.post("/api/config", async (req, res, next) => {
  try {
    store.gpsConfig = {
      ...(store.gpsConfig || {}),
      ...req.body,
      updatedAt: new Date().toISOString(),
    };
    await saveStore();
    res.json({ ok: true, storage: dbPool ? "mysql" : "memory" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/gps/vehicles", async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.vehicles) ? req.body.vehicles : Array.isArray(req.body) ? req.body : [req.body];
    const events = await processGpsVehicles(rows);
    res.status(201).json({ events, dashboard: gpsDashboard(store) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/gps/providers/:providerName/data", async (req, res, next) => {
  try {
    const removed = removeGpsProviderData(store, req.params.providerName);
    await saveStore();
    res.json({ ok: true, removed, dashboard: gpsDashboard(store) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/gps/plates/:plateNumber/data", async (req, res, next) => {
  try {
    const removed = removeGpsPlateData(store, req.params.plateNumber);
    await saveStore();
    res.json({ ok: true, removed, dashboard: gpsDashboard(store) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/gps/demo", async (req, res, next) => {
  try {
    const dashboard = gpsDashboard(store);
    const activeTrips = dashboard.trips.filter((trip) => trip.plateNumber && trip.targetStop).slice(0, 12);
    const rows = activeTrips.map((trip, index) => {
      const offset = index % 2 === 0 ? 0.0003 : 0.012;
      return {
        id: `demo-${trip.id}`,
        plateNumber: trip.plateNumber,
        provider: "Demo GPS",
        lat: Number(trip.targetStop.lat) + offset,
        lng: Number(trip.targetStop.lng) + offset,
        speed: index % 2 === 0 ? 0 : 45,
        heading: index * 28,
        driverName: trip.driverName,
        driverPhone: trip.driverPhone,
        address: `Demo quanh ${trip.targetStop.name}`,
      };
    });
    const events = await processGpsVehicles(rows);
    res.status(201).json({ events, dashboard: gpsDashboard(store) });
  } catch (error) {
    next(error);
  }
});

const GPS_PROXY_BASES = {
  tct: "https://webapi.dientutct.com/api/gps",
  gotrack: "https://gps.gotrack.vn/api/v1",
  hungduong: "https://hungduonggps.vn/api/v1",
  binhanh: "http://api.gps.binhanh.vn/api/gps",
  etruck: "https://cus.etruck.vn/api/",
  thanhlong: "http://stagingws.giamsathanhtrinh.vn/SmartLog.asmx",
};

const GPS_POST_FORM_ENDPOINTS = new Set(["tct:tracking", "binhanh:tracking"]);

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlText(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim() : "";
}

function parseThanhLongVehicles(xml) {
  return Array.from(String(xml || "").matchAll(/<CarInfo_SmartLog>([\s\S]*?)<\/CarInfo_SmartLog>/gi)).map((match) => {
    const block = match[1];
    return {
      CarID: xmlText(block, "CarID"),
      CarPlate: xmlText(block, "CarPlate"),
      Speed: Number(xmlText(block, "Speed") || 0),
      NoGPS: xmlText(block, "NoGPS").toLowerCase() === "true",
      NoGRPS: xmlText(block, "NoGRPS").toLowerCase() === "true",
      Lat: Number(xmlText(block, "Lat")),
      Lng: Number(xmlText(block, "Lng")),
      Time: xmlText(block, "Time"),
      Address: xmlText(block, "Address"),
      Temp: Number(xmlText(block, "Temp") || 0),
    };
  });
}

const proxyRateLimit = new Map();
const PROXY_RATE_LIMIT_WINDOW_MS = 60_000;
const PROXY_RATE_LIMIT_MAX = 30;

function checkProxyRateLimit(ip) {
  const now = Date.now();
  const record = proxyRateLimit.get(ip);
  if (!record || now - record.windowStart > PROXY_RATE_LIMIT_WINDOW_MS) {
    proxyRateLimit.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  record.count++;
  return record.count <= PROXY_RATE_LIMIT_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of proxyRateLimit) {
    if (now - record.windowStart > PROXY_RATE_LIMIT_WINDOW_MS * 2) proxyRateLimit.delete(ip);
  }
}, PROXY_RATE_LIMIT_WINDOW_MS * 2);

app.all("/proxy/:provider/:endpoint", authenticateToken, async (req, res, next) => {
  try {
    const clientIp = req.ip || req.connection?.remoteAddress || "unknown";
    if (!checkProxyRateLimit(clientIp)) {
      return res.status(429).json({ error: "Rate limit exceeded for GPS proxy" });
    }
    const { provider, endpoint } = req.params;
    const base = GPS_PROXY_BASES[provider];
    const allowed = new Set(["vehicles", "tracking-vehicles", "history-vehicle", "tracking", "loc", "GetCarInfo"]);
    if (!base || !allowed.has(endpoint)) return res.status(404).json({ error: "Unsupported GPS provider endpoint" });

    const params = new URLSearchParams(req.query);
    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      for (const [key, value] of Object.entries(req.body)) {
        if (value !== undefined && value !== null) params.set(key, String(value));
      }
    }
    if (provider === "etruck") {
      params.set("act", "loc");
      const target = `${base}?${params.toString()}`;
      const response = await fetch(target, {
        method: "POST",
        headers: { "User-Agent": "ALS-Vehicle-Tracker/1.0" },
      });
      const text = await response.text();
      res.status(response.status);
      res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(text);
      return;
    }

    if (provider === "thanhlong" && endpoint === "GetCarInfo") {
      const username = params.get("username") || params.get("UserName") || params.get("customerCode") || "";
      const password = params.get("password") || params.get("Password") || params.get("Key") || "";
      const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <ServiceAuthHeader xmlns="http://tempuri.org/">
      <Username>${xmlEscape(process.env.THANHLONG_SOAP_USERNAME || "smartlog")}</Username>
      <Password>${xmlEscape(process.env.THANHLONG_SOAP_PASSWORD || "")}</Password>
    </ServiceAuthHeader>
  </soap:Header>
  <soap:Body>
    <GetCarInfo xmlns="http://tempuri.org/">
      <username>${xmlEscape(username)}</username>
      <password>${xmlEscape(password)}</password>
    </GetCarInfo>
  </soap:Body>
</soap:Envelope>`;
      const response = await fetch(base, {
        method: "POST",
        headers: {
          "User-Agent": "ALS-Vehicle-Tracker/1.0",
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "\"http://tempuri.org/GetCarInfo\"",
        },
        body: soapBody,
      });
      const text = await response.text();
      res.status(response.status);
      res.setHeader("Cache-Control", "no-store");
      if (!response.ok) {
        res.setHeader("Content-Type", response.headers.get("content-type") || "text/xml; charset=utf-8");
        res.send(text);
        return;
      }
      res.json({ status: "success", vehicles: parseThanhLongVehicles(text) });
      return;
    }

    if (provider === "hungduong" && endpoint === "tracking-vehicles" && !params.get("vehiclePlates") && params.get("apikey")) {
      const vehicleUrl = `${base}/vehicles?${new URLSearchParams({ apikey: params.get("apikey") })}`;
      const vehicleResponse = await fetch(vehicleUrl, { headers: { "User-Agent": "ALS-Vehicle-Tracker/1.0" } });
      const vehiclePayload = await vehicleResponse.json();
      const rows = vehiclePayload.result || [];
      params.set(
        "vehiclePlates",
        rows.map((row) => String(row.numberPlate || row.name || "").trim()).filter(Boolean).join(","),
      );
    }

    const mustPostForm = req.method === "GET" && GPS_POST_FORM_ENDPOINTS.has(`${provider}:${endpoint}`);
    const proxyMethod = mustPostForm ? "POST" : req.method;
    const isGet = proxyMethod === "GET";
    const body = !isGet && params.toString() ? params.toString() : undefined;
    const target = `${base}/${endpoint}${isGet && params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(target, {
      method: proxyMethod,
      headers: {
        "User-Agent": "ALS-Vehicle-Tracker/1.0",
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}),
      },
      ...(body ? { body } : {}),
    });
    const text = await response.text();
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(text);
  } catch (error) {
    next(error);
  }
});

app.get("/api/costs", (req, res) => {
  res.json(store.costs);
});

app.get("/api/account-admin", (req, res) => {
  store.accountAdmin = ensureCoreLoginUsers(store.accountAdmin || defaultAccountAdmin());
  res.json(store.accountAdmin);
});

app.put("/api/account-admin", async (req, res, next) => {
  try {
    const fallback = defaultAccountAdmin();
    const users = Array.isArray(req.body?.users) ? req.body.users : fallback.users;
    const permissions = req.body?.permissions && typeof req.body?.permissions === "object" ? req.body.permissions : fallback.permissions;
    store.accountAdmin = await normalizeAccountPasswords(ensureCoreLoginUsers({ users, permissions }));
    await saveStore();
    res.json(store.accountAdmin);
  } catch (error) {
    next(error);
  }
});

app.get("/api/report-templates", (req, res) => {
  const templates = store.reportTemplates || [];
  res.json({
    templates,
    selectedId: store.reportTemplateSelectedId || templates[0]?.id || "",
  });
});

app.put("/api/report-templates", (req, res) => {
  const templates = Array.isArray(req.body?.templates) ? req.body.templates : [];
  const selectedId = String(req.body?.selectedId || templates[0]?.id || "");
  store.reportTemplates = templates;
  store.reportTemplateSelectedId = selectedId;
  res.json({ templates, selectedId });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Lá»—i server local", detail: error.message });
});

await initializeStore();

app.listen(PORT, "127.0.0.1", () => {
  console.log(`ALSE transport API listening on http://127.0.0.1:${PORT} (${store.source})`);
});
