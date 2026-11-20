'use strict';

/* Page wiring: routing, rewards, missions, gifts, titles, profile. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const S = () => Store.state;

const THEME_ICONS = {
  auto:  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  dark:  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

const PARCEL_SVG = `
<svg viewBox="0 0 120 110" aria-hidden="true">
  <rect x="20" y="44" width="80" height="58" rx="2" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="2"/>
  <rect x="54" y="44" width="12" height="58" fill="var(--accent)"/>
  <g class="parcel-lid">
    <rect x="14" y="26" width="92" height="18" rx="2" fill="var(--paper-2)" stroke="var(--ink)" stroke-width="2"/>
    <rect x="54" y="26" width="12" height="18" fill="var(--accent)"/>
    <path d="M60 26c-9-15-27-13-17-2M60 26c9-15 27-13 17-2" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/>
  </g>
</svg>`;

let engine = null;
let view = 'test';
let resultsOpen = false;

/* ======================================================================
   Rewards & progression
   ====================================================================== */

function rewardText(rw) {
  const parts = [];
  if (rw.xp) parts.push(`${fmt(rw.xp)} XP`);
  if (rw.coins) parts.push(`${fmt(rw.coins)} coins`);
  if (rw.chests) parts.push(rw.chests === 1 ? '1 gift box' : `${rw.chests} gift boxes`);
  return parts.join(' · ');
}

function grant(rw) {
  const s = S();
  const before = levelInfo(s.xp).level;
  s.xp += rw.xp || 0;
  s.coins += rw.coins || 0;
  s.chests += rw.chests || 0;
  const after = levelInfo(s.xp).level;
  for (let l = before + 1; l <= after; l++) {
    const box = l % 5 === 0;
    s.coins += 25;
    if (box) s.chests += 1;
    toast('Level up', `You reached level ${l}. +25 coins${box ? ' and a gift box' : ''}.`);
  }
}

function titleById(id) { return TITLES.find(t => t.id === id) || TITLES[0]; }

/** Unlocks any titles the player now qualifies for. */
function checkTitles(r, silent) {
  const s = S();
  const fresh = [];
  for (const t of TITLES) {
    if (s.titles.unlocked.includes(t.id)) continue;
    const ok = t.group === 'speed' ? s.stats.bestWpm >= t.wpm : t.test(s, r);
    if (ok) { s.titles.unlocked.push(t.id); fresh.push(t); }
  }
  // If they're wearing a speed title, move them up to the best one automatically.
  const worn = titleById(s.titles.equipped);
  if (worn.group === 'speed') {
    const top = TITLES.filter(t => t.group === 'speed' && s.titles.unlocked.includes(t.id)).pop();
    if (top && top.wpm > worn.wpm) s.titles.equipped = top.id;
  }
  if (!silent) fresh.forEach(t => toast('Title unlocked', `<em>${esc(t.name)}</em> — wear it from your profile.`));
  return fresh;
}

function readyMilestones() {
  const s = S();
  return MILESTONES.filter(m => !s.milestones[m.id] && m.value(s) >= m.target);
}

function processResult(r) {
  const s = S();
  const notes = [];
  const readyBefore = new Set(readyMilestones().map(m => m.id));

  s.stats.tests += 1;
  s.stats.chars += r.correctChars;
  s.stats.seconds += r.duration;

  const key = `${r.mode}-${r.mode2}`;
  const prev = s.stats.best[key];
  const pb = !prev || r.wpm > prev.wpm;
  if (pb) s.stats.best[key] = { wpm: r.wpm, acc: r.acc, at: r.at };
  if (r.duration >= 15 && r.wpm > s.stats.bestWpm) s.stats.bestWpm = r.wpm;

  const day = todayKey();
  s.stats.daily[day] = (s.stats.daily[day] || 0) + 1;
  const { samples, ...slim } = r;
  s.stats.history.unshift(slim);
  s.stats.history = s.stats.history.slice(0, 40);

  // Rewards scale with speed, accuracy and length. Key-mashing earns little.
  const quality = r.acc >= 75 ? 1 : 0.35;
  let xp = Math.round((8 + r.wpm * (r.acc / 100) * (r.duration / 60) * 1.6) * quality);
  const coins = Math.round((2 + r.duration / 15 + r.wpm / 25) * quality);
  if (pb && prev) { xp += 30; notes.push({ hot: true, text: 'Personal best +30 XP' }); }
  grant({ xp, coins });

  for (const m of s.missions.list) {
    if (missionAdvance(m, r)) {
      notes.push({ hot: true, text: `Mission done: ${m.name}` });
      toast('Mission complete', `${esc(m.name)} — claim ${rewardText(m.reward)} on the Missions page.`);
    }
  }
  for (const t of checkTitles(r)) notes.push({ hot: true, text: `New title: ${t.name}` });
  for (const m of readyMilestones()) {
    if (!readyBefore.has(m.id)) {
      notes.push({ hot: false, text: `Milestone ready: ${m.name}` });
      toast('Milestone reached', `${esc(m.name)} — claim it on the Missions page.`);
    }
  }

  Store.save();
  return { xp, coins, pb: pb && !!prev, firstOfKind: !prev, notes };
}

