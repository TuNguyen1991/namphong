function normalizeKey(value) {
  return String(value || "").trim().toUpperCase();
}

function compareKey(value) {
  return normalizeKey(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ");
}

function nextRouteId(routes = []) {
  return routes.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function routeType(routeCode) {
  const upper = normalizeKey(routeCode)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (upper.includes("NOI BAI") || upper.includes("NBA")) return "export";
  if (upper.includes("CHUYEN KHO")) return "domestic";
  return "import";
}

function routeParts(routeCode) {
  const parts = String(routeCode || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    from: parts[0] || "",
    to: parts[1] || "",
    via: parts.slice(2).join(" - "),
  };
}

export function ensureTripRoute(store = {}, payload = {}) {
  store.routes = Array.isArray(store.routes) ? store.routes : [];
  const routeId = String(payload.routeId || "").trim();
  const customerCode = normalizeKey(payload.customerCode);
  const routeCode = normalizeKey(payload.routeCode || payload.routeText);

  const byId = routeId ? store.routes.find((item) => String(item.id) === routeId) : null;
  if (byId) return byId;

  if (!customerCode || !routeCode) return null;

  const customerCompare = compareKey(customerCode);
  const routeCompare = compareKey(routeCode);
  const existing = store.routes.find((item) => compareKey(item.customerCode) === customerCompare && compareKey(item.routeCode) === routeCompare);
  if (existing) return existing;

  const rate = (store.transportRates || []).find(
    (item) => compareKey(item.customer) === customerCompare && compareKey(item.route) === routeCompare,
  );
  const parts = routeParts(routeCode);
  const route = {
    id: nextRouteId(store.routes),
    customerCode,
    routeCode,
    from: payload.from || parts.from,
    to: payload.to || parts.to,
    via: payload.via || parts.via,
    km: Number(payload.km || rate?.km) || null,
    type: payload.orderType || routeType(routeCode),
  };
  store.routes.push(route);
  return route;
}

export function tripRouteFields(route = {}, payload = {}) {
  return {
    orderType: route.type || payload.orderType || "import",
    customerCode: route.customerCode || payload.customerCode || "",
    routeCode: route.routeCode || payload.routeCode || payload.routeText || "",
    from: route.from || payload.from || "",
    to: route.to || payload.to || "",
    via: route.via || payload.via || "",
    km: Number(route.km || payload.km) || null,
  };
}
