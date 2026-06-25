import { getFavorites } from '../services/storage.js';
import { getHiLo } from '../services/api.js';
import { formatTime, formatHeight, hoursFromNow } from '../services/format.js';
import { getSettings } from '../services/storage.js';

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

  // Fetch next hi/lo for each favorite in parallel
  const now = new Date().toISOString();
  const future = hoursFromNow(36);

  Promise.all(
    favs.map(fav =>
      getHiLo(fav.id, now, future, settings.datum)
        .then(events => ({ fav, events }))
        .catch(() => ({ fav, events: [] }))
    )
  ).then(results => {
    container.innerHTML = '';
    for (const { fav, events } of results) {
      // type field is "HIGH" or "LOW"
      const highs = events.filter(e => e.type === 'HIGH').sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
      const lows = events.filter(e => e.type === 'LOW').sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
      const nH = highs[0];
      const nL = lows[0];

      const card = document.createElement('div');
      card.className = 'card card-clickable';
      card.innerHTML = `
        <div class="tide-station-name">${fav.name}</div>
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
          ${!nH && !nL ? '<div class="station-meta">No data available</div>' : ''}
        </div>`;
      card.addEventListener('click', () => onSelectStation(fav));
      container.appendChild(card);
    }
  });
}
