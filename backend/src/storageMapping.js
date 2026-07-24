function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function setting(settingKey, data) {
  return { settingKey, data: data ?? (Array.isArray(data) ? [] : {}) };
}

function costRowsForTrip(trip) {
  const rows = [];
  if (trip.handlingFeeAmount) {
    rows.push({
      tripId: trip.id,
      orderCode: trip.orderCode || "",
      type: "handling",
      amount: trip.handlingFeeAmount,
      description: trip.handlingFeeSide || "",
      status: "recorded",
    });
  }
  for (const fee of toArray(trip.otherFees)) {
    rows.push({
      tripId: trip.id,
      orderCode: trip.orderCode || "",
      type: "other",
      amount: fee.amount || 0,
      description: fee.description || "",
      status: "recorded",
    });
  }
  return rows;
}

function uniqueRoutes(routes) {
  const seen = new Set();
  return toArray(routes).filter((route) => {
    const key = `${String(route.customerCode || "").trim().toUpperCase()}|||${String(route.routeCode || "").trim().toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueTransportRates(rates) {
  const byRoute = new Map();
  for (const rate of toArray(rates)) {
    const key = `${String(rate.customer || "").trim().toUpperCase()}|||${String(rate.route || "").trim().toUpperCase()}`;
    if (key === "|||") continue;
    byRoute.set(key, rate);
  }
  return Array.from(byRoute.values());
}

export function storeToDatabaseRows(store = {}) {
  const tripCosts = [
    ...toArray(store.costs).map((cost) => ({
      id: cost.id,
      tripId: cost.tripId || null,
      orderCode: cost.orderCode || "",
      type: cost.type || cost.costType || "",
      amount: cost.amount || 0,
      description: cost.description || "",
      status: cost.status || cost.approvalStatus || "pending",
    })),
    ...toArray(store.trips).flatMap(costRowsForTrip),
  ];

  return {
    customers: toArray(store.customers),
    transportPartners: toArray(store.partners),
    locations: toArray(store.locations),
    routes: uniqueRoutes(store.routes),
    trips: toArray(store.trips),
    tripWaybills: toArray(store.trips).flatMap((trip) =>
      toArray(trip.waybills).map((waybill, index) => ({
        tripId: trip.id,
        orderCode: trip.orderCode || "",
        lineNo: index + 1,
        ...waybill,
      })),
    ),
    tripCosts,
    customerDeliveries: toArray(store.customerDeliveries).map((item) => ({ id: item.id, data: item })),
    gateLogs: toArray(store.gateLogs).map((item) => ({ id: item.id, data: item })),
    tripStopEvents: toArray(store.tripStopEvents),
    vehicles: toArray(store.vehicles),
    drivers: toArray(store.drivers),
    fuelLogs: toArray(store.fuelLogs),
    salaryRates: toArray(store.salaryRates),
    transportRates: uniqueTransportRates(store.transportRates),
    fuelSurcharges: toArray(store.fuelSurcharges),
    salaryAdvances: toArray(store.salaryAdvances),
    standardFuelPrices: toArray(store.standardFuelPrices),
    appSettings: [
      setting("gps_vehicles_by_plate", store.gpsVehiclesByPlate || {}),
      setting("gps_vehicle_states", store.gpsVehicleStates || {}),
      setting("gps_events", toArray(store.gpsEvents)),
      setting("gps_config", store.gpsConfig || {}),
      setting("account_admin", store.accountAdmin || {}),
      setting("audit_logs", toArray(store.auditLogs)),
      setting("report_template_selected_id", store.reportTemplateSelectedId || ""),
      setting("driver_attendance", toArray(store.driverAttendance)),
    ],
    reportTemplates: toArray(store.reportTemplates).map((template) => ({
      id: template.id,
      name: template.name || "",
      data: template,
    })),
  };
}

function settingValue(rows, key, fallback) {
  const row = toArray(rows).find((item) => item.settingKey === key || item.setting_key === key);
  return row?.data ?? fallback;
}

export function databaseRowsToStore(rows = {}) {
  const waybillsByTrip = new Map();
  for (const row of toArray(rows.tripWaybills)) {
    const key = Number(row.tripId ?? row.trip_id);
    const list = waybillsByTrip.get(key) || [];
    list.push({
      hawb: row.hawb || "",
      mawb: row.mawb || "",
      packageCount: row.packageCount ?? row.package_count ?? "",
      grossWeight: row.grossWeight ?? row.gross_weight ?? "",
    });
    waybillsByTrip.set(key, list);
  }

  const costsByTrip = new Map();
  const standaloneCosts = [];
  for (const row of toArray(rows.tripCosts)) {
    const normalized = {
      id: row.id,
      tripId: row.tripId ?? row.trip_id ?? null,
      orderCode: row.orderCode ?? row.order_code ?? "",
      type: row.type ?? row.cost_type ?? "",
      amount: row.amount ?? 0,
      description: row.description || "",
      status: row.status ?? row.approval_status ?? "pending",
    };
    if (["handling", "other"].includes(normalized.type) && normalized.tripId) {
      const list = costsByTrip.get(Number(normalized.tripId)) || [];
      list.push(normalized);
      costsByTrip.set(Number(normalized.tripId), list);
    } else {
      standaloneCosts.push(normalized);
    }
  }

  const trips = toArray(rows.trips).map((trip) => {
    const tripId = Number(trip.id);
    const feeRows = costsByTrip.get(tripId) || [];
    const handling = feeRows.find((row) => row.type === "handling");
    return {
      ...trip,
      waybills: waybillsByTrip.get(tripId) || [],
      handlingFeeSide: handling?.description || trip.handlingFeeSide || "Khong",
      handlingFeeAmount: handling ? String(handling.amount ?? "") : trip.handlingFeeAmount || "",
      otherFees: feeRows
        .filter((row) => row.type === "other")
        .map((row) => ({ description: row.description || "", amount: String(row.amount ?? "") })),
    };
  });

  return {
    customers: toArray(rows.customers),
    partners: toArray(rows.transportPartners),
    locations: toArray(rows.locations),
    routes: toArray(rows.routes),
    trips,
    customerDeliveries: toArray(rows.customerDeliveries).map((row) => row.data || row),
    gateLogs: toArray(rows.gateLogs).map((row) => row.data || row),
    tripStopEvents: toArray(rows.tripStopEvents),
    vehicles: toArray(rows.vehicles).map((row) => ({
      id: row.id,
      plateNumber: row.plateNumber ?? row.plate_number ?? "",
      type: row.type ?? row.vehicle_type ?? "",
      owner: row.owner || "",
      driverName: row.driverName ?? row.driver_name ?? "",
      status: row.status || "",
      route: row.route ?? row.current_route ?? "",
      fuelNorm: row.fuelNorm ?? row.fuel_norm ?? "",
      registryDue: row.registryDue ?? row.registry_due ?? "",
      loadCapacity: row.loadCapacity ?? row.load_capacity ?? row.type ?? row.vehicle_type ?? "",
      length: row.length ?? row.vehicle_length ?? "",
      width: row.width ?? row.vehicle_width ?? "",
      height: row.height ?? row.vehicle_height ?? "",
      doorCount: row.doorCount ?? row.door_count ?? "",
      registrationNumber: row.registrationNumber ?? row.registration_number ?? "",
    })),
    drivers: toArray(rows.drivers).map((row) => ({
      id: row.id,
      name: row.name ?? row.full_name ?? "",
      phone: row.phone || "",
      license: row.license ?? row.license_class ?? "",
      vehicle: row.vehicle ?? row.vehicle_plate ?? "",
      status: row.status || "",
      trips: row.trips ?? row.monthly_trips ?? 0,
      safety: row.safety ?? row.safety_note ?? "",
      employeeCode: row.employeeCode ?? row.employee_code ?? "",
      position: row.position || "Lái xe",
      licenseType: row.licenseType ?? row.license_type ?? row.license ?? row.license_class ?? "",
      dateOfBirth: row.dateOfBirth ?? row.date_of_birth ?? "",
      identityNumber: row.identityNumber ?? row.identity_number ?? "",
      address: row.address || "",
      contractStart: row.contractStart ?? row.contract_start ?? "",
      contractEnd: row.contractEnd ?? row.contract_end ?? "",
      familyDeduction: row.familyDeduction ?? row.family_deduction ?? "",
      bankAccount: row.bankAccount ?? row.bank_account ?? "",
      bankName: row.bankName ?? row.bank_name ?? "",
      applicationFileOnHand: Boolean(row.applicationFileOnHand ?? row.application_file_on_hand),
      hardCopyContractOnHand: Boolean(row.hardCopyContractOnHand ?? row.hard_copy_contract_on_hand),
    })),
    fuelLogs: toArray(rows.fuelLogs).map((row) => ({
      id: row.id,
      date: row.date ?? row.fuel_date ?? "",
      plateNumber: row.plateNumber ?? row.plate_number ?? "",
      driverName: row.driverName ?? row.driver_name ?? "",
      liters: row.liters ?? 0,
      unitPrice: row.unitPrice ?? row.unit_price ?? 0,
      amount: row.amount ?? 0,
      kmReading: row.kmReading ?? row.km_reading ?? 0,
      kmRun: row.kmRun ?? row.km_run ?? 0,
      fuelNorm: row.fuelNorm ?? row.fuel_norm ?? 0,
      normLiters: row.normLiters ?? row.norm_liters ?? 0,
      previousLiters: row.previousLiters ?? row.previous_liters ?? 0,
      fuelDelta: row.fuelDelta ?? row.fuel_delta ?? 0,
      station: row.station || "",
      status: row.status || "",
    })),
    salaryRates: toArray(rows.salaryRates).map((row) => ({
      id: row.id,
      route: row.route || "",
      vehicle: row.vehicle || "",
      base: row.base ?? row.base_amount ?? 0,
      loading: row.loading ?? row.loading_amount ?? 0,
      night: row.night ?? row.night_amount ?? 0,
      total: row.total ?? row.total_amount ?? 0,
      note: row.note || "",
    })),
    transportRates: toArray(rows.transportRates).map((row) => ({
      id: row.id,
      customer: row.customer || "",
      route: row.route || "",
      km: row.km || "",
      rate125: row.rate125 ?? row.rate_125 ?? "",
      rate25: row.rate25 ?? row.rate_25 ?? "",
      rate35: row.rate35 ?? row.rate_35 ?? "",
      rate5: row.rate5 ?? row.rate_5 ?? "",
      rate7: row.rate7 ?? row.rate_7 ?? "",
      rate8: row.rate8 ?? row.rate_8 ?? "",
      rate10: row.rate10 ?? row.rate_10 ?? "",
      rate15: row.rate15 ?? row.rate_15 ?? "",
      rate20: row.rate20 ?? row.rate_20 ?? "",
      cont20: row.cont20 ?? row.cont_20 ?? "",
      cont40: row.cont40 ?? row.cont_40 ?? "",
      cont45: row.cont45 ?? row.cont_45 ?? "",
      status: row.status || "active",
    })),
    fuelSurcharges: toArray(rows.fuelSurcharges).map((row) => ({
      id: row.id,
      content: row.content || "",
      dateFrom: row.dateFrom ?? row.date_from ?? "",
      dateTo: row.dateTo ?? row.date_to ?? "",
      percent: row.percent ?? "",
      note: row.note || "",
    })),
    salaryAdvances: toArray(rows.salaryAdvances).map((row) => ({
      id: row.id,
      date: row.date ?? row.advance_date ?? "",
      driverName: row.driverName ?? row.driver_name ?? "",
      amount: row.amount ?? 0,
      note: row.note || "",
    })),
    standardFuelPrices: toArray(rows.standardFuelPrices).map((row) => ({
      id: row.id,
      month: String(row.month ?? row.price_month ?? "").slice(0, 7),
      unitPrice: row.unitPrice ?? row.unit_price ?? 0,
      note: row.note || "",
    })),
    gpsVehiclesByPlate: settingValue(rows.appSettings, "gps_vehicles_by_plate", {}),
    gpsVehicleStates: settingValue(rows.appSettings, "gps_vehicle_states", {}),
    gpsEvents: settingValue(rows.appSettings, "gps_events", []),
    gpsConfig: settingValue(rows.appSettings, "gps_config", {}),
    costs: standaloneCosts,
    accountAdmin: settingValue(rows.appSettings, "account_admin", null),
    auditLogs: settingValue(rows.appSettings, "audit_logs", []),
    driverAttendance: settingValue(rows.appSettings, "driver_attendance", []),
    reportTemplateSelectedId: settingValue(rows.appSettings, "report_template_selected_id", ""),
    reportTemplates: toArray(rows.reportTemplates).map((row) => row.data || row),
  };
}
