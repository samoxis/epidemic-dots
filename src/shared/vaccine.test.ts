import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, ROUNDS, VACCINE_WAKE_DELAY, aliveOf, myCells, randomSeeds, runSim, type LevelKey } from './engine.ts';
import { mulberry32 } from './rng.ts';

test('a wake delay moves the first infection by exactly that many rounds', () => {
  for (const level of Object.keys(LEVELS) as LevelKey[]) {
    const wake = LEVELS[level].wake;
    const plain = runSim([[4, 4], [8, 8], [3, 9]], false, level).frames;
    const delayed = runSim([[4, 4], [8, 8], [3, 9]], false, level, true, undefined, VACCINE_WAKE_DELAY).frames;
    const firstSick = (frames: typeof plain) => frames.findIndex((f) => f.inf.some((v) => v >= 0));
    assert.equal(firstSick(plain), wake);
    assert.equal(firstSick(delayed), wake + VACCINE_WAKE_DELAY);
  }
});

test('a Vaccine day is gentler: random players keep more dots on average', () => {
  for (const level of Object.keys(LEVELS) as LevelKey[]) {
    const mean = (delay: number) => {
      const rng = mulberry32(2024);
      let sum = 0;
      for (let i = 0; i < 1500; i++) {
        const last = runSim(randomSeeds(rng), false, level, true, undefined, delay).frames[ROUNDS];
        sum += last ? myCells(aliveOf(last), false) : 0;
      }
      return sum / 1500;
    };
    assert.ok(mean(VACCINE_WAKE_DELAY) > mean(0), `${level}: vaccine day should help`);
  }
});

test('wake delay of zero is identical to the default', () => {
  const a = runSim([[4, 4], [8, 8], [3, 9]], false, 'hard');
  const b = runSim([[4, 4], [8, 8], [3, 9]], false, 'hard', true, undefined, 0);
  assert.deepEqual(a, b);
});
