// Orchestrace: routing, udalosti, odmeny, level-upy, efekty.
import * as store from './store.js';
import { getState, dayKey } from './store.js';
import { icon, COLORS } from './icons.js';
import {
  viewToday, viewHabits, viewTrain, viewStats, viewProfile,
  sheetHabit, sheetExercise, sheetExerciseDetail,
} from './ui.js';
import {
  amountOn, streakInfo, levelFromXp, getQuest, computeStats,
  BADGES, HABIT_XP, REP_XP, BADGE_XP, exTodayTotal,
} from './game.js';

const $view = document.getElementById('view');
const $tabbar = document.getElementById('tabbar');
const $modal = document.getElementById('modal');
const $toast = document.getElementById('toast');
const $fx = document.getElementById('fx');
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let currentTab = 'today';
const VIEWS = { today: viewToday, habits: viewHabits, train: viewTrain, stats: viewStats, profile: viewProfile };

import { renderTabbar } from './ui.js';
function paint() {
  $view.innerHTML = VIEWS[currentTab](getState());
  $tabbar.innerHTML = renderTabbar(currentTab);
}

store.subscribe(() => paint());

// ---------- efekty ----------
function haptic(p) { if (getState().settings.haptics && navigator.vibrate) navigator.vibrate(p); }
function pop(el) { if (!el) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

function showToast(text, { xp, level, icon: ic } = {}) {
  const t = document.createElement('div');
  t.className = 'toast' + (level ? ' level' : '');
  t.innerHTML = `${ic ? icon(ic) : ''}<span class="${xp ? 'tx' : ''}">${text}</span>`;
  $toast.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0'; t.style.transform = 'translateY(-12px)';
    setTimeout(() => t.remove(), 300);
  }, 1900);
}

function confetti() {
  if (prefersReduced) return;
  const colors = ['#7c5cff', '#22d3ee', '#f472b6', '#fbbf24', '#34d399'];
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = 0; i < 64; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.background = colors[i % colors.length];
    el.style.left = (Math.random() * W) + 'px';
    el.style.top = '-24px';
    $fx.appendChild(el);
    const x = (Math.random() - 0.5) * 260;
    const rot = Math.random() * 720 - 360;
    const dur = 1100 + Math.random() * 1000;
    el.animate([
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${x}px, ${H + 80}px) rotate(${rot}deg)`, opacity: 1, offset: 0.85 },
      { transform: `translate(${x}px, ${H + 80}px) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: dur, easing: 'cubic-bezier(.2,.6,.4,1)' }).onfinish = () => el.remove();
  }
}

// ---------- odmeny ----------
function rewardXp(amount, { silent } = {}) {
  if (!amount) return;
  const before = getState().game.xp;
  store.addXp(amount);
  if (amount > 0 && !silent) showToast(`+${amount} XP`, { xp: true, icon: 'zap' });
  checkLevelUp(before, getState().game.xp);
}
function checkLevelUp(a, b) {
  const la = levelFromXp(a), lb = levelFromXp(b);
  if (lb > la) {
    setTimeout(() => { showToast(`Level ${lb}! Nový rank tě čeká 🚀`, { level: true, icon: 'rocket' }); confetti(); haptic([0, 60, 40, 60, 40, 80]); }, 250);
  }
}
function checkBadges() {
  const stats = computeStats(getState());
  for (const b of BADGES) {
    if (!getState().game.badges.includes(b.id) && b.test(stats)) {
      store.awardBadge(b.id);
      showToast(`Odznak odemčen: ${b.name}`, { icon: b.icon });
      confetti(); haptic([0, 50, 30, 50]);
      const before = getState().game.xp; store.addXp(BADGE_XP); checkLevelUp(before, getState().game.xp);
    }
  }
}
function checkQuest() {
  if (getState().game.questDay !== dayKey()) store.setGame({ questDay: dayKey(), questDone: false });
  const q = getQuest(getState());
  if (q.done && !getState().game.questDone) {
    store.setGame({ questDone: true });
    const before = getState().game.xp; store.addXp(q.reward);
    showToast(`Denní výzva splněna! +${q.reward} XP`, { icon: 'trophy' });
    confetti(); haptic([0, 60, 30, 60]);
    checkLevelUp(before, getState().game.xp);
  }
}

