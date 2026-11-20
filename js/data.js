'use strict';

/* Static content: word bank, inks, titles, missions, milestones, login gifts. */

const WORD_BANK = `
the be of and a to in he have it that for they with as not on she at by this we you do but from or which
one would all will there say who make when can more if no man out other so what time up go about than into
could state only new year some take come these know see use get like then first any work now may such give
over think most even find day also after way many must look before great back through long where much should
well people down own just because good each those feel seem how high too place little world very still nation
hand old life tell write become here show house both between need mean call develop under last right move
thing general school never same another begin while number part turn real leave might want point form off
child few small since against ask late home interest large person end open public follow during present
without again hold around possible head consider word program problem however lead system set order eye plan
run keep face fact group play stand increase early course change help line city light river paper letter
music water story table window garden morning evening simple quiet sudden bright carry watch learn listen
travel answer study close cover mark build north south question ground reason minute strong market single
`.trim().split(/\s+/);

/* Sample passages for passage mode. Plain ASCII so every character is typeable. */
const PASSAGES = [
  { id: 'ferry', length: 'short', title: 'The Morning Ferry',
    text: 'The ferry left the harbor at seven, cutting a pale line across the gray water. A few passengers stood at the rail with paper cups of coffee, watching the town grow smaller until only the church tower was left.' },
  { id: 'garden', length: 'short', title: 'Garden Notes',
    text: 'Tomatoes need more sun than you think and less water than you fear. Plant them deep, tie them loosely, and pinch off the small shoots that grow between the stem and the branches.' },
  { id: 'bus', length: 'short', title: 'The Last Bus',
    text: 'She missed the last bus by less than a minute. Instead of waiting for a taxi, she buttoned her coat, put her hands in her pockets, and decided that the walk home would do her good.' },

  { id: 'bridges', length: 'medium', title: 'How Bridges Stand',
    text: 'A bridge is a quiet argument with gravity. Every beam, cable, and stone is there to move weight from the middle of the span out to the ground on either side. Engineers spend years studying wind, traffic, and temperature, because a structure that looks still is always moving a little. The best bridges are the ones nobody thinks about at all.' },
  { id: 'repair', length: 'medium', title: 'The Repair Shop',
    text: 'The repair shop on Elm Street had no sign, only a window full of clocks that all showed different times. Mr. Okafor worked at a narrow bench in the back, fixing radios, lamps, and the occasional toaster. He charged very little and talked a great deal, and most of his customers came back with broken things they could easily have replaced.' },
  { id: 'touch', length: 'medium', title: 'Learning to Type',
    text: 'Most people learn to type by accident, pressing keys with two fingers until the habit sets in. Touch typing asks you to unlearn that. At first it feels slower, because your hands must find the home row and your eyes must stay on the screen. After a few weeks, however, the keyboard begins to disappear, and you start to think in sentences instead of letters.' },

  { id: 'observatory', length: 'long', title: 'Night Shift at the Observatory',
    text: 'The observatory sat on a ridge above the clouds, and on clear nights the sky looked close enough to touch. Lena arrived at sunset, checked the weather report, and opened the dome while the last orange light faded from the west. Her work was mostly patient waiting. The telescope followed a single star for hours, collecting faint light that had traveled for thousands of years. Between readings she drank tea, wrote notes in a worn logbook, and listened to the motors hum. By dawn her hands were cold, but the data was safe, and somewhere in those numbers was a small new fact about the universe.' },
  { id: 'library', length: 'long', title: 'The Village Library',
    text: 'When the village library was threatened with closure, nobody expected much of a fight. It was a small brick building with uneven floors and a heater that rattled all winter. Yet within a week, the reading room was full every evening. Retired teachers organized a petition, children painted posters, and a local baker offered free bread to anyone who signed. The council members, who had planned a short meeting, found themselves listening for three hours. In the end they voted to keep the doors open, and the next morning someone left a vase of fresh flowers on the front desk.' },
  { id: 'rivers', length: 'long', title: 'Rivers and Roads',
    text: 'Long before there were highways, rivers decided where people lived. Towns grew at the places where water was calm enough to cross or deep enough for boats, and trade followed the current from the hills to the sea. Roads came later, often tracing the same valleys the rivers had carved. Even today, if you look at a map of almost any old country, you can see the shape of its rivers hidden in its railways and streets. The water may have been replaced by asphalt, but the old routes remain, quietly guiding the way we travel.' },
];

/* Accent "inks". Each has a light-paper and dark-paper variant. */
const INKS = [
  { id: 'vermilion', name: 'Vermilion', light: '#c8441b', dark: '#ff7c50' },
  { id: 'cobalt',    name: 'Cobalt',    light: '#2a52be', dark: '#86a3ff' },
  { id: 'moss',      name: 'Moss',      light: '#4c7526', dark: '#9fd16e' },
  { id: 'ochre',     name: 'Ochre',     light: '#a8730d', dark: '#f0b94c' },
  { id: 'plum',      name: 'Plum',      light: '#83306e', dark: '#e384cb' },
  { id: 'teal',      name: 'Teal',      light: '#0d7b70', dark: '#4fd2c2' },
  { id: 'oxblood',   name: 'Oxblood',   light: '#7c1f2c', dark: '#e57a87' },
  { id: 'graphite',  name: 'Graphite',  light: '#3b3b38', dark: '#cfccc4' },
];

