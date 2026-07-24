function parseNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value).trim();
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(/,/g, ".")
    : (text.match(/\./g) || []).length > 1
      ? text.replace(/\./g, "")
      : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parseFuelNorm(value) {
  if (value === null || value === undefined || value === "") return 0;
  const match = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? parseNumber(match[0]) : parseNumber(value);
}

export function fuelDateKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return text;
}

function monthKey(value) {
  const key = fuelDateKey(value);
  return key ? key.slice(0, 7) : "";
}

export function enrichFuelLogs(logs = [], vehicles = []) {
  const normByPlate = new Map(
    vehicles.map((vehicle) => [
      String(vehicle.plateNumber || "").trim().toUpperCase(),
      parseFuelNorm(vehicle.fuelNorm || vehicle.fuel_norm),
    ]),
  );
  const sorted = [...logs].sort((a, b) => {
    const byDate = fuelDateKey(a.date).localeCompare(fuelDateKey(b.date));
    if (byDate) return byDate;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
  const previousByPlate = new Map();
  const enrichedById = new Map();
  const monthTotals = new Map();

  for (const log of sorted) {
    const plate = String(log.plateNumber || "").trim().toUpperCase();
    const previous = previousByPlate.get(plate);
    const kmReading = parseNumber(log.kmReading);
    const previousKm = previous ? parseNumber(previous.kmReading) : 0;
    const kmRun = log.kmRun !== undefined && log.kmRun !== "" ? parseNumber(log.kmRun) : previous && kmReading ? kmReading - previousKm : 0;
    const fuelNorm = parseFuelNorm(log.fuelNorm) || normByPlate.get(plate) || 0;
    const normLiters = log.normLiters !== undefined && log.normLiters !== "" ? parseNumber(log.normLiters) : (kmRun > 0 && fuelNorm > 0 ? (kmRun * fuelNorm) / 100 : 0);
    const previousLiters = previous ? parseNumber(previous.liters) : 0;
    const fuelDelta = previous ? normLiters - previousLiters : 0;
    const key = `${plate}|${monthKey(log.date)}|${String(log.driverName || "").trim().toUpperCase()}`;
    const monthlyDelta = (monthTotals.get(key) || 0) + fuelDelta;
    monthTotals.set(key, monthlyDelta);
    const enriched = { ...log, kmReading, kmRun, fuelNorm, normLiters, previousLiters, fuelDelta, monthlyDelta };
    enrichedById.set(log.id, enriched);
    previousByPlate.set(plate, enriched);
  }

  return logs.map((log) => enrichedById.get(log.id) || log);
}

export function calculateFuelDraft(form = {}, logs = [], vehicles = []) {
  return enrichFuelLogs([...logs, { ...form, id: form.id || "__draft__" }], vehicles).find((log) => log.id === (form.id || "__draft__")) || {};
}
