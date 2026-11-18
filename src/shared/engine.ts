// Epidemic Dots game engine. Pure functions, no dependencies, shared by client and server.
// Port of prototype/engine.js. The prototype stays as the reference; src/shared/parity.test.ts
// proves that this port produces identical results. Any rule change goes here first, then the balance test.

import { randomInt, type Rng } from './rng.ts';

export const N = 12; // board is N x N
export const ROUNDS = 8;

export type LevelKey = 'easy' | 'medium' | 'hard';

/**
 * Strain of the day. wake = round the plague appears; jump = infection radius (Chebyshev);
 * every = spread every N rounds after waking; fc = lab forecast factor (calibrated by the balance test).
 */
export interface Level {
  label: string;
  name: string;
  wake: number;
  jump: number;
  every: number;
  fc: number;
  /** Team goal for the day: average immunity score (percent) the subreddit must reach for a Vaccine day. */
  teamGoal: number;
}

export const LEVELS: Readonly<Record<LevelKey, Level>> = {
  easy: { label: 'Mon · Chill', name: '#5 SNEEZY', wake: 3, jump: 1, every: 2, fc: 0.72, teamGoal: 65 },
  medium: { label: 'Wed · Spicy', name: '#7 HOPPER', wake: 3, jump: 2, every: 2, fc: 0.6, teamGoal: 58 },
  hard: { label: 'Fri · Chaos', name: '#8 YEET', wake: 2, jump: 2, every: 2, fc: 0.26, teamGoal: 51 },
};

/** Weekly average immunity score (percent) needed to move up a league. Leagues never drop. */
export const PROMOTION_IMMUNITY = 60;

/** Runs per day. The best run counts for rank, the team goal and leagues. */
export const ATTEMPTS_PER_DAY = 3;

/** Vaccine day: after a day whose team goal was reached, the germs wake this many rounds later. */
export const VACCINE_WAKE_DELAY = 2;
/** Fewest real players for a day to count toward a Vaccine day (bots alone never trigger it). */
export const VACCINE_MIN_PLAYERS = 1;

export type Point = readonly [number, number];

export interface Ghost {
  id: string;
  seeds: readonly Point[];
  /** Patient Zero: the plague starts in this colony. */
  zero?: boolean;
}

/** Default board used by the prototype: 6 other colonies, C is Patient Zero. */
export const GHOSTS: readonly Ghost[] = [
  { id: 'A', seeds: [[1, 1], [2, 2]] },
  { id: 'B', seeds: [[9, 1], [10, 2]] },
  { id: 'C', seeds: [[1, 9], [2, 10]], zero: true },
  { id: 'D', seeds: [[5, 5], [6, 6]] },
  { id: 'E', seeds: [[10, 9], [9, 10]] },
  { id: 'F', seeds: [[5, 10], [6, 9], [7, 10]] },
];

export const ALLY_ID = 'D';

/**
 * Daily mutation the subreddit votes for. It changes how the plague behaves the next day.
 * zoomier: spreads every round but only hops 1 square.
 * jumpier: hops one square further (never beyond 3) and never wakes before round 3, or the whole board would die.
 * grumpier: the germs wake up one round earlier (never before round 1).
 * (An earlier "clingier" mutation, sick or compost cells staying contagious longer, changed nothing: germs have already
 * spread before cells die, so it was replaced.)
 */
export type Mutation = 'none' | 'zoomier' | 'jumpier' | 'grumpier';
export const MUTATIONS: readonly Exclude<Mutation, 'none'>[] = ['zoomier', 'jumpier', 'grumpier'];

export type MutationEffect = { jump: number; every: number; minWake: number; wakeShift: number };

export function mutationEffect(l: Pick<Level, 'jump' | 'every'>, m: Mutation): MutationEffect {
  if (m === 'zoomier') return { jump: 1, every: 1, minWake: 1, wakeShift: 0 };
  if (m === 'jumpier') return { jump: Math.min(3, l.jump + 1), every: l.every, minWake: 3, wakeShift: 0 };
  if (m === 'grumpier') return { jump: l.jump, every: l.every, minWake: 1, wakeShift: -1 };
  return { jump: l.jump, every: l.every, minWake: 1, wakeShift: 0 };
}

