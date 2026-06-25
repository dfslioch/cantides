import './styles/main.css';
import { renderHomeView } from './views/homeView.js';
import { renderBrowseView } from './views/browseView.js';
import { renderNearbyView } from './views/nearbyView.js';
import { renderTideView } from './views/tideView.js';
import { getSettings, saveSettings } from './services/storage.js';

// ===== State =====
let currentView = 'home';   // home | search | nearby
let settings = getSettings();

// ===== DOM refs =====
const mainContent = document.getElementById('main-content');
const navItems = document.querySelectorAll('.nav-item');
const btnBack = document.getElementById('btn-back');
const btnSettings = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const btnCloseSettings = document.getElementById('btn-close-settings');

// ===== Nav =====
navItems.forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    navigateTo(view);
  });
});

function navigateTo(view) {
  currentView = view;
  navItems.forEach(b => b.classList.toggle('active', b.dataset.view === view));
  btnBack.classList.add('hidden');
  renderView(view);
}

function renderView(view) {
  mainContent.innerHTML = '';
  if (view === 'home') renderHomeView(mainContent, { onSelectStation });
  else if (view === 'search') renderBrowseView(mainContent, { onSelectStation });
  else if (view === 'nearby') renderNearbyView(mainContent, { onSelectStation });
}

// ===== Tide View =====
function onSelectStation(station) {
  mainContent.innerHTML = '<div class="loading">Loading tide data…</div>';
  btnBack.classList.remove('hidden');
  navItems.forEach(b => b.classList.remove('active'));

  renderTideView(mainContent, station, settings).catch(err => {
    mainContent.innerHTML = `<div class="error-msg">Error: ${err.message}</div>`;
  });

  btnBack.onclick = () => {
    btnBack.classList.add('hidden');
    navigateTo(currentView);
  };
}

// ===== Settings =====
btnSettings.addEventListener('click', () => settingsPanel.classList.remove('hidden'));
btnCloseSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));
settingsPanel.addEventListener('click', e => {
  if (e.target === settingsPanel) settingsPanel.classList.add('hidden');
});

// Sync settings UI to current values
document.getElementById('setting-datum').value = settings.datum;
updateToggleGroup('unit', settings.units);
updateToggleGroup('time', settings.timeFormat);

document.getElementById('setting-datum').addEventListener('change', e => {
  settings = { ...settings, datum: e.target.value };
  saveSettings(settings);
});

['unit-m', 'unit-ft'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    settings = { ...settings, units: e.target.dataset.value };
    saveSettings(settings);
    updateToggleGroup('unit', settings.units);
  });
});

['time-24', 'time-12'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    settings = { ...settings, timeFormat: e.target.dataset.value };
    saveSettings(settings);
    updateToggleGroup('time', settings.timeFormat);
  });
});

function updateToggleGroup(prefix, activeValue) {
  document.querySelectorAll(`[id^="${prefix}-"]`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === activeValue);
  });
}

// ===== Offline banner =====
const offlineBanner = document.getElementById('offline-banner');
function updateOnlineStatus() {
  offlineBanner.classList.toggle('hidden', navigator.onLine);
}
window.addEventListener('offline', updateOnlineStatus);
window.addEventListener('online', updateOnlineStatus);
updateOnlineStatus();

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ===== Initial render =====
renderView('home');
