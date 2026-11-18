// Goal calibration: the daily team goal and the league promotion must ask for slightly better than random play
// (a random player who uses all ATTEMPTS_PER_DAY runs and keeps the best), and a random player should reach them
// often enough that success stays frequent. Seeded, so reproducible.
// Run on its own: node --experimental-strip-types --test src/shared/goals.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ATTEMPTS_PER_DAY, LEVELS, PROMOTION_IMMUNITY, ROUNDS, aliveOf, findBest, immunityScore, myCells, randomSeeds, runSim, type LevelKey } from './engine.ts';
import { mulberry32 } from './rng.ts';

const TRIALS = Number(process.env.GOAL_TRIALS) || 3000;
const means: number[] = [];

for (const [i, level] of (Object.keys(LEVELS) as LevelKey[]).entries()) {
  test(`team goal (${level}): above the random-play average, reachable by a good share of random players`, () => {
    const { best } = findBest(mulberry32(500 + i), level);
    const rng = mulberry32(900 + i);
    const goal = LEVELS[level].teamGoal;
    let sum = 0;
    let reach = 0;
    for (let t = 0; t < TRIALS; t++) {
      let imm = 0;
      for (let a = 0; a < ATTEMPTS_PER_DAY; a++) {
        const last = runSim(randomSeeds(rng), false, level).frames[ROUNDS];
        assert.ok(last);
        imm = Math.max(imm, immunityScore(myCells(aliveOf(last), false), best));
      }
      sum += imm;
      if (imm >= goal) reach++;
    }
    const mean = sum / TRIALS;
    const share = (reach / TRIALS) * 100;
    means.push(mean);
    console.log(`${level.padEnd(6)} best ${best}  random mean ${mean.toFixed(1)}%  goal ${goal}%  random reaches goal ${share.toFixed(1)}%`);
    assert.ok(mean < goal, `random mean ${mean.toFixed(1)}% should be below the goal ${goal}%`);
    assert.ok(goal - mean < 15, `goal ${goal}% is too far above the random mean ${mean.toFixed(1)}%`);
    assert.ok(share >= 18 && share <= 50, `random players reaching the goal: ${share.toFixed(1)}% (want 18-50%)`);
  });
}

test('league promotion: above the weekly random-play average', () => {
  assert.equal(means.length, 3);
  const weekly = means.reduce((s, m) => s + m, 0) / means.length;
  console.log(`weekly random mean ${weekly.toFixed(1)}%  promotion ${PROMOTION_IMMUNITY}%`);
  assert.ok(weekly < PROMOTION_IMMUNITY, `weekly random mean ${weekly.toFixed(1)}% should be below ${PROMOTION_IMMUNITY}%`);
  assert.ok(PROMOTION_IMMUNITY - weekly < 15);
});
