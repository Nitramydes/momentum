// Persistence + stav aplikace. Vsechna data zustavaji v zarizeni.
const KEY = 'momentum.v1';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultState() {
  const now = Date.now();
  return {
    habits: [
      { id: uid(), name: 'Pít vodu', icon: 'droplet', color: '#22d3ee', type: 'daily', target: 8, step: 1, unit: 'sklenic', priority: 2, order: 0, createdAt: now },
      { id: uid(), name: 'Čtení', icon: 'book', color: '#a78bfa', type: 'daily', target: 30, step: 5, unit: 'min', priority: 2, order: 1, createdAt: now },
      { id: uid(), name: 'Meditace', icon: 'sparkles', color: '#34d399', type: 'weekly', target: 1, step: 1, unit: '×', weeklyTarget: 5, priority: 2, order: 2, createdAt: now },
    ],
    exercises: [
      { id: uid(), name: 'Kliky', icon: 'dumbbell', color: '#f472b6', step: 10, unit: 'opak.' },
      { id: uid(), name: 'Dřepy', icon: 'activity', color: '#fbbf24', step: 15, unit: 'opak.' },
      { id: uid(), name: 'Výpady', icon: 'footprints', color: '#60a5fa', step: 10, unit: 'opak.' },
      { id: uid(), name: 'Shyby', icon: 'zap', color: '#34d399', step: 5, unit: 'opak.' },
    ],
    logs: [], // { id, kind:'habit'|'exercise', refId, amount, ts, day }
    game: { xp: 0, badges: [], questDay: null, questId: null, questDone: false, penaltyLog: {} },
    settings: { name: '', haptics: true },
    createdAt: now,
  };
}

let state;
try {
  const raw = localStorage.getItem(KEY);
  state = raw ? JSON.parse(raw) : defaultState();
  // migrace: přidej priority a krok ke starým návykům
  for (const h of state.habits) {
    if (h.priority === undefined) h.priority = 2;
    if (h.step === undefined) h.step = 1;
  }
  // migrace: penaltyLog v game state
  if (!state.game.penaltyLog) state.game.penaltyLog = {};
} catch (e) {
  state = defaultState();
}

const subs = new Set();
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }, 120);
}
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit() { persist(); subs.forEach((fn) => fn(state)); }

export function getState() { return state; }

// ---- Habits ----
export function addHabit(h) {
  state.habits.push({ id: uid(), order: state.habits.length, createdAt: Date.now(), ...h });
  emit();
}
export function updateHabit(id, patch) {
  const h = state.habits.find((x) => x.id === id);
  if (h) Object.assign(h, patch);
  emit();
}
export function removeHabit(id) {
  state.habits = state.habits.filter((x) => x.id !== id);
  state.logs = state.logs.filter((l) => !(l.kind === 'habit' && l.refId === id));
  emit();
}

// ---- Exercises ----
export function addExercise(e) { state.exercises.push({ id: uid(), ...e }); emit(); }
export function updateExercise(id, patch) {
  const e = state.exercises.find((x) => x.id === id);
  if (e) Object.assign(e, patch);
  emit();
}
export function removeExercise(id) {
  state.exercises = state.exercises.filter((x) => x.id !== id);
  state.logs = state.logs.filter((l) => !(l.kind === 'exercise' && l.refId === id));
  emit();
}

// ---- Logs ----
export function addLog(kind, refId, amount, ts = Date.now()) {
  const entry = { id: uid(), kind, refId, amount, ts, day: dayKey(ts) };
  state.logs.push(entry);
  emit();
  return entry;
}
export function removeLog(id) {
  state.logs = state.logs.filter((l) => l.id !== id);
  emit();
}
// Snizi dnesni mnozstvi o `amount` odebranim/upravou poslednich dnesnich logu.
export function reduceToday(kind, refId, amount) {
  const today = dayKey();
  for (let i = state.logs.length - 1; i >= 0 && amount > 0; i--) {
    const l = state.logs[i];
    if (l.kind === kind && l.refId === refId && l.day === today) {
      if (l.amount <= amount) { amount -= l.amount; state.logs.splice(i, 1); }
      else { l.amount -= amount; amount = 0; }
    }
  }
  emit();
}

// ---- Game / settings ----
export function setGame(patch) { Object.assign(state.game, patch); emit(); }
export function addXp(n) { state.game.xp = Math.max(0, state.game.xp + n); emit(); }
export function awardBadge(id) {
  if (!state.game.badges.includes(id)) { state.game.badges.push(id); emit(); return true; }
  return false;
}
export function setSettings(patch) { Object.assign(state.settings, patch); emit(); }

export function reorderHabits(orderedIds) {
  orderedIds.forEach((id, idx) => {
    const h = state.habits.find((x) => x.id === id);
    if (h) h.order = idx;
  });
  emit();
}

export function exportData() { return JSON.stringify(state, null, 2); }
export function importData(json) {
  const obj = JSON.parse(json);
  if (!obj.habits || !obj.logs) throw new Error('Neplatná záloha');
  state = obj;
  emit();
}
export function resetAll() { state = defaultState(); emit(); }
