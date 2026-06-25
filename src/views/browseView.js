import { getStations } from '../services/api.js';

/**
 * Drill-down browser: Province/Region → Station
 */
export function renderBrowseView(container, { onSelectStation }) {
  container.innerHTML = '<div class="loading">Loading stations…</div>';

  getStations().then(stations => {
    renderRegionList(container, stations, onSelectStation);
  }).catch(err => {
    container.innerHTML = `<div class="error-msg">Failed to load stations: ${err.message}</div>`;
  });
}

function renderRegionList(container, stations, onSelectStation) {
  // Build search + region list
  container.innerHTML = `
    <div class="search-bar">
      <input class="search-input" id="station-search" type="search" placeholder="Search stations…" autocomplete="off" />
    </div>
    <div id="drill-content"></div>`;

  const searchInput = container.querySelector('#station-search');
  const drillContent = container.querySelector('#drill-content');

  // Group by province/region (use 'province' or 'region' field)
  const groups = groupStations(stations);
  renderGroups(drillContent, groups, stations, onSelectStation);

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < 2) {
      renderGroups(drillContent, groups, stations, onSelectStation);
      return;
    }
    const matches = stations.filter(s =>
      (s.officialName ?? s.name ?? '').toLowerCase().includes(q)
    );
    renderStationList(drillContent, matches, onSelectStation);
  });
}

/**
 * The stations API has no region field — infer from longitude:
 *  lon < -100  → Pacific (BC / Yukon)
 *  lon > -60   → Newfoundland & Labrador
 *  lat > 55 && lon between -100..-60 → Central & Arctic
 *  else → Maritimes / Quebec (further split by lat)
 */
function inferRegion(s) {
  const { latitude: lat, longitude: lon } = s;
  if (lon == null || lat == null) return 'Other';
  if (lon < -100) return 'Pacific (BC)';
  if (lon > -60)  return 'Newfoundland & Labrador';
  if (lat > 55)   return 'Central & Arctic';
  if (lat > 46)   return 'Quebec';
  return 'Maritimes (NS / NB / PEI)';
}

function groupStations(stations) {
  const groups = {};
  for (const s of stations) {
    const region = inferRegion(s);
    if (!groups[region]) groups[region] = [];
    groups[region].push(s);
  }
  return groups;
}

function renderGroups(container, groups, stations, onSelectStation) {
  const sortedKeys = Object.keys(groups).sort();
  const ul = document.createElement('ul');
  ul.className = 'drill-list';

  for (const region of sortedKeys) {
    const li = document.createElement('li');
    li.className = 'drill-item';
    li.innerHTML = `
      <span class="drill-item-label">${region} <span style="color:var(--text-muted);font-size:0.8rem">(${groups[region].length})</span></span>
      <span class="drill-arrow">›</span>`;
    li.addEventListener('click', () => {
      renderStationList(container, groups[region], onSelectStation, () => {
        renderGroups(container, groups, stations, onSelectStation);
      });
    });
    ul.appendChild(li);
  }
  container.innerHTML = '';
  container.appendChild(ul);
}

function renderStationList(container, stations, onSelectStation, onBack) {
  container.innerHTML = '';

  if (onBack) {
    const backBtn = document.createElement('button');
    backBtn.className = 'nav-back';
    backBtn.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:12px;padding:8px 12px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--border);color:var(--text);cursor:pointer';
    backBtn.innerHTML = '&#8592; All regions';
    backBtn.addEventListener('click', onBack);
    container.appendChild(backBtn);
  }

  const sorted = [...stations].sort((a, b) =>
    (a.officialName ?? a.name ?? '').localeCompare(b.officialName ?? b.name ?? '')
  );

  for (const s of sorted) {
    const item = document.createElement('div');
    item.className = 'station-item';
    const displayName = s.officialName ?? s.name ?? s.id;
    item.innerHTML = `
      <div>
        <div class="station-name">${displayName}</div>
        <div class="station-meta">${s.id ?? ''}</div>
      </div>`;
    item.addEventListener('click', () => onSelectStation({ id: s.id, name: displayName, ...s }));
    container.appendChild(item);
  }
}
