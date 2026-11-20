'use strict';

/* Persistence, dates, daily login tracking, levels, mission generation. */

const STORE_KEY = 'typeset.save.v1';

const pad2 = n => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/** Whole-day index for a YYYY-MM-DD key, so date gaps are simple subtraction. */
function dayIndex(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
function keyFromIndex(i) {
  const d = new Date(i * 86400000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function msToMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
}

function freshState() {
  return {
    version: 1,
    name: '',
    createdAt: Date.now(),
    xp: 0,
    coins: 0,
    chests: 0,
    chestsOpened: 0,
    login: { last: null, streak: 0, bestStreak: 0, days: [], claimed: {} },
    stats: { tests: 0, chars: 0, seconds: 0, bestWpm: 0, best: {}, history: [], daily: {} },
    missions: { date: null, list: [], bonusClaimed: false, sheetsCleared: 0 },
    milestones: {},
    titles: { unlocked: ['hunt'], equipped: 'hunt' },
    inks: { owned: ['vermilion'], equipped: 'vermilion' },
    settings: { mode: 'time', time: 30, words: 25, passage: 'medium', punct: false, nums: false, theme: 'auto' },
  };
}

function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function mergeInto(base, saved) {
  for (const k of Object.keys(saved)) {
    if (isPlainObject(base[k]) && isPlainObject(saved[k]) && Object.keys(base[k]).length) mergeInto(base[k], saved[k]);
    else base[k] = saved[k];
  }
  return base;
}

const Store = {
  state: null,
  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { saved = null; }
    this.state = isPlainObject(saved) ? mergeInto(freshState(), saved) : freshState();
  },
  save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); } catch (e) { /* storage full or blocked */ }
  },
  wipe() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    this.state = freshState();
  },
};

/* ---------- Daily login ---------- */

/**
 * Records today's visit. Consecutive days extend the streak, a gap resets it.
 * Returns what happened so the UI can greet the player.
 */
function registerLogin(s) {
  const today = todayKey();
  const L = s.login;
  if (L.last === today) return { isNew: false, streak: L.streak };

  const gap = L.last ? dayIndex(today) - dayIndex(L.last) : null;
  const broke = gap !== null && gap > 1 && L.streak > 1;
  const lost = L.streak;
  L.streak = gap === 1 ? L.streak + 1 : 1;
  L.last = today;
  if (!L.days.includes(today)) L.days.push(today);
  L.bestStreak = Math.max(L.bestStreak, L.streak);

  // keep the claim log from growing forever
  const cutoff = dayIndex(today) - 60;
  for (const k of Object.keys(L.claimed)) if (dayIndex(k) < cutoff) delete L.claimed[k];

  return { isNew: true, streak: L.streak, broke, lost };
}

/** Position in the 7-day gift cycle (0..6) for the current streak. */
function cycleIndex(s) { return (Math.max(1, s.login.streak) - 1) % 7; }
function giftClaimedToday(s) { return !!s.login.claimed[todayKey()]; }

/* ---------- Levels ---------- */

function xpToNext(level) { return 120 + (level - 1) * 80; }
function levelInfo(xp) {
  let level = 1, rem = xp, need = xpToNext(1);
  while (rem >= need) { rem -= need; level++; need = xpToNext(level); }
  return { level, into: rem, need };
}

/* ---------- Daily missions ---------- */

function seededRandom(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
  return function () {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds today's three missions if the sheet is from an earlier day. */
function ensureMissions(s) {
  const today = todayKey();
  if (s.missions.date === today && s.missions.list.length) return false;
  const rnd = seededRandom(today + '|' + s.createdAt);
  const base = s.stats.bestWpm > 0 ? s.stats.bestWpm : 30;
  const pool = MISSION_POOL.slice();
  const list = [];
  while (list.length < 3 && pool.length) {
    const tpl = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    list.push({ type: tpl.type, meta: {}, ...tpl.make(base, rnd), progress: 0, claimed: false });
  }
  s.missions.date = today;
  s.missions.list = list;
  s.missions.bonusClaimed = false;
  return true;
}

/** Applies a finished test to a mission. Returns true if this test completed it. */
function missionAdvance(m, r) {
  if (m.progress >= m.target) return false;
  switch (m.type) {
    case 'tests':     m.progress += 1; break;
    case 'wpm':       if (r.duration >= 15 && r.wpm >= m.meta.wpm) m.progress = 1; break;
    case 'accuracy':  if (r.acc >= m.meta.acc) m.progress += 1; break;
    case 'chars':     m.progress += r.correctChars; break;
    case 'seconds':   m.progress += Math.round(r.duration); break;
    case 'long':      if (r.mode === 'time' && r.mode2 >= 60) m.progress = 1; break;
    case 'punct':     if (r.punct) m.progress = 1; break;
    case 'clean':     m.progress = r.acc >= m.meta.acc ? m.progress + 1 : 0; break;
    case 'wordsmode': if (r.mode === 'words' && r.mode2 >= 50) m.progress = 1; break;
    case 'passage':   if (r.mode === 'passage') m.progress = 1; break;
  }
  m.progress = Math.min(m.progress, m.target);
  return m.progress >= m.target;
}
