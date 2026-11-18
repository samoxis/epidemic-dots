import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LEVELS,
  MUTATIONS,
  ROUNDS,
  aliveOf,
  calibratedGoal,
  effectiveStrain,
  findBest,
  myCells,
  randomSeeds,
  runSim,
  type LevelKey,
  type Mutation,
} from './engine.ts';
import { makeGhosts } from './board.ts';
import { mulberry32 } from './rng.ts';

const levels = Object.keys(LEVELS) as LevelKey[];

test('effective strain: vaccine delay, mutations and their limits', () => {
  assert.deepEqual(effectiveStrain('medium', 0, 'none'), { wake: 3, jump: 2, every: 2 });
  assert.deepEqual(effectiveStrain('medium', 2, 'none'), { wake: 5, jump: 2, every: 2 });
  assert.deepEqual(effectiveStrain('easy', 0, 'zoomier'), { wake: 3, jump: 1, every: 1 });
  assert.deepEqual(effectiveStrain('hard', 0, 'jumpier'), { wake: 3, jump: 3, every: 2 });
  assert.deepEqual(effectiveStrain('easy', 0, 'jumpier'), { wake: 3, jump: 2, every: 2 });
  assert.deepEqual(effectiveStrain('medium', 0, 'grumpier'), { wake: 2, jump: 2, every: 2 });
  assert.equal(effectiveStrain('hard', 0, 'grumpier').wake, 1);
});

test('a grumpier day starts the plague one round earlier', () => {
  const ghosts = makeGhosts('2026-12-02');
  const first = (m: Mutation) => runSim([[4, 4], [8, 8], [3, 9]], false, 'medium', true, ghosts, 0, m).frames.findIndex((f) => f.inf.some((v) => v >= 0));
  assert.equal(first('none'), 3);
  assert.equal(first('grumpier'), 2);
});

test('every mutation changes the outcome and keeps every strain playable', () => {
  const ghosts = makeGhosts('2026-12-02');
  for (const level of levels) {
    const base = findBest(mulberry32(1), level, ghosts).best;
    for (const m of MUTATIONS) {
      const { best } = findBest(mulberry32(1), level, ghosts, 1500, 3, 0, m);
      assert.ok(best >= 8, `${level}/${m}: best possible ${best} is too low to be playable`);
      // The mutation must matter somewhere: different best possible or different random-play result.
      const rng = mulberry32(3);
      let differs = best !== base;
      for (let i = 0; i < 300 && !differs; i++) {
        const seeds = randomSeeds(rng, ghosts);
        const a = runSim(seeds, false, level, true, ghosts, 0, 'none').frames[ROUNDS];
        const b = runSim(seeds, false, level, true, ghosts, 0, m).frames[ROUNDS];
        if (a && b && myCells(aliveOf(a), false) !== myCells(aliveOf(b), false)) differs = true;
      }
      assert.ok(differs, `${level}/${m} changes nothing`);
    }
  }
});

test('calibrated goal is reproducible, bounded and close to the static goal on a plain day', () => {
  const ghosts = makeGhosts('2026-12-02');
  for (const level of levels) {
    const best = findBest(mulberry32(9), level, ghosts).best;
    const g1 = calibratedGoal(mulberry32(4), level, ghosts, best, 0, 'none');
    const g2 = calibratedGoal(mulberry32(4), level, ghosts, best, 0, 'none');
    assert.equal(g1, g2);
    assert.ok(g1 >= 30 && g1 <= 90);
    assert.ok(Math.abs(g1 - LEVELS[level].teamGoal) <= 12, `${level}: calibrated ${g1} vs static ${LEVELS[level].teamGoal}`);
  }
});
