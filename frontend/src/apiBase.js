export function resolveApiBase({ explicitBase, isProd, hostname }) {
  if (explicitBase !== undefined && explicitBase !== null) return explicitBase;
  if (isProd) return "";
  return ["127.0.0.1", "localhost", "::1"].includes(hostname) ? "http://127.0.0.1:4100" : "";
}
