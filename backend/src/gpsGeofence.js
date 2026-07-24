import { deriveTripStatus, nextId } from "./domain.js";

export function normalizePlate(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, "");
}

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function haversineMeters(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const earthRadiusM = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeForTrip(trip, store) {
  return (store.routes || []).find(
    (route) => route.routeCode === trip.routeCode && route.customerCode === trip.customerCode,
  );
}

function stopNamesForTrip(trip, store) {
  const route = routeForTrip(trip, store) || {};
  const explicitStops = [route.from || trip.from, route.to || trip.to, route.via || trip.via].filter(Boolean);
  if (explicitStops.length >= 2) return explicitStops;
  return String(trip.routeCode || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function findLocationByStopName(stopName, store) {
  const normalized = normalizeText(stopName);
  return (store.locations || []).find((location) => {
    const sameName = normalizeText(location.name) === normalized;
    const sameCode = normalizeText(location.code) === normalized;
    return sameName || sameCode;
  }) || null;
}

function hasCoordinates(location) {
  return Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng));
}

export function targetStopForTrip(trip, store) {
  const stops = stopNamesForTrip(trip, store);
  for (let index = 0; index < stops.length; index += 1) {
    const stopNo = index + 1;
    const arrivalKey = `point${stopNo}ArrivalAt`;
    const departKey = `point${stopNo}DepartAt`;
    if (trip[arrivalKey] && trip[departKey]) continue;
    const location = findLocationByStopName(stops[index], store);
    if (!location || !hasCoordinates(location)) continue;
    return {
      stopNo,
      stopName: stops[index],
      arrivalKey,
      departKey,
      location: {
        ...location,
        lat: Number(location.lat),
        lng: Number(location.lng),
        radiusM: Number(location.radiusM || location.radius_m || 500) || 500,
      },
    };
  }
  return null;
}

function updateTripStatus(trip) {
  const hasThirdPoint = Boolean(trip.via || trip.point3ArrivalAt || trip.point3DepartAt);
  const { status, label: statusLabel } = deriveTripStatus(
    {
      point1ArrivalAt: trip.point1ArrivalAt || "",
      point1DepartAt: trip.point1DepartAt || "",
      point2ArrivalAt: trip.point2ArrivalAt || "",
      point2DepartAt: trip.point2DepartAt || "",
      point3ArrivalAt: trip.point3ArrivalAt || "",
      point3DepartAt: trip.point3DepartAt || "",
      plateNumber: trip.plateNumber || "",
    },
    hasThirdPoint,
  );
  Object.assign(trip, { status, statusLabel });
}

function buildGpsEvent({ trip, target, eventType, eventTime, vehicle }) {
  return {
    id: 0,
    tripId: trip.id,
    orderCode: trip.orderCode || "",
    stopNo: target.stopNo,
    stopName: target.location.name || target.stopName,
    eventType,
    eventTime,
    source: "gps",
    status: "confirmed",
    editReason: `${vehicle.provider || "GPS"} ${vehicle.plateNumber || vehicle.plate || ""}`.trim(),
    createdAt: eventTime,
  };
}

export function normalizeGpsVehicle(raw = {}) {
  return {
    id: String(raw.id || raw.vehicleId || raw.VehicleID || raw.plateNumber || raw.plate || raw.VehiclePlate || ""),
    plateNumber: String(raw.plateNumber || raw.plate || raw.VehiclePlate || raw.numberPlate || raw.name || "").trim().toUpperCase(),
    provider: String(raw.provider || raw.providerName || "GPS").trim(),
    lat: Number(raw.lat ?? raw.latitude ?? raw.Latitude),
    lng: Number(raw.lng ?? raw.lon ?? raw.longitude ?? raw.Longitude),
    speed: Number(raw.speed ?? raw.Speed ?? 0) || 0,
    heading: Number(raw.heading ?? raw.Direction ?? 0) || 0,
    address: String(raw.address || raw.Address || "").trim(),
    driverName: String(raw.driverName || raw.driver || raw.DriverName || "").trim(),
    driverPhone: String(raw.driverPhone || raw.phone || raw.DriverPhone || "").trim(),
    lastUpdate: raw.lastUpdate || raw.localTime || raw.LocalTime || new Date().toISOString(),
  };
}

export function applyGpsPointToTrips(store, rawVehicle, now = new Date()) {
  const vehicle = normalizeGpsVehicle(rawVehicle);
  const plateKey = normalizePlate(vehicle.plateNumber);
  if (!plateKey || !Number.isFinite(vehicle.lat) || !Number.isFinite(vehicle.lng)) {
    return { vehicle, events: [], matchedTrips: [] };
  }

  store.gpsVehicleStates = store.gpsVehicleStates || {};
  store.gpsEvents = store.gpsEvents || [];
  const events = [];
  const matchedTrips = (store.trips || []).filter(
    (trip) => normalizePlate(trip.plateNumber) === plateKey && trip.status !== "completed",
  );
  const eventTime = now.toISOString();

  for (const trip of matchedTrips) {
    const target = targetStopForTrip(trip, store);
    if (!target) continue;
    const stateKey = `${plateKey}:${trip.id}:${target.stopNo}`;
    const previous = store.gpsVehicleStates[stateKey] || { inside: false };
    const distanceM = haversineMeters(target.location, vehicle);
    const inside = distanceM <= target.location.radiusM;

    if (inside && !previous.inside && !trip[target.arrivalKey]) {
      trip[target.arrivalKey] = eventTime;
      updateTripStatus(trip);
      const event = buildGpsEvent({ trip, target, eventType: "arrival", eventTime, vehicle });
      event.id = nextId(store.gpsEvents);
      store.gpsEvents.unshift(event);
      events.push(event);
    }

    if (!inside && previous.inside && trip[target.arrivalKey] && !trip[target.departKey]) {
      trip[target.departKey] = eventTime;
      updateTripStatus(trip);
      const event = buildGpsEvent({ trip, target, eventType: "depart", eventTime, vehicle });
      event.id = nextId(store.gpsEvents);
      store.gpsEvents.unshift(event);
      events.push(event);
    }

    store.gpsVehicleStates[stateKey] = {
      inside,
      distanceM,
      stopNo: target.stopNo,
      stopName: target.location.name || target.stopName,
      locationId: target.location.id,
      updatedAt: eventTime,
    };
  }

  return { vehicle, events, matchedTrips };
}

export function removeGpsProviderData(store, providerName) {
  const providerNeedle = normalizeText(providerName);
  if (!providerNeedle) {
    return { vehicles: 0, states: 0, events: 0 };
  }

  store.gpsVehiclesByPlate = store.gpsVehiclesByPlate || {};
  store.gpsVehicleStates = store.gpsVehicleStates || {};
  store.gpsEvents = store.gpsEvents || [];

  const removedPlateKeys = new Set();
  let vehicles = 0;
  for (const [plateKey, vehicle] of Object.entries(store.gpsVehiclesByPlate)) {
    const providerText = normalizeText(`${vehicle?.provider || ""} ${vehicle?.providerName || ""} ${vehicle?.id || ""}`);
    if (!providerText.includes(providerNeedle)) continue;
    removedPlateKeys.add(normalizePlate(vehicle?.plateNumber || vehicle?.plate || plateKey));
    delete store.gpsVehiclesByPlate[plateKey];
    vehicles += 1;
  }

  let states = 0;
  for (const key of Object.keys(store.gpsVehicleStates)) {
    const statePlateKey = normalizePlate(String(key).split(":")[0]);
    if (!removedPlateKeys.has(statePlateKey)) continue;
    delete store.gpsVehicleStates[key];
    states += 1;
  }

  const beforeEvents = store.gpsEvents.length;
  store.gpsEvents = store.gpsEvents.filter((event) => {
    const eventProviderText = normalizeText(`${event?.editReason || ""} ${event?.source || ""}`);
    const eventPlateKey = normalizePlate(event?.plateNumber || event?.plate || "");
    return !eventProviderText.includes(providerNeedle) && !removedPlateKeys.has(eventPlateKey);
  });

  return { vehicles, states, events: beforeEvents - store.gpsEvents.length };
}

export function removeGpsPlateData(store, plateNumber) {
  const plateKey = normalizePlate(plateNumber);
  if (!plateKey) {
    return { vehicles: 0, states: 0, events: 0 };
  }

  store.gpsVehiclesByPlate = store.gpsVehiclesByPlate || {};
  store.gpsVehicleStates = store.gpsVehicleStates || {};
  store.gpsEvents = store.gpsEvents || [];

  const vehicles = store.gpsVehiclesByPlate[plateKey] ? 1 : 0;
  delete store.gpsVehiclesByPlate[plateKey];

  let states = 0;
  for (const key of Object.keys(store.gpsVehicleStates)) {
    const statePlateKey = normalizePlate(String(key).split(":")[0]);
    if (statePlateKey !== plateKey) continue;
    delete store.gpsVehicleStates[key];
    states += 1;
  }

  const beforeEvents = store.gpsEvents.length;
  store.gpsEvents = store.gpsEvents.filter((event) => {
    const eventPlateKey = normalizePlate(event?.plateNumber || event?.plate || "");
    const editReason = normalizeText(event?.editReason || "");
    return eventPlateKey !== plateKey && !editReason.includes(plateKey);
  });

  return { vehicles, states, events: beforeEvents - store.gpsEvents.length };
}

export function gpsDashboard(store) {
  const activeVehicles = Object.values(store.gpsVehiclesByPlate || {});
  return {
    vehicles: activeVehicles,
    locations: (store.locations || []).filter(hasCoordinates),
    trips: (store.trips || [])
      .filter((trip) => trip.plateNumber && trip.status !== "completed")
      .map((trip) => {
        const target = targetStopForTrip(trip, store);
        return {
          id: trip.id,
          orderCode: trip.orderCode,
          plateNumber: trip.plateNumber,
          driverName: trip.driverName,
          driverPhone: trip.driverPhone,
          routeCode: trip.routeCode,
          status: trip.status,
          statusLabel: trip.statusLabel,
          targetStop: target
            ? {
                stopNo: target.stopNo,
                name: target.location.name || target.stopName,
                code: target.location.code || "",
                lat: target.location.lat,
                lng: target.location.lng,
                radiusM: target.location.radiusM,
                arrivalAt: trip[target.arrivalKey] || "",
                departAt: trip[target.departKey] || "",
              }
            : null,
        };
      }),
    events: (store.gpsEvents || []).slice(0, 100),
  };
}
