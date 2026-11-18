// Reference game engine for Petri (working title), extracted from the clickable prototype.
// Plain JS, no dependencies. Source of truth for rules and balance until the TypeScript port.

'use strict';

const N = 12;        // board is N x N
const ROUNDS = 8;

// Strain of the day. wake = round the plague appears; jump = infection radius (Chebyshev);
// every = spread every N rounds after waking; fc = lab forecast factor (calibrated by balance-test.js).
const LEVELS = {
  easy:   { label: 'Mon · Chill', name: '#5 SNEEZY', wake: 3, jump: 1, every: 2, fc: 0.72 },
  medium: { label: 'Wed · Spicy', name: '#7 HOPPER', wake: 3, jump: 2, every: 2, fc: 0.60 },
  hard:   { label: 'Fri · Chaos', name: '#8 YEET',   wake: 2, jump: 2, every: 2, fc: 0.26 },
};

// Default board used by the prototype: 6 other colonies, C is Patient Zero.
const GHOSTS = [
  { id: 'A', seeds: [[1, 1], [2, 2]] },
  { id: 'B', seeds: [[9, 1], [10, 2]] },
  { id: 'C', seeds: [[1, 9], [2, 10]], zero: true },
  { id: 'D', seeds: [[5, 5], [6, 6]] },
  { id: 'E', seeds: [[10, 9], [9, 10]] },
  { id: 'F', seeds: [[5, 10], [6, 9], [7, 10]] },
];

const ALLY_ID = 'D';

/**
 * Run one board.
 * @param {Array<[number, number]>} mine  the player's 3 seeds as [x, y]
 * @param {boolean} ally                 teamed up with ALLY_ID
 * @param {string} levelKey              'easy' | 'medium' | 'hard'
 * @param {boolean} plague               false = growth only (used for the forecast)
 * @param {Array} ghosts                 other colonies on the board
 * @returns {{frames: Array, touched: Object, firstHit: number}}
 */
function runSim(mine, ally, levelKey, plague = true, ghosts = GHOSTS) {
  const L = LEVELS[levelKey];
  let own = new Array(N * N).fill(null);
  let inf = new Array(N * N).fill(-1);
  const dead = new Array(N * N).fill(false);
  const zeroId = (ghosts.find((g) => g.zero) || {}).id;

  ghosts.forEach((g) => g.seeds.forEach(([x, y]) => { own[y * N + x] = g.id; }));
  mine.forEach(([x, y]) => { own[y * N + x] = 'me'; });

  const team = (o) => (ally && (o === ALLY_ID || o === 'me') ? 'T' : o);
  const touched = {};
  let firstHit = 0;
  const frames = [{ own: own.slice(), inf: inf.slice(), dead: dead.slice() }];

  for (let r = 1; r <= ROUNDS; r++) {
    // Growth: an empty square touching exactly one living colony (team) joins it.
    const next = own.slice();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = y * N + x;
        if (own[k] || dead[k]) continue;
        const groups = new Set();
        let first = null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx, o = own[nk];
          if (o && inf[nk] < 0 && !dead[nk]) {
            groups.add(team(o));
            if (!first || o === 'me') first = o;
          }
        }
        if (groups.size === 1) next[k] = first;
      }
    }
    own = next;

    // Plague.
    const ninf = inf.slice();
    if (plague) {
      if (r === L.wake) {
        for (let i = 0; i < N * N; i++) if (own[i] === zeroId) ninf[i] = r;
      } else if (r > L.wake && (r - L.wake) % L.every === 0) {
        for (let cy = 0; cy < N; cy++) {
          for (let cx = 0; cx < N; cx++) {
            const ck = cy * N + cx;
            if (!own[ck] || ninf[ck] >= 0 || dead[ck]) continue;
            let hit = false;
            for (let dy = -L.jump; dy <= L.jump && !hit; dy++) {
              for (let dx = -L.jump; dx <= L.jump && !hit; dx++) {
                const tx = cx + dx, ty = cy + dy;
                if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
                const tk = ty * N + tx;
                if (inf[tk] >= 0 && !dead[tk]) hit = true;
              }
            }
            if (hit) ninf[ck] = r;
          }
        }
      }
    }
    inf = ninf;

    // Sick cells die 2 rounds after infection and stay as compost.
    for (let i = 0; i < N * N; i++) {
      if (inf[i] >= 0 && inf[i] <= r - 2) dead[i] = true;
      if (inf[i] >= 0 && own[i]) {
        touched[own[i]] = true;
        if (!firstHit && (own[i] === 'me' || (ally && own[i] === ALLY_ID))) firstHit = r;
      }
    }
    frames.push({ own: own.slice(), inf: inf.slice(), dead: dead.slice() });
  }
  return { frames, touched, firstHit };
}

function aliveOf(frame) {
  const alive = {};
  frame.own.forEach((o, i) => {
    if (o && frame.inf[i] < 0 && !frame.dead[i]) alive[o] = (alive[o] || 0) + 1;
  });
  return alive;
}

function myCells(alive, ally) {
  return ally ? Math.round(((alive.me || 0) + (alive[ALLY_ID] || 0)) / 2) : (alive.me || 0);
}

function forecast(mine, ally, levelKey, ghosts = GHOSTS) {
  if (mine.length !== 3) return 0;
  const { frames } = runSim(mine, ally, levelKey, false, ghosts);
  return Math.max(1, Math.round(myCells(aliveOf(frames[ROUNDS]), ally) * LEVELS[levelKey].fc));
}

// points = (cells x 10 + 50 if never infected + dish podium) x streak multiplier
function scoreBoard(result, mine, ally, streakDays, ghosts = GHOSTS) {
  const alive = aliveOf(result.frames[ROUNDS]);
  const rows = ghosts
    .filter((g) => !(ally && g.id === ALLY_ID))
    .map((g) => ({ id: g.id, cells: alive[g.id] || 0, clean: !result.touched[g.id] }));
  rows.push({
    id: 'me',
    cells: myCells(alive, ally),
    clean: !result.touched.me && !(ally && result.touched[ALLY_ID]),
    mult: 1 + 0.05 * streakDays,
  });
  rows.sort((a, b) => b.cells - a.cells);
  const podium = [100, 60, 30];
  rows.forEach((r, i) => {
    r.pos = i + 1;
    r.base = r.cells * 10;
    r.cleanBonus = r.clean && r.cells > 0 ? 50 : 0;
    r.podium = podium[i] || 0;
    r.points = Math.round((r.base + r.cleanBonus + r.podium) * (r.mult || 1));
  });
  return rows;
}

const TITLES = [
  [0, 'Lonely Spore'], [500, 'Mildly Cultured'], [1500, 'Colony Boss'],
  [2500, 'Germ Whisperer'], [4000, 'Supreme Petri Overlord'],
];

function titleFor(xp) {
  let cur = TITLES[0], nxt = null;
  TITLES.forEach((t, i) => { if (xp >= t[0]) { cur = t; nxt = TITLES[i + 1] || null; } });
  return { cur, nxt };
}

module.exports = { N, ROUNDS, LEVELS, GHOSTS, ALLY_ID, runSim, aliveOf, myCells, forecast, scoreBoard, TITLES, titleFor };
