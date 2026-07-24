function clean(value) {
  return String(value ?? "").trim();
}

export function shouldSyncCompletedTripDriver(row = {}) {
  return clean(row.partnerCode).toUpperCase() === "NP";
}

export function shouldSyncCompletedTripVehicle(row = {}) {
  return clean(row.partnerCode).toUpperCase() === "NP";
}

function cleanMoney(value) {
  const raw = clean(value);
  if (!raw) return "";
  const withoutSpaces = raw.replace(/\s/g, "");
  const thousandsNormalized = withoutSpaces.replace(/[.,](?=\d{3}(\D|$))/g, "");
  const decimalNormalized = thousandsNormalized.replace(/,/g, ".");
  const [integer = "", decimal = ""] = decimalNormalized.replace(/[^\d.]/g, "").split(".");
  const cleanInteger = integer.replace(/^0+(?=\d)/, "");
  return decimal ? `${cleanInteger || "0"}.${decimal.slice(0, 2)}` : cleanInteger;
}

function moneyFee(description, amount) {
  const cleanAmount = cleanMoney(amount);
  return cleanAmount ? { description, amount: cleanAmount } : null;
}

function pointTimes(arrivalValue, departValue) {
  const arrivalAt = clean(arrivalValue);
  return { arrivalAt, departAt: clean(departValue) || arrivalAt };
}

export function buildCompletedTripPayload(row = {}) {
  const point1 = pointTimes(row.point1At, row.point1DepartAt);
  const point2 = pointTimes(row.point2At, row.point2DepartAt);
  const point3 = pointTimes(row.point3At, row.point3DepartAt);
  const plannedDate = clean(row.plannedDate) || clean(row.point1At).slice(0, 10);
  const plannedTime = clean(row.plannedTime) || clean(row.point1At).slice(11, 16) || "08:00";
  const handlingFeeAmount = cleanMoney(row.handlingFeeAmount);
  const otherFees = [
    moneyFee("Vé kho", row.warehouseTicketFee),
    moneyFee("Vé cao tốc", row.highwayTicketFee),
    moneyFee("Lưu đêm cho lái xe", row.driverOvernightFee),
    moneyFee("Phí khác", row.otherFeeAmount),
  ].filter(Boolean);

  return {
    ...row,
    plannedDate,
    plannedTime,
    customerCode: clean(row.customerCode).toUpperCase(),
    partnerCode: clean(row.partnerCode).toUpperCase(),
    routeCode: clean(row.routeCode || row.routeText).toUpperCase(),
    plateNumber: clean(row.plateNumber).toUpperCase(),
    cargoWeight: clean(row.cargoWeight),
    driverName: clean(row.driverName),
    point1ArrivalAt: point1.arrivalAt,
    point1DepartAt: point1.departAt,
    point2ArrivalAt: point2.arrivalAt,
    point2DepartAt: point2.departAt,
    point3ArrivalAt: point3.arrivalAt,
    point3DepartAt: point3.departAt,
    handlingFeeSide: handlingFeeAmount ? "Hai đầu" : "Không",
    handlingFeeAmount,
    otherFees,
  };
}