/* ======================================================================
   Toasts & modal
   ====================================================================== */

function toast(kicker, html) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast__k">${esc(kicker)}</span>${html}`;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, 4200);
}

function openModal(html) {
  $('#modalCard').innerHTML = html;
  $('#modal').hidden = false;
  const first = $('#modalCard button');
  if (first) first.focus();
}
function closeModal() {
  $('#modal').hidden = true;
  $('#modalCard').innerHTML = '';
  renderAll();
}

/* ======================================================================
   Theme & ink
   ====================================================================== */

function applyTheme() {
  const t = S().settings.theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const btn = $('#themeBtn');
  btn.innerHTML = THEME_ICONS[t];
  btn.title = `Theme: ${t}`;
}

function applyInk() {
  const ink = INKS.find(i => i.id === S().inks.equipped) || INKS[0];
  const root = document.documentElement.style;
  root.setProperty('--accent-l', ink.light);
  root.setProperty('--accent-d', ink.dark);
}

/* ======================================================================
   Header
   ====================================================================== */

function renderHeader() {
  const s = S();
  const L = levelInfo(s.xp);
  $('#hdrStreak').textContent = s.login.streak;
  $('#hdrCoins').textContent = fmt(s.coins);
  $('#hdrLevel').textContent = L.level;
  $('#hdrXpBar').style.width = `${(L.into / L.need) * 100}%`;
  $('#hdrLvl').title = `${fmt(L.into)} / ${fmt(L.need)} XP to level ${L.level + 1}`;

  const claimable = s.missions.list.some(m => m.progress >= m.target && !m.claimed)
    || (s.missions.list.every(m => m.claimed) && !s.missions.bonusClaimed)
    || readyMilestones().length > 0;
  $('#pipMissions').hidden = !claimable;
  $('#pipGifts').hidden = giftClaimedToday(s) && s.chests === 0;

  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === view));
}

/* ======================================================================
   Test page
   ====================================================================== */

