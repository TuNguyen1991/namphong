function hasOfficialVehicleDetail(vehicle = {}) {
  return [
    vehicle.owner,
    vehicle.length,
    vehicle.width,
    vehicle.height,
    vehicle.doorCount,
    vehicle.registrationNumber,
    vehicle.fuelNorm,
    vehicle.registryDue,
  ].some((value) => String(value || "").trim());
}

export function officialNpVehicles(vehicles = []) {
  return vehicles.filter((vehicle) => hasOfficialVehicleDetail(vehicle));
}