/* Titles. Speed titles unlock from best WPM; the rest from things you do. */
const TITLES = [
  { id: 'hunt',     group: 'speed', wpm: 0,   name: 'Hunt & Peck',       desc: 'Where everyone starts.' },
  { id: 'two',      group: 'speed', wpm: 25,  name: 'Two-Finger Typist', desc: 'Reach 25 WPM.' },
  { id: 'steady',   group: 'speed', wpm: 40,  name: 'Steady Hands',      desc: 'Reach 40 WPM.' },
  { id: 'keysmith', group: 'speed', wpm: 55,  name: 'Keysmith',          desc: 'Reach 55 WPM.' },
  { id: 'scribe',   group: 'speed', wpm: 70,  name: 'Swift Scribe',      desc: 'Reach 70 WPM.' },
  { id: 'velocity', group: 'speed', wpm: 85,  name: 'Velocity',          desc: 'Reach 85 WPM.' },
  { id: 'phantom',  group: 'speed', wpm: 100, name: 'Phantom Fingers',   desc: 'Reach 100 WPM.' },
  { id: 'ghost',    group: 'speed', wpm: 120, name: 'Ghostwriter',       desc: 'Reach 120 WPM.' },
  { id: 'steno',    group: 'speed', wpm: 140, name: 'Stenographer',      desc: 'Reach 140 WPM.' },

  { id: 'perfect',   group: 'feat', name: 'Perfectionist', desc: 'Finish a test of 30s or longer with 100% accuracy.',
    test: (s, r) => r && r.duration >= 30 && r.acc === 100 },
  { id: 'metronome', group: 'feat', name: 'Metronome',     desc: 'Finish a 30s+ test with 85% consistency or better.',
    test: (s, r) => r && r.duration >= 30 && r.consistency >= 85 },
  { id: 'marathon',  group: 'feat', name: 'Marathoner',    desc: 'Complete a 120 second test.',
    test: (s, r) => r && r.mode === 'time' && r.mode2 === 120 },
  { id: 'nightowl',  group: 'feat', name: 'Night Owl',     desc: 'Finish a test between midnight and 5am.',
    test: (s, r) => r && r.hour < 5 },
  { id: 'earlybird', group: 'feat', name: 'Early Bird',    desc: 'Finish a test between 5am and 8am.',
    test: (s, r) => r && r.hour >= 5 && r.hour < 8 },
  { id: 'regular',   group: 'feat', name: 'The Regular',   desc: 'Log in 7 days in a row.',
    test: s => s.login.bestStreak >= 7 },
  { id: 'devoted',   group: 'feat', name: 'Devoted',       desc: 'Log in 30 days in a row.',
    test: s => s.login.bestStreak >= 30 },
  { id: 'centurion', group: 'feat', name: 'Centurion',     desc: 'Complete 100 tests.',
    test: s => s.stats.tests >= 100 },
  { id: 'wordsmith', group: 'feat', name: 'Wordsmith',     desc: 'Type 50,000 correct characters.',
    test: s => s.stats.chars >= 50000 },
  { id: 'collector', group: 'feat', name: 'Ink Collector', desc: 'Own every ink.',
    test: s => s.inks.owned.length >= INKS.length },
];

/* Daily mission templates. `b` = player's best WPM (or a sensible default), `r` = seeded random. */
const pickFrom = (r, arr) => arr[Math.floor(r() * arr.length)];

