// Picking the day's board so that it is always fair: a playable layout, a mutation that does not break it, a secret
// Patient Zero, and a lab forecast that can actually be beaten. Pure and seeded, so it is tested like the engine.

import { ROUNDS, aliveOf, findBest, myCells, randomSeeds, runSim, type Ghost, type LevelKey, type Mutation, type Point } from './engine.ts';
import { makeGhostsFromReal, type RealColony } from './board.ts';
import { randomInt, rngFromText } from './rng.ts';

/**
 * A board is fair when the lab's benchmark is at least MIN_BEST dots and at most MAX_ZERO_SHARE of random first runs
 * end with nothing alive. Measured: without this floor about one day in five left 80-98% of random runs at 0 dots.
 */
export const MIN_BEST = 15;
export const MAX_ZERO_SHARE = 0.5;
/** Other layouts tried (with fresh lab-rat colonies) before settling for the least bad one. */
export const LAYOUT_VARIANTS = 6;

export type BoardHealth = { zeroShare: number; meanKept: number; meanClean: number };

/** How random first runs fare on a board: share that keep 0 dots, average kept, average kept with no plague. */
export function boardHealth(
  seed: string,
  level: LevelKey,
  ghosts: readonly Ghost[],
  wakeDelay: number,
  mutation: Mutation,
  samples = 120,
): BoardHealth {
  const rng = rngFromText(`health:${seed}`);
  let zero = 0;
  let kept = 0;
  let clean = 0;
  for (let i = 0; i < samples; i++) {
    const seeds = randomSeeds(rng, ghosts);
    const last = runSim(seeds, false, level, true, ghosts, wakeDelay, mutation).frames[ROUNDS];
    const k = last ? myCells(aliveOf(last), false) : 0;
    const c = runSim(seeds, false, level, false, ghosts).frames[ROUNDS];
    if (k === 0) zero++;
    kept += k;
    clean += c ? myCells(aliveOf(c), false) : 0;
  }
  return { zeroShare: zero / samples, meanKept: kept / samples, meanClean: clean / samples };
}

/**
 * The lab's forecast factor for a board: on average, what share of the dots a placement would grow with no plague
 * actually survives today. Replaces the fixed per-strain factor, which ignored mutations and layouts.
 */
export function forecastFactor(h: BoardHealth): number {
  if (h.meanClean <= 0) return 0.5;
  return Math.min(1, Math.max(0.05, h.meanKept / h.meanClean));
}

/** The lab's prediction: dots grown with no plague times the board's factor, never at or above the benchmark. */
export function labForecast(cleanKept: number, fc: number, best: number): number {
  return Math.max(1, Math.min(Math.round(cleanKept * fc), Math.max(1, best - 1)));
}

/** Dots a placement keeps when nobody is sick (the lab's starting point for its forecast). */
export function cleanKept(seeds: readonly Point[], level: LevelKey, ghosts: readonly Ghost[]): number {
  const last = runSim(seeds, false, level, false, ghosts).frames[ROUNDS];
  return last ? myCells(aliveOf(last), false) : 0;
}

export type PickedBoard = {
  ghosts: Ghost[];
  slots: number[];
  mutation: Mutation;
  /** True when the lab rats' mutation was cancelled because it made the board unfair. */
  mutationCancelled: boolean;
  best: number;
  bestSeeds: Point[];
  fc: number;
  variant: number;
  health: BoardHealth;
};

/** Patient Zero is re-drawn from a server-only seed, so it cannot be worked out from the date. */
function withZero(ghosts: readonly Ghost[], zeroSeed: string, variant: number): Ghost[] {
  const zero = randomInt(rngFromText(`zero:${zeroSeed}:${variant}`), ghosts.length);
  return ghosts.map((g, i) => {
    const { zero: _old, ...rest } = g;
    return i === zero ? { ...rest, zero: true } : rest;
  });
}

/**
 * The day's board. Tries the normal layout first, then (only for a mutation the lab rats picked) the same layout
 * without it, then other layouts; the first fair one wins. If none is fair, the one with the fewest empty-handed
 * random runs is used. A mutation the players voted for is kept unless no layout is fair with it.
 */
export function pickBoard(o: {
  day: string;
  level: LevelKey;
  real: readonly RealColony[];
  mutation: Mutation;
  mutationBy: 'players' | 'rats';
  wakeDelay: number;
  zeroSeed: string;
  bestSamples?: number;
  healthSamples?: number;
}): PickedBoard {
  const muts: Mutation[] = o.mutation === 'none' ? ['none'] : [o.mutation, 'none'];
  const order: { variant: number; mutation: Mutation }[] = [];
  if (o.mutationBy === 'rats') {
    for (let v = 0; v < LAYOUT_VARIANTS; v++) for (const m of muts) order.push({ variant: v, mutation: m });
  } else {
    for (let v = 0; v < LAYOUT_VARIANTS; v++) order.push({ variant: v, mutation: o.mutation });
    if (o.mutation !== 'none') for (let v = 0; v < LAYOUT_VARIANTS; v++) order.push({ variant: v, mutation: 'none' });
  }
  const layouts = new Map<number, { ghosts: Ghost[]; slots: number[] }>();
  const layout = (v: number) => {
    let l = layouts.get(v);
    if (!l) {
      const raw = makeGhostsFromReal(o.day, o.real, v);
      l = { ghosts: withZero(raw.ghosts, o.zeroSeed, v), slots: raw.slots };
      layouts.set(v, l);
    }
    return l;
  };
  let fallback: { variant: number; mutation: Mutation; health: BoardHealth } | null = null;
  const finish = (variant: number, mutation: Mutation, health: BoardHealth, best: { best: number; seeds: Point[] }): PickedBoard => {
    const l = layout(variant);
    return {
      ghosts: l.ghosts,
      slots: l.slots,
      mutation,
      mutationCancelled: mutation !== o.mutation,
      best: best.best,
      bestSeeds: best.seeds,
      fc: forecastFactor(health),
      variant,
      health,
    };
  };
  const bestFor = (variant: number, mutation: Mutation) =>
    findBest(rngFromText(`best:${o.day}:${variant}`), o.level, layout(variant).ghosts, o.bestSamples ?? 1500, 3, o.wakeDelay, mutation);
  for (const c of order) {
    const { ghosts } = layout(c.variant);
    const health = boardHealth(`${o.day}:${c.variant}:${c.mutation}`, o.level, ghosts, o.wakeDelay, c.mutation, o.healthSamples);
    if (!fallback || health.zeroShare < fallback.health.zeroShare) fallback = { ...c, health };
    if (health.zeroShare > MAX_ZERO_SHARE) continue;
    const best = bestFor(c.variant, c.mutation);
    if (best.best >= MIN_BEST) return finish(c.variant, c.mutation, health, best);
  }
  const f = fallback ?? { variant: 0, mutation: o.mutation, health: boardHealth(o.day, o.level, layout(0).ghosts, o.wakeDelay, o.mutation) };
  return finish(f.variant, f.mutation, f.health, bestFor(f.variant, f.mutation));
}
