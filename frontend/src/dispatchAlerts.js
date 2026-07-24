const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const MISSING_ASSIGNMENT_WINDOW_MINUTES = 90;
const MISSING_ASSIGNMENT_HIGH_MINUTES = 30;
const LATE_CRITICAL_MINUTES = 30;
const WAITING_THRESHOLD_MINUTES = 120;
const WAITING_HIGH_OVERAGE_MINUTES = 60;
const GPS_STALE_MINUTES = 30;
const GATE_WAITING_MINUTES = 60;
const GATE_INSIDE_MINUTES = 180;

function dateMs(value) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function minutesBetween(from, to) {
  const fromMs = dateMs(from);
  const toMs = dateMs(to);
  if (fromMs === null || toMs === null) return null;
  return Math.floor((toMs - fromMs) / 60000);
}

function isActiveTrip(trip = {}) {
  return trip.status !== "completed";
}

function plateKey(value = "") {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function tripBase(trip = {}) {
  return {
    tripId: trip.id,
    orderCode: trip.orderCode || "",
    customerCode: trip.customerCode || "",
    routeCode: trip.routeCode || "",
    plateNumber: trip.plateNumber || "",
    driverName: trip.driverName || "",
    action: "viewTrip",
  };
}

function currentOpenStop(trip = {}) {
  for (const stopNo of [1, 2, 3]) {
    const arrivalKey = `point${stopNo}ArrivalAt`;
    const departKey = `point${stopNo}DepartAt`;
    if (trip[arrivalKey] && !trip[departKey]) return { stopNo, arrivalAt: trip[arrivalKey], departAt: trip[departKey] };
  }
  return null;
}

function hasRequiredArrival(trip = {}) {
  if (!trip.point1ArrivalAt) return false;
  if (trip.via && !trip.point2ArrivalAt) return false;
  return Boolean(trip.point1ArrivalAt);
}

function missingAssignmentAlert(trip, now) {
  if (!isActiveTrip(trip)) return null;
  if (trip.plateNumber && trip.driverName) return null;
  const minutesToRequired = minutesBetween(now, trip.requiredArrivalAt);
  if (minutesToRequired === null || minutesToRequired > MISSING_ASSIGNMENT_WINDOW_MINUTES) return null;
  return {
    id: `missing-assignment:${trip.id}`,
    type: "missingAssignment",
    severity: minutesToRequired <= MISSING_ASSIGNMENT_HIGH_MINUTES ? "high" : "medium",
    title: "Thieu xe/tai xe",
    message: minutesToRequired < 0 ? `Qua gio yeu cau ${Math.abs(minutesToRequired)} phut` : `Con ${minutesToRequired} phut den gio yeu cau`,
    minutes: Math.abs(minutesToRequired),
    ...tripBase(trip),
  };
}

function lateArrivalAlert(trip, now) {
  if (!isActiveTrip(trip) || hasRequiredArrival(trip)) return null;
  const lateMinutes = minutesBetween(trip.requiredArrivalAt, now);
  if (lateMinutes === null || lateMinutes <= 0) return null;
  return {
    id: `late-arrival:${trip.id}`,
    type: "lateArrival",
    severity: lateMinutes >= LATE_CRITICAL_MINUTES ? "critical" : "high",
    title: "Tre gio den diem",
    message: `Tre ${lateMinutes} phut so voi gio yeu cau`,
    minutes: lateMinutes,
    ...tripBase(trip),
  };
}

function longWaitingAlert(trip, now) {
  if (!isActiveTrip(trip)) return null;
  const stop = currentOpenStop(trip);
  if (!stop) return null;
  const waitingMinutes = minutesBetween(stop.arrivalAt, now);
  if (waitingMinutes === null || waitingMinutes <= WAITING_THRESHOLD_MINUTES) return null;
  const overage = waitingMinutes - WAITING_THRESHOLD_MINUTES;
  return {
    id: `long-waiting:${trip.id}:${stop.stopNo}`,
    type: "longWaiting",
    severity: overage >= WAITING_HIGH_OVERAGE_MINUTES ? "high" : "medium",
    title: "Cho qua lau",
    message: `Da cho ${waitingMinutes} phut tai diem ${stop.stopNo}`,
    minutes: waitingMinutes,
    ...tripBase(trip),
  };
}

function gpsVehicleByPlate(gpsDashboard = {}) {
  const byPlate = new Map();
  for (const vehicle of gpsDashboard.vehicles || []) {
    const key = plateKey(vehicle.plateNumber || vehicle.plate || vehicle.numberPlate);
    if (key) byPlate.set(key, vehicle);
  }
  return byPlate;
}

function gpsStaleAlert(trip, now, vehiclesByPlate, lateByTripId) {
  if (!isActiveTrip(trip) || !trip.plateNumber) return null;
  const vehicle = vehiclesByPlate.get(plateKey(trip.plateNumber));
  const lastUpdate = vehicle?.lastUpdate || vehicle?.time || vehicle?.updatedAt || "";
  const staleMinutes = vehicle ? minutesBetween(lastUpdate, now) : GPS_STALE_MINUTES + 1;
  if (staleMinutes === null || staleMinutes <= GPS_STALE_MINUTES) return null;
  const isLate = lateByTripId.has(Number(trip.id));
  return {
    id: `gps-stale:${trip.id}`,
    type: "gpsStale",
    severity: isLate ? "high" : "medium",
    title: "GPS bat thuong",
    message: vehicle ? `GPS chua cap nhat ${staleMinutes} phut` : "Chua co du lieu GPS theo bien so",
    minutes: staleMinutes,
    ...tripBase(trip),
  };
}

function gateStatus(log = {}) {
  if (log.outAt || log.gateOutAt) return "completed";
  if (log.inAt || log.gateInAt) return "inside";
  return "waiting";
}

function gateWaitingAlert(log, now) {
  const status = gateStatus(log);
  if (status === "completed") return null;
  const start = status === "inside" ? log.inAt || log.gateInAt : log.registeredAt || log.createdAt || log.updatedAt;
  const minutes = minutesBetween(start, now);
  if (minutes === null) return null;
  if (status === "waiting" && minutes <= GATE_WAITING_MINUTES) return null;
  if (status === "inside" && minutes <= GATE_INSIDE_MINUTES) return null;
  return {
    id: `gate-waiting:${log.id || log.plateNumber || start}`,
    type: "gateWaiting",
    severity: status === "inside" ? "high" : "medium",
    title: status === "inside" ? "Xe trong bai qua lau" : "Xe cho vao cong qua lau",
    message: `${minutes} phut`,
    minutes,
    tripId: log.tripId || "",
    orderCode: log.orderCode || "",
    customerCode: log.customerCode || "",
    routeCode: log.routeCode || "",
    plateNumber: log.plateNumber || "",
    driverName: log.driverName || "",
    action: "viewGate",
  };
}

function sortAlerts(a, b) {
  const severityDiff = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
  if (severityDiff !== 0) return severityDiff;
  return (Number(b.minutes) || 0) - (Number(a.minutes) || 0);
}

function typeCounts(alerts = []) {
  return alerts.reduce(
    (counts, alert) => {
      counts[alert.type] = (counts[alert.type] || 0) + 1;
      return counts;
    },
    { lateArrival: 0, missingAssignment: 0, longWaiting: 0, gpsStale: 0, gateWaiting: 0 },
  );
}

export function buildDispatchAlertModel({ trips = [], gateLogs = [], gpsDashboard = {}, now = new Date() } = {}) {
  const activeTrips = trips.filter(isActiveTrip);
  const vehiclesByPlate = gpsVehicleByPlate(gpsDashboard);
  const alerts = [];

  for (const trip of activeTrips) {
    const missing = missingAssignmentAlert(trip, now);
    const late = lateArrivalAlert(trip, now);
    const waiting = longWaitingAlert(trip, now);
    if (missing) alerts.push(missing);
    if (late) alerts.push(late);
    if (waiting) alerts.push(waiting);
  }

  const lateByTripId = new Set(alerts.filter((alert) => alert.type === "lateArrival").map((alert) => Number(alert.tripId)));
  for (const trip of activeTrips) {
    const gps = gpsStaleAlert(trip, now, vehiclesByPlate, lateByTripId);
    if (gps) alerts.push(gps);
  }

  for (const log of gateLogs || []) {
    const gate = gateWaitingAlert(log, now);
    if (gate) alerts.push(gate);
  }

  alerts.sort(sortAlerts);
  const counts = typeCounts(alerts);
  const alertsByTrip = new Map();
  for (const alert of alerts) {
    if (!alert.tripId) continue;
    const list = alertsByTrip.get(Number(alert.tripId)) || [];
    list.push(alert);
    alertsByTrip.set(Number(alert.tripId), list);
  }

  const activeTripRows = activeTrips
    .map((trip) => {
      const tripAlerts = alertsByTrip.get(Number(trip.id)) || [];
      return {
        ...trip,
        warningCount: tripAlerts.length,
        highestSeverity: tripAlerts[0]?.severity || "low",
      };
    })
    .sort((a, b) => {
      const severityDiff = (SEVERITY_RANK[a.highestSeverity] ?? 9) - (SEVERITY_RANK[b.highestSeverity] ?? 9);
      if (severityDiff !== 0) return severityDiff;
      return (dateMs(a.requiredArrivalAt) ?? Number.MAX_SAFE_INTEGER) - (dateMs(b.requiredArrivalAt) ?? Number.MAX_SAFE_INTEGER);
    });

  return {
    alerts,
    activeTripRows,
    summary: {
      totalAlerts: alerts.length,
      activeTrips: activeTrips.length,
      completedTrips: trips.length - activeTrips.length,
      criticalAlerts: alerts.filter((alert) => alert.severity === "critical").length,
      highAlerts: alerts.filter((alert) => alert.severity === "high").length,
      lateArrival: counts.lateArrival,
      missingAssignment: counts.missingAssignment,
      longWaiting: counts.longWaiting,
      gpsStale: counts.gpsStale,
      gateWaiting: counts.gateWaiting,
    },
  };
}