// ---------- logovani ----------
function logHabit(h, delta) {
  const today = dayKey();
  const before = amountOn(getState(), 'habit', h.id, today);
  if (delta > 0) store.addLog('habit', h.id, delta);
  else store.reduceToday('habit', h.id, -delta);
  const after = amountOn(getState(), 'habit', h.id, today);
  const target = h.target || 1;

  if (before < target && after >= target) {
    const info = streakInfo(getState(), h);
    const xp = Math.round(HABIT_XP * info.multiplier);
    rewardXp(xp);
    if (info.multiplier > 1) showToast(`Bonus ×${info.multiplier} za streak 🔥`, { icon: 'flame' });
    confetti(); haptic([0, 40, 30, 40]);
    checkBadges(); checkQuest();
  } else if (before >= target && after < target) {
    store.addXp(-HABIT_XP);
    haptic(10);
  } else {
    haptic(12);
    checkBadges(); checkQuest();
  }
}

function logExercise(id, amt) {
  store.addLog('exercise', id, amt);
  rewardXp(amt * REP_XP);
  haptic(15);
  updateExCount(id);
  checkBadges(); checkQuest();
}
function undoExercise(id, amt) {
  const have = exTodayTotal(getState(), id);
  const real = Math.min(amt, have);
  if (!real) { haptic(8); return; }
  store.reduceToday('exercise', id, real);
  store.addXp(-real * REP_XP);
  haptic(10);
  updateExCount(id);
}
function updateExCount(id) {
  const el = $modal.querySelector(`[data-ex-count="${id}"]`);
  if (el) { el.textContent = exTodayTotal(getState(), id); pop(el); }
}

// ---------- modal ----------
function openModal(html) {
  $modal.innerHTML = `<div class="backdrop" data-act="close-modal"></div>${html}`;
  $modal.hidden = false;
}
function closeModal() { $modal.hidden = true; $modal.innerHTML = ''; }

// ---------- ctení formulare ----------
const v = (id) => (document.getElementById(id)?.value || '').trim();
const selOn = (sel) => $modal.querySelector(sel + ' .on');

function readHabitForm() {
  return {
    name: v('f-name'),
    type: selOn('#f-type')?.dataset.v || 'daily',
    target: Math.max(1, +v('f-target') || 1),
    unit: v('f-unit'),
    step: Math.max(1, +v('f-step') || 1),
    weeklyTarget: Math.min(7, Math.max(1, +v('f-weekly') || 3)),
    icon: $modal.querySelector('#f-icon .on')?.dataset.v || 'target',
    color: $modal.querySelector('#f-color .on')?.dataset.v || COLORS[0],
  };
}
function readExForm() {
  return {
    name: v('f-name'),
    step: Math.max(1, +v('f-step') || 10),
    unit: v('f-unit') || 'opak.',
    icon: $modal.querySelector('#f-icon .on')?.dataset.v || 'dumbbell',
    color: $modal.querySelector('#f-color .on')?.dataset.v || COLORS[2],
  };
}

