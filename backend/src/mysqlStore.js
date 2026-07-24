import { localMysqlDateTime } from "./domain.js";
import { databaseRowsToStore, storeToDatabaseRows } from "./storageMapping.js";

function jsonValue(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function mysqlDateTime(value) {
  return localMysqlDateTime(value);
}

function isoDateTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

async function ensureColumn(pool, table, column, definition) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (Number(rows[0]?.count || 0) === 0) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function ensureBusinessSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      contact VARCHAR(255) NULL,
      phone VARCHAR(64) NULL,
      email VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_customers_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transport_partners (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      contact VARCHAR(255) NULL,
      phone VARCHAR(64) NULL,
      email VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_transport_partners_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS locations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      code VARCHAR(32) NOT NULL,
      name VARCHAR(255) NOT NULL,
      address TEXT NULL,
      lat DECIMAL(10, 6) NULL,
      lng DECIMAL(10, 6) NULL,
      radius_m INT UNSIGNED NOT NULL DEFAULT 500,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_locations_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS routes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      customer_id BIGINT UNSIGNED NOT NULL,
      route_code VARCHAR(255) NOT NULL,
      point1_location_id BIGINT UNSIGNED NULL,
      point2_location_id BIGINT UNSIGNED NULL,
      point3_location_id BIGINT UNSIGNED NULL,
      km DECIMAL(10, 2) NULL,
      route_type ENUM('import', 'export', 'domestic') NOT NULL DEFAULT 'import',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_routes_customer_route_code (customer_id, route_code),
      KEY idx_routes_customer_id (customer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      order_code VARCHAR(32) NOT NULL,
      order_type ENUM('import', 'export', 'domestic') NOT NULL DEFAULT 'import',
      customer_id BIGINT UNSIGNED NULL,
      route_id BIGINT UNSIGNED NULL,
      partner_id BIGINT UNSIGNED NULL,
      required_arrival_at DATETIME NOT NULL,
      point1_arrival_at DATETIME NULL,
      point1_depart_at DATETIME NULL,
      point2_arrival_at DATETIME NULL,
      point2_depart_at DATETIME NULL,
      point3_arrival_at DATETIME NULL,
      point3_depart_at DATETIME NULL,
      plate_number VARCHAR(32) NULL,
      driver_name VARCHAR(255) NULL,
      driver_phone VARCHAR(64) NULL,
      cargo_weight VARCHAR(32) NULL,
      vehicle_type VARCHAR(64) NOT NULL DEFAULT 'Thuong',
      status VARCHAR(32) NOT NULL DEFAULT 'plan',
      status_label VARCHAR(64) NOT NULL DEFAULT 'Plan',
      estimated_cost DECIMAL(14, 2) NULL,
      note TEXT NULL,
      created_by VARCHAR(128) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_trips_order_code (order_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn(pool, "trips", "created_by", "VARCHAR(128) NULL AFTER note");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trip_waybills (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      trip_id BIGINT UNSIGNED NOT NULL,
      line_no INT UNSIGNED NOT NULL,
      hawb VARCHAR(128) NULL,
      mawb VARCHAR(128) NULL,
      package_count INT UNSIGNED NULL,
      gross_weight DECIMAL(12, 2) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_trip_waybills_trip_line (trip_id, line_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trip_costs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      trip_id BIGINT UNSIGNED NULL,
      order_code VARCHAR(32) NULL,
      cost_type VARCHAR(128) NOT NULL,
      amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      description TEXT NULL,
      approval_status VARCHAR(64) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_trip_costs_trip_id (trip_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn(pool, "trip_costs", "order_code", "VARCHAR(32) NULL AFTER trip_id");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trip_stop_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      trip_id BIGINT UNSIGNED NOT NULL,
      order_code VARCHAR(32) NOT NULL,
      stop_no TINYINT UNSIGNED NOT NULL,
      stop_name VARCHAR(255) NOT NULL,
      event_type VARCHAR(32) NOT NULL,
      event_time DATETIME NOT NULL,
      source VARCHAR(32) NOT NULL DEFAULT 'driver',
      status ENUM('confirmed', 'draft') NOT NULL DEFAULT 'confirmed',
      edit_reason TEXT NULL,
      report_type VARCHAR(32) NULL,
      amount VARCHAR(64) NULL,
      note TEXT NULL,
      attachment_name VARCHAR(255) NULL,
      attachment_data_url MEDIUMTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_trip_stop_events_trip_stop (trip_id, stop_no, event_type),
      KEY idx_trip_stop_events_order_code (order_code),
      KEY idx_trip_stop_events_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query("ALTER TABLE trip_stop_events MODIFY COLUMN event_type VARCHAR(32) NOT NULL");
  await ensureColumn(pool, "trip_stop_events", "report_type", "VARCHAR(32) NULL AFTER edit_reason");
  await ensureColumn(pool, "trip_stop_events", "amount", "VARCHAR(64) NULL AFTER report_type");
  await ensureColumn(pool, "trip_stop_events", "note", "TEXT NULL AFTER amount");
  await ensureColumn(pool, "trip_stop_events", "attachment_name", "VARCHAR(255) NULL AFTER note");
  await ensureColumn(pool, "trip_stop_events", "attachment_data_url", "MEDIUMTEXT NULL AFTER attachment_name");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      plate_number VARCHAR(32) NOT NULL,
      vehicle_type VARCHAR(128) NOT NULL,
      owner VARCHAR(128) NULL,
      driver_name VARCHAR(255) NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'San sang',
      current_route VARCHAR(255) NULL,
      fuel_norm VARCHAR(64) NULL,
      registry_due VARCHAR(64) NULL,
      load_capacity VARCHAR(64) NULL,
      vehicle_length VARCHAR(64) NULL,
      vehicle_width VARCHAR(64) NULL,
      vehicle_height VARCHAR(64) NULL,
      door_count VARCHAR(32) NULL,
      registration_number VARCHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_vehicles_plate_number (plate_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn(pool, "vehicles", "load_capacity", "VARCHAR(64) NULL AFTER registry_due");
  await ensureColumn(pool, "vehicles", "vehicle_length", "VARCHAR(64) NULL AFTER load_capacity");
  await ensureColumn(pool, "vehicles", "vehicle_width", "VARCHAR(64) NULL AFTER vehicle_length");
  await ensureColumn(pool, "vehicles", "vehicle_height", "VARCHAR(64) NULL AFTER vehicle_width");
  await ensureColumn(pool, "vehicles", "door_count", "VARCHAR(32) NULL AFTER vehicle_height");
  await ensureColumn(pool, "vehicles", "registration_number", "VARCHAR(64) NULL AFTER door_count");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS drivers (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      full_name VARCHAR(255) NOT NULL,
      phone VARCHAR(64) NULL,
      license_class VARCHAR(32) NULL,
      vehicle_plate VARCHAR(32) NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'San sang',
      monthly_trips INT NOT NULL DEFAULT 0,
      safety_note VARCHAR(255) NULL,
      employee_code VARCHAR(64) NULL,
      position VARCHAR(128) NULL,
      license_type VARCHAR(32) NULL,
      date_of_birth VARCHAR(32) NULL,
      identity_number VARCHAR(64) NULL,
      address TEXT NULL,
      contract_start VARCHAR(32) NULL,
      contract_end VARCHAR(32) NULL,
      family_deduction VARCHAR(32) NULL,
      bank_account VARCHAR(128) NULL,
      bank_name VARCHAR(255) NULL,
      application_file_on_hand TINYINT(1) NOT NULL DEFAULT 0,
      hard_copy_contract_on_hand TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_drivers_vehicle_plate (vehicle_plate)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn(pool, "drivers", "employee_code", "VARCHAR(64) NULL AFTER safety_note");
  await ensureColumn(pool, "drivers", "position", "VARCHAR(128) NULL AFTER employee_code");
  await ensureColumn(pool, "drivers", "license_type", "VARCHAR(32) NULL AFTER position");
  await ensureColumn(pool, "drivers", "date_of_birth", "VARCHAR(32) NULL AFTER license_type");
  await ensureColumn(pool, "drivers", "identity_number", "VARCHAR(64) NULL AFTER date_of_birth");
  await ensureColumn(pool, "drivers", "address", "TEXT NULL AFTER identity_number");
  await ensureColumn(pool, "drivers", "contract_start", "VARCHAR(32) NULL AFTER address");
  await ensureColumn(pool, "drivers", "contract_end", "VARCHAR(32) NULL AFTER contract_start");
  await ensureColumn(pool, "drivers", "family_deduction", "VARCHAR(32) NULL AFTER contract_end");
  await ensureColumn(pool, "drivers", "bank_account", "VARCHAR(128) NULL AFTER family_deduction");
  await ensureColumn(pool, "drivers", "bank_name", "VARCHAR(255) NULL AFTER bank_account");
  await ensureColumn(pool, "drivers", "application_file_on_hand", "TINYINT(1) NOT NULL DEFAULT 0 AFTER bank_name");
  await ensureColumn(pool, "drivers", "hard_copy_contract_on_hand", "TINYINT(1) NOT NULL DEFAULT 0 AFTER application_file_on_hand");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fuel_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      fuel_date VARCHAR(32) NOT NULL,
      plate_number VARCHAR(32) NOT NULL,
      driver_name VARCHAR(255) NULL,
      liters DECIMAL(12, 2) NOT NULL DEFAULT 0,
      unit_price DECIMAL(14, 2) NOT NULL DEFAULT 0,
      amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      km_reading DECIMAL(14, 2) NOT NULL DEFAULT 0,
      km_run DECIMAL(14, 2) NOT NULL DEFAULT 0,
      fuel_norm DECIMAL(10, 2) NOT NULL DEFAULT 0,
      norm_liters DECIMAL(12, 2) NOT NULL DEFAULT 0,
      previous_liters DECIMAL(12, 2) NOT NULL DEFAULT 0,
      fuel_delta DECIMAL(12, 2) NOT NULL DEFAULT 0,
      station VARCHAR(255) NULL,
      status VARCHAR(64) NOT NULL DEFAULT 'Hop le',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_fuel_logs_plate_date (plate_number, fuel_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn(pool, "fuel_logs", "km_reading", "DECIMAL(14, 2) NOT NULL DEFAULT 0 AFTER amount");
  await ensureColumn(pool, "fuel_logs", "km_run", "DECIMAL(14, 2) NOT NULL DEFAULT 0 AFTER km_reading");
  await ensureColumn(pool, "fuel_logs", "fuel_norm", "DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER km_run");
  await ensureColumn(pool, "fuel_logs", "norm_liters", "DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER fuel_norm");
  await ensureColumn(pool, "fuel_logs", "previous_liters", "DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER norm_liters");
  await ensureColumn(pool, "fuel_logs", "fuel_delta", "DECIMAL(12, 2) NOT NULL DEFAULT 0 AFTER previous_liters");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salary_rates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      route VARCHAR(255) NOT NULL,
      vehicle VARCHAR(64) NULL,
      base_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      loading_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      night_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transport_rates (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      customer VARCHAR(128) NOT NULL,
      route VARCHAR(255) NOT NULL,
      km VARCHAR(32) NULL,
      rate_125 VARCHAR(64) NULL,
      rate_25 VARCHAR(64) NULL,
      rate_35 VARCHAR(64) NULL,
      rate_5 VARCHAR(64) NULL,
      rate_7 VARCHAR(64) NULL,
      rate_8 VARCHAR(64) NULL,
      rate_10 VARCHAR(64) NULL,
      rate_15 VARCHAR(64) NULL,
      rate_20 VARCHAR(64) NULL,
      cont_20 VARCHAR(64) NULL,
      cont_40 VARCHAR(64) NULL,
      cont_45 VARCHAR(64) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_transport_rates_customer_route (customer, route)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await ensureColumn(pool, "transport_rates", "rate_7", "VARCHAR(64) NULL AFTER rate_5");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fuel_surcharges (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      content VARCHAR(255) NOT NULL,
      date_from VARCHAR(32) NULL,
      date_to VARCHAR(32) NULL,
      percent VARCHAR(32) NULL,
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS salary_advances (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      advance_date VARCHAR(32) NOT NULL,
      driver_name VARCHAR(255) NOT NULL,
      amount DECIMAL(14, 2) NOT NULL DEFAULT 0,
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_salary_advances_driver_month (driver_name, advance_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS standard_fuel_prices (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      price_month VARCHAR(7) NOT NULL,
      unit_price DECIMAL(14, 2) NOT NULL DEFAULT 0,
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_standard_fuel_prices_month (price_month)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_deliveries (
      id BIGINT UNSIGNED NOT NULL,
      data JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gate_logs (
      id BIGINT UNSIGNED NOT NULL,
      data JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(64) NOT NULL,
      data JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_templates (
      id VARCHAR(128) NOT NULL,
      name VARCHAR(255) NOT NULL,
      data JSON NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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

export async function saveStoreToDatabase(pool, store) {
  const rows = storeToDatabaseRows(store);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of [
      "trip_stop_events",
      "trip_waybills",
      "trip_costs",
      "trips",
      "routes",
      "locations",
      "salary_rates",
      "transport_rates",
      "fuel_surcharges",
      "salary_advances",
      "standard_fuel_prices",
      "fuel_logs",
      "drivers",
      "vehicles",
      "transport_partners",
      "customers",
      "customer_deliveries",
      "gate_logs",
      "app_settings",
      "report_templates",
    ]) {
      await connection.query(`DELETE FROM ${table}`);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");

    for (const customer of rows.customers) {
      await connection.execute(
        `INSERT INTO customers (id, code, name, contact, phone, email) VALUES (?, ?, ?, ?, ?, ?)`,
        [customer.id || null, customer.code, customer.name, customer.contact || null, customer.phone || null, customer.email || null],
      );
    }
    for (const partner of rows.transportPartners) {
      await connection.execute(
        `INSERT INTO transport_partners (id, code, name, contact, phone, email) VALUES (?, ?, ?, ?, ?, ?)`,
        [partner.id || null, partner.code, partner.name, partner.contact || null, partner.phone || null, partner.email || null],
      );
    }
    for (const location of rows.locations) {
      await connection.execute(
        `INSERT INTO locations (id, code, name, address, lat, lng, radius_m) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          location.id || null,
          location.code,
          location.name,
          location.address || null,
          location.lat ?? null,
          location.lng ?? null,
          location.radiusM ?? location.radius_m ?? 500,
        ],
      );
    }

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
    for (const event of rows.tripStopEvents) {
      await connection.execute(
        `INSERT INTO trip_stop_events
          (id, trip_id, order_code, stop_no, stop_name, event_type, event_time, source, status, edit_reason,
           report_type, amount, note, attachment_name, attachment_data_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
        [
          event.id || null,
          event.tripId,
          event.orderCode,
          event.stopNo,
          event.stopName,
          event.eventType,
          mysqlDateTime(event.eventTime),
          event.source || "driver",
          event.status || "confirmed",
          event.editReason || null,
          event.reportType || null,
          event.amount || null,
          event.note || null,
          event.attachmentName || null,
          event.attachmentDataUrl || null,
          mysqlDateTime(event.createdAt),
        ],
      );
    }
    for (const vehicle of rows.vehicles) {
      await connection.execute(
        `INSERT INTO vehicles
          (id, plate_number, vehicle_type, owner, driver_name, status, current_route, fuel_norm, registry_due,
           load_capacity, vehicle_length, vehicle_width, vehicle_height, door_count, registration_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vehicle.id || null,
          vehicle.plateNumber,
          vehicle.type || vehicle.loadCapacity || "",
          vehicle.owner || null,
          vehicle.driverName || null,
          vehicle.status || "San sang",
          vehicle.route || null,
          vehicle.fuelNorm || null,
          vehicle.registryDue || null,
          vehicle.loadCapacity || vehicle.type || null,
          vehicle.length || null,
          vehicle.width || null,
          vehicle.height || null,
          vehicle.doorCount || null,
          vehicle.registrationNumber || null,
        ],
      );
    }
    for (const driver of rows.drivers) {
      await connection.execute(
        `INSERT INTO drivers
          (id, full_name, phone, license_class, vehicle_plate, status, monthly_trips, safety_note,
           employee_code, position, license_type, date_of_birth, identity_number, address,
           contract_start, contract_end, family_deduction, bank_account, bank_name,
           application_file_on_hand, hard_copy_contract_on_hand)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          driver.id || null,
          driver.name,
          driver.phone || null,
          driver.license || driver.licenseType || null,
          driver.vehicle || null,
          driver.status || "San sang",
          Number(driver.trips) || 0,
          driver.safety || null,
          driver.employeeCode || null,
          driver.position || null,
          driver.licenseType || driver.license || null,
          driver.dateOfBirth || null,
          driver.identityNumber || null,
          driver.address || null,
          driver.contractStart || null,
          driver.contractEnd || null,
          driver.familyDeduction || null,
          driver.bankAccount || null,
          driver.bankName || null,
          driver.applicationFileOnHand ? 1 : 0,
          driver.hardCopyContractOnHand ? 1 : 0,
        ],
      );
    }
    for (const log of rows.fuelLogs) {
      await connection.execute(
        `INSERT INTO fuel_logs
          (id, fuel_date, plate_number, driver_name, liters, unit_price, amount, km_reading, km_run, fuel_norm, norm_liters, previous_liters, fuel_delta, station, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.id || null,
          log.date || "",
          log.plateNumber || "",
          log.driverName || null,
          Number(log.liters) || 0,
          Number(log.unitPrice) || 0,
          Number(log.amount) || 0,
          Number(log.kmReading) || 0,
          Number(log.kmRun) || 0,
          Number(log.fuelNorm) || 0,
          Number(log.normLiters) || 0,
          Number(log.previousLiters) || 0,
          Number(log.fuelDelta) || 0,
          log.station || null,
          log.status || "Hop le",
        ],
      );
    }
    for (const rate of rows.salaryRates) {
      await connection.execute(
        `INSERT INTO salary_rates
          (id, route, vehicle, base_amount, loading_amount, night_amount, total_amount, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rate.id || null,
          rate.route || "",
          rate.vehicle || null,
          Number(rate.base) || 0,
          Number(rate.loading) || 0,
          Number(rate.night) || 0,
          Number(rate.total) || 0,
          rate.note || null,
        ],
      );
    }
    for (const rate of rows.transportRates || []) {
      await connection.execute(
        `INSERT INTO transport_rates
          (id, customer, route, km, rate_125, rate_25, rate_35, rate_5, rate_7, rate_8, rate_10,
           rate_15, rate_20, cont_20, cont_40, cont_45, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          rate.id || null,
          rate.customer || "",
          rate.route || "",
          rate.km || null,
          rate.rate125 || null,
          rate.rate25 || null,
          rate.rate35 || null,
          rate.rate5 || null,
          rate.rate7 || null,
          rate.rate8 || null,
          rate.rate10 || null,
          rate.rate15 || null,
          rate.rate20 || null,
          rate.cont20 || null,
          rate.cont40 || null,
          rate.cont45 || null,
          rate.status || "active",
        ],
      );
    }
    for (const surcharge of rows.fuelSurcharges || []) {
      await connection.execute(
        `INSERT INTO fuel_surcharges
          (id, content, date_from, date_to, percent, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          surcharge.id || null,
          surcharge.content || "",
          surcharge.dateFrom || null,
          surcharge.dateTo || null,
          surcharge.percent || null,
          surcharge.note || null,
        ],
      );
    }
    for (const advance of rows.salaryAdvances || []) {
      await connection.execute(
        `INSERT INTO salary_advances
          (id, advance_date, driver_name, amount, note)
         VALUES (?, ?, ?, ?, ?)`,
        [
          advance.id || null,
          advance.date || "",
          advance.driverName || "",
          Number(advance.amount) || 0,
          advance.note || null,
        ],
      );
    }
    for (const price of rows.standardFuelPrices || []) {
      await connection.execute(
        `INSERT INTO standard_fuel_prices
          (id, price_month, unit_price, note)
         VALUES (?, ?, ?, ?)`,
        [
          price.id || null,
          String(price.month || "").slice(0, 7),
          Number(price.unitPrice) || 0,
          price.note || null,
        ],
      );
    }
    for (const delivery of rows.customerDeliveries) {
      await connection.execute(`INSERT INTO customer_deliveries (id, data) VALUES (?, ?)`, [delivery.id, JSON.stringify(delivery.data)]);
    }
    for (const log of rows.gateLogs) {
      await connection.execute(`INSERT INTO gate_logs (id, data) VALUES (?, ?)`, [log.id, JSON.stringify(log.data)]);
    }
    for (const setting of rows.appSettings) {
      await connection.execute(`INSERT INTO app_settings (setting_key, data) VALUES (?, ?)`, [setting.settingKey, JSON.stringify(setting.data)]);
    }
    for (const template of rows.reportTemplates) {
      await connection.execute(`INSERT INTO report_templates (id, name, data) VALUES (?, ?, ?)`, [
        template.id,
        template.name,
        JSON.stringify(template.data),
      ]);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function loadStoreFromDatabase(pool) {
  const [customers] = await pool.query("SELECT id, code, name, contact, phone, email FROM customers ORDER BY id");
  const [transportPartners] = await pool.query("SELECT id, code, name, contact, phone, email FROM transport_partners ORDER BY id");
  const [locations] = await pool.query("SELECT id, code, name, address, lat, lng, radius_m AS radiusM FROM locations ORDER BY id");
  const [routes] = await pool.query(`
    SELECT r.id, c.code AS customerCode, r.route_code AS routeCode,
           l1.name AS \`from\`, l2.name AS \`to\`, l3.name AS via,
           r.km, r.route_type AS type
      FROM routes r
      JOIN customers c ON c.id = r.customer_id
      LEFT JOIN locations l1 ON l1.id = r.point1_location_id
      LEFT JOIN locations l2 ON l2.id = r.point2_location_id
      LEFT JOIN locations l3 ON l3.id = r.point3_location_id
      ORDER BY r.id
  `);
  const [tripsRaw] = await pool.query(`
    SELECT t.id, t.order_code AS orderCode, t.order_type AS orderType,
           c.code AS customerCode, r.route_code AS routeCode, p.code AS partnerCode, p.name AS partnerName,
           l1.name AS \`from\`, l2.name AS \`to\`, l3.name AS via,
           t.required_arrival_at AS requiredArrivalAt,
           t.point1_arrival_at AS point1ArrivalAt, t.point1_depart_at AS point1DepartAt,
           t.point2_arrival_at AS point2ArrivalAt, t.point2_depart_at AS point2DepartAt,
           t.point3_arrival_at AS point3ArrivalAt, t.point3_depart_at AS point3DepartAt,
           t.plate_number AS plateNumber, t.driver_name AS driverName, t.driver_phone AS driverPhone,
           t.cargo_weight AS cargoWeight, t.vehicle_type AS vehicleType,
           t.status, t.status_label AS statusLabel, t.estimated_cost AS estimatedCost, t.note,
           t.created_by AS createdBy, t.created_at AS createdAt
      FROM trips t
      LEFT JOIN customers c ON c.id = t.customer_id
      LEFT JOIN routes r ON r.id = t.route_id
      LEFT JOIN locations l1 ON l1.id = r.point1_location_id
      LEFT JOIN locations l2 ON l2.id = r.point2_location_id
      LEFT JOIN locations l3 ON l3.id = r.point3_location_id
      LEFT JOIN transport_partners p ON p.id = t.partner_id
      ORDER BY t.required_arrival_at, t.id
  `);
  const trips = tripsRaw.map((trip) => ({
    ...trip,
    requiredArrivalAt: isoDateTime(trip.requiredArrivalAt),
    point1ArrivalAt: isoDateTime(trip.point1ArrivalAt),
    point1DepartAt: isoDateTime(trip.point1DepartAt),
    point2ArrivalAt: isoDateTime(trip.point2ArrivalAt),
    point2DepartAt: isoDateTime(trip.point2DepartAt),
    point3ArrivalAt: isoDateTime(trip.point3ArrivalAt),
    point3DepartAt: isoDateTime(trip.point3DepartAt),
    createdAt: isoDateTime(trip.createdAt),
  }));
  const [tripWaybills] = await pool.query(
    "SELECT trip_id AS tripId, line_no AS lineNo, hawb, mawb, package_count AS packageCount, gross_weight AS grossWeight FROM trip_waybills ORDER BY trip_id, line_no",
  );
  const [tripCosts] = await pool.query(
    "SELECT id, trip_id AS tripId, order_code AS orderCode, cost_type AS type, amount, description, approval_status AS status FROM trip_costs ORDER BY id",
  );
  const [eventsRaw] = await pool.query(
    "SELECT id, trip_id AS tripId, order_code AS orderCode, stop_no AS stopNo, stop_name AS stopName, event_type AS eventType, event_time AS eventTime, source, status, edit_reason AS editReason, report_type AS reportType, amount, note, attachment_name AS attachmentName, attachment_data_url AS attachmentDataUrl, created_at AS createdAt FROM trip_stop_events ORDER BY created_at DESC, id DESC",
  );
  const tripStopEvents = eventsRaw.map((event) => ({
    ...event,
    eventTime: isoDateTime(event.eventTime),
    createdAt: isoDateTime(event.createdAt),
  }));
  const [customerDeliveries] = await pool.query("SELECT id, data FROM customer_deliveries ORDER BY id");
  const [gateLogs] = await pool.query("SELECT id, data FROM gate_logs ORDER BY id");
  const [settingsRaw] = await pool.query("SELECT setting_key AS settingKey, data FROM app_settings");
  const [reportTemplatesRaw] = await pool.query("SELECT id, name, data FROM report_templates ORDER BY name, id");
  const [vehicles] = await pool.query(`
    SELECT id, plate_number AS plateNumber, vehicle_type AS type, owner, driver_name AS driverName,
           status, current_route AS route, fuel_norm AS fuelNorm, registry_due AS registryDue,
           load_capacity AS loadCapacity, vehicle_length AS length, vehicle_width AS width,
           vehicle_height AS height, door_count AS doorCount, registration_number AS registrationNumber
      FROM vehicles
      ORDER BY id
  `);
  const [drivers] = await pool.query(`
    SELECT id, full_name AS name, phone, license_class AS license, vehicle_plate AS vehicle,
           status, monthly_trips AS trips, safety_note AS safety,
           employee_code AS employeeCode, position, license_type AS licenseType,
           date_of_birth AS dateOfBirth, identity_number AS identityNumber, address,
           contract_start AS contractStart, contract_end AS contractEnd,
           family_deduction AS familyDeduction, bank_account AS bankAccount, bank_name AS bankName,
           application_file_on_hand AS applicationFileOnHand,
           hard_copy_contract_on_hand AS hardCopyContractOnHand
      FROM drivers
      ORDER BY id
  `);
  const [fuelLogs] = await pool.query(`
    SELECT id, fuel_date AS date, plate_number AS plateNumber, driver_name AS driverName,
           liters, unit_price AS unitPrice, amount, km_reading AS kmReading, km_run AS kmRun,
           fuel_norm AS fuelNorm, norm_liters AS normLiters, previous_liters AS previousLiters,
           fuel_delta AS fuelDelta, station, status
      FROM fuel_logs
      ORDER BY id DESC
  `);
  const [salaryRates] = await pool.query(`
    SELECT id, route, vehicle, base_amount AS base, loading_amount AS loading,
           night_amount AS night, total_amount AS total, note
      FROM salary_rates
      ORDER BY id
  `);
  const [transportRates] = await pool.query(`
    SELECT id, customer, route, km, rate_125 AS rate125, rate_25 AS rate25,
           rate_35 AS rate35, rate_5 AS rate5, rate_7 AS rate7, rate_8 AS rate8, rate_10 AS rate10,
           rate_15 AS rate15, rate_20 AS rate20, cont_20 AS cont20, cont_40 AS cont40,
           cont_45 AS cont45, status
      FROM transport_rates
      ORDER BY id
  `);
  const [fuelSurcharges] = await pool.query(`
    SELECT id, content, date_from AS dateFrom, date_to AS dateTo, percent, note
      FROM fuel_surcharges
      ORDER BY id DESC
  `);
  const [salaryAdvances] = await pool.query(`
    SELECT id, advance_date AS date, driver_name AS driverName, amount, note
      FROM salary_advances
      ORDER BY advance_date DESC, id DESC
  `);
  const [standardFuelPrices] = await pool.query(`
    SELECT id, price_month AS month, unit_price AS unitPrice, note
      FROM standard_fuel_prices
      ORDER BY price_month DESC, id DESC
  `);

  return databaseRowsToStore({
    customers,
    transportPartners,
    locations,
    routes,
    trips,
    tripWaybills,
    tripCosts,
    tripStopEvents,
    customerDeliveries: customerDeliveries.map((row) => ({ id: row.id, data: jsonValue(row.data, {}) })),
    gateLogs: gateLogs.map((row) => ({ id: row.id, data: jsonValue(row.data, {}) })),
    appSettings: settingsRaw.map((row) => ({ settingKey: row.settingKey, data: jsonValue(row.data, {}) })),
    reportTemplates: reportTemplatesRaw.map((row) => ({ id: row.id, name: row.name, data: jsonValue(row.data, {}) })),
    vehicles,
    drivers,
    fuelLogs,
    salaryRates,
    transportRates,
    fuelSurcharges,
    salaryAdvances,
    standardFuelPrices,
  });
}
