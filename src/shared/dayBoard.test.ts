// Daily boards must stay fair on real dates, not just on one hand-picked layout: a benchmark worth chasing, few
// empty-handed random runs, and a lab forecast that can be beaten. Swept over 40 consecutive days with no real
// players and the lab rats' mutation, which is the common case in a small subreddit.
// Run on its own: node --experimental-strip-types --test src/shared/dayBoard.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { levelForDay, dayKey } from './board.ts';
import { ratMutation } from './bots.ts';
import { MAX_ZERO_SHARE, MIN_BEST, cleanKept, labForecast, pickBoard } from './dayBoard.ts';
import { randomSeeds } from './engine.ts';
import { rngFromText } from './rng.ts';

const DAYS = 40;
const start = Date.UTC(2026, 10, 18); // the day the floor was introduced: a board with a benchmark of 4

test(`boards over ${DAYS} days meet the fairness floor`, () => {
  let unfair = 0;
  let cancelled = 0;
  const report: string[] = [];
  for (let d = 0; d < DAYS; d++) {
    const day = dayKey(new Date(start + d * 86400000));
    const level = levelForDay(day);
    const b = pickBoard({ day, level, real: [], mutation: ratMutation(day), mutationBy: 'rats', wakeDelay: 0, zeroSeed: 'test', bestSamples: 400, healthSamples: 80 });
    assert.equal(b.ghosts.filter((g) => g.zero).length, 1, `${day}: exactly one Patient Zero`);
    if (b.mutationCancelled) cancelled++;
    if (b.best < MIN_BEST || b.health.zeroShare > MAX_ZERO_SHARE) {
      unfair++;
      report.push(`${day} ${level} best ${b.best} zero ${Math.round(b.health.zeroShare * 100)}%`);
    }
    // the forecast can always be beaten without beating the benchmark
    const rng = rngFromText(`fc:${day}`);
    for (let i = 0; i < 20; i++) {
      const f = labForecast(cleanKept(randomSeeds(rng, b.ghosts), level, b.ghosts), b.fc, b.best);
      assert.ok(f >= 1 && f <= Math.max(1, b.best - 1), `${day}: forecast ${f} vs benchmark ${b.best}`);
    }
  }
  assert.ok(unfair <= 1, `unfair boards: ${unfair}\n${report.join('\n')}`);
  // the rats' twist is kept on most days; it is only dropped when it breaks the board
  assert.ok(cancelled <= DAYS / 3, `mutations cancelled on ${cancelled} of ${DAYS} days`);
});

test('a players-voted mutation is kept when the board stays fair with it', () => {
  // 2026-11-22 (easy, zoomier) was fair with its mutation before the floor existed
  const b = pickBoard({ day: '2026-11-22', level: levelForDay('2026-11-22'), real: [], mutation: 'zoomier', mutationBy: 'players', wakeDelay: 0, zeroSeed: 'x', bestSamples: 400, healthSamples: 80 });
  assert.equal(b.mutation, 'zoomier');
  assert.equal(b.mutationCancelled, false);
});

test('Patient Zero depends on the server seed, not only on the date', () => {
  const zeros = new Set<string>();
  for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    const b = pickBoard({ day: '2026-11-22', level: 'easy', real: [], mutation: 'none', mutationBy: 'rats', wakeDelay: 0, zeroSeed: seed, bestSamples: 200, healthSamples: 40 });
    zeros.add(b.ghosts.find((g) => g.zero)?.id ?? '?');
  }
  assert.ok(zeros.size >= 2, 'different seeds should pick different Patient Zeros');
});

test('the forecast never reaches the benchmark', () => {
  assert.equal(labForecast(40, 0.6, 30), 24);
  assert.equal(labForecast(40, 0.9, 30), 29);
  assert.equal(labForecast(40, 0.9, 1), 1);
  assert.equal(labForecast(0, 0.5, 20), 1);
});
