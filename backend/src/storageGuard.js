const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function shouldRejectWriteWithoutDatabase({ method = "", mysqlConfigured = false, dbConnected = false } = {}) {
  return Boolean(mysqlConfigured && !dbConnected && MUTATING_METHODS.has(String(method).toUpperCase()));
}

export function shouldRejectRequestWithoutDatabase({ path = "", mysqlConfigured = false, dbConnected = false } = {}) {
  const requestPath = String(path || "");
  return Boolean(mysqlConfigured && !dbConnected && requestPath.startsWith("/api/") && requestPath !== "/api/health");
}
