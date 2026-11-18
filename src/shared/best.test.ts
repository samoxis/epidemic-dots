import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, ROUNDS, aliveOf, findBest, immunityScore, myCells, randomSeeds, runSim, type LevelKey } from './engine.ts';
import { mulberry32 } from './rng.ts';

// True optimum on the default ghost board, from scanning all 366,145 placements (17 Nov 2026).
const TRUE_BEST: Record<LevelKey, number> = { easy: 35, medium: 36, hard: 19 };

test('immunity score: percent of the best possible, capped at 100', () => {
  assert.equal(immunityScore(24, 36), 67);
  assert.equal(immunityScore(0, 36), 0);
  assert.equal(immunityScore(40, 36), 100);
  assert.equal(immunityScore(5, 0), 0);
});

for (const level of Object.keys(TRUE_BEST) as LevelKey[]) {
  test(`findBest is near the true optimum (${level})`, () => {
    const { best, seeds } = findBest(mulberry32(42), level);
    assert.ok(best <= TRUE_BEST[level], `cannot beat the true optimum: ${best} > ${TRUE_BEST[level]}`);
    assert.ok(best >= TRUE_BEST[level] - 2, `too far from the optimum: ${best} vs ${TRUE_BEST[level]}`);
    // The returned seeds really score `best`.
    const last = runSim(seeds, false, level).frames[ROUNDS];
    assert.ok(last);
    assert.equal(myCells(aliveOf(last), false), best);
  });
}

test('findBest is reproducible and beats a random placement', () => {
  const a = findBest(mulberry32(7), 'medium');
  const b = findBest(mulberry32(7), 'medium');
  assert.deepEqual(a, b);
  const rnd = randomSeeds(mulberry32(1));
  const last = runSim(rnd, false, 'medium').frames[ROUNDS];
  assert.ok(last);
  assert.ok(a.best >= myCells(aliveOf(last), false));
});

test('team goals ask for better than random play and rise from hard to easy', () => {
  assert.ok(LEVELS.easy.teamGoal > LEVELS.medium.teamGoal);
  assert.ok(LEVELS.medium.teamGoal > LEVELS.hard.teamGoal);
});
