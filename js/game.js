// Gamifikacni engine: streaky, multiplikatory, XP, levely, odznaky, questy.
import { dayKey } from './store.js';

// Priority systém
export const PRIORITY_XP = [0, 15, 25, 40];            // P1/P2/P3 base XP
export const PRIORITY_PENALTY = [0, 8, 15, 25];         // XP penalizace za den miss streaku
export const PRIORITY_LABELS = ['', 'Základní', 'Důležitý', 'Klíčový'];
export const PRIORITY_COLORS = ['', '#9ca3af', '#7c5cff', '#fbbf24'];
export function habitBaseXp(habit) { return PRIORITY_XP[habit.priority || 2]; }

export const HABIT_XP = 25;     // legacy fallback
export const REP_XP = 1;        // XP za jedno opakovani cviku
export const QUEST_XP = 50;     // bonus za denni quest
export const BADGE_XP = 100;    // bonus za odznak

// ---------- datum ----------
function fromKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function keyOf(d) { return dayKey(d.getTime()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setHours(0,0,0,0); x.setDate(x.getDate() - dow); return x; }

// ---------- agregace logu ----------
export function amountOn(state, kind, refId, key) {
  let s = 0;
  for (const l of state.logs) if (l.kind === kind && l.refId === refId && l.day === key) s += l.amount;
  return s;
}
export function habitDoneOn(state, habit, key) {
  return amountOn(state, 'habit', habit.id, key) >= habit.target;
}

// ---------- streaky ----------
export function dailyStreak(state, habit) {
  let streak = 0;
  let d = new Date();
  if (!habitDoneOn(state, habit, keyOf(d))) d = addDays(d, -1);
  while (habitDoneOn(state, habit, keyOf(d))) { streak++; d = addDays(d, -1); }
  return streak;
}
function weekDoneCount(state, habit, weekStart) {
  let c = 0;
  for (let i = 0; i < 7; i++) if (habitDoneOn(state, habit, keyOf(addDays(weekStart, i)))) c++;
  return c;
}
export function weeklyStreak(state, habit) {
  let streak = 0;
  let ws = startOfWeek(new Date());
  const need = habit.weeklyTarget || 1;
  if (weekDoneCount(state, habit, ws) < need) ws = addDays(ws, -7);
  while (weekDoneCount(state, habit, ws) >= need) { streak++; ws = addDays(ws, -7); }
  return streak;
}

// Pokrok v aktualnim tydnu (kolik dni splneno z weeklyTarget)
export function weekProgress(state, habit) {
  const ws = startOfWeek(new Date());
  let done = 0;
  for (let i = 0; i < 7; i++) if (habitDoneOn(state, habit, keyOf(addDays(ws, i)))) done++;
  return { done, target: habit.weeklyTarget || 1 };
}

// Vraci { weeks, multiplier, displayStreak, unit }
export function streakInfo(state, habit) {
  if (habit.type === 'weekly') {
    const weeks = weeklyStreak(state, habit);
    return { weeks, multiplier: Math.min(3, 1 + 0.25 * weeks), displayStreak: weeks, unit: 'tý' };
  }
  const days = dailyStreak(state, habit);
  const weeks = Math.floor(days / 7);
  return { weeks, multiplier: Math.min(3, 1 + 0.25 * weeks), displayStreak: days, unit: 'd' };
}

// nasledujici multiplikator a kolik chybi k jeho dosazeni (pro motivaci)
export function nextMultStep(info, habit) {
  if (info.multiplier >= 3) return null;
  const nextMult = Math.min(3, info.multiplier + 0.25);
  if (habit.type === 'weekly') {
    return { mult: nextMult, needText: `${info.weeks + 1}. týden v řadě` };
  }
  const daysToNext = (info.weeks + 1) * 7 - info.displayStreak;
  return { mult: nextMult, needText: `za ${daysToNext} ${daysToNext === 1 ? 'den' : daysToNext < 5 ? 'dny' : 'dní'}` };
}

// ---------- levely ----------
export function xpForLevel(L) { return 50 * L * (L - 1); } // L1=0, L2=100, L3=300...
export function levelFromXp(xp) {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  return L;
}
export function levelProgress(xp) {
  const L = levelFromXp(xp);
  const base = xpForLevel(L);
  const next = xpForLevel(L + 1);
  return { level: L, inLevel: xp - base, need: next - base, pct: (xp - base) / (next - base) };
}

const RANKS = [
  { min: 1, name: 'Začátečník', icon: 'sparkles' },
  { min: 5, name: 'Vytrvalec', icon: 'flame' },
  { min: 10, name: 'Bojovník', icon: 'zap' },
  { min: 20, name: 'Veterán', icon: 'medal' },
  { min: 35, name: 'Mistr', icon: 'trophy' },
  { min: 55, name: 'Legenda', icon: 'crown' },
];
export function rankFor(level) {
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x.min) r = x;
  return r;
}

