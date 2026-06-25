/**
 * Formatting helpers for heights, times, dates.
 */

export function formatHeight(metres, settings) {
  const v = settings.units === 'ft' ? metres * 3.28084 : metres;
  const unit = settings.units === 'ft' ? 'ft' : 'm';
  return `${v.toFixed(2)} ${unit}`;
}

export function formatTime(isoString, settings) {
  const d = new Date(isoString);
  if (settings.timeFormat === '12') {
    return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** e.g. "Fri Jun 27, 14:35" or "Fri Jun 27, 2:35 PM" */
export function formatDateTime(isoString, settings) {
  const d = new Date(isoString);
  const datePart = d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
  const timePart = formatTime(isoString, settings);
  return `${datePart}, ${timePart}`;
}

export function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDayKey(isoString) {
  const d = new Date(isoString);
  return d.toISOString().slice(0, 10);
}

/** ISO string for N hours from now */
export function hoursFromNow(h) {
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}

/** ISO string for start of today */
export function startOfDay(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}
