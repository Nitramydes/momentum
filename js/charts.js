// SVG vizualizace: progress kruh, tydenni sloupce, kalendarova heatmapa.
import { dayKey } from './store.js';

let gradId = 0;

export function ring(pct, { size = 92, stroke = 9, color } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct)));
  const id = `rg${gradId++}`;
  const fill = color || `url(#${id})`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#22d3ee"/>
    </linearGradient></defs>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${fill}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      style="transition:stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)"/>
  </svg>`;
}

function lastNDays(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d); x.setDate(d.getDate() - i);
    out.push(x);
  }
  return out;
}

// soucet opakovani cviku za den
function repsPerDay(state) {
  const map = {};
  for (const l of state.logs) if (l.kind === 'exercise') map[l.day] = (map[l.day] || 0) + l.amount;
  return map;
}

export function weeklyBars(state) {
  const map = repsPerDay(state);
  const days = lastNDays(7);
  const vals = days.map((d) => map[dayKey(d.getTime())] || 0);
  const max = Math.max(1, ...vals);
  const labels = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  return `<div class="bars">${days.map((d, i) => {
    const v = vals[i];
    const h = v === 0 ? 4 : Math.round((v / max) * 118) + 6;
    const dow = (d.getDay() + 6) % 7;
    return `<div class="bar-col"><div class="bar ${v === 0 ? 'empty' : ''}" style="height:${h}px" title="${v}"></div><div class="bl">${labels[dow]}</div></div>`;
  }).join('')}</div>`;
}

export function heatmap(state) {
  const map = {};
  for (const l of state.logs) map[l.day] = (map[l.day] || 0) + (l.kind === 'exercise' ? l.amount : 5);
  const weeks = 13;
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const start = new Date(today); start.setDate(today.getDate() - dow - (weeks - 1) * 7);
  const cells = [];
  const maxV = Math.max(1, ...Object.values(map));
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    if (d > today) { cells.push('<div class="cell" style="opacity:0"></div>'); continue; }
    const v = map[dayKey(d.getTime())] || 0;
    let lvl = 0;
    if (v > 0) lvl = Math.min(4, Math.ceil((v / maxV) * 4));
    cells.push(`<div class="cell ${lvl ? 'l' + lvl : ''}" title="${dayKey(d.getTime())}: ${v}"></div>`);
  }
  return `<div class="heat">${cells.join('')}</div>`;
}