function renderTestbar() {
  const set = S().settings;
  $$('#testbar [data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === set.mode));
  $$('#testbar [data-toggle]').forEach(b => b.classList.toggle('on', !!set[b.dataset.toggle]));
  const opts = set.mode === 'time' ? [15, 30, 60, 120]
    : set.mode === 'passage' ? ['short', 'medium', 'long'] : [10, 25, 50, 100];
  const curr = set[lengthKey(set.mode)];
  const isPassage = set.mode === 'passage';
  $('#extrasSeg').hidden = isPassage;   // passages come with their own punctuation
  $('#extrasSep').hidden = isPassage;
  $('#lengthSeg').innerHTML = opts.map(n =>
    `<button type="button" data-len="${n}" class="${n === curr ? 'on' : ''}">${n}</button>`).join('');

  const s = S();
  const who = s.name ? esc(s.name) : 'Guest';
  $('#testWho').innerHTML = `${who}, <em>${esc(titleById(s.titles.equipped).name)}</em>`;
}

function lengthKey(mode) { return mode === 'time' ? 'time' : mode === 'passage' ? 'passage' : 'words'; }

function engineConfig() {
  const set = S().settings;
  return { mode: set.mode, time: set.time, words: set.words, passage: set.passage, punct: set.punct, nums: set.nums };
}

function focusTyping() {
  if (view === 'test' && !resultsOpen) $('#hiddenInput').focus({ preventScroll: true });
}

function newTest(repeat) {
  resultsOpen = false;
  $('#results').hidden = true;
  $('#typing').hidden = false;
  engine.reset(repeat);
  focusTyping();
}

function onTick(live) {
  $('#typing').classList.toggle('running', live.started);
  $('#liveMain').textContent = live.counter;
  $('#liveWpm').textContent = live.wpm;
  $('#liveAcc').textContent = live.acc;

  const passage = engine.cfg.mode === 'passage' && engine.passage;
  $('#liveTitle').hidden = !passage;
  $('#passageBar').hidden = !passage;
  if (passage) {
    $('#liveTitle').innerHTML = `<em>${esc(passage.title)}</em>word ${Math.min(live.done + 1, live.total)} of ${live.total}`;
    $('#passageBar span').style.width = `${(live.done / live.total) * 100}%`;
  }
}

function onFinish(r) {
  r.at = Date.now();
  r.hour = new Date().getHours();
  const outcome = processResult(r);
  showResults(r, outcome);
  renderHeader();
  renderSheet();
}

function chartSVG(samples) {
  if (!samples.length) return '';
  const W = 600, H = 190, L = 34, R = 8, T = 10, B = 24;
  const peak = Math.max(10, ...samples.map(p => Math.max(p.wpm, p.raw)));
  const top = Math.ceil(peak / 20) * 20;
  const n = samples.length;
  const x = i => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = v => T + (H - T - B) * (1 - v / top);
  const path = k => samples.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ');

  let grid = '';
  for (let k = 0; k <= 4; k++) {
    const v = (top * k) / 4, yy = y(v).toFixed(1);
    grid += `<line class="g" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="t" x="${L - 8}" y="${+yy + 3.5}" text-anchor="end">${Math.round(v)}</text>`;
  }
  const step = Math.max(1, Math.ceil(n / 10));
  let ticks = '';
  for (let i = 0; i < n; i += step) ticks += `<text class="t" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${Math.round(samples[i].t)}</text>`;
  const area = `${path('wpm')} L${x(n - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`;
  const errs = samples.map((p, i) => p.err
    ? `<g class="err" transform="translate(${x(i).toFixed(1)} ${y(p.raw).toFixed(1)})"><path d="M-3 -3L3 3M3 -3L-3 3"/></g>` : '').join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Words per minute over the test">
    ${grid}${ticks}<path class="area" d="${area}"/><path class="raw" d="${path('raw')}"/><path class="wpm" d="${path('wpm')}"/>${errs}</svg>`;
}

function modeLabel(r) {
  if (r.mode === 'passage') return `${r.mode2} passage`;
  return (r.mode === 'time' ? `${r.mode2}s` : `${r.mode2} words`)
    + (r.punct ? ' · punct' : '') + (r.nums ? ' · nums' : '');
}

function showResults(r, o) {
  resultsOpen = true;
  $('#typing').hidden = true;
  const c = r.chars;
  const stamp = o.pb ? '<span class="stamp">Personal best</span>'
    : o.firstOfKind ? '<span class="stamp stamp--muted">First run</span>' : '';
  const chips = [
    `<span class="chip hot">+${fmt(o.xp)} XP</span>`,
    `<span class="chip">+${fmt(o.coins)} coins</span>`,
    ...o.notes.map(n => `<span class="chip ${n.hot ? 'hot' : ''}">${esc(n.text)}</span>`),
  ].join('');

  const el = $('#results');
  el.innerHTML = `
    <div class="results__head">
      <div class="big"><span class="kicker">wpm</span><strong class="num accent">${r.wpm}</strong>${stamp}</div>
      <div class="big"><span class="kicker">accuracy</span><strong class="num">${r.acc}<small>%</small></strong></div>
      <div class="results__chart">
        ${chartSVG(r.samples)}
        <div class="chart-legend"><span><i></i>wpm</span><span><i class="raw"></i>raw</span><span><b>×</b>errors</span></div>
      </div>
    </div>
    <dl class="results__grid">
      ${r.passageTitle
        ? `<div><dt>${esc(modeLabel(r))}</dt><dd class="dd-title" title="${esc(r.passageTitle)}">${esc(r.passageTitle)}</dd></div>`
        : `<div><dt>test</dt><dd>${esc(modeLabel(r))}</dd></div>`}
      <div><dt>raw</dt><dd>${r.raw}</dd></div>
      <div><dt title="correct / incorrect / extra / missed">characters</dt><dd title="correct / incorrect / extra / missed">${c.correct}/${c.incorrect}/${c.extra}/${c.missed}</dd></div>
      <div><dt>consistency</dt><dd>${r.consistency}%</dd></div>
      <div><dt>time</dt><dd>${Math.round(r.duration * 10) / 10}s</dd></div>
    </dl>
    <div class="results__foot">
      <div class="earned">${chips}</div>
      <div class="results__actions">
        <button class="btn btn--primary" type="button" data-act="next">Next test <kbd>tab</kbd></button>
        <button class="btn" type="button" data-act="repeat">Repeat <kbd>esc</kbd></button>
      </div>
    </div>`;
  el.hidden = false;
  $('[data-act="next"]', el).focus({ preventScroll: true });
}

function fmtProgress(m) {
  if (m.type === 'seconds') {
    const t = v => `${Math.floor(v / 60)}:${pad2(Math.floor(v % 60))}`;
    return `${t(m.progress)} / ${t(m.target)}`;
  }
  return `${fmt(m.progress)} / ${fmt(m.target)}`;
}

function renderSheet() {
  const s = S();
  const rows = s.missions.list.map(m => {
    const done = m.progress >= m.target;
    return `<div class="mini ${done ? 'is-done' : ''}">
      <strong>${esc(m.name)}</strong>
      <p>${esc(m.desc)}</p>
      <div class="bar"><span style="width:${(m.progress / m.target) * 100}%"></span></div>
      <div class="mini__meta"><span>${fmtProgress(m)}</span><span>${m.claimed ? 'claimed' : done ? 'ready to claim' : rewardText(m.reward)}</span></div>
    </div>`;
  }).join('');
  $('#sheet').innerHTML = `
    <div class="sheet__head"><span class="kicker">Today's sheet</span><a href="#missions">All missions &rarr;</a></div>
    <div class="sheet__grid">${rows}</div>`;
}

/* ======================================================================
   Missions page
   ====================================================================== */

function renderMissions() {
  const s = S();
  const list = s.missions.list;
  const allClaimed = list.length && list.every(m => m.claimed);

  const rows = list.map((m, i) => {
    const done = m.progress >= m.target;
    const act = m.claimed ? '<span class="stamp stamp--muted">Claimed</span>'
      : done ? `<button class="btn btn--accent" type="button" data-claim-mission="${i}">Claim</button>`
      : '<span class="mono muted">in progress</span>';
    return `<div class="ledger__row ${done ? 'is-done' : ''}">
      <span class="ledger__idx">${'abc'[i]}.</span>
      <div class="ledger__main"><strong>${esc(m.name)}</strong><span>${esc(m.desc)}</span></div>
      <div class="ledger__prog"><div class="bar"><span style="width:${(m.progress / m.target) * 100}%"></span></div><span class="mono">${fmtProgress(m)}</span></div>
      <span class="ledger__reward mono">${rewardText(m.reward)}</span>
      <div class="ledger__act">${act}</div>
    </div>`;
  }).join('');

  const bonusBtn = s.missions.bonusClaimed ? '<span class="stamp">Collected</span>'
    : `<button class="btn btn--primary" type="button" data-claim-bonus ${allClaimed ? '' : 'disabled'}>Collect bonus</button>`;

  const cards = MILESTONES.map(m => {
    const v = Math.min(m.value(s), m.target);
    const claimed = !!s.milestones[m.id];
    const ready = !claimed && v >= m.target;
    const foot = claimed ? '<span class="stamp stamp--muted">Claimed</span>'
      : ready ? `<button class="btn btn--accent" type="button" data-claim-milestone="${m.id}">Claim</button>`
      : `<span class="mono">${fmt(v)} / ${fmt(m.target)}</span>`;
    return `<article class="card ${ready ? 'is-ready' : ''} ${claimed ? 'is-claimed' : ''}">
      <h3>${esc(m.name)}</h3>
      <p>${esc(m.desc)}</p>
      <div class="bar"><span style="width:${(v / m.target) * 100}%"></span></div>
      <div class="card__foot"><span class="mono">${rewardText(m.reward)}</span>${foot}</div>
    </article>`;
  }).join('');

  const doneCount = MILESTONES.filter(m => s.milestones[m.id]).length;

  $('#view-missions').innerHTML = `
    <div class="page-head">
      <div><span class="kicker">02 — Missions</span><h1>Today's <em>sheet</em></h1></div>
      <div class="page-head__aside"><span class="kicker">New sheet in</span><strong id="resetClock">--:--:--</strong></div>
    </div>
    <p class="lede">Three missions are set each day at midnight, tuned to your best speed. Progress counts from any test you finish today.</p>
    <div class="ledger">${rows}</div>
    <div class="bonus">
      <div><strong>Full sheet bonus</strong><p>Claim all three missions to collect ${rewardText(SHEET_BONUS)}. Sheets cleared so far: ${s.missions.sheetsCleared}.</p></div>
      ${bonusBtn}
    </div>
    <div class="section-head"><div><span class="kicker">Milestones</span><h2>The long game</h2></div><p>${doneCount} of ${MILESTONES.length} claimed</p></div>
    <div class="cards">${cards}</div>`;
  tickClock();
}

function tickClock() {
  const el = $('#resetClock');
  if (!el) return;
  const ms = msToMidnight();
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  el.textContent = `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

/* ======================================================================
   Gifts page
   ====================================================================== */

function renderGifts() {
  const s = S();
  const today = todayKey();
  const tIdx = dayIndex(today);
  const cyc = cycleIndex(s);
  const claimed = giftClaimedToday(s);

  const tickets = LOGIN_REWARDS.map((rw, i) => {
    let cls, stamp = '';
    if (i < cyc) {
      const k = keyFromIndex(tIdx - (cyc - i));
      const got = !!s.login.claimed[k];
      cls = got ? 'past' : 'past missed';
      stamp = `<span class="stamp">${got ? 'Collected' : 'Missed'}</span>`;
    } else if (i === cyc) {
      cls = claimed ? 'today past' : 'today';
      if (claimed) stamp = '<span class="stamp">Collected</span>';
    } else cls = 'future';
    return `<div class="ticket ${cls} ${rw.chests ? 'big' : ''}">
      <span class="ticket__day">${i === cyc ? 'Today' : 'Day'}<b>${i + 1}</b></span>
      <span class="ticket__rw">${rewardText(rw).replace(/ · /g, '<br>')}</span>
      ${stamp}
    </div>`;
  }).join('');

  const ms = msToMidnight();
  const left = `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m`;
  const claimBtn = claimed
    ? `<button class="btn" type="button" disabled>Collected today</button><span class="mono">Next gift in ${left}. Log in tomorrow to keep the streak.</span>`
    : `<button class="btn btn--accent" type="button" data-claim-gift>Collect day ${cyc + 1} gift</button><span class="mono">${rewardText(LOGIN_REWARDS[cyc])}</span>`;

  const inks = INKS.map(ink => {
    const owned = s.inks.owned.includes(ink.id);
    const on = s.inks.equipped === ink.id;
    return `<button type="button" class="ink ${owned ? '' : 'locked'} ${on ? 'on' : ''}" style="--c:${ink.light}"
              ${owned ? `data-equip-ink="${ink.id}"` : 'disabled'} title="${owned ? (on ? 'In use' : 'Use this ink') : 'Found in gift boxes'}">
      <span class="ink__dot"></span><span>${esc(ink.name)}<small>${on ? 'in use' : owned ? 'owned' : 'locked'}</small></span>
    </button>`;
  }).join('');

  $('#view-gifts').innerHTML = `
    <div class="page-head">
      <div><span class="kicker">03 — Gifts</span><h1>Daily <em>gifts</em></h1></div>
      <div class="page-head__aside"><span class="kicker">Coins</span><strong>${fmt(s.coins)}</strong></div>
    </div>
    <div class="login-hero">
      <div>
        <div class="streak-num">${s.login.streak}</div>
        <div class="streak-label">day${s.login.streak === 1 ? '' : 's'} in a row</div>
        <ul class="streak-facts">
          <li><span>Best streak</span><span>${s.login.bestStreak} day${s.login.bestStreak === 1 ? '' : 's'}</span></li>
          <li><span>Days logged in</span><span>${s.login.days.length}</span></li>
          <li><span>First visit</span><span>${s.login.days[0] || today}</span></li>
        </ul>
      </div>
      <div>
        <div class="tickets">${tickets}</div>
        <div class="claim-row">${claimBtn}</div>
      </div>
    </div>

    <div class="section-head"><div><span class="kicker">Gift boxes & inks</span><h2>The parcel shelf</h2></div><p>Boxes come from day-7 gifts, milestones, full sheets and every fifth level.</p></div>
    <div class="gift-grid">
      <div class="panel">
        <h3>Gift boxes</h3>
        <p>Each box holds coins, XP, or a new ink for your caret and highlights.</p>
        <div class="boxes">
          <div class="boxes__count">${s.chests}<small>unopened</small></div>
          <div class="boxes__actions">
            <button class="btn btn--accent" type="button" data-open-box ${s.chests ? '' : 'disabled'}>Open a box</button>
            <button class="btn" type="button" data-buy-box ${s.coins >= BOX_PRICE ? '' : 'disabled'}>Buy one · ${BOX_PRICE} coins</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>Inks</h3>
        <p>${s.inks.owned.length} of ${INKS.length} collected. Pick one to recolour the whole page.</p>
        <div class="inks">${inks}</div>
      </div>
    </div>

    <div class="section-head"><div><span class="kicker">Login log</span><h2>Days at the desk</h2></div><p>Last 20 weeks. Darker squares mean more tests that day.</p></div>
    ${heatmap()}`;
}

function heatmap() {
  const s = S();
  const t = dayIndex(todayKey());
  const dow = new Date().getDay();
  const weeks = 20;
  const start = t - ((weeks - 1) * 7 + dow);
  const logged = new Set(s.login.days);
  let cells = '';
  for (let i = start; i < start + weeks * 7; i++) {
    if (i > t) { cells += '<i class="void"></i>'; continue; }
    const k = keyFromIndex(i);
    const tests = s.stats.daily[k] || 0;
    let lvl = 0;
    if (logged.has(k)) lvl = tests === 0 ? 1 : tests < 3 ? 2 : tests < 6 ? 3 : 4;
    const tip = `${k}: ${logged.has(k) ? `logged in, ${tests} test${tests === 1 ? '' : 's'}` : 'no visit'}`;
    cells += `<i class="l${lvl} ${i === t ? 'now' : ''}" title="${tip}"></i>`;
  }
  return `<div class="heat-wrap"><div class="heat">${cells}</div></div>
    <div class="heat-legend"><span>less</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>more</span></div>`;
}

function claimDailyGift() {
  const s = S();
  if (giftClaimedToday(s)) return;
  const rw = LOGIN_REWARDS[cycleIndex(s)];
  s.login.claimed[todayKey()] = true;
  grant(rw);
  Store.save();
  toast('Daily gift', `Day ${cycleIndex(s) + 1} collected: ${rewardText(rw)}.`);
  renderAll();
}

function rollBox() {
  const s = S();
  const unowned = INKS.filter(i => !s.inks.owned.includes(i.id));
  const r = Math.random();
  if (r < 0.32 && unowned.length) return { ink: unowned[Math.floor(Math.random() * unowned.length)] };
  if (r < 0.68) return { coins: 40 + Math.floor(Math.random() * 11) * 10 };
  return { xp: 80 + Math.floor(Math.random() * 15) * 10 };
}

function openBox() {
  const s = S();
  if (!s.chests) return;
  const no = String(s.chestsOpened + 1).padStart(4, '0');
  openModal(`
    <span class="kicker">Gift box · No. ${no}</span>
    <div class="parcel" id="parcel" title="Untie">${PARCEL_SVG}</div>
    <h3 id="boxTitle">Untie the string</h3>
    <p id="boxText">Something is rattling inside.</p>
    <div class="modal__actions" id="boxActions">
      <button class="btn btn--accent" type="button" data-untie>Open it</button>
      <button class="btn btn--ghost" type="button" data-close>Later</button>
    </div>`);
}

function untie() {
  const s = S();
  if (!s.chests || $('#parcel').classList.contains('open')) return;
  s.chests -= 1;
  s.chestsOpened += 1;
  const prize = rollBox();
  let title, text, extra = '';
  if (prize.ink) {
    s.inks.owned.push(prize.ink.id);
    title = `${prize.ink.name} ink`;
    text = 'A new colour for your caret, highlights and headings.';
    extra = `<button class="btn btn--accent" type="button" data-equip-ink="${prize.ink.id}" data-close>Use it now</button>`;
    checkTitles(null);
  } else if (prize.coins) {
    grant({ coins: prize.coins });
    title = `<span class="reveal">${prize.coins}</span> coins`;
    text = 'Into the tin they go.';
  } else {
    grant({ xp: prize.xp });
    title = `<span class="reveal">${prize.xp}</span> XP`;
    text = 'Straight towards your next level.';
  }
  Store.save();

  $('#parcel').classList.add('open');
  setTimeout(() => {
    $('#boxTitle').innerHTML = prize.ink
      ? `<span class="reveal-swatch" style="--c:${prize.ink.light}"></span><br>${esc(title)}` : title;
    $('#boxText').textContent = text;
    $('#boxActions').innerHTML = `${extra}
      ${s.chests ? '<button class="btn" type="button" data-open-box>Open another</button>' : ''}
      <button class="btn btn--ghost" type="button" data-close>Done</button>`;
    renderHeader();
  }, 380);
}

/* ======================================================================
   Profile page
   ====================================================================== */

function fmtDuration(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor(sec / 60) % 60}m`;
}

function renderProfile() {
  const s = S();
  const L = levelInfo(s.xp);
  const recent = s.stats.history.slice(0, 10);
  const avg = recent.length ? Math.round(recent.reduce((a, r) => a + r.wpm, 0) / recent.length) : 0;

  const facts = [
    ['tests', fmt(s.stats.tests)],
    ['best wpm', s.stats.bestWpm || '—'],
    ['avg of last 10', avg || '—'],
    ['time typing', fmtDuration(s.stats.seconds)],
    ['characters', fmt(s.stats.chars)],
    ['days logged', s.login.days.length],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  const pbKeys = [['time', 15], ['time', 30], ['time', 60], ['time', 120], ['words', 10], ['words', 25], ['words', 50], ['words', 100],
                  ['passage', 'short'], ['passage', 'medium'], ['passage', 'long']];
  const pbs = pbKeys.map(([m, n]) => {
    const b = s.stats.best[`${m}-${n}`];
    return `<div><span>${m === 'time' ? `${n} seconds` : m === 'passage' ? `${n} passage` : `${n} words`}</span><strong>${b ? b.wpm : '—'}</strong><small>${b ? `${b.acc}% acc` : 'no run yet'}</small></div>`;
  }).join('');

  const rung = t => {
    const have = s.titles.unlocked.includes(t.id);
    const on = s.titles.equipped === t.id;
    const act = on ? '<span class="stamp">Wearing</span>'
      : have ? `<button class="btn btn--ghost" type="button" data-equip-title="${t.id}">Wear</button>`
      : '<span class="mono muted">locked</span>';
    const req = t.group === 'speed' ? `${t.wpm}+ wpm` : have ? 'earned' : '—';
    return `<div class="rung ${have ? '' : 'locked'} ${on ? 'on' : ''}">
      <span class="rung__req">${req}</span>
      <span class="rung__name">${esc(t.name)}<small>${esc(t.desc)}</small></span>
      <span>${act}</span>
    </div>`;
  };
  const speed = TITLES.filter(t => t.group === 'speed').map(rung).join('');
  const feats = TITLES.filter(t => t.group === 'feat').map(rung).join('');
  const got = s.titles.unlocked.length;

  const hist = s.stats.history.slice(0, 15).map(r => {
    const d = new Date(r.at);
    const when = `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return `<tr><td>${when}</td><td>${r.wpm}</td><td>${r.acc}%</td><td>${esc(modeLabel(r))}</td><td>${r.raw} raw · ${r.consistency}% cons.</td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty">No tests yet. Your results will be listed here.</td></tr>';

  $('#view-profile').innerHTML = `
    <div class="id-card">
      <div>
        <span class="kicker">04 — Profile</span>
        <input class="name-input" id="nameInput" maxlength="24" placeholder="Your name" value="${esc(s.name)}" aria-label="Your name">
        <div class="id-card__title">${esc(titleById(s.titles.equipped).name)}</div>
      </div>
      <div class="id-level">
        <strong>Level ${L.level}</strong>
        <div class="bar"><span style="width:${(L.into / L.need) * 100}%"></span></div>
        ${fmt(L.into)} / ${fmt(L.need)} XP to level ${L.level + 1} · ${fmt(s.xp)} XP total
      </div>
    </div>
    <dl class="facts">${facts}</dl>

    <div class="section-head"><div><span class="kicker">Personal bests</span><h2>Best marks</h2></div><p>Net WPM, counting only correctly typed words.</p></div>
    <div class="pbs">${pbs}</div>

    <div class="section-head"><div><span class="kicker">Titles · ${got} of ${TITLES.length}</span><h2>Speed ranks</h2></div><p>Earned from your best WPM in a test of 15 seconds or more.</p></div>
    <div class="ladder">${speed}</div>

    <div class="section-head"><div><span class="kicker">Titles</span><h2>Distinctions</h2></div><p>Earned by habits, not just speed.</p></div>
    <div class="ladder">${feats}</div>

    <div class="section-head"><div><span class="kicker">History</span><h2>Recent tests</h2></div><p>Last 15 results</p></div>
    <table class="history">
      <thead><tr><th>when</th><th>wpm</th><th>acc</th><th>test</th><th>detail</th></tr></thead>
      <tbody>${hist}</tbody>
    </table>

    <div class="danger">
      <span>Everything here is stored in this browser's local storage. Clearing site data will erase it.</span>
      <button class="btn btn--ghost" type="button" data-reset>Erase all progress</button>
    </div>`;

  $('#nameInput').addEventListener('input', e => {
    S().name = e.target.value.trim().slice(0, 24);
    Store.save();
  });
}

/* ======================================================================
   Routing & events
   ====================================================================== */

function renderView() {
  if (view === 'test') { renderTestbar(); renderSheet(); }
  else if (view === 'missions') renderMissions();
  else if (view === 'gifts') renderGifts();
  else if (view === 'profile') renderProfile();
}

function renderAll() { renderHeader(); renderView(); }

function route() {
  const next = (location.hash || '#test').slice(1);
  const valid = ['test', 'missions', 'gifts', 'profile'];
  const target = valid.includes(next) ? next : 'test';
  if (view === 'test' && target !== 'test' && engine && engine.started && !engine.finished) newTest(false);
  view = target;
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== view; });
  renderAll();
  window.scrollTo(0, 0);
  if (view === 'test') focusTyping();
}

function onClick(e) {
  const t = e.target.closest('button, [data-act]');
  if (!t) return;
  const s = S();
  const d = t.dataset;

  if (t.id === 'themeBtn') {
    const order = ['auto', 'light', 'dark'];
    s.settings.theme = order[(order.indexOf(s.settings.theme) + 1) % 3];
    Store.save(); applyTheme(); return;
  }

  if (d.mode) { s.settings.mode = d.mode; return changeTest(); }
  if (d.len) {
    const k = lengthKey(s.settings.mode);
    s.settings[k] = k === 'passage' ? d.len : +d.len;
    return changeTest();
  }
  if (d.toggle) { s.settings[d.toggle] = !s.settings[d.toggle]; return changeTest(); }
  if (d.act === 'next') return newTest(false);
  if (d.act === 'repeat') return newTest(true);

  if (d.claimMission !== undefined) {
    const m = s.missions.list[+d.claimMission];
    if (m && !m.claimed && m.progress >= m.target) {
      m.claimed = true; grant(m.reward); Store.save();
      toast('Mission reward', `${esc(m.name)}: ${rewardText(m.reward)}.`);
      renderAll();
    }
    return;
  }
  if (d.claimBonus !== undefined) {
    if (!s.missions.bonusClaimed && s.missions.list.every(m => m.claimed)) {
      s.missions.bonusClaimed = true; s.missions.sheetsCleared += 1;
      grant(SHEET_BONUS); Store.save();
      toast('Full sheet', `Bonus collected: ${rewardText(SHEET_BONUS)}.`);
      renderAll();
    }
    return;
  }
  if (d.claimMilestone) {
    const m = MILESTONES.find(x => x.id === d.claimMilestone);
    if (m && !s.milestones[m.id] && m.value(s) >= m.target) {
      s.milestones[m.id] = Date.now(); grant(m.reward); Store.save();
      toast('Milestone', `${esc(m.name)}: ${rewardText(m.reward)}.`);
      renderAll();
    }
    return;
  }
  if (d.claimGift !== undefined) return claimDailyGift();
  if (d.buyBox !== undefined) {
    if (s.coins >= BOX_PRICE) {
      s.coins -= BOX_PRICE; s.chests += 1; Store.save();
      toast('Bought', `One gift box for ${BOX_PRICE} coins.`);
      renderAll();
    }
    return;
  }
  if (d.openBox !== undefined) return openBox();
  if (d.untie !== undefined) return untie();
  if (d.equipInk) {
    if (s.inks.owned.includes(d.equipInk)) { s.inks.equipped = d.equipInk; Store.save(); applyInk(); }
    if (d.close !== undefined) return closeModal();
    return renderAll();
  }
  if (d.equipTitle) {
    if (s.titles.unlocked.includes(d.equipTitle)) { s.titles.equipped = d.equipTitle; Store.save(); renderAll(); }
    return;
  }
  if (d.close !== undefined) return closeModal();
  if (d.reset !== undefined) {
    if (confirm('Erase all tests, coins, titles, gifts and your login streak? This cannot be undone.')) {
      Store.wipe(); registerLogin(S()); ensureMissions(S()); checkTitles(null, true); Store.save();
      applyInk(); applyTheme(); engine.configure(engineConfig()); renderAll();
      toast('Fresh start', 'All progress erased.');
    }
  }
}

function changeTest() {
  Store.save();
  renderTestbar();
  resultsOpen = false;
  $('#results').hidden = true;
  $('#typing').hidden = false;
  engine.configure(engineConfig());
  focusTyping();
}

function onKeydown(e) {
  if (!$('#modal').hidden) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (view !== 'test') return;
  const ae = document.activeElement;
  const input = $('#hiddenInput');
  if (ae && ae !== input && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;

  if (e.key === 'Tab') { e.preventDefault(); newTest(false); return; }
  if (e.key === 'Escape') { e.preventDefault(); newTest(true); return; }
  if (resultsOpen) {
    if (e.key === 'Enter' && (ae === document.body || ae === input)) newTest(false);
    return;
  }
  if (ae !== input) input.focus({ preventScroll: true });
  engine.handleKey(e);
}

/** Runs every second: reset countdown, and rolls the day over if the tab stays open past midnight. */
function heartbeat() {
  tickClock();
  const s = S();
  if (s.login.last !== todayKey()) {
    const login = registerLogin(s);
    ensureMissions(s);
    checkTitles(null);
    Store.save();
    if (view !== 'test' || !engine.started || engine.finished) renderAll(); else renderHeader();
    toast('New day', `Day ${login.streak} streak. A new gift and mission sheet are ready.`);
  }
}

function init() {
  Store.load();
  const s = S();
  const login = registerLogin(s);
  ensureMissions(s);
  checkTitles(null, true);
  Store.save();

  applyTheme();
  applyInk();

  engine = new TypingTest(
    { viewport: $('#viewport'), wordsEl: $('#words'), caret: $('#caret'), input: $('#hiddenInput') },
    { onTick, onFinish }
  );
  engine.configure(engineConfig());

  const input = $('#hiddenInput');
  input.addEventListener('focus', () => $('#typing').classList.remove('unfocused'));
  input.addEventListener('blur', () => $('#typing').classList.add('unfocused'));
  $('#typing').addEventListener('click', () => input.focus({ preventScroll: true }));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('hashchange', route);

  route();

  if (login.isNew) {
    if (login.broke) toast('Streak reset', `Your ${login.lost}-day streak ended. Day 1 starts now — your gift is waiting.`);
    else if (login.streak > 1) toast(`Day ${login.streak}`, 'Welcome back. Your daily gift is ready on the Gifts page.');
    else toast('Welcome', 'Start typing to begin. Collect your first daily gift on the Gifts page.');
  }

  setInterval(heartbeat, 1000);
}

document.addEventListener('DOMContentLoaded', init);
