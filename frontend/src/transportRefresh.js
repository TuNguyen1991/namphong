export const TRANSPORT_AUTO_REFRESH_MS = 5 * 60 * 1000;
export const TRANSPORT_TRIPS_PAGE_SIZE = 500;

export function transportTripsPath(query = "", pageSize = TRANSPORT_TRIPS_PAGE_SIZE) {
  const params = new URLSearchParams(String(query || ""));
  params.set("page", "1");
  params.set("pageSize", String(pageSize));
  return `/api/trips?${params.toString()}`;
}

export function shouldAutoRefreshTransport({ activeView, currentUser }) {
  return activeView === "transport" && Boolean(currentUser);
}

export function shouldLoadAppData({ authReady, currentUser }) {
  return Boolean(authReady && currentUser);
}
