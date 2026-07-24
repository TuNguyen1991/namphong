const GATE_REGISTRATION_DELAY_MS = 60 * 60 * 1000;

function normalizeStop(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isVsipStop(value) {
  const text = normalizeStop(value);
  return text.includes("VSIP") || text.includes("ALSE");
}

function isNbaStop(value) {
  const text = normalizeStop(value);
  return text.includes("NBA") || text.includes("NOI BAI");
}

function routeStops(item = {}) {
  const explicitStops = [item.from, item.to, item.via].filter(Boolean);
  if (explicitStops.length >= 2) return explicitStops;
  return String(item.routeCode || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizedPlate(value) {
  return String(value || "").trim().toUpperCase();
}

function openGatePlateSet(gateLogs = []) {
  return new Set(
    gateLogs
      .filter((item) => !item.gateOutAt)
      .map((item) => normalizedPlate(item.plateNumber))
      .filter(Boolean),
  );
}

function timeValue(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? time : null;
}

function plannedGateTime(item = {}) {
  return item.requiredArrivalAt || item.point1ArrivalAt || item.vsipArrivalAt || "";
}

function isDueForGateRegistration(item, now = new Date()) {
  const plannedAt = timeValue(plannedGateTime(item));
  if (plannedAt === null) return true;
  return plannedAt <= now.getTime() - GATE_REGISTRATION_DELAY_MS;
}

function isDueAt(value, now = new Date()) {
  const plannedAt = timeValue(value);
  if (plannedAt === null) return true;
  return plannedAt <= now.getTime() - GATE_REGISTRATION_DELAY_MS;
}

function baseCandidate(item, purpose, purposeLabel, extra = {}) {
  const planAt = extra.planAt || item.requiredArrivalAt || item.vsipArrivalAt || "";
  return {
    id: item.id,
    source: item.source || "transport",
    sourceId: item.id,
    purpose,
    purposeLabel,
    customerCode: item.customerCode || "",
    routeText: item.routeText || item.routeCode || "",
    plateNumber: normalizedPlate(item.plateNumber),
    driverName: item.driverName || "",
    driverPhone: item.driverPhone || "",
    note: item.note || "",
    planAt,
    actualArrivalAt: extra.actualArrivalAt || "",
    registeredAt: extra.registeredAt || planAt,
    ...extra,
  };
}

function vsipGatePoint(item, now = new Date()) {
  const stops = routeStops(item);
  const vsipIndex = stops.findIndex((stop) => isVsipStop(stop));
  if (vsipIndex === -1) return null;

  const pointNumber = vsipIndex + 1;
  const continuesToNba = isNbaStop(stops[vsipIndex + 1] || "");
  if (pointNumber === 1) {
    if (!continuesToNba) return null;
    const planAt = item.point1ArrivalAt || item.requiredArrivalAt || "";
    if (item.point1DepartAt || !isDueAt(planAt, now)) return null;
    return { purpose: "export", purposeLabel: "Vào xuất hàng", planAt, actualArrivalAt: item.point1ArrivalAt || "" };
  }

  const previousDepartAt = item[`point${pointNumber - 1}DepartAt`];
  const arrivalAt = item[`point${pointNumber}ArrivalAt`];
  const departAt = item[`point${pointNumber}DepartAt`];
  if (!previousDepartAt || arrivalAt || departAt || !isDueAt(previousDepartAt, now)) return null;
  if (continuesToNba) {
    return { purpose: "unload-export", purposeLabel: "Hạ-xuất hàng", planAt: previousDepartAt, actualArrivalAt: "" };
  }
  return { purpose: "unload", purposeLabel: "Hạ hàng", planAt: previousDepartAt, actualArrivalAt: "" };
}

export function buildGateRegistrationCandidates({
  waitingUnloadRows = [],
  deliveries = [],
  trips = [],
  gateLogs = [],
  now = new Date(),
} = {}) {
  const openPlates = openGatePlateSet(gateLogs);
  const deliveryRows = deliveries
    .filter((item) => !item.vsipDepartAt && isDueForGateRegistration(item, now))
    .map((item) =>
      baseCandidate(item, "unload", "Hạ hàng", {
        source: "delivery",
        sourceId: item.id,
        routeText: item.routeText || "Giao hàng VSIP",
        planAt: item.vsipArrivalAt || item.requiredArrivalAt || "",
        actualArrivalAt: item.vsipArrivalAt || "",
        registeredAt: item.vsipArrivalAt || item.requiredArrivalAt || "",
      }),
    );
  const deliveryIds = new Set(deliveryRows.map((item) => String(item.sourceId)));
  const unloadRows = waitingUnloadRows
    .filter((item) => item.source !== "delivery" || !deliveryIds.has(String(item.id)))
    .filter((item) => isDueForGateRegistration(item, now))
    .map((item) =>
      baseCandidate(item, "unload", "Hạ hàng", {
        source: item.source,
        sourceId: item.id,
        planAt: item.vsipArrivalAt || item.requiredArrivalAt || "",
        actualArrivalAt: item.vsipArrivalAt || "",
      }),
    );
  const exportRows = trips
    .map((item) => ({ item, gatePoint: vsipGatePoint(item, now) }))
    .filter(({ gatePoint }) => gatePoint)
    .map(({ item, gatePoint }) =>
      baseCandidate(item, gatePoint.purpose, gatePoint.purposeLabel, {
        source: "transport",
        sourceId: item.id,
        planAt: gatePoint.planAt,
        actualArrivalAt: gatePoint.actualArrivalAt,
        registeredAt: gatePoint.planAt,
      }),
    );

  return [...deliveryRows, ...unloadRows, ...exportRows]
    .filter((item) => item.plateNumber && !openPlates.has(item.plateNumber))
    .sort((a, b) => {
      const timeA = new Date(a.planAt || 0).getTime();
      const timeB = new Date(b.planAt || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.plateNumber.localeCompare(b.plateNumber);
    });
}
