// Daily board: which strain runs today and where the other colonies start.
// Everything is derived from the date, so the server and the client always agree and a day can be replayed.

import { N, type Ghost, type LevelKey, type Point } from './engine.ts';
import { randomInt, rngFromText, type Rng } from './rng.ts';

/** Strain by weekday, indexed by Date#getUTCDay (0 = Sunday). Mon/Wed/Fri follow the design; other days borrow. */
const STRAIN_BY_UTC_DAY: readonly LevelKey[] = ['easy', 'easy', 'easy', 'medium', 'medium', 'hard', 'medium'];

/** UTC date as YYYY-MM-DD. The game day rolls over at 00:00 UTC. */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function levelForDay(day: string): LevelKey {
  const d = new Date(`${day}T00:00:00Z`);
  return STRAIN_BY_UTC_DAY[d.getUTCDay()] ?? 'medium';
}

/** Seconds until the next UTC midnight. */
export function secondsToReset(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(0, Math.floor((next - now.getTime()) / 1000));
}

/** ISO-ish week key (YYYY-Www) used for weekly league averages. */
export function weekKey(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this week decides the year
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const SEED_COUNTS = [2, 2, 2, 2, 3, 3];
const IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MIN_GAP = 3; // Chebyshev distance between seeds of different colonies

function cluster(rng: Rng, count: number): Point[] | null {
  const x0 = randomInt(rng, N - 3);
  const y0 = randomInt(rng, N - 3);
  const flip = rng() < 0.5 ? 1 : -1;
  const pts: Point[] = [[x0, flip === 1 ? y0 : y0 + 2]];
  for (let k = 1; k < count; k++) {
    const last = pts[k - 1];
    if (!last) return null;
    const dy = (k % 2 === 1 ? flip : -flip) * (rng() < 0.3 ? 0 : 1);
    pts.push([last[0] + 1, last[1] + dy]);
  }
  return pts.every(([x, y]) => x >= 0 && y >= 0 && x < N && y < N) ? pts : null;
}

function farEnough(a: readonly Point[], b: readonly Point[]): boolean {
  return a.every(([ax, ay]) => b.every(([bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) >= MIN_GAP));
}

/** The six other colonies of a day, one of them secretly Patient Zero. Anonymous "lab rats" until real placements exist. */
export function makeGhosts(day: string): Ghost[] {
  // The first layouts that fit win; a day whose draw does not fit simply redraws with the next sub-seed.
  for (let retry = 0; retry < 200; retry++) {
    const rng = rngFromText(retry === 0 ? `ghosts:${day}` : `ghosts:${day}:${retry}`);
    const placed: Ghost[] = [];
    for (let i = 0; i < IDS.length; i++) {
      const want = SEED_COUNTS[i] ?? 2;
      let seeds: Point[] | null = null;
      for (let attempt = 0; attempt < 300 && !seeds; attempt++) {
        const c = cluster(rng, want);
        if (c && placed.every((g) => farEnough(c, g.seeds))) seeds = c;
      }
      if (!seeds) break;
      placed.push({ id: IDS[i] ?? `G${i}`, seeds });
    }
    if (placed.length === IDS.length) {
      const zero = randomInt(rng, placed.length);
      return placed.map((g, i) => (i === zero ? { ...g, zero: true } : g));
    }
  }
  // Practically unreachable, but keeps the day playable: a fixed, valid layout.
  return [
    { id: 'A', seeds: [[1, 1], [2, 2]] },
    { id: 'B', seeds: [[9, 1], [10, 2]] },
    { id: 'C', seeds: [[1, 9], [2, 10]], zero: true },
    { id: 'D', seeds: [[5, 5], [6, 6]] },
    { id: 'E', seeds: [[10, 9], [9, 10]] },
    { id: 'F', seeds: [[5, 10], [6, 9], [7, 10]] },
  ];
}

/** A real player's best placement from yesterday, identified only by an anonymous slot number (never a user id). */
export type RealColony = { slot: number; seeds: readonly Point[] };

const REAL_GAP = 2; // real colonies only need a free square between them

function gapBetween(a: readonly Point[], b: readonly Point[], gap: number): boolean {
  return a.every(([ax, ay]) => b.every(([bx, by]) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) >= gap));
}

function validReal(seeds: readonly Point[]): boolean {
  return (
    seeds.length === 3 &&
    seeds.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < N && y < N) &&
    new Set(seeds.map(([x, y]) => `${x},${y}`)).size === 3
  );
}

/**
 * The six other colonies of a day. Up to six of them are yesterday's real placements (anonymous); the rest are
 * lab-rat bot colonies. `slots[i]` is the anonymous slot behind ghosts[i], or 0 for a bot colony.
 * Deterministic for a given day and set of placements.
 */
export function makeGhostsFromReal(day: string, real: readonly RealColony[]): { ghosts: Ghost[]; slots: number[] } {
  const base = [...real].filter((r) => validReal(r.seeds)).sort((a, b) => a.slot - b.slot);
  if (base.length === 0) return { ghosts: makeGhosts(day), slots: IDS.map(() => 0) };
  for (let retry = 0; retry < 200; retry++) {
    const rng = rngFromText(`realghosts:${day}:${retry}`);
    const pool = [...base];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randomInt(rng, i + 1);
      const t = pool[i];
      const u = pool[j];
      if (t && u) {
        pool[i] = u;
        pool[j] = t;
      }
    }
    const placed: { seeds: Point[]; slot: number }[] = [];
    for (const r of pool) {
      if (placed.length >= IDS.length) break;
      const seeds = r.seeds.map(([x, y]): Point => [x, y]);
      if (placed.every((p) => gapBetween(seeds, p.seeds, REAL_GAP))) placed.push({ seeds, slot: r.slot });
    }
    let ok = true;
    while (placed.length < IDS.length) {
      let seeds: Point[] | null = null;
      for (let attempt = 0; attempt < 300 && !seeds; attempt++) {
        const c = cluster(rng, placed.length % 3 === 2 ? 3 : 2);
        if (c && placed.every((p) => gapBetween(c, p.seeds, MIN_GAP))) seeds = c;
      }
      if (!seeds) {
        ok = false;
        break;
      }
      placed.push({ seeds, slot: 0 });
    }
    if (!ok) continue;
    for (let i = placed.length - 1; i > 0; i--) {
      const j = randomInt(rng, i + 1);
      const t = placed[i];
      const u = placed[j];
      if (t && u) {
        placed[i] = u;
        placed[j] = t;
      }
    }
    const zero = randomInt(rng, placed.length);
    return {
      ghosts: placed.map((p, i) => ({ id: IDS[i] ?? `G${i}`, seeds: p.seeds, ...(i === zero ? { zero: true } : {}) })),
      slots: placed.map((p) => p.slot),
    };
  }
  return { ghosts: makeGhosts(day), slots: IDS.map(() => 0) };
}

/** Anonymous label for a player, stable per player id. */
export function labRatName(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return `lab rat #${100 + (h % 900)}`;
}
