/**
 * localStorage helpers for favorites and settings.
 */

const FAVS_KEY = 'cantides_favorites';
const SETTINGS_KEY = 'cantides_settings';

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVS_KEY) ?? '[]');
  } catch { return []; }
}

export function addFavorite(station) {
  const favs = getFavorites();
  if (!favs.find(f => f.id === station.id)) {
    favs.push({ id: station.id, name: station.officialName ?? station.name });
    localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
  }
}

export function removeFavorite(stationId) {
  const favs = getFavorites().filter(f => f.id !== stationId);
  localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
}

export function isFavorite(stationId) {
  return getFavorites().some(f => f.id === stationId);
}

const DEFAULT_SETTINGS = { datum: 'CD', units: 'm', timeFormat: '24' };

export function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
