import { getStations } from '../services/api.js';
import { getCurrentPosition, nearestStations } from '../services/geo.js';
import { hasPredictions } from './tideView.js';

// Persist results across back-navigation within the same session
let _cachedResults = null; // { lat, lon, stations: [{...distanceKm}] }

// Pre-fetch stations as soon as this module loads
const stationsPromise = getStations();

export function renderNearbyView(container, { onSelectStation }) {
  container.innerHTML = `
    <div class="nearby-header">
      <button class="btn-locate" id="btn-locate">
        <span>&#127961;</span> Find Nearby Stations
      </button>
    </div>
    <div id="nearby-results"></div>`;

  const btn = container.querySelector('#btn-locate');
  const results = container.querySelector('#nearby-results');

  // Restore previous results immediately if available
  if (_cachedResults) {
    renderResults(results, _cachedResults, onSelectStation);
    btn.innerHTML = '<span>&#127961;</span> Refresh Location';
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.innerHTML = '<span>&#127961;</span> Locating…';
    results.innerHTML = '<div class="loading">Getting your location…</div>';

    try {
      const [pos, stations] = await Promise.all([
        getCurrentPosition(),
        stationsPromise,
      ]);
      const { latitude, longitude } = pos.coords;
      const nearest = nearestStations(latitude, longitude, stations, 20);

      _cachedResults = { lat: latitude, lon: longitude, stations: nearest };
      renderResults(results, _cachedResults, onSelectStation);
      btn.innerHTML = '<span>&#127961;</span> Refresh Location';
    } catch (err) {
      results.innerHTML = `<div class="error-msg">${geoErrorMessage(err)}</div>`;
      btn.innerHTML = '<span>&#127961;</span> Find Nearby Stations';
    } finally {
      btn.disabled = false;
    }
  });
}

function renderResults(container, { lat, lon, stations }, onSelectStation) {
  container.innerHTML = `<div class="station-meta" style="margin-bottom:12px">Nearest to ${lat.toFixed(3)}°, ${lon.toFixed(3)}°</div>`;
  for (const s of stations) {
    const item = document.createElement('div');
    item.className = 'station-item';
    const displayName = s.officialName ?? s.name ?? s.id;
    item.innerHTML = `
      <div style="flex:1">
        <div class="station-name">${displayName}${hasPredictions(s) ? '' : ' <span class="badge-obs">Obs. only</span>'}</div>
        <div class="station-meta">${s.distanceKm.toFixed(1)} km away</div>
      </div>`;
    item.addEventListener('click', () => onSelectStation({ id: s.id, name: displayName, ...s }));
    container.appendChild(item);
  }
}

function geoErrorMessage(err) {
  if (err.code === 1) return 'Location access denied. Please allow location access in your browser settings.';
  if (err.code === 2) return 'Location unavailable. Check that location services are enabled on your device.';
  if (err.code === 3) return 'Location request timed out. Try again or browse stations manually.';
  return `Location error: ${err.message}`;
}
