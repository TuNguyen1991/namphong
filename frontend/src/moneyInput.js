export function cleanMoneyInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s/g, "");
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  const lastSeparator = Math.max(lastDot, lastComma);
  let normalized = compact;

  if (lastSeparator >= 0) {
    const separator = compact[lastSeparator];
    const fraction = compact.slice(lastSeparator + 1).replace(/\D/g, "");
    const sameSeparatorCount = compact.split(separator).length - 1;
    const hasBothSeparators = lastDot >= 0 && lastComma >= 0;
    const isDecimal = fraction.length > 0 && fraction.length <= 2 && (hasBothSeparators || sameSeparatorCount === 1);
    normalized = isDecimal
      ? `${compact.slice(0, lastSeparator).replace(/[.,]/g, "")}.${fraction}`
      : compact.replace(/[.,]/g, "");
  }

  const [integer = "", decimal = ""] = normalized.replace(/[^\d.]/g, "").split(".");
  const cleanInteger = integer.replace(/^0+(?=\d)/, "");
  if (!cleanInteger && !decimal) return "";
  return decimal && Number(decimal) !== 0 ? `${cleanInteger || "0"}.${decimal.slice(0, 2)}` : cleanInteger || "0";
}

export function moneyAmount(value) {
  const clean = cleanMoneyInput(value);
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}
