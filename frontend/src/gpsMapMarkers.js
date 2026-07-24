export function plannedTripMarkerPositions(trips = []) {
  const groups = new Map();
  return trips.map((trip) => {
    const rawLat = trip?.targetStop?.lat;
    const rawLng = trip?.targetStop?.lng;
    const lat = rawLat === "" || rawLat === null || rawLat === undefined ? NaN : Number(rawLat);
    const lng = rawLng === "" || rawLng === null || rawLng === undefined ? NaN : Number(rawLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { trip, lat, lng };

    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    const index = groups.get(key) || 0;
    groups.set(key, index + 1);

    if (index === 0) return { trip, lat, lng };

    const ring = Math.floor((index - 1) / 8) + 1;
    const position = (index - 1) % 8;
    const angle = (Math.PI * 2 * position) / 8;
    const distance = 0.00018 * ring;

    return {
      trip,
      lat: lat + Math.sin(angle) * distance,
      lng: lng + Math.cos(angle) * distance,
    };
  });
}
