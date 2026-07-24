function normalizeStop(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function isVsipStop(value) {
  const stop = normalizeStop(value);
  return stop.includes("VSIP") || stop.includes("ALSE");
}

function routeStops(item) {
  const explicitStops = [item.from, item.to, item.via].filter(Boolean);
  if (explicitStops.length >= 2) return explicitStops;
  return String(item.routeCode || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
}

function waitingTripPoint(item) {
  const stops = routeStops(item);
  if (stops.length < 2) return null;
  const vsipIndex = stops.findIndex((stop) => isVsipStop(stop));
  if (vsipIndex <= 0) return null;
  const arrivalKey = `point${vsipIndex + 1}ArrivalAt`;
  const departKey = `point${vsipIndex + 1}DepartAt`;
  if (!item[arrivalKey] || item[departKey]) return null;
  return { arrivalKey, departKey, stopName: stops[vsipIndex] };
}

function totals(rows = [], fallback = {}) {
  const source = Array.isArray(rows) ? rows : [];
  const packageCount = source.reduce((sum, row) => sum + (Number(row.packageCount) || 0), 0);
  const grossWeight = source.reduce((sum, row) => sum + (Number(row.grossWeight) || 0), 0);
  return {
    packageCount: packageCount || fallback.packageCount || "",
    grossWeight: grossWeight ? Number(grossWeight.toFixed(1)) : fallback.grossWeight || "",
  };
}

function deliveryRow(item) {
  return {
    ...item,
    source: "delivery",
    sourceLabel: "Giao hàng VSIP",
    routeText: "Giao hàng VSIP",
    vsipArrivalAt: item.vsipArrivalAt,
    ...totals(item.waybills, item),
  };
}

function tripRow(item, point) {
  return {
    ...item,
    source: "transport",
    sourceLabel: "Vận chuyển",
    routeText: item.routeCode || point.stopName || "",
    vsipArrivalAt: item[point.arrivalKey],
    ...totals(item.waybills, item),
  };
}

export function buildWaitingUnloadRows({ deliveries = [], trips = [] } = {}) {
  const deliveryRows = deliveries
    .filter((item) => item.vsipArrivalAt && !item.vsipDepartAt)
    .map(deliveryRow);
  const tripRows = trips.flatMap((item) => {
    const point = waitingTripPoint(item);
    return point ? [tripRow(item, point)] : [];
  });

  return [...tripRows, ...deliveryRows].sort((a, b) => {
    const timeA = new Date(a.vsipArrivalAt || a.requiredArrivalAt || 0).getTime();
    const timeB = new Date(b.vsipArrivalAt || b.requiredArrivalAt || 0).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return String(a.plateNumber || a.orderCode || "").localeCompare(String(b.plateNumber || b.orderCode || ""));
  });
}
