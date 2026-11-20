'use strict';

/* The typing test itself: word generation, input handling, timing and scoring. */

function punctuate(word, prev) {
  const sentenceStart = !prev || /[.?!]["')]?$/.test(prev);
  if (sentenceStart && /^[a-z]/.test(word)) word = word[0].toUpperCase() + word.slice(1);
  const r = Math.random();
  if (r < 0.09) return word + ',';
  if (r < 0.15) return word + '.';
  if (r < 0.17) return word + '?';
  if (r < 0.18) return word + '!';
  if (r < 0.195) return word + ';';
  if (r < 0.205) return word + ':';
  if (r < 0.22) return `"${word}"`;
  if (r < 0.23) return `(${word})`;
  return word;
}

function generateWords(count, opts, prev) {
  const out = [];
  let last = prev || null;
  for (let i = 0; i < count; i++) {
    let w;
    do { w = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]; }
    while (last && w === last.toLowerCase());
    if (opts.nums && Math.random() < 0.12) {
      w = String(Math.floor(Math.random() * (Math.random() < 0.6 ? 100 : 10000)));
    }
    if (opts.punct) w = punctuate(w, last);
    out.push(w);
    last = w;
  }
  return out;
}

/** Picks a passage of the given length, avoiding the one just typed when possible. */
function pickPassage(length, prev) {
  const pool = PASSAGES.filter(p => p.length === length);
  const choices = pool.length > 1 && prev ? pool.filter(p => p.id !== prev.id) : pool;
  return choices[Math.floor(Math.random() * choices.length)] || PASSAGES[0];
}

