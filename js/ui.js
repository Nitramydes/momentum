// Vykreslovani vsech obrazovek a formularu (vraci HTML retezce).
import { icon, HABIT_ICONS, EX_ICONS, COLORS } from './icons.js';
import { ring, weeklyBars, heatmap } from './charts.js';
import { dayKey } from './store.js';
import {
  amountOn, habitDoneOn, streakInfo, nextMultStep, weekProgress,
  levelProgress, rankFor, computeStats, exTodayTotal, getQuest, BADGES,
} from './game.js';

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TABS = [
  { id: 'today', label: 'Dnes', icon: 'home' },
  { id: 'habits', label: 'Návyky', icon: 'listcheck' },
  { id: 'train', label: 'Trénink', icon: 'dumbbell' },
  { id: 'stats', label: 'Statistiky', icon: 'chart' },
  { id: 'profile', label: 'Profil', icon: 'user' },
];

export function renderTabbar(active) {
  return TABS.map((t) =>
    `<button class="tab ${t.id === active ? 'active' : ''}" data-act="tab" data-tab="${t.id}">
      ${icon(t.icon)}<span>${t.label}</span>
    </button>`).join('');
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Dobré ráno' : h < 18 ? 'Dobrý den' : 'Dobrý večer';
}
function prettyDate() {
  try {
    const s = new Intl.DateTimeFormat('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch (e) { return dayKey(); }
}

function tinted(color) {
  return `background:${color}22;color:${color};box-shadow:inset 0 0 0 1px ${color}33`;
}

// ---------- hero (level + souhrn) ----------
function heroCard(state) {
  const lp = levelProgress(state.game.xp);
  const rank = rankFor(lp.level);
  const todayK = dayKey();
  const totalDaily = state.habits.filter((h) => h.type === 'daily').length;
  const doneDaily = state.habits.filter((h) => h.type === 'daily' && habitDoneOn(state, h, todayK)).length;
  let bestStreak = 0;
  for (const h of state.habits) { const i = streakInfo(state, h); if (h.type === 'daily') bestStreak = Math.max(bestStreak, i.displayStreak); }
  return `<div class="card hero">
    <div class="hero-top">
      <div class="ring-wrap">
        ${ring(lp.pct, { size: 92, stroke: 9 })}
        <div class="ring-center"><div class="level-num">${lp.level}</div><div class="level-lbl">Level</div></div>
      </div>
      <div class="hero-meta">
        <div class="rank">${icon(rank.icon)} ${rank.name}</div>
        <div class="xp">${state.game.xp.toLocaleString('cs-CZ')} XP · ještě ${(lp.need - lp.inLevel).toLocaleString('cs-CZ')} do levelu ${lp.level + 1}</div>
        <div class="xpbar"><i style="width:${Math.round(lp.pct * 100)}%"></i></div>
      </div>
    </div>
    <div class="hero-stats">
      <div class="pill flame"><div class="v">${icon('flame')} ${bestStreak}</div><div class="l">nejdelší streak</div></div>
      <div class="pill"><div class="v">${doneDaily}/${totalDaily}</div><div class="l">návyky dnes</div></div>
    </div>
  </div>`;
}

// ---------- quest ----------
function questCard(state) {
  const q = getQuest(state);
  return `<div class="card quest ${q.done ? 'done' : ''}">
    <div class="q-ico">${icon(q.done ? 'check' : 'target')}</div>
    <div class="q-body">
      <div class="q-tag">Denní výzva</div>
      <div class="q-title">${esc(q.label)}</div>
      <div class="q-prog">${q.done ? 'Splněno! ⚡' : `${q.progress}/${q.target}`}</div>
    </div>
    <div class="q-reward">+${q.reward}</div>
  </div>`;
}

// ---------- habit row ----------
function habitRow(state, h) {
  const today = dayKey();
  const amt = amountOn(state, 'habit', h.id, today);
  const target = h.target || 1;
  const done = amt >= target;
  const info = streakInfo(state, h);
  const pct = Math.min(1, amt / target);
  const step = h.step || 1;

  let sub = '';
  if (h.type === 'weekly') {
    const wp = weekProgress(state, h);
    sub = `<span>${wp.done}/${wp.target} tento týden</span>`;
  } else {
    sub = `<span>${amt}/${target} ${esc(h.unit || '')}</span>`;
  }
  const streakBadge = info.displayStreak > 0
    ? `<span class="mini-streak">${icon('flame')} ${info.displayStreak}${info.unit}</span>` : '';
  const multBadge = info.multiplier > 1 ? `<span class="mult-badge">×${info.multiplier}</span>` : '';

  let action;
  if (target <= 1) {
    action = `<button class="checkbtn ${done ? 'done' : ''}" data-act="habit-check" data-id="${h.id}">${icon('check')}</button>`;
  } else {
    action = `<div class="stepper">
      <button data-act="habit-sub" data-id="${h.id}">${icon('minus')}</button>
      <span class="cnt">${amt}</span>
      <button data-act="habit-add" data-id="${h.id}">${icon('plus')}</button>
    </div>`;
  }

  return `<div class="card habit">
    <div class="h-ico" style="${tinted(h.color)}">${icon(h.icon)}</div>
    <div class="h-body">
      <div class="h-name">${esc(h.name)} ${multBadge}</div>
      <div class="h-sub">${sub} ${streakBadge}</div>
      ${target > 1 ? `<div class="h-prog-bar"><i style="width:${pct * 100}%;background:${h.color}"></i></div>` : ''}
    </div>
    <div class="h-action">${action}</div>
  </div>`;
}

// ---------- VIEW: Dnes ----------
export function viewToday(state) {
  const dailyHabits = state.habits.filter((h) => h.type !== 'weekly');
  const weeklyHabits = state.habits.filter((h) => h.type === 'weekly');
  const ordered = [...dailyHabits, ...weeklyHabits].sort((a, b) => (a.order || 0) - (b.order || 0));
  const quickEx = state.exercises.slice(0, 4);
  return `
    <div class="topbar">
      <div><div class="hello">${greeting()} 👋</div><div class="date">${prettyDate()}</div></div>
      <div class="brand-mini"><div class="bolt">${icon('zap')}</div></div>
    </div>
    ${heroCard(state)}
    ${questCard(state)}
    <div class="section-title">Dnešní návyky</div>
    ${ordered.length ? ordered.map((h) => habitRow(state, h)).join('') :
      `<div class="empty"><div class="e-ico">🌱</div>Zatím žádné návyky.<br>Přidej si první na záložce Návyky.</div>`}
    <div class="section-title">Rychlý trénink</div>
    <div class="ex-grid">
      ${quickEx.map((e) => exCard(state, e)).join('')}
    </div>
  `;
}

// ---------- VIEW: Navyky ----------
export function viewHabits(state) {
  const ordered = [...state.habits].sort((a, b) => (a.order || 0) - (b.order || 0));
  return `
    <div class="topbar"><div><div class="hello">Správa</div><div class="date">Návyky</div></div></div>
    ${ordered.length ? ordered.map((h) => {
      const info = streakInfo(state, h);
      const ns = nextMultStep(info, h);
      const meta = h.type === 'weekly'
        ? `${h.weeklyTarget}× týdně`
        : `${h.target} ${esc(h.unit || '')} denně`;
      return `<div class="card habit" data-act="habit-edit" data-id="${h.id}">
        <div class="h-ico" style="${tinted(h.color)}">${icon(h.icon)}</div>
        <div class="h-body">
          <div class="h-name">${esc(h.name)} ${info.multiplier > 1 ? `<span class="mult-badge">×${info.multiplier}</span>` : ''}</div>
          <div class="h-sub"><span>${meta}</span>${info.displayStreak > 0 ? `<span class="mini-streak">${icon('flame')} ${info.displayStreak}${info.unit}</span>` : ''}</div>
          ${ns ? `<div class="h-sub muted">Další bonus ×${ns.mult} ${ns.needText}</div>` : `<div class="h-sub muted">Maximální bonus ×3 🔥</div>`}
        </div>
        ${icon('chevron')}
      </div>`;
    }).join('') : `<div class="empty"><div class="e-ico">🌱</div>Žádné návyky. Přidej první tlačítkem +</div>`}
    <button class="fab" data-act="habit-new">${icon('plus')}</button>
  `;
}

// ---------- exercise card ----------
function exCard(state, e) {
  const total = exTodayTotal(state, e.id);
  return `<div class="card ex-card" data-act="ex-open" data-id="${e.id}">
    <button class="e-add" data-act="ex-quick" data-id="${e.id}" data-amt="${e.step}">+${e.step}</button>
    <div class="e-ico" style="${tinted(e.color)}">${icon(e.icon)}</div>
    <div class="e-name">${esc(e.name)}</div>
    <div class="e-today">${total}</div>
    <div class="e-unit">dnes · ${esc(e.unit || '')}</div>
  </div>`;
}

// ---------- VIEW: Trenink ----------
export function viewTrain(state) {
  let totalToday = 0;
  for (const l of state.logs) if (l.kind === 'exercise' && l.day === dayKey()) totalToday += l.amount;
  return `
    <div class="topbar"><div><div class="hello">Dnes nadřeno</div><div class="date">Trénink</div></div>
      <div class="pill" style="flex:none;padding:8px 14px"><div class="v">${totalToday}</div><div class="l">opak. dnes</div></div>
    </div>
    <div class="ex-grid">${state.exercises.map((e) => exCard(state, e)).join('')}</div>
    <button class="fab" data-act="ex-new">${icon('plus')}</button>
  `;
}

// ---------- VIEW: Statistiky ----------
export function viewStats(state) {
  const s = computeStats(state);
  const prRows = state.exercises.map((e) => `
    <div class="card pr-row">
      <div class="e-ico" style="${tinted(e.color)}">${icon(e.icon)}</div>
      <div class="nm">${esc(e.name)}</div>
      <div class="vals"><div class="a">${(s.exTotals[e.id] || 0).toLocaleString('cs-CZ')}</div><div class="b">PR den: ${s.exPR[e.id] || 0}</div></div>
    </div>`).join('');
  return `
    <div class="topbar"><div><div class="hello">Tvůj postup</div><div class="date">Statistiky</div></div></div>
    <div class="stat-cards">
      <div class="card"><div class="stat-num" style="background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent">${s.totalXp.toLocaleString('cs-CZ')}</div><div class="stat-lbl">Celkem XP</div></div>
      <div class="card"><div class="stat-num">${s.exTotalAll.toLocaleString('cs-CZ')}</div><div class="stat-lbl">Opakování celkem</div></div>
      <div class="card"><div class="stat-num">${s.habitCompletions}</div><div class="stat-lbl">Splněných návyků</div></div>
      <div class="card"><div class="stat-num">${s.activeDays}</div><div class="stat-lbl">Aktivních dní</div></div>
    </div>
    <div class="card chart-card"><h3>Opakování — posledních 7 dní</h3>${weeklyBars(state)}</div>
    <div class="card chart-card"><h3>Aktivita (13 týdnů)</h3>${heatmap(state)}</div>
    <div class="section-title">Osobní rekordy</div>
    ${prRows || '<div class="empty">Zatím žádná data</div>'}
  `;
}

// ---------- VIEW: Profil ----------
export function viewProfile(state) {
  const lp = levelProgress(state.game.xp);
  const rank = rankFor(lp.level);
  const s = computeStats(state);
  const badges = BADGES.map((b) => {
    const got = state.game.badges.includes(b.id);
    return `<div class="badge ${got ? '' : 'locked'}">
      <div class="b-ico">${icon(got ? b.icon : 'lock')}</div>
      <div class="b-name">${esc(b.name)}</div>
      <div class="b-desc">${esc(b.desc)}</div>
    </div>`;
  }).join('');
  const earned = state.game.badges.length;
  return `
    <div class="topbar"><div><div class="hello">Profil</div><div class="date">${esc(state.settings.name || 'Hráč')}</div></div></div>
    <div class="card hero">
      <div class="hero-top">
        <div class="ring-wrap">${ring(lp.pct, { size: 92, stroke: 9 })}<div class="ring-center"><div class="level-num">${lp.level}</div><div class="level-lbl">Level</div></div></div>
        <div class="hero-meta">
          <div class="rank">${icon(rank.icon)} ${rank.name}</div>
          <div class="xp">${state.game.xp.toLocaleString('cs-CZ')} XP celkem</div>
          <div class="xpbar"><i style="width:${Math.round(lp.pct * 100)}%"></i></div>
        </div>
      </div>
      <div class="hero-stats">
        <div class="pill"><div class="v">${earned}/${BADGES.length}</div><div class="l">odznaků</div></div>
        <div class="pill flame"><div class="v">${icon('flame')} ${s.maxStreak}</div><div class="l">nejdelší streak</div></div>
      </div>
    </div>
    <div class="section-title">Odznaky</div>
    <div class="badge-grid">${badges}</div>
    <div class="section-title">Nastavení</div>
    <div class="card settings-row">
      <div class="s-name">Tvé jméno</div>
      <button class="btn btn-ghost" data-act="set-name" style="padding:8px 14px">${esc(state.settings.name || 'Nastavit')}</button>
    </div>
    <div class="card settings-row">
      <div class="s-name">Vibrace (haptika)</div>
      <div class="switch ${state.settings.haptics ? 'on' : ''}" data-act="toggle-haptics"><i></i></div>
    </div>
    <div class="card settings-row" data-act="export"><div class="s-name">Exportovat zálohu</div>${icon('chevron')}</div>
    <div class="card settings-row" data-act="import"><div class="s-name">Obnovit ze zálohy</div>${icon('chevron')}</div>
    <div class="card settings-row" data-act="reset"><div class="s-name" style="color:var(--pink)">Smazat všechna data</div>${icon('chevron')}</div>
    <div class="empty" style="padding:24px 12px 8px;font-size:12px">Momentum · data zůstávají jen v tomto zařízení</div>
  `;
}

// ---------- SHEET: pridat/upravit navyk ----------
export function sheetHabit(habit) {
  const h = habit || { name: '', icon: 'target', color: COLORS[0], type: 'daily', target: 1, step: 1, unit: '×', weeklyTarget: 3 };
  return `<div class="sheet">
    <div class="grip"></div>
    <h2>${habit ? 'Upravit návyk' : 'Nový návyk'}</h2>
    <div class="field"><label>Název</label><input class="input" id="f-name" placeholder="Např. Pít vodu" value="${esc(h.name)}"></div>
    <div class="field"><label>Typ</label>
      <div class="seg" id="f-type">
        <button data-v="daily" class="${h.type !== 'weekly' ? 'on' : ''}">Denně</button>
        <button data-v="weekly" class="${h.type === 'weekly' ? 'on' : ''}">×/týden</button>
      </div>
    </div>
    <div class="row2">
      <div class="field" id="wrap-target"><label>Cíl (množství/den)</label><input class="input" id="f-target" type="number" min="1" value="${h.target}"></div>
      <div class="field"><label>Jednotka</label><input class="input" id="f-unit" placeholder="min, sklenic…" value="${esc(h.unit || '')}"></div>
    </div>
    <div class="row2">
      <div class="field" id="wrap-step"><label>Krok (+/−)</label><input class="input" id="f-step" type="number" min="1" value="${h.step || 1}"></div>
      <div class="field" id="wrap-weekly" style="${h.type === 'weekly' ? '' : 'display:none'}"><label>Kolikrát týdně</label><input class="input" id="f-weekly" type="number" min="1" max="7" value="${h.weeklyTarget || 3}"></div>
    </div>
    <div class="field"><label>Ikona</label><div class="chip-row" id="f-icon">
      ${HABIT_ICONS.map((ic) => `<div class="chip ${ic === h.icon ? 'on' : ''}" data-v="${ic}">${icon(ic)}</div>`).join('')}
    </div></div>
    <div class="field"><label>Barva</label><div class="color-row" id="f-color">
      ${COLORS.map((c) => `<div class="color-dot ${c === h.color ? 'on' : ''}" data-v="${c}" style="background:${c}"></div>`).join('')}
    </div></div>
    <button class="btn btn-primary" data-act="habit-save" data-id="${habit ? habit.id : ''}">${habit ? 'Uložit' : 'Přidat návyk'}</button>
    ${habit ? `<button class="btn btn-ghost btn-block" style="margin-top:10px;color:var(--pink)" data-act="habit-delete" data-id="${habit.id}">Smazat návyk</button>` : ''}
  </div>`;
}

// ---------- SHEET: pridat/upravit cvik ----------
export function sheetExercise(ex) {
  const e = ex || { name: '', icon: 'dumbbell', color: COLORS[2], step: 10, unit: 'opak.' };
  return `<div class="sheet">
    <div class="grip"></div>
    <h2>${ex ? 'Upravit cvik' : 'Nový cvik'}</h2>
    <div class="field"><label>Název</label><input class="input" id="f-name" placeholder="Např. Kliky" value="${esc(e.name)}"></div>
    <div class="row2">
      <div class="field"><label>Rychlý krok (+)</label><input class="input" id="f-step" type="number" min="1" value="${e.step}"></div>
      <div class="field"><label>Jednotka</label><input class="input" id="f-unit" value="${esc(e.unit || 'opak.')}"></div>
    </div>
    <div class="field"><label>Ikona</label><div class="chip-row" id="f-icon">
      ${EX_ICONS.map((ic) => `<div class="chip ${ic === e.icon ? 'on' : ''}" data-v="${ic}">${icon(ic)}</div>`).join('')}
    </div></div>
    <div class="field"><label>Barva</label><div class="color-row" id="f-color">
      ${COLORS.map((c) => `<div class="color-dot ${c === e.color ? 'on' : ''}" data-v="${c}" style="background:${c}"></div>`).join('')}
    </div></div>
    <button class="btn btn-primary" data-act="ex-save" data-id="${ex ? ex.id : ''}">${ex ? 'Uložit' : 'Přidat cvik'}</button>
    ${ex ? `<button class="btn btn-ghost btn-block" style="margin-top:10px;color:var(--pink)" data-act="ex-delete" data-id="${ex.id}">Smazat cvik</button>` : ''}
  </div>`;
}

// ---------- SHEET: pocitadlo cviku ----------
export function sheetExerciseDetail(state, ex) {
  const total = exTodayTotal(state, ex.id);
  const s = computeStats(state);
  const steps = [ex.step, ex.step * 2, Math.max(1, Math.round(ex.step / 2))].sort((a, b) => a - b);
  const quick = [...new Set([steps[0], ex.step, ex.step * 2])];
  return `<div class="sheet">
    <div class="grip"></div>
    <div class="ex-hero">
      <div class="e-ico" style="margin:0 auto 14px;width:54px;height:54px;border-radius:16px;${tinted(ex.color)}">${icon(ex.icon)}</div>
      <div class="big" data-ex-count="${ex.id}">${total}</div>
      <div class="lbl">${esc(ex.name)} dnes · celkem ${(s.exTotals[ex.id] || 0).toLocaleString('cs-CZ')}</div>
    </div>
    <div class="quick-grid">
      ${quick.map((n, i) => `<button class="${i === 1 ? 'accent' : ''}" data-act="ex-add" data-id="${ex.id}" data-amt="${n}">+${n}</button>`).join('')}
    </div>
    <div class="quick-grid" style="grid-template-columns:1fr 1fr;margin-top:10px">
      <button data-act="ex-add" data-id="${ex.id}" data-amt="1">+1</button>
      <button data-act="ex-undo" data-id="${ex.id}" data-amt="${ex.step}">−${ex.step}</button>
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:16px" data-act="ex-edit" data-id="${ex.id}">Upravit cvik</button>
  </div>`;
}