const MISSION_POOL = [
  { type: 'tests', make: (b, r) => {
      const n = pickFrom(r, [3, 4, 5]);
      return { name: 'Warm-up laps', desc: `Complete ${n} tests of any kind.`, target: n,
               reward: { xp: 40 + n * 12, coins: 10 + n * 4 } };
  } },
  { type: 'wpm', make: b => {
      const t = Math.max(15, Math.round(b * 0.9 / 5) * 5);
      return { name: 'Speed trap', desc: `Hit ${t} WPM in a test lasting 15 seconds or more.`, target: 1,
               meta: { wpm: t }, reward: { xp: 110, coins: 30 } };
  } },
  { type: 'accuracy', make: (b, r) => {
      const a = pickFrom(r, [94, 95, 96]);
      return { name: 'Clean copy', desc: `Finish 2 tests with ${a}% accuracy or better.`, target: 2,
               meta: { acc: a }, reward: { xp: 90, coins: 25 } };
  } },
  { type: 'chars', make: (b, r) => {
      const n = pickFrom(r, [1500, 2500, 4000]);
      return { name: 'Ink by the page', desc: `Type ${n.toLocaleString('en-US')} correct characters.`, target: n,
               reward: { xp: Math.round(n / 25), coins: Math.round(n / 90) } };
  } },
  { type: 'seconds', make: (b, r) => {
      const m = pickFrom(r, [3, 5, 8]);
      return { name: 'Desk hours', desc: `Spend ${m} minutes typing in total.`, target: m * 60,
               reward: { xp: 40 + m * 14, coins: 10 + m * 4 } };
  } },
  { type: 'long', make: () => ({ name: 'The long haul', desc: 'Complete a 60 or 120 second test.', target: 1,
                                  reward: { xp: 80, coins: 20 } }) },
  { type: 'punct', make: () => ({ name: 'Mind the commas', desc: 'Complete a test with punctuation switched on.', target: 1,
                                   reward: { xp: 70, coins: 20 } }) },
  { type: 'clean', make: () => ({ name: 'Spotless run', desc: 'Finish 3 tests in a row above 92% accuracy. A miss resets the count.',
                                   target: 3, meta: { acc: 92 }, reward: { xp: 120, coins: 35 } }) },
  { type: 'wordsmode', make: () => ({ name: 'Full column', desc: 'Complete a words test of 50 words or more.', target: 1,
                                       reward: { xp: 80, coins: 20 } }) },
  { type: 'passage', make: () => ({ name: 'Copy the page', desc: 'Type a full sample passage of any length.', target: 1,
                                     reward: { xp: 90, coins: 25 } }) },
];

const SHEET_BONUS = { coins: 60, chests: 1 };

/* Lifetime milestones, claimable once each. */
const MILESTONES = [
  { id: 'first',     name: 'First impression',    desc: 'Complete your first test.',     target: 1,      value: s => s.stats.tests,      reward: { xp: 50, coins: 25 } },
  { id: 'tests10',   name: 'Getting the feel',    desc: 'Complete 10 tests.',            target: 10,     value: s => s.stats.tests,      reward: { xp: 150, coins: 60 } },
  { id: 'tests50',   name: 'Fixture at the desk', desc: 'Complete 50 tests.',            target: 50,     value: s => s.stats.tests,      reward: { xp: 400, coins: 150, chests: 1 } },
  { id: 'tests200',  name: 'Two hundred sheets',  desc: 'Complete 200 tests.',           target: 200,    value: s => s.stats.tests,      reward: { xp: 1000, coins: 300, chests: 2 } },
  { id: 'wpm40',     name: 'Forty flat',          desc: 'Reach 40 WPM.',                 target: 40,     value: s => s.stats.bestWpm,    reward: { xp: 120, coins: 50 } },
  { id: 'wpm60',     name: 'Sixty and climbing',  desc: 'Reach 60 WPM.',                 target: 60,     value: s => s.stats.bestWpm,    reward: { xp: 250, coins: 100 } },
  { id: 'wpm80',     name: 'Past eighty',         desc: 'Reach 80 WPM.',                 target: 80,     value: s => s.stats.bestWpm,    reward: { xp: 500, coins: 200, chests: 1 } },
  { id: 'wpm100',    name: 'Triple digits',       desc: 'Reach 100 WPM.',                target: 100,    value: s => s.stats.bestWpm,    reward: { xp: 1000, coins: 400, chests: 2 } },
  { id: 'streak3',   name: 'Three days running',  desc: 'Log in 3 days in a row.',       target: 3,      value: s => s.login.bestStreak, reward: { xp: 100, coins: 50 } },
  { id: 'streak7',   name: 'A full week',         desc: 'Log in 7 days in a row.',       target: 7,      value: s => s.login.bestStreak, reward: { xp: 300, coins: 120, chests: 1 } },
  { id: 'streak30',  name: 'Month of mornings',   desc: 'Log in 30 days in a row.',      target: 30,     value: s => s.login.bestStreak, reward: { xp: 1200, coins: 500, chests: 3 } },
  { id: 'chars10k',  name: 'Ten thousand keys',   desc: 'Type 10,000 correct characters.', target: 10000, value: s => s.stats.chars,    reward: { xp: 200, coins: 80 } },
  { id: 'chars100k', name: 'A novella',           desc: 'Type 100,000 correct characters.', target: 100000, value: s => s.stats.chars,  reward: { xp: 900, coins: 350, chests: 1 } },
  { id: 'boxes5',    name: 'Unwrapper',           desc: 'Open 5 gift boxes.',            target: 5,      value: s => s.chestsOpened,     reward: { xp: 150, coins: 100 } },
];

/* Seven-day login gift cycle. Day 7 includes a gift box. */
const LOGIN_REWARDS = [
  { coins: 20 },
  { xp: 60 },
  { coins: 35 },
  { xp: 100 },
  { coins: 50 },
  { xp: 150, coins: 25 },
  { coins: 80, chests: 1 },
];

const BOX_PRICE = 150;
