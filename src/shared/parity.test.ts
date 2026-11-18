// The TypeScript engine must behave exactly like the reference prototype (prototype/engine.js).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { randomSeeds, runSim, scoreBoard, forecast, type LevelKey } from './engine.ts';
import { mulberry32 } from './rng.ts';

interface Reference {
  runSim: (mine: unknown, ally: boolean, level: string, plague?: boolean) => unknown;
  scoreBoard: (result: unknown, mine: unknown, ally: boolean, streak: number) => unknown;
  forecast: (mine: unknown, ally: boolean, level: string) => number;
}

const ref = createRequire(import.meta.url)('../../prototype/engine.js') as Reference;

test('TypeScript port matches the prototype on 600 seeded placements', () => {
  const rng = mulberry32(20261117);
  const levels: LevelKey[] = ['easy', 'medium', 'hard'];
  for (let t = 0; t < 200; t++) {
    const mine = randomSeeds(rng);
    for (const level of levels) {
      for (const ally of [false, true]) {
        for (const plague of [true, false]) {
          assert.deepStrictEqual(runSim(mine, ally, level, plague), ref.runSim(mine, ally, level, plague));
        }
        const result = runSim(mine, ally, level);
        assert.deepStrictEqual(scoreBoard(result, ally, 6), ref.scoreBoard(result, mine, ally, 6));
        assert.equal(forecast(mine, ally, level), ref.forecast(mine, ally, level));
      }
    }
  }
});
