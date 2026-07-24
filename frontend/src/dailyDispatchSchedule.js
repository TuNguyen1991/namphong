const DEFAULT_DURATION_MINUTES = 180;
const SHORT_TURNAROUND_MINUTES = 45;

function dateMs(value) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function isoFromMs(ms) {
  return new Date(ms).toISOString();
}

function dateKey(value) {
  const ms = dateMs(value);
  if (ms === null) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

function plateKey(value = "") {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function driverKey(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function normalizeRouteKey(customerCode, routeCode) {
  return `${String(customerCode || "").trim().toUpperCase()}::${String(routeCode || "").trim().toUpperCase()}`;
}

function routeKm(trip, routes = [], transportRates = []) {
  const directKm = toNumber(trip.km ?? trip.routeKm ?? trip.distanceKm);
  if (directKm) return directKm;
  const key = normalizeRouteKey(trip.customerCode, trip.routeCode);
  const route = routes.find((item) => normalizeRouteKey(item.customerCode || item.customer, item.routeCode || item.route) === key);
  const catalogKm = toNumber(route?.km);
  if (catalogKm) return catalogKm;
  const rate = transportRates.find((item) => normalizeRouteKey(item.customer || item.customerCode, item.route || item.routeCode) === key);
  return toNumber(rate?.km);
}

function estimatedDurationMinutes(trip, routes, transportRates) {
  const km = routeKm(trip, routes, transportRates);
  return km ? Math.max(60, Math.round(km * 2)) : DEFAULT_DURATION_MINUTES;
}

function scheduleWindow(trip, routes, transportRates) {
  const startMs = dateMs(trip.requiredArrivalAt);
  if (startMs === null) return null;
  const explicitEnd = [trip.point3DepartAt, trip.point2DepartAt]
    .map(dateMs)
    .find((ms) => ms !== null && ms > startMs);
  let endMs = explicitEnd;
  const point2ArrivalMs = dateMs(trip.point2ArrivalAt);
  if (!endMs && point2ArrivalMs !== null && point2ArrivalMs > startMs) endMs = point2ArrivalMs + 60 * 60000;
  const point1DepartMs = dateMs(trip.point1DepartAt);
  if (!endMs && point1DepartMs !== null && point1DepartMs > startMs) {
    endMs = point1DepartMs + estimatedDurationMinutes(trip, routes, transportRates) * 60000;
  }
  if (!endMs) endMs = startMs + DEFAULT_DURATION_MINUTES * 60000;
  return {
    startMs,
    endMs,
    startAt: isoFromMs(startMs),
    endAt: isoFromMs(endMs),
    durationMinutes: Math.round((endMs - startMs) / 60000),
  };
}

function missingAssignmentConflict(row) {
  if (row.plateNumber && row.driverName) return null;
  return {
    id: `missing_assignment:${row.tripId}`,
    type: "missing_assignment",
    severity: "medium",
    message: "Chua gan xe hoac tai xe",
    tripIds: [row.tripId],
  };
}

function addConflictToRows(rowsById, conflict) {
  for (const tripId of conflict.tripIds || []) {
    const row = rowsById.get(Number(tripId));
    if (row) row.conflicts.push(conflict);
  }
}

function resourceConflicts(rows, keyName, type, messagePrefix) {
  const conflicts = [];
  const byKey = new Map();
  for (const row of rows) {
    const key = row[keyName];
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  }

  for (const list of byKey.values()) {
    list.sort((a, b) => a.startMs - b.startMs);
    for (let index = 1; index < list.length; index++) {
      const previous = list[index - 1];
      const current = list[index];
      if (current.startMs < previous.endMs) {
        conflicts.push({
          id: `${type}:${previous.tripId}:${current.tripId}`,
          type,
          severity: "high",
          message: `${messagePrefix} ${current[keyName === "plateKey" ? "plateNumber" : "driverName"]}`,
          tripIds: [previous.tripId, current.tripId],
        });
        continue;
      }
      const gapMinutes = Math.round((current.startMs - previous.endMs) / 60000);
      if (gapMinutes < SHORT_TURNAROUND_MINUTES) {
        conflicts.push({
          id: `short_turnaround:${keyName}:${previous.tripId}:${current.tripId}`,
          type: "short_turnaround",
          severity: "medium",
          message: `Quay dau chi ${gapMinutes} phut`,
          tripIds: [previous.tripId, current.tripId],
        });
      }
    }
  }

  return conflicts;
}

function groupRows(rows, keyName, labelName) {
  const byKey = new Map();
  for (const row of rows) {
    const key = row[keyName] || "unassigned";
    const label = row[labelName] || "Chua gan";
    const group = byKey.get(key) || { key, label, trips: [] };
    group.trips.push(row);
    byKey.set(key, group);
  }
  return Array.from(byKey.values())
    .map((group) => ({ ...group, trips: group.trips.sort((a, b) => a.startMs - b.startMs) }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));
}

function dedupeConflicts(conflicts = []) {
  const seen = new Set();
  const result = [];
  for (const conflict of conflicts) {
    const pairKey = [...(conflict.tripIds || [])].map(Number).sort((a, b) => a - b).join(":");
    const key = conflict.type === "short_turnaround" ? `${conflict.type}:${pairKey}` : conflict.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(conflict);
  }
  return result;
}

export function buildDailyDispatchScheduleModel({ trips = [], routes = [], transportRates = [], date = "" } = {}) {
  const selectedDate = String(date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rows = trips
    .map((trip) => {
      const window = scheduleWindow(trip, routes, transportRates);
      if (!window || dateKey(window.startAt) !== selectedDate) return null;
      return {
        tripId: trip.id,
        orderCode: trip.orderCode || "",
        customerCode: trip.customerCode || "",
        routeCode: trip.routeCode || "",
        plateNumber: trip.plateNumber || "",
        driverName: trip.driverName || "",
        plateKey: plateKey(trip.plateNumber),
        driverKey: driverKey(trip.driverName),
        status: trip.status || "",
        statusLabel: trip.statusLabel || trip.status || "",
        conflicts: [],
        trip,
        ...window,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);

  const conflicts = [];
  for (const row of rows) {
    const missing = missingAssignmentConflict(row);
    if (missing) conflicts.push(missing);
  }
  conflicts.push(...resourceConflicts(rows, "plateKey", "vehicle_overlap", "Trung xe"));
  conflicts.push(...resourceConflicts(rows, "driverKey", "driver_overlap", "Trung tai xe"));
  const uniqueConflicts = dedupeConflicts(conflicts);

  const rowsById = new Map(rows.map((row) => [Number(row.tripId), row]));
  for (const conflict of uniqueConflicts) addConflictToRows(rowsById, conflict);

  return {
    date: selectedDate,
    trips: rows,
    vehicleGroups: groupRows(rows, "plateKey", "plateNumber"),
    driverGroups: groupRows(rows, "driverKey", "driverName"),
    conflicts: uniqueConflicts.sort((a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1)),
    summary: {
      tripCount: rows.length,
      assignedTrips: rows.filter((row) => row.plateNumber && row.driverName).length,
      missingAssignment: uniqueConflicts.filter((conflict) => conflict.type === "missing_assignment").length,
      vehicleOverlap: uniqueConflicts.filter((conflict) => conflict.type === "vehicle_overlap").length,
      driverOverlap: uniqueConflicts.filter((conflict) => conflict.type === "driver_overlap").length,
      shortTurnaround: uniqueConflicts.filter((conflict) => conflict.type === "short_turnaround").length,
    },
  };
}
