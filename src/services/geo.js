/**
 * Geolocation + Haversine distance helpers.
 */

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 20000,
      maximumAge: 300000, // accept a cached position up to 5 min old
      enableHighAccuracy: false,
    });
  });
}

/** Haversine distance in km between two lat/lon points */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * (Math.PI / 180); }

/** Sort stations by distance from a point, return top N */
export function nearestStations(lat, lon, stations, n = 20) {
  return stations
    .filter(s => s.latitude != null && s.longitude != null)
    .map(s => ({
      ...s,
      distanceKm: haversineKm(lat, lon, s.latitude, s.longitude),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n);
}
