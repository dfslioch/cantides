import { getHiLo } from '../services/api.js';
import { formatTime, formatHeight, formatDayKey, startOfDay, hoursFromNow } from '../services/format.js';
import { getSettings } from '../services/storage.js';
import { sparklineSVG } from '../services/sparkline.js';
import { getFavorites } from '../services/storage.js';

export function renderHomeView(container, { onSelectStation }) {
  const favs = getFavorites();
  const settings = getSettings();

  if (favs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🌊</div>
        <p>No favorites yet.</p>
        <p>Browse or search for stations and tap ★ to save them here.</p>
      </div>`;
    return;
  }

  container.innerHTML = '<div class="loading">Loading tide data…</div>';

  // Fetch from start of today through +36h so we get full today sparkline + upcoming hi/lo
  const from   = startOfDay(0);
  const to     = hoursFromNow(36);
  const todayKey = formatDayKey(new Date().toISOString());

  Promise.all(
    favs.map(fav =>
      getHiLo(fav.id, from, to, settings.datum)
        .then(events => ({ fav, events }))
        .catch(() => ({ fav, events: [] }))
    )
  ).then(results => {
    container.innerHTML = '';
    for (const { fav, events } of results) {
      const now = Date.now();
      const upcoming = events.filter(e => new Date(e.eventDate).getTime() >= now);
      const nH = upcoming.find(e => e.type === 'HIGH');
      const nL = upcoming.find(e => e.type === 'LOW');

      // Today's events for sparkline
      const todayEvents = events.filter(e => formatDayKey(e.eventDate) === todayKey);

      const card = document.createElement('div');
      card.className = 'card card-clickable';
      card.innerHTML = `
        <div class="home-card-header">
          <div class="tide-station-name">${fav.name}</div>
          ${todayEvents.length ? `<div class="home-sparkline">${sparklineSVG(events, todayEvents, 240, 28)}</div>` : ''}
        </div>
        <div style="display:flex;gap:16px;margin-top:8px">
          ${nH ? `<div class="hilo-item" style="flex:1">
            <div class="hilo-type H">Next High</div>
            <div class="hilo-time">${formatTime(nH.eventDate, settings)}</div>
            <div class="hilo-height">${formatHeight(nH.value, settings)}</div>
          </div>` : ''}
          ${nL ? `<div class="hilo-item" style="flex:1">
            <div class="hilo-type L">Next Low</div>
            <div class="hilo-time">${formatTime(nL.eventDate, settings)}</div>
            <div class="hilo-height">${formatHeight(nL.value, settings)}</div>
          </div>` : ''}
          ${!nH && !nL ? '<div class="station-meta">No upcoming data</div>' : ''}
        </div>`;

      card.addEventListener('click', () => onSelectStation(fav));
      container.appendChild(card);
    }
  });
}
