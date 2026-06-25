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
    // Draw in the padding below the axis tick labels
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
import { getHiLo, getWaterLevels } from '../services/api.js';
import { isFavorite, addFavorite, removeFavorite, getSettings } from '../services/storage.js';
import { formatTime, formatDateTime, formatHeight, formatDate, formatDayKey, hoursFromNow, startOfDay } from '../services/format.js';

let _chart = null;

export async function renderTideView(container, station, settings) {
  if (!settings) settings = getSettings();
  const { datum, units } = settings;

  const displayName = station.officialName ?? station.name ?? station.id;
  const fav = isFavorite(station.id);

  container.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1">
          <div class="tide-station-name">${displayName}</div>
          <div class="tide-station-meta">Station ${station.id} · Datum: ${datum}</div>
        </div>
        <button class="fav-btn ${fav ? 'active' : ''}" id="fav-toggle" title="Favorite">★</button>
      </div>
    </div>

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
            <tr><th>Type</th><th>Time</th><th>Height</th></tr>
          </thead>
          <tbody id="week-tbody">
            <tr><td colspan="3" class="loading">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;

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

  // Date ranges
  const chartFrom = hoursFromNow(-12);
  const chartTo = hoursFromNow(24);
  const weekFrom = startOfDay(0);
  const weekTo = startOfDay(7);

  // Fetch all data in parallel
  const [chartLevels, hiloToday, hiloWeek] = await Promise.allSettled([
    getWaterLevels(station.id, chartFrom, chartTo, datum),
    getHiLo(station.id, chartFrom, chartTo, datum),
    getHiLo(station.id, weekFrom, weekTo, datum),
  ]);

  renderChart(container, chartLevels, hiloToday, settings);
  renderTodayHiLo(container, hiloToday, settings);
  renderWeekTable(container, hiloWeek, settings);
}

function renderChart(container, levelsResult, hiloResult, settings) {
  const canvas = container.querySelector('#tide-chart');
  if (!canvas) return;

  if (_chart) { _chart.destroy(); _chart = null; }

  const levels = levelsResult.status === 'fulfilled' ? levelsResult.value : [];
  const hilo = hiloResult.status === 'fulfilled' ? hiloResult.value : [];

  if (levels.length === 0) {
    canvas.parentElement.innerHTML = '<div class="error-msg">Chart data unavailable</div>';
    return;
  }

  const toHeight = v => settings.units === 'ft' ? v * 3.28084 : v;

  const labels = levels.map(p => new Date(p.eventDate ?? p.timestamp ?? p.time));
  const data = levels.map(p => toHeight(p.value));

  const nowX = new Date();
  const chartStart = labels[0];
  const chartEnd   = labels[labels.length - 1];
  const midnights  = getMidnights(chartStart, chartEnd);

  // Annotation points for hi/lo
  const hiloPoints = hilo.map(e => ({
    x: new Date(e.eventDate),
    y: toHeight(e.value),
    type: e.type,
  }));

  _chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `Water Level (${settings.units})`,
          data,
          borderColor: '#7ecfe0',
          backgroundColor: 'rgba(126,207,224,0.12)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.4,
        },
      ],
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
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y.toFixed(2)} ${settings.units}`,
          },
        },
        dayLabels: { midnights },
        annotation: buildAnnotations(nowX, hiloPoints, chartStart, chartEnd, midnights),
      },
    },
  });
}

function buildAnnotations(nowX, hiloPoints, chartStart, chartEnd, midnights) {
  const annotations = {};

  // --- Day bands: alternating shaded boxes (dates shown on x-axis, not here) ---
  const bandBoundaries = [chartStart, ...midnights, chartEnd];
  for (let i = 0; i < bandBoundaries.length - 1; i++) {
    annotations[`band_${i}`] = {
      type: 'box',
      xMin: bandBoundaries[i],
      xMax: bandBoundaries[i + 1],
      backgroundColor: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.12)',
      borderWidth: 0,
    };
  }

  // --- Midnight divider lines ---
  for (const [i, midnight] of midnights.entries()) {
    annotations[`midnight_${i}`] = {
      type: 'line',
      xMin: midnight,
      xMax: midnight,
      borderColor: 'rgba(255,255,255,0.15)',
      borderWidth: 1,
      borderDash: [3, 3],
    };
  }

  // --- Now line ---
  annotations.nowLine = {
    type: 'line',
    xMin: nowX,
    xMax: nowX,
    borderColor: '#ffffff',
    borderWidth: 2,
    label: {
      display: true,
      content: 'Now',
      position: 'start',
      backgroundColor: 'rgba(255,255,255,0.15)',
      color: '#ffffff',
      font: { size: 11, weight: 'bold' },
      padding: { x: 6, y: 3 },
      yAdjust: 8,
    },
  };

  // --- Hi/Lo dots ---
  for (const [i, pt] of hiloPoints.entries()) {
    annotations[`hilo_${i}`] = {
      type: 'point',
      xValue: pt.x,
      yValue: pt.y,
      backgroundColor: pt.type === 'HIGH' ? '#4fc3f7' : '#81c784',
      borderColor:     pt.type === 'HIGH' ? '#4fc3f7' : '#81c784',
      radius: 5,
    };
  }

  return { annotations };
}

/** Return Date objects for each midnight between start and end (exclusive of endpoints) */
function getMidnights(start, end) {
  const midnights = [];
  const d = new Date(start);
  // Advance to next midnight
  d.setHours(24, 0, 0, 0);
  while (d < end) {
    midnights.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return midnights;
}

function renderTodayHiLo(container, hiloResult, settings) {
  const grid = container.querySelector('#today-hilo');
  if (!grid) return;

  if (hiloResult.status === 'rejected') {
    grid.innerHTML = '<div class="error-msg" style="grid-column:1/-1">Failed to load hi/lo data</div>';
    return;
  }

  const events = hiloResult.value;
  if (events.length === 0) {
    grid.innerHTML = '<div class="station-meta">No data</div>';
    return;
  }

  grid.innerHTML = events.map(e => `
    <div class="hilo-item">
      <div class="hilo-type ${e.type === 'HIGH' ? 'H' : 'L'}">${e.type === 'HIGH' ? 'High' : 'Low'}</div>
      <div class="hilo-time">${formatDateTime(e.eventDate, settings)}</div>
      <div class="hilo-height">${formatHeight(e.value, settings)}</div>
    </div>`).join('');
}

function renderWeekTable(container, hiloResult, settings) {
  const tbody = container.querySelector('#week-tbody');
  if (!tbody) return;

  if (hiloResult.status === 'rejected') {
    tbody.innerHTML = '<tr><td colspan="3" class="error-msg">Failed to load weekly data</td></tr>';
    return;
  }

  const events = hiloResult.value;
  if (events.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">No data</td></tr>';
    return;
  }

  let lastDay = null;
  const rows = [];
  for (const e of events) {
    const day = formatDayKey(e.eventDate);
    if (day !== lastDay) {
      rows.push(`<tr class="day-separator"><td colspan="3">${formatDate(e.eventDate)}</td></tr>`);
      lastDay = day;
    }
    rows.push(`
      <tr>
        <td><span class="badge-${e.type === 'HIGH' ? 'H' : 'L'}">${e.type === 'HIGH' ? 'High' : 'Low'}</span></td>
        <td>${formatTime(e.eventDate, settings)}</td>
        <td>${formatHeight(e.value, settings)}</td>
      </tr>`);
  }
  tbody.innerHTML = rows.join('');
}
