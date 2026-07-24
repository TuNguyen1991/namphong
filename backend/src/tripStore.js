import { localMysqlDateTime } from "./domain.js";
import { storeToDatabaseRows } from "./storageMapping.js";

const DIRECT_TRIP_ROUTE = /^\/api\/trips(?:\/bulk(?:-completed)?|\/\d+(?:\/status)?|\/?)$/;

function mysqlDateTime(value) {
  return localMysqlDateTime(value);
}

function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), max);
}

export function paginateTrips(trips = [], queryParams = {}) {
  if (queryParams.page === undefined && queryParams.pageSize === undefined) return trips;
  const page = positiveInt(queryParams.page, 1);
  const pageSize = positiveInt(queryParams.pageSize, 100, 1000);
  const start = (page - 1) * pageSize;
  return {
    rows: trips.slice(start, start + pageSize),
    total: trips.length,
    page,
    pageSize,
  };
}

export function shouldPersistWholeStore(req = {}, { directTripPersistence = false } = {}) {
  const method = String(req.method || "").toUpperCase();
  if (!["POST", "PUT", "DELETE"].includes(method)) return false;
  if (!directTripPersistence) return true;
  const path = String(req.path || "");
  return !DIRECT_TRIP_ROUTE.test(path);
}

async function fetchCodeMaps(connection) {
  const [customers] = await connection.query("SELECT id, code FROM customers");
  const [partners] = await connection.query("SELECT id, code FROM transport_partners");
  const [locations] = await connection.query("SELECT id, code, name FROM locations");
  const [routes] = await connection.query(`
    SELECT r.id, r.route_code AS routeCode, c.code AS customerCode
      FROM routes r
      JOIN customers c ON c.id = r.customer_id
  `);
  return {
    customerIdByCode: new Map(customers.map((row) => [row.code, row.id])),
    partnerIdByCode: new Map(partners.map((row) => [row.code, row.id])),
    locationIdByText: new Map(locations.flatMap((row) => [[row.code, row.id], [row.name, row.id]])),
    routeIdByKey: new Map(routes.map((row) => [`${row.customerCode}|||${row.routeCode}`, row.id])),
  };
}

export async function saveTripsDirectly(pool, store) {
  const rows = storeToDatabaseRows(store);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of ["trip_waybills", "trip_costs", "trips", "routes"]) {
      await connection.query(`DELETE FROM ${table}`);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");

    let maps = await fetchCodeMaps(connection);
    for (const route of rows.routes) {
      await connection.execute(
        `INSERT INTO routes (id, customer_id, route_code, point1_location_id, point2_location_id, point3_location_id, km, route_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          route.id || null,
          maps.customerIdByCode.get(route.customerCode) || null,
          route.routeCode,
          maps.locationIdByText.get(route.from) || null,
          maps.locationIdByText.get(route.to) || null,
          maps.locationIdByText.get(route.via) || null,
          route.km ?? null,
          route.type || "import",
        ],
      );
    }

    maps = await fetchCodeMaps(connection);
    for (const trip of rows.trips) {
      await connection.execute(
        `INSERT INTO trips
          (id, order_code, order_type, customer_id, route_id, partner_id, required_arrival_at,
           point1_arrival_at, point1_depart_at, point2_arrival_at, point2_depart_at,
           point3_arrival_at, point3_depart_at, plate_number, driver_name, driver_phone,
           cargo_weight, vehicle_type, status, status_label, estimated_cost, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        [
          trip.id || null,
          trip.orderCode,
          trip.orderType || "import",
          maps.customerIdByCode.get(trip.customerCode) || null,
          maps.routeIdByKey.get(`${trip.customerCode}|||${trip.routeCode}`) || null,
          maps.partnerIdByCode.get(trip.partnerCode) || null,
          mysqlDateTime(trip.requiredArrivalAt) || mysqlDateTime(new Date()),
          mysqlDateTime(trip.point1ArrivalAt),
          mysqlDateTime(trip.point1DepartAt),
          mysqlDateTime(trip.point2ArrivalAt),
          mysqlDateTime(trip.point2DepartAt),
          mysqlDateTime(trip.point3ArrivalAt),
          mysqlDateTime(trip.point3DepartAt),
          trip.plateNumber || null,
          trip.driverName || null,
          trip.driverPhone || null,
          trip.cargoWeight || null,
          trip.vehicleType || "Thuong",
          trip.status || "plan",
          trip.statusLabel || "Plan",
          trip.estimatedCost ?? null,
          trip.note || null,
          trip.createdBy || null,
          mysqlDateTime(trip.createdAt),
        ],
      );
    }

    for (const waybill of rows.tripWaybills) {
      await connection.execute(
        `INSERT INTO trip_waybills (trip_id, line_no, hawb, mawb, package_count, gross_weight) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          waybill.tripId,
          waybill.lineNo,
          waybill.hawb || null,
          waybill.mawb || null,
          waybill.packageCount || null,
          waybill.grossWeight || null,
        ],
      );
    }

    for (const cost of rows.tripCosts) {
      await connection.execute(
        `INSERT INTO trip_costs (id, trip_id, order_code, cost_type, amount, description, approval_status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cost.id || null, cost.tripId || null, cost.orderCode || null, cost.type, cost.amount || 0, cost.description || null, cost.status || "pending"],
      );
    }

    const auditSetting = rows.appSettings.find((setting) => setting.settingKey === "audit_logs");
    if (auditSetting) {
      await connection.execute(
        `REPLACE INTO app_settings (setting_key, data) VALUES (?, ?)`,
        [auditSetting.settingKey, JSON.stringify(auditSetting.data)],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
