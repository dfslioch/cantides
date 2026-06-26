import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import Annotation from 'chartjs-plugin-annotation';

// Plugin: draws date labels in the bottom padding below the x-axis tick labels
const dayLabelsPlugin = {
  id: 'dayLabels',
  afterDraw(chart) {
    const midnights = chart.options.plugins.dayLabels?.midnights;
    if (!midnights?.length) return;
    const { ctx, chartArea, scales: { x } } = chart;
    ctx.save();
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(138,155,176,0.9)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const y = chartArea.bottom + 36;
    for (const midnight of midnights) {
      const xPx = x.getPixelForValue(midnight.getTime());
      if (xPx < chartArea.left || xPx > chartArea.right) continue;
      const label = midnight.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
      ctx.fillText(label, xPx, y);
    }
    ctx.restore();
  },
};

Chart.register(Annotation, dayLabelsPlugin);

import { getHiLo, getWaterLevels, getStation, getStations, hasPredictions } from '../services/api.js';
import { isFavorite, addFavorite, removeFavorite, getSettings } from '../services/storage.js';
import { formatTime, formatDateTime, formatHeight, formatDate, formatDayKey, hoursFromNow, startOfDay } from '../services/format.js';

let _chart = null;


export async function renderTideView(container, station, settings) {
  if (!settings) settings = getSettings();
  const { datum, units } = settings;

  // Favorites only store {id, name} — look up the full record if timeSeries is missing
  if (!station.timeSeries) {
    const all = await getStations();
    const full = all.find(s => s.id === station.id);
    if (full) station = { ...station, ...full };
  }

  const displayName = station.officialName ?? station.name ?? station.id;
  const fav = isFavorite(station.id);
  const predicting = hasPredictions(station);

  container.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1">
          <div class="tide-station-name">${displayName}</div>
          <div class="tide-station-meta">Station ${station.code ?? station.id} · Datum: ${datum}</div>
        </div>
        <button class="fav-btn ${fav ? 'active' : ''}" id="fav-toggle" title="Favorite">★</button>
      </div>
      <div id="tz-notice"></div>
    </div>

    ${predicting ? `
    <div class="card">
      <div class="hilo-section">
        <h3>Current Window</h3>
        <div class="hilo-grid" id="today-hilo">
          <div class="loading" style="grid-column:1/-1">Loading…</div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="tide-chart"></canvas>
      </div>
    </div>

    <div class="card">
      <div class="week-section">
        <h3>7-Day Forecast</h3>
        <table class="week-table">
          <thead>
            <tr><th>Type</th><th>Time</th><th>Height</th><th class="sparkline-col"></th></tr>
          </thead>
          <tbody id="week-tbody">
            <tr><td colspan="4" class="loading">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>` : `
    <div class="card">
      <div class="obs-only-notice">
        <div class="obs-only-icon">📡</div>
        <div>
          <strong>Observation station only</strong>
          <p>Tide predictions are not available for this station. It records water level observations only.</p>
        </div>
      </div>
    </div>`}`;

  // Favorite toggle
  const favBtn = container.querySelector('#fav-toggle');
  favBtn.addEventListener('click', () => {
    if (isFavorite(station.id)) {
      removeFavorite(station.id);
      favBtn.classList.remove('active');
    } else {
      addFavorite(station);
      favBtn.classList.add('active');
    }
  });

  // Timezone check — fetch full station record in background
  getStation(station.id).then(full => {
    const stationTz = full?.timeZone;
    if (!stationTz) return;
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (stationTz !== deviceTz) {
      const notice = container.querySelector('#tz-notice');
      if (notice) {
        notice.innerHTML = `<div class="tz-notice">
          ⚠ Station timezone: <strong>${stationTz}</strong> — your device is set to <strong>${deviceTz}</strong>.
          Times shown are in your device's local time.
        </div>`;
      }
    }
  }).catch(() => {});

  if (!predicting) return;

  // Date ranges
  const chartFrom = hoursFromNow(-12);
  const chartTo   = hoursFromNow(24);
  const weekFrom  = startOfDay(0);
  const weekTo    = startOfDay(7);

  const [chartLevels, hiloToday, hiloWeek] = await Promise.allSettled([
    getWaterLevels(station.id, chartFrom, chartTo, datum),
    getHiLo(station.id, chartFrom, chartTo, datum),
    getHiLo(station.id, weekFrom, weekTo, datum),
  ]);

  renderChart(container, chartLevels, hiloToday, settings);
  renderTodayHiLo(container, hiloToday, settings);
  renderWeekTable(container, hiloWeek, settings);
}

// ─── Chart ────────────────────────────────────────────────────────────────────

function renderChart(container, levelsResult, hiloResult, settings) {
  const canvas = container.querySelector('#tide-chart');
  if (!canvas) return;

  if (_chart) { _chart.destroy(); _chart = null; }

  const levels = levelsResult.status === 'fulfilled' ? levelsResult.value : [];
  const hilo   = hiloResult.status === 'fulfilled'   ? hiloResult.value   : [];

  if (levels.length === 0) {
    canvas.parentElement.innerHTML = '<div class="error-msg">Chart data unavailable</div>';
    return;
  }

  const toHeight = v => settings.units === 'ft' ? v * 3.28084 : v;
  const labels     = levels.map(p => new Date(p.eventDate));
  const data       = levels.map(p => toHeight(p.value));
  const nowX       = new Date();
  const chartStart = labels[0];
  const chartEnd   = labels[labels.length - 1];
  const midnights  = getMidnights(chartStart, chartEnd);

  const hiloPoints = hilo.map(e => ({
    x: new Date(e.eventDate),
    y: toHeight(e.value),
    type: e.type,
  }));

  _chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Water Level (${settings.units})`,
        data,
        borderColor: '#7ecfe0',
        backgroundColor: 'rgba(126,207,224,0.12)',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { bottom: 24 } },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'hour', displayFormats: { hour: 'HH:mm' } },
          grid: { color: '#2d3f55' },
          ticks: { color: '#8a9bb0', maxTicksLimit: 10, maxRotation: 0 },
        },
        y: {
          grid: { color: '#2d3f55' },
          ticks: { color: '#8a9bb0' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y.toFixed(2)} ${settings.units}` } },
        dayLabels: { midnights },
        annotation: buildAnnotations(nowX, hiloPoints, chartStart, chartEnd, midnights),
      },
    },
  });
}

function buildAnnotations(nowX, hiloPoints, chartStart, chartEnd, midnights) {
  const annotations = {};
  const bandBoundaries = [chartStart, ...midnights, chartEnd];
  for (let i = 0; i < bandBoundaries.length - 1; i++) {
    annotations[`band_${i}`] = {
      type: 'box',
      xMin: bandBoundaries[i], xMax: bandBoundaries[i + 1],
      backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.12)',
      borderWidth: 0,
    };
  }
  for (const [i, midnight] of midnights.entries()) {
    annotations[`midnight_${i}`] = {
      type: 'line', xMin: midnight, xMax: midnight,
      borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderDash: [3, 3],
    };
  }
  annotations.nowLine = {
    type: 'line', xMin: nowX, xMax: nowX,
    borderColor: '#ffffff', borderWidth: 2,
    label: {
      display: true, content: 'Now', position: 'start',
      backgroundColor: 'rgba(255,255,255,0.15)', color: '#ffffff',
      font: { size: 11, weight: 'bold' }, padding: { x: 6, y: 3 }, yAdjust: 8,
    },
  };
  for (const [i, pt] of hiloPoints.entries()) {
    annotations[`hilo_${i}`] = {
      type: 'point', xValue: pt.x, yValue: pt.y,
      backgroundColor: pt.type === 'HIGH' ? '#4fc3f7' : '#81c784',
      borderColor:     pt.type === 'HIGH' ? '#4fc3f7' : '#81c784',
      radius: 5,
    };
  }
  return { annotations };
}

function getMidnights(start, end) {
  const midnights = [];
  const d = new Date(start);
  d.setHours(24, 0, 0, 0);
  while (d < end) { midnights.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return midnights;
}

// ─── Current Window hi/lo grid ────────────────────────────────────────────────

function renderTodayHiLo(container, hiloResult, settings) {
  const grid = container.querySelector('#today-hilo');
  if (!grid) return;
  if (hiloResult.status === 'rejected') {
    grid.innerHTML = '<div class="error-msg" style="grid-column:1/-1">Failed to load hi/lo data</div>';
    return;
  }
  const events = hiloResult.value;
  if (events.length === 0) { grid.innerHTML = '<div class="station-meta">No data</div>'; return; }
  grid.innerHTML = events.map(e => `
    <div class="hilo-item">
      <div class="hilo-type ${e.type === 'HIGH' ? 'H' : 'L'}">${e.type === 'HIGH' ? 'High' : 'Low'}</div>
      <div class="hilo-time">${formatDateTime(e.eventDate, settings)}</div>
      <div class="hilo-height">${formatHeight(e.value, settings)}</div>
    </div>`).join('');
}

// ─── 7-day table with sparklines ─────────────────────────────────────────────

function renderWeekTable(container, hiloResult, settings) {
  const tbody = container.querySelector('#week-tbody');
  if (!tbody) return;
  if (hiloResult.status === 'rejected') {
    tbody.innerHTML = '<tr><td colspan="4" class="error-msg">Failed to load weekly data</td></tr>';
    return;
  }
  const events = hiloResult.value;
  if (events.length === 0) { tbody.innerHTML = '<tr><td colspan="4">No data</td></tr>'; return; }

  // Group events by calendar day
  const byDay = new Map();
  for (const e of events) {
    const key = formatDayKey(e.eventDate);
    if (!byDay.has(key)) byDay.set(key, { label: formatDate(e.eventDate), events: [] });
    byDay.get(key).events.push(e);
  }

  const rows = [];
  for (const { label, events: dayEvents } of byDay.values()) {
    // Pass all events for context so the sparkline curve is smooth at the edges
    const svg = sparklineSVG(events, dayEvents);
    rows.push(`
      <tr class="day-separator">
        <td colspan="3">${label}</td>
        <td class="sparkline-col">${svg}</td>
      </tr>`);
    for (const e of dayEvents) {
      rows.push(`
        <tr>
          <td><span class="badge-${e.type === 'HIGH' ? 'H' : 'L'}">${e.type === 'HIGH' ? 'High' : 'Low'}</span></td>
          <td>${formatTime(e.eventDate, settings)}</td>
          <td>${formatHeight(e.value, settings)}</td>
          <td></td>
        </tr>`);
    }
  }
  tbody.innerHTML = rows.join('');
}

/**
 * Build a smooth SVG sparkline for one day, using all events for curve continuity.
 * Width is expressed as a viewBox unit — CSS makes it fill the column.
 * Tick marks at 06:00, 12:00, 18:00 give time reference.
 */
function sparklineSVG(allEvents, dayEvents, w = 240, h = 50) {
  if (dayEvents.length < 1) return '';

  const dayStartMs = new Date(dayEvents[0].eventDate).setHours(0, 0, 0, 0);
  const dayEndMs   = dayStartMs + 86400000;
  const tickMs     = [6, 12, 18].map(h => dayStartMs + h * 3600000);

  // Collect day events + 1 neighbour on each side for smooth entry/exit
  const pts = [];
  let beforeIdx = -1;
  for (let i = 0; i < allEvents.length; i++) {
    const t = new Date(allEvents[i].eventDate).getTime();
    if (t < dayStartMs) { beforeIdx = i; }
    else if (t <= dayEndMs) { pts.push(allEvents[i]); }
  }
  const afterEvent = allEvents.find(e => new Date(e.eventDate).getTime() > dayEndMs);
  if (beforeIdx >= 0) pts.unshift(allEvents[beforeIdx]);
  if (afterEvent)     pts.push(afterEvent);

  if (pts.length < 2) return '';

  const values = pts.map(e => e.value);
  const minV = Math.min(...values), maxV = Math.max(...values), rangeV = maxV - minV || 1;

  const curveTop = 2, curveBot = h - 2;
  const px = t  => ((t - dayStartMs) / (dayEndMs - dayStartMs)) * w;
  const py = v  => curveBot - ((v - minV) / rangeV) * (curveBot - curveTop);

  const coords = pts.map(e => [px(new Date(e.eventDate).getTime()), py(e.value)]);

  let d = `M ${coords[0][0].toFixed(1)} ${coords[0][1].toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const cx = ((x0 + x1) / 2).toFixed(1);
    d += ` C ${cx} ${y0.toFixed(1)}, ${cx} ${y1.toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }

  // Full-height vertical dividers at 00, 06, 12, 18, 24
  const allTickMs = [dayStartMs, ...tickMs, dayEndMs];
  const ticks = allTickMs.map(t => {
    const x = px(t).toFixed(1);
    return `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="rgba(138,155,176,0.6)" stroke-width="1"/>`;
  }).join('');

  // Baseline
  const baseline = `<line x1="0" y1="${curveBot + 2}" x2="${w}" y2="${curveBot + 2}" stroke="rgba(138,155,176,0.5)" stroke-width="1"/>`;

  return `<svg viewBox="0 0 ${w} ${h}" class="sparkline-svg" aria-hidden="true">
    ${baseline}${ticks}
    <path d="${d}" stroke="#7ecfe0" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}