// ---------- export / import ----------
function doExport() {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `momentum-zaloha-${dayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('Záloha stažena', { icon: 'check' });
}
function doImport() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { store.importData(r.result); showToast('Záloha obnovena', { icon: 'check' }); }
      catch (e) { showToast('Neplatný soubor', { icon: 'trash' }); }
    };
    r.readAsText(f);
  };
  inp.click();
}

// ---------- event delegace ----------
document.addEventListener('click', (e) => {
  // vyber v segmentech/ikonach/barvach (uvnitr modalu)
  const seg = e.target.closest('.seg button');
  if (seg) {
    seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    seg.classList.add('on');
    if (seg.parentElement.id === 'f-type') {
      const weekly = seg.dataset.v === 'weekly';
      const w = document.getElementById('wrap-weekly');
      const lbl = document.querySelector('#wrap-target label');
      if (w) w.style.display = weekly ? '' : 'none';
      if (lbl) lbl.textContent = weekly ? 'Cíl za 1 splnění' : 'Cíl (množství/den)';
    }
    return;
  }
  const chip = e.target.closest('.chip');
  if (chip && chip.parentElement.id === 'f-icon') {
    chip.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
    chip.classList.add('on'); return;
  }
  const dot = e.target.closest('.color-dot');
  if (dot && dot.parentElement.id === 'f-color') {
    dot.parentElement.querySelectorAll('.color-dot').forEach((c) => c.classList.remove('on'));
    dot.classList.add('on'); return;
  }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const st = getState();

  switch (act) {
    case 'tab':
      currentTab = el.dataset.tab; paint(); window.scrollTo(0, 0); haptic(8); break;

    case 'close-modal': closeModal(); break;

    // navyky
    case 'habit-check': {
      const h = st.habits.find((x) => x.id === id); if (!h) break;
      const target = h.target || 1;
      const done = amountOn(st, 'habit', h.id, dayKey()) >= target;
      logHabit(h, done ? -target : target);
      break;
    }
    case 'habit-add': { const h = st.habits.find((x) => x.id === id); if (h) logHabit(h, h.step || 1); break; }
    case 'habit-sub': { const h = st.habits.find((x) => x.id === id); if (h) logHabit(h, -(h.step || 1)); break; }
    case 'habit-new': openModal(sheetHabit(null)); break;
    case 'habit-edit': { const h = st.habits.find((x) => x.id === id); if (h) openModal(sheetHabit(h)); break; }
    case 'habit-save': {
      const data = readHabitForm();
      if (!data.name) { showToast('Zadej název', { icon: 'pen' }); break; }
      if (id) store.updateHabit(id, data); else store.addHabit(data);
      closeModal(); haptic(20); break;
    }
    case 'habit-delete': {
      if (confirm('Smazat tento návyk i jeho historii?')) { store.removeHabit(id); closeModal(); }
      break;
    }

    // cviky
    case 'ex-open': { const ex = st.exercises.find((x) => x.id === id); if (ex) openModal(sheetExerciseDetail(st, ex)); break; }
    case 'ex-quick': logExercise(id, +el.dataset.amt); pop(el); break;
    case 'ex-add': logExercise(id, +el.dataset.amt); pop(el); break;
    case 'ex-undo': undoExercise(id, +el.dataset.amt); break;
    case 'ex-new': openModal(sheetExercise(null)); break;
    case 'ex-edit': { const ex = st.exercises.find((x) => x.id === id); if (ex) openModal(sheetExercise(ex)); break; }
    case 'ex-save': {
      const data = readExForm();
      if (!data.name) { showToast('Zadej název', { icon: 'pen' }); break; }
      if (id) store.updateExercise(id, data); else store.addExercise(data);
      closeModal(); haptic(20); break;
    }
    case 'ex-delete': {
      if (confirm('Smazat tento cvik i jeho historii?')) { store.removeExercise(id); closeModal(); }
      break;
    }

    // profil / nastaveni
    case 'set-name': {
      const name = prompt('Jak ti máme říkat?', st.settings.name || '');
      if (name !== null) store.setSettings({ name: name.trim() });
      break;
    }
    case 'toggle-haptics': store.setSettings({ haptics: !st.settings.haptics }); haptic(20); break;
    case 'export': doExport(); break;
    case 'import': doImport(); break;
    case 'reset': if (confirm('Opravdu smazat VŠECHNA data? Tohle nelze vrátit.')) { store.resetAll(); showToast('Vše smazáno', { icon: 'trash' }); } break;
  }
});

// ---------- start ----------
function init() {
  // reset denni vyzvy pri novem dni
  if (getState().game.questDay !== dayKey()) store.setGame({ questDay: dayKey(), questDone: false });
  paint();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
