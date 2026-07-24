CREATE DATABASE IF NOT EXISTS nam_phong_logistics
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE nam_phong_logistics;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
  KEY idx_routes_customer_id (customer_id),
  KEY idx_routes_point1_location_id (point1_location_id),
  KEY idx_routes_point2_location_id (point2_location_id),
  KEY idx_routes_point3_location_id (point3_location_id),
  CONSTRAINT fk_routes_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_routes_point1_location_id FOREIGN KEY (point1_location_id) REFERENCES locations (id),
  CONSTRAINT fk_routes_point2_location_id FOREIGN KEY (point2_location_id) REFERENCES locations (id),
  CONSTRAINT fk_routes_point3_location_id FOREIGN KEY (point3_location_id) REFERENCES locations (id)
) ENGINE=InnoDB;

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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trips_order_code (order_code),
  KEY idx_trips_status_required_arrival_at (status, required_arrival_at),
  KEY idx_trips_customer_id (customer_id),
  KEY idx_trips_route_id (route_id),
  KEY idx_trips_partner_id (partner_id),
  CONSTRAINT fk_trips_customer_id FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_trips_route_id FOREIGN KEY (route_id) REFERENCES routes (id),
  CONSTRAINT fk_trips_partner_id FOREIGN KEY (partner_id) REFERENCES transport_partners (id)
) ENGINE=InnoDB;

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
  UNIQUE KEY uq_trip_waybills_trip_line (trip_id, line_no),
  KEY idx_trip_waybills_hawb (hawb),
  KEY idx_trip_waybills_mawb (mawb),
  CONSTRAINT fk_trip_waybills_trip_id FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
  KEY idx_trip_costs_trip_id (trip_id),
  KEY idx_trip_costs_order_code (order_code),
  CONSTRAINT fk_trip_costs_trip_id FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE SET NULL
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_drivers_vehicle_plate (vehicle_plate)
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_deliveries (
  id BIGINT UNSIGNED NOT NULL,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS gate_logs (
  id BIGINT UNSIGNED NOT NULL,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) NOT NULL,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS report_templates (
  id VARCHAR(128) NOT NULL,
  name VARCHAR(255) NOT NULL,
  data JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_state (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  data LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
