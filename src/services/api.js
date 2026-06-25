/**
 * CHS IWLS API service
 * Base: https://api-iwls.dfo-mpo.gc.ca/api/v1
 *
 * Confirmed response shapes (live API):
 *  GET /stations          → plain array of station objects
 *  GET /stations/{id}/data → plain array of {eventDate, value, qcFlagCode, ...}
 *    wlp-hilo entries have NO type field — infer HIGH/LOW from alternating values
 *    wlp entries are per-minute resolution
 */

const BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`);
  return res.json();
}

/** Return all stations — plain array, cached after first fetch */
let _stationsCache = null;
export async function getStations() {
  if (_stationsCache) return _stationsCache;
  const data = await fetchJSON(`${BASE}/stations`);
  _stationsCache = Array.isArray(data) ? data : [];
  return _stationsCache;
}

/** Return single station metadata */
export async function getStation(stationId) {
  return fetchJSON(`${BASE}/stations/${stationId}`);
}

/**
 * Get high/low tide predictions for a station.
 * Returns events with an inferred `type` field: "HIGH" | "LOW"
 */
export async function getHiLo(stationId, from, to, datum = 'CD') {
  const url = `${BASE}/stations/${stationId}/data?` +
    new URLSearchParams({
      'time-series-code': 'wlp-hilo',
      'from': from,
      'to': to,
      'datum': datum,
    });
  const res = await fetchJSON(url);
  const events = Array.isArray(res) ? res : (res.data ?? []);
  return inferHiLoTypes(events);
}

/**
 * Infer HIGH/LOW type from alternating wlp-hilo events.
 * The API returns no type field — events alternate H/L, determine by
 * comparing each value to its neighbour.
 */
function inferHiLoTypes(events) {
  if (events.length === 0) return events;
  return events.map((e, i, arr) => {
    let type;
    if (i === 0) {
      // First event: compare to next
      type = arr.length > 1 ? (e.value >= arr[1].value ? 'HIGH' : 'LOW') : 'HIGH';
    } else {
      // Subsequent: opposite of previous (strict alternating pattern)
      type = arr[i - 1]._type === 'HIGH' ? 'LOW' : 'HIGH';
    }
    // Attach _type for use by next iteration, then expose as type
    e._type = type;
    return { ...e, type };
  });
}

/**
 * Get water level series for the chart.
 * wlp returns per-minute data — downsample to every 15 min for charting.
 */
export async function getWaterLevels(stationId, from, to, datum = 'CD') {
  const url = `${BASE}/stations/${stationId}/data?` +
    new URLSearchParams({
      'time-series-code': 'wlp',
      'from': from,
      'to': to,
      'datum': datum,
    });
  const res = await fetchJSON(url);
  const all = Array.isArray(res) ? res : (res.data ?? []);
  // Downsample: keep every 15th point (≈ 15-min intervals from per-minute data)
  return all.filter((_, i) => i % 15 === 0);
}

/** Get available time series / datums for a station */
export async function getStationMetadata(stationId) {
  return fetchJSON(`${BASE}/stations/${stationId}/metadata`);
}

/** True if this station has tide predictions (wlp-hilo time series) */
export function hasPredictions(station) {
  return station.timeSeries?.some(t => t.code === 'wlp-hilo') ?? false;
}
