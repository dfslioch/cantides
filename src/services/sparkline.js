/**
 * Shared sparkline SVG generator.
 * Used by both tideView (7-day table) and homeView (favorites cards).
 */

/**
 * Build a smooth SVG sparkline for one calendar day.
 * @param {Array} allEvents  — full event list (for curve continuity at edges)
 * @param {Array} dayEvents  — events belonging to this day
 * @param {number} w         — viewBox width
 * @param {number} h         — viewBox height
 */
export function sparklineSVG(allEvents, dayEvents, w = 240, h = 50) {
  if (dayEvents.length < 1) return '';

  const dayStartMs = new Date(dayEvents[0].eventDate).setHours(0, 0, 0, 0);
  const dayEndMs   = dayStartMs + 86400000;
  const tickMs     = [6, 12, 18].map(hr => dayStartMs + hr * 3600000);

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
  const px = t => ((t - dayStartMs) / (dayEndMs - dayStartMs)) * w;
  const py = v => curveBot - ((v - minV) / rangeV) * (curveBot - curveTop);

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

  const baseline = `<line x1="0" y1="${curveBot + 2}" x2="${w}" y2="${curveBot + 2}" stroke="rgba(138,155,176,0.5)" stroke-width="1"/>`;

  return `<svg viewBox="0 0 ${w} ${h}" class="sparkline-svg" aria-hidden="true">
    ${baseline}${ticks}
    <path d="${d}" stroke="#7ecfe0" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}