function fmtClock(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const escHTML = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

class TypingTest {
  /**
   * @param {{viewport:HTMLElement, wordsEl:HTMLElement, caret:HTMLElement, input:HTMLInputElement}} els
   * @param {{onStart?:Function, onTick:Function, onFinish:Function}} hooks
   */
  constructor(els, hooks) {
    this.viewport = els.viewport;
    this.wordsEl = els.wordsEl;
    this.caret = els.caret;
    this.input = els.input;
    this.hooks = hooks;
    this.cfg = { mode: 'time', time: 30, words: 25, passage: 'medium', punct: false, nums: false };
    this.passage = null;
    this.timer = null;
    this.words = [];

    // Mobile keyboards often send key "Unidentified" on keydown, so fall back to input events.
    this.input.addEventListener('input', () => {
      const v = this.input.value;
      this.input.value = '';
      for (const ch of v) this.type(ch);
    });
    this.input.addEventListener('beforeinput', e => {
      if (e.inputType === 'deleteContentBackward') { e.preventDefault(); this.backspace(false); }
      if (e.inputType === 'deleteWordBackward') { e.preventDefault(); this.backspace(true); }
    });

    let resizeT;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => { this.lineH = null; this._caret(); }, 80);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { this.lineH = null; this._caret(); });
  }

  configure(cfg) {
    this.cfg = { ...this.cfg, ...cfg };
    this.reset(false);
  }

  /** Fresh test. With `repeat`, the same words are used again. */
  reset(repeat) {
    clearInterval(this.timer);
    const again = repeat && this.words.length ? this.words.slice() : null;

    this.words = []; this.typed = []; this.wordEls = [];
    this.cur = 0; this.firstVisible = 0;
    this.started = false; this.finished = false;
    this.keys = 0; this.correctKeys = 0;
    this.secErrors = 0; this.lastKeys = 0; this.samples = [];
    this.lineH = null;
    this.wordsEl.textContent = '';

    if (again) {
      this._appendWords(this.cfg.mode === 'words' ? again.slice(0, this.cfg.words) : again);
    } else if (this.cfg.mode === 'passage') {
      this.passage = pickPassage(this.cfg.passage, this.passage);
      this._appendWords(this.passage.text.split(' '));
    } else {
      this._append(this.cfg.mode === 'words' ? this.cfg.words : 70);
    }

    this._paint(0);
    this.caret.classList.add('idle');
    this._caret();
    this.hooks.onTick(this.liveStats(0));
  }

  /** Called from the page-level keydown handler. Returns true if the key was used. */
  handleKey(e) {
    if (this.finished) return false;
    if (e.key === 'Backspace') { e.preventDefault(); this.backspace(e.ctrlKey || e.altKey || e.metaKey); return true; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) return false;
    if (e.key.length !== 1) return false;
    e.preventDefault();
    this.type(e.key);
    return true;
  }

  type(ch) {
    if (this.finished || ch === '\n' || ch === '\t') return;
    const i = this.cur;
    const word = this.words[i];
    const typed = this.typed[i];

    if (ch === ' ') {
      if (!typed.length) return;           // no double spaces / skipping empty words
      if (!this.started) this._start();
      this.keys++;
      if (typed === word) this.correctKeys++; else this.secErrors++;
      if (this.cfg.mode !== 'time' && i === this.words.length - 1) { this._paint(i); this._finish(); return; }
      this.cur++;
      if (this.cfg.mode === 'time' && this.words.length - this.cur < 40) this._append(40);
      this._paint(i);
      this._paint(this.cur);
      this._lines();
      this._caret();
      return;
    }

    if (typed.length >= word.length + 8) return; // cap runaway extra letters
    if (!this.started) this._start();
    this.keys++;
    if (word[typed.length] === ch) this.correctKeys++; else this.secErrors++;
    this.typed[i] = typed + ch;
    this._paint(i);

    if (this.cfg.mode !== 'time' && i === this.words.length - 1 && this.typed[i] === word) { this._finish(); return; }
    this._lines();
    this._caret();
  }

  backspace(wholeWord) {
    if (this.finished) return;
    let i = this.cur;
    if (!this.typed[i].length) {
      // step back into the previous word only if it was left wrong and is still on screen
      if (i === 0 || i - 1 < this.firstVisible || this.typed[i - 1] === this.words[i - 1]) return;
      this.cur = --i;
      this._paint(i + 1);
      if (wholeWord) this.typed[i] = '';
    } else {
      this.typed[i] = wholeWord ? '' : this.typed[i].slice(0, -1);
    }
    this._paint(i);
    this._caret();
  }

  liveStats(elapsed) {
    const timed = this.cfg.mode === 'time';
    return {
      started: this.started,
      counter: timed ? Math.max(0, Math.ceil(this.cfg.time - elapsed))
        : this.cfg.mode === 'passage' ? fmtClock(elapsed)
        : `${this.cur}/${this.words.length}`,
      done: this.cur,
      total: this.words.length,
      wpm: elapsed >= 1 ? this._wpm(elapsed) : 0,
      acc: this.keys ? Math.floor(this.correctKeys / this.keys * 100) : 100,
    };
  }

  /* ---------- internals ---------- */

  _append(n) {
    this._appendWords(generateWords(n, this.cfg, this.words[this.words.length - 1]));
  }

  _appendWords(list) {
    const frag = document.createDocumentFragment();
    for (const w of list) {
      const el = document.createElement('div');
      el.className = 'word';
      el.innerHTML = this._letters(w, '');
      frag.appendChild(el);
      this.words.push(w);
      this.typed.push('');
      this.wordEls.push(el);
    }
    this.wordsEl.appendChild(frag);
  }

  _letters(word, typed) {
    let html = '';
    for (let j = 0; j < word.length; j++) {
      const cls = j < typed.length ? (typed[j] === word[j] ? 'ch ok' : 'ch bad') : 'ch';
      html += `<span class="${cls}">${escHTML(word[j])}</span>`;
    }
    for (let j = word.length; j < typed.length; j++) {
      html += `<span class="ch bad extra">${escHTML(typed[j])}</span>`;
    }
    return html;
  }

  _paint(i) {
    const el = this.wordEls[i];
    if (!el) return;
    el.innerHTML = this._letters(this.words[i], this.typed[i]);
    el.classList.toggle('error', i < this.cur && this.typed[i] !== this.words[i]);
    el.classList.toggle('active', i === this.cur);
  }

  /** Keep the active word on the first two lines by hiding the oldest line. */
  _lines() {
    const el = this.wordEls[this.cur];
    if (!el) return;
    if (!this.lineH) this.lineH = el.offsetHeight;
    const top0 = this.wordEls[this.firstVisible].offsetTop;
    if (el.offsetTop - top0 >= this.lineH * 2 - 1) {
      let j = this.firstVisible;
      while (j < this.cur && this.wordEls[j].offsetTop === top0) {
        this.wordEls[j].style.display = 'none';
        j++;
      }
      this.firstVisible = j;
    }
  }

  _caret() {
    const el = this.wordEls[this.cur];
    if (!el) return;
    const spans = el.children;
    const n = this.typed[this.cur].length;
    let x, y;
    if (n < spans.length) {
      x = el.offsetLeft + spans[n].offsetLeft;
      y = el.offsetTop + spans[n].offsetTop;
    } else {
      const s = spans[spans.length - 1];
      x = el.offsetLeft + s.offsetLeft + s.offsetWidth;
      y = el.offsetTop + s.offsetTop;
    }
    this.caret.style.transform = `translate(${x - 1}px, ${y}px)`;
  }

  _start() {
    this.started = true;
    this.t0 = performance.now();
    this.caret.classList.remove('idle');
    this.timer = setInterval(() => this._tick(), 100);
    if (this.hooks.onStart) this.hooks.onStart();
  }

  _tick() {
    const elapsed = (performance.now() - this.t0) / 1000;
    const limit = this.cfg.mode === 'time' ? this.cfg.time : Infinity;
    while (this.samples.length < Math.min(Math.floor(elapsed), limit)) this._sample(this.samples.length + 1);
    if (elapsed >= limit) { this._finish(); return; }
    this.hooks.onTick(this.liveStats(elapsed));
  }

  _sample(sec, span = 1) {
    const k = this.keys - this.lastKeys;
    this.lastKeys = this.keys;
    this.samples.push({ t: sec, wpm: this._wpm(sec), raw: Math.round(k * 12 / span), err: this.secErrors });
    this.secErrors = 0;
  }

  /** Characters of correctly typed words (plus their spaces), and the correct prefix of the current word. */
  _netChars() {
    let c = 0;
    for (let i = 0; i < this.cur; i++) if (this.typed[i] === this.words[i]) c += this.words[i].length + 1;
    const t = this.typed[this.cur], w = this.words[this.cur];
    if (t && w.startsWith(t)) c += t.length;
    return c;
  }

  _wpm(sec) { return sec > 0 ? Math.round(this._netChars() / 5 / (sec / 60)) : 0; }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    clearInterval(this.timer);
    this.caret.classList.add('idle');

    const timed = this.cfg.mode === 'time';
    const duration = timed ? this.cfg.time : (performance.now() - this.t0) / 1000;
    const partial = duration - this.samples.length;
    if (!timed && partial > 0.2) this._sample(Math.round(duration * 10) / 10, partial);

    let correct = 0, incorrect = 0, extra = 0, missed = 0;
    for (let i = 0; i <= this.cur; i++) {
      const w = this.words[i], t = this.typed[i];
      const m = Math.min(w.length, t.length);
      for (let j = 0; j < m; j++) (t[j] === w[j] ? correct++ : incorrect++);
      if (t.length > w.length) extra += t.length - w.length;
      else if (i < this.cur) missed += w.length - t.length;
    }

    const raws = this.samples.map(s => s.raw);
    let consistency = 100;
    if (raws.length > 1) {
      const mean = raws.reduce((a, b) => a + b, 0) / raws.length;
      const sd = Math.sqrt(raws.reduce((a, b) => a + (b - mean) ** 2, 0) / raws.length);
      consistency = mean > 0 ? Math.max(0, Math.round(100 * (1 - sd / mean))) : 0;
    }

    const minutes = duration / 60;
    this.hooks.onFinish({
      mode: this.cfg.mode,
      mode2: timed ? this.cfg.time : this.cfg.mode === 'passage' ? this.cfg.passage : this.cfg.words,
      passageTitle: this.cfg.mode === 'passage' && this.passage ? this.passage.title : null,
      punct: !!this.cfg.punct,
      nums: !!this.cfg.nums,
      duration: Math.round(duration * 100) / 100,
      wpm: Math.round(this._netChars() / 5 / minutes),
      raw: Math.round(this.keys / 5 / minutes),
      acc: this.keys ? Math.floor(this.correctKeys / this.keys * 100) : 0,
      consistency,
      correctChars: correct,
      chars: { correct, incorrect, extra, missed },
      samples: this.samples,
    });
  }
}