/** Id used for the player's own colony. */
export const ME = 'me';

export interface Frame {
  /** Owner id per cell (row-major, N x N), or null when empty. */
  own: (string | null)[];
  /** Round in which the cell was infected, or -1 when healthy. */
  inf: number[];
  /** True once an infected cell has died and become compost. */
  dead: boolean[];
}

export interface SimResult {
  /** frames[0] is the start, frames[r] is the board after round r. */
  frames: Frame[];
  /** Colonies that had at least one infected cell. */
  touched: Record<string, true>;
  /** First round the player's colony (or ally) was hit, 0 if never. */
  firstHit: number;
}

const DIRS4: readonly Point[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const at = <T>(arr: readonly T[], i: number, fallback: T): T => arr[i] ?? fallback;

/**
 * Run one board.
 * @param mine      the player's 3 seeds as [x, y]
 * @param ally      teamed up with ALLY_ID
 * @param levelKey  strain level
 * @param plague    false = growth only (used for the forecast)
 * @param ghosts    other colonies on the board
 * @param wakeDelay rounds added to the strain's wake round (Vaccine day)
 */
export function runSim(
  mine: readonly Point[],
  ally: boolean,
  levelKey: LevelKey,
  plague = true,
  ghosts: readonly Ghost[] = GHOSTS,
  wakeDelay = 0,
  mutation: Mutation = 'none',
): SimResult {
  const L = LEVELS[levelKey];
  const fx = mutationEffect(L, mutation);
  const wake = Math.max(L.wake + wakeDelay + fx.wakeShift, fx.minWake);
  let own: (string | null)[] = new Array<string | null>(N * N).fill(null);
  let inf: number[] = new Array<number>(N * N).fill(-1);
  const dead: boolean[] = new Array<boolean>(N * N).fill(false);
  const zeroId = ghosts.find((g) => g.zero)?.id;

  for (const g of ghosts) for (const [x, y] of g.seeds) own[y * N + x] = g.id;
  for (const [x, y] of mine) own[y * N + x] = ME;

  const team = (o: string): string => (ally && (o === ALLY_ID || o === ME) ? 'T' : o);
  const touched: Record<string, true> = {};
  let firstHit = 0;
  const frames: Frame[] = [{ own: own.slice(), inf: inf.slice(), dead: dead.slice() }];

  for (let r = 1; r <= ROUNDS; r++) {
    // Growth: an empty square touching exactly one living colony (team) joins it.
    const next = own.slice();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const k = y * N + x;
        if (at(own, k, null) || at(dead, k, false)) continue;
        const groups = new Set<string>();
        let first: string | null = null;
        for (const [dx, dy] of DIRS4) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const nk = ny * N + nx;
          const o = at(own, nk, null);
          if (o && at(inf, nk, -1) < 0 && !at(dead, nk, false)) {
            groups.add(team(o));
            if (!first || o === ME) first = o;
          }
        }
        if (groups.size === 1) next[k] = first;
      }
    }
    own = next;

    // Plague.
    const ninf = inf.slice();
    if (plague) {
      if (r === wake) {
        for (let i = 0; i < N * N; i++) if (at(own, i, null) === zeroId) ninf[i] = r;
      } else if (r > wake && (r - wake) % fx.every === 0) {
        for (let cy = 0; cy < N; cy++) {
          for (let cx = 0; cx < N; cx++) {
            const ck = cy * N + cx;
            if (!at(own, ck, null) || at(ninf, ck, -1) >= 0 || at(dead, ck, false)) continue;
            let hit = false;
            for (let dy = -fx.jump; dy <= fx.jump && !hit; dy++) {
              for (let dx = -fx.jump; dx <= fx.jump && !hit; dx++) {
                const tx = cx + dx;
                const ty = cy + dy;
                if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
                const tk = ty * N + tx;
                if (at(inf, tk, -1) >= 0 && !at(dead, tk, false)) hit = true;
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
      const infAt = at(inf, i, -1);
      if (infAt >= 0 && infAt <= r - 2) dead[i] = true;
      const owner = at(own, i, null);
      if (infAt >= 0 && owner) {
        touched[owner] = true;
        if (!firstHit && (owner === ME || (ally && owner === ALLY_ID))) firstHit = r;
      }
    }
    frames.push({ own: own.slice(), inf: inf.slice(), dead: dead.slice() });
  }
  return { frames, touched, firstHit };
}

/** Living (healthy, not dead) cells per colony in one frame. */
export function aliveOf(frame: Frame): Record<string, number> {
  const alive: Record<string, number> = {};
  frame.own.forEach((o, i) => {
    if (o && at(frame.inf, i, -1) < 0 && !at(frame.dead, i, false)) alive[o] = (alive[o] ?? 0) + 1;
  });
  return alive;
}

/** The player's living cells. With an ally the shared total is split in two (rounded). */
export function myCells(alive: Readonly<Record<string, number>>, ally: boolean): number {
  return ally ? Math.round(((alive[ME] ?? 0) + (alive[ALLY_ID] ?? 0)) / 2) : (alive[ME] ?? 0);
}

/** Lab forecast: living cells in a plague-free run, scaled by the strain's forecast factor. */
export function forecast(
  mine: readonly Point[],
  ally: boolean,
  levelKey: LevelKey,
  ghosts: readonly Ghost[] = GHOSTS,
): number {
  if (mine.length !== 3) return 0;
  const { frames } = runSim(mine, ally, levelKey, false, ghosts);
  const last = frames[ROUNDS];
  if (!last) return 0;
  return Math.max(1, Math.round(myCells(aliveOf(last), ally) * LEVELS[levelKey].fc));
}

export interface ScoreRow {
  id: string;
  cells: number;
  clean: boolean;
  /** Streak multiplier, only set on the player's row. */
  mult?: number;
  pos: number;
  base: number;
  cleanBonus: number;
  podium: number;
  points: number;
}

const PODIUM: readonly number[] = [100, 60, 30];

/** points = (cells x 10 + 50 if never infected + dish podium) x streak multiplier */
export function scoreBoard(
  result: SimResult,
  ally: boolean,
  streakDays: number,
  ghosts: readonly Ghost[] = GHOSTS,
): ScoreRow[] {
  const last = result.frames[ROUNDS];
  const alive = last ? aliveOf(last) : {};
  const blank = { pos: 0, base: 0, cleanBonus: 0, podium: 0, points: 0 };
  const rows: ScoreRow[] = ghosts
    .filter((g) => !(ally && g.id === ALLY_ID))
    .map((g) => ({ id: g.id, cells: alive[g.id] ?? 0, clean: !result.touched[g.id], ...blank }));
  rows.push({
    id: ME,
    cells: myCells(alive, ally),
    clean: !result.touched[ME] && !(ally && result.touched[ALLY_ID]),
    mult: 1 + 0.05 * streakDays,
    ...blank,
  });
  rows.sort((a, b) => b.cells - a.cells);
  rows.forEach((row, i) => {
    row.pos = i + 1;
    row.base = row.cells * 10;
    row.cleanBonus = row.clean && row.cells > 0 ? 50 : 0;
    row.podium = PODIUM[i] ?? 0;
    row.points = Math.round((row.base + row.cleanBonus + row.podium) * (row.mult ?? 1));
  });
  return rows;
}

export type Title = readonly [xp: number, name: string];

export const TITLES: readonly Title[] = [
  [0, 'Lonely Spore'],
  [500, 'Mildly Cultured'],
  [1500, 'Colony Boss'],
  [2500, 'Germ Whisperer'],
  [4000, 'Supreme Petri Overlord'],
];

export function titleFor(xp: number): { cur: Title; nxt: Title | null } {
  let cur: Title = [0, 'Lonely Spore'];
  let nxt: Title | null = null;
  TITLES.forEach((t, i) => {
    if (xp >= t[0]) {
      cur = t;
      nxt = TITLES[i + 1] ?? null;
    }
  });
  return { cur, nxt };
}

/**
 * Pick `count` distinct empty cells for the player's seeds, avoiding every ghost seed.
 * Used by the balance test and (later) to place bots reproducibly.
 */
export function randomSeeds(rng: Rng, ghosts: readonly Ghost[] = GHOSTS, count = 3): Point[] {
  const occupied = new Set<string>();
  for (const g of ghosts) for (const [x, y] of g.seeds) occupied.add(`${x},${y}`);
  const picked: Point[] = [];
  while (picked.length < count) {
    const x = randomInt(rng, N);
    const y = randomInt(rng, N);
    if (occupied.has(`${x},${y}`) || picked.some((p) => p[0] === x && p[1] === y)) continue;
    picked.push([x, y]);
  }
  return picked;
}

/** Kept dots as a percentage of the best possible, capped at 100. */
export function immunityScore(kept: number, bestPossible: number): number {
  if (bestPossible <= 0) return 0;
  return Math.min(100, Math.round((kept / bestPossible) * 100));
}

/**
 * Near-optimal placement search for the day's "best possible": the best of `samples` random placements, then hill
 * climbing (move one seed to any free cell while it helps), repeated `restarts` times. Takes a fraction of a second,
 * unlike scanning all ~366,000 placements (14-17 s). May miss the true optimum by a dot or two (checked in tests).
 */
export function findBest(
  rng: Rng,
  levelKey: LevelKey,
  ghosts: readonly Ghost[] = GHOSTS,
  samples = 1500,
  restarts = 3,
  wakeDelay = 0,
  mutation: Mutation = 'none',
): { best: number; seeds: Point[] } {
  const taken = new Set<string>();
  for (const g of ghosts) for (const [x, y] of g.seeds) taken.add(`${x},${y}`);
  const free: Point[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!taken.has(`${x},${y}`)) free.push([x, y]);
  const score = (m: readonly Point[]): number => {
    const last = runSim(m, false, levelKey, true, ghosts, wakeDelay, mutation).frames[ROUNDS];
    return last ? myCells(aliveOf(last), false) : 0;
  };
  let globalBest = -1;
  let globalSeeds: Point[] = [];
  for (let r = 0; r < restarts; r++) {
    let seeds = randomSeeds(rng, ghosts);
    let value = score(seeds);
    for (let i = 1; i < samples; i++) {
      const cand = randomSeeds(rng, ghosts);
      const v = score(cand);
      if (v > value) {
        value = v;
        seeds = cand;
      }
    }
    let improved = true;
    while (improved) {
      improved = false;
      for (let s = 0; s < seeds.length; s++) {
        for (const c of free) {
          if (seeds.some((p) => p[0] === c[0] && p[1] === c[1])) continue;
          const trial = seeds.slice();
          trial[s] = c;
          const v = score(trial);
          if (v > value) {
            value = v;
            seeds = trial;
            improved = true;
          }
        }
      }
    }
    if (value > globalBest) {
      globalBest = value;
      globalSeeds = seeds;
    }
  }
  return { best: globalBest, seeds: globalSeeds };
}

/** Plague parameters of a day after the Vaccine delay and the voted mutation are applied. */
export function effectiveStrain(levelKey: LevelKey, wakeDelay: number, mutation: Mutation): { wake: number; jump: number; every: number } {
  const L = LEVELS[levelKey];
  const fx = mutationEffect(L, mutation);
  return { wake: Math.max(L.wake + wakeDelay + fx.wakeShift, fx.minWake), jump: fx.jump, every: fx.every };
}

/**
 * Team goal for a day: what a random player who takes all runs and keeps the best averages, plus a margin, so that
 * about a third of random players reach it. Computed per board because the Vaccine delay and mutations shift difficulty.
 */
export function calibratedGoal(
  rng: Rng,
  levelKey: LevelKey,
  ghosts: readonly Ghost[],
  bestPossible: number,
  wakeDelay: number,
  mutation: Mutation,
  samples = 600,
): number {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    let best = 0;
    for (let a = 0; a < ATTEMPTS_PER_DAY; a++) {
      const last = runSim(randomSeeds(rng, ghosts), false, levelKey, true, ghosts, wakeDelay, mutation).frames[ROUNDS];
      best = Math.max(best, immunityScore(last ? myCells(aliveOf(last), false) : 0, bestPossible));
    }
    sum += best;
  }
  return Math.min(90, Math.max(30, Math.round(sum / samples + 7)));
}
