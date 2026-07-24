export function normalizePlateKey(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function tripTimeValue(trip = {}) {
  const value = trip.requiredArrivalAt || trip.updatedAt || trip.createdAt || "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function findLatestDriverByPlate(trips = [], plateNumber = "", options = {}) {
  const plateKey = normalizePlateKey(plateNumber);
  if (!plateKey) return null;

  const match = [...trips]
    .filter((trip) => {
      if (options.excludeTripId && String(trip.id) === String(options.excludeTripId)) return false;
      if (normalizePlateKey(trip.plateNumber) !== plateKey) return false;
      return Boolean(String(trip.driverName || "").trim() || String(trip.driverPhone || "").trim());
    })
    .sort((a, b) => tripTimeValue(b) - tripTimeValue(a))[0];

  if (!match) return null;

  return {
    orderCode: match.orderCode || "",
    plateNumber: match.plateNumber || "",
    driverName: match.driverName || "",
    driverPhone: match.driverPhone || "",
    requiredArrivalAt: match.requiredArrivalAt || "",
  };
}