// ---------- statistiky ----------
export function computeStats(state) {
  const exTotals = {};
  let exTotalAll = 0, habitCompletions = 0;
  const activeDays = new Set();
  const exMaxDay = {}; // refId -> {day -> sum}
  for (const l of state.logs) {
    activeDays.add(l.day);
    if (l.kind === 'exercise') {
      exTotals[l.refId] = (exTotals[l.refId] || 0) + l.amount;
      exTotalAll += l.amount;
      (exMaxDay[l.refId] ||= {})[l.day] = (exMaxDay[l.refId]?.[l.day] || 0) + l.amount;
    }
  }
  // habit completions + max streak
  let maxStreak = 0;
  const todayKey = dayKey();
  // perfect days: dny, kdy byly splneny vsechny denni navyky
  for (const h of state.habits) {
    const info = streakInfo(state, h);
    if (h.type === 'daily' && info.displayStreak > maxStreak) maxStreak = info.displayStreak;
  }
  // spocti habit completions napric dny
  const dayHabit = {};
  for (const l of state.logs) if (l.kind === 'habit') (dayHabit[l.refId + '|' + l.day] ||= 0, dayHabit[l.refId + '|' + l.day] += l.amount);
  for (const h of state.habits) {
    for (const key of Object.keys(dayHabit)) {
      if (key.startsWith(h.id + '|') && dayHabit[key] >= h.target) habitCompletions++;
    }
  }
  // PR (osobni rekord) na cvik = nejlepsi den
  const exPR = {};
  for (const id of Object.keys(exMaxDay)) exPR[id] = Math.max(...Object.values(exMaxDay[id]));

  return {
    totalXp: state.game.xp,
    level: levelFromXp(state.game.xp),
    exTotals, exTotalAll, exPR,
    habitCompletions,
    activeDays: activeDays.size,
    maxStreak,
    totalLogs: state.logs.length,
  };
}

// reps daneho cviku dnes
export function exTodayTotal(state, refId) { return amountOn(state, 'exercise', refId, dayKey()); }

// Miss streak: pocet po sobe jdoucich dni BEZ splneni (zpetne od vcera, ne dnes)
export function missStreakYesterday(state, habit) {
  const createdDay = dayKey(habit.createdAt || Date.now());
  let streak = 0;
  let d = addDays(new Date(), -1);
  while (keyOf(d) >= createdDay && !habitDoneOn(state, habit, keyOf(d))) {
    streak++;
    d = addDays(d, -1);
    if (streak > 365) break;
  }
  return streak;
}

// ---------- odznaky ----------
export const BADGES = [
  { id: 'first', name: 'První krok', desc: 'První záznam', icon: 'rocket', test: (s) => s.totalLogs >= 1 },
  { id: 'streak7', name: 'Týdenní oheň', desc: '7denní streak', icon: 'flame', test: (s) => s.maxStreak >= 7 },
  { id: 'streak30', name: 'Železná vůle', desc: '30denní streak', icon: 'crown', test: (s) => s.maxStreak >= 30 },
  { id: 'reps100', name: 'Stovkař', desc: '100 opakování', icon: 'medal', test: (s) => s.exTotalAll >= 100 },
  { id: 'reps1000', name: 'Tisícovka', desc: '1000 opakování', icon: 'trophy', test: (s) => s.exTotalAll >= 1000 },
  { id: 'level5', name: 'Vytrvalec', desc: 'Level 5', icon: 'star', test: (s) => s.level >= 5 },
  { id: 'level10', name: 'Bojovník', desc: 'Level 10', icon: 'zap', test: (s) => s.level >= 10 },
  { id: 'active30', name: 'Stálice', desc: '30 aktivních dní', icon: 'target', test: (s) => s.activeDays >= 30 },
  { id: 'habits50', name: 'Disciplína', desc: '50 splněných návyků', icon: 'sparkles', test: (s) => s.habitCompletions >= 50 },
];

// ---------- denni quest ----------
const QUESTS = [
  { id: 'habits3', label: 'Splň 3 návyky', target: 3, prog: (s) => completedDailyHabits(s), unit: '' },
  { id: 'reps60', label: 'Udělej 60 opakování', target: 60, prog: (s) => totalRepsToday(s), unit: '' },
  { id: 'allhabits', label: 'Splň všechny dnešní návyky', dyn: (s) => s.habits.filter((h) => h.type === 'daily').length || 1, prog: (s) => completedDailyHabits(s), unit: '' },
];
function completedDailyHabits(state) {
  const k = dayKey();
  return state.habits.filter((h) => h.type === 'daily' && habitDoneOn(state, h, k)).length;
}
function totalRepsToday(state) {
  const k = dayKey();
  let s = 0;
  for (const l of state.logs) if (l.kind === 'exercise' && l.day === k) s += l.amount;
  return s;
}
function hashDay(k) { let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

export function getQuest(state) {
  const k = dayKey();
  const q = QUESTS[hashDay(k) % QUESTS.length];
  const target = q.dyn ? q.dyn(state) : q.target;
  const progress = Math.min(target, q.prog(state));
  return { id: q.id, label: q.label, target, progress, reward: QUEST_XP, done: progress >= target };
}
