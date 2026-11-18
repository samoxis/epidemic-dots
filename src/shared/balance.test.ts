// Balance test: random 3-seed placements per strain level, reproducible thanks to the seeded RNG.
// Target bands are the difficulty waves the game was designed around (easy Mon, spicy Wed, chaotic Fri). A rule
// change that moves a level out of its band must either be fixed or the bands below updated on purpose.
// Run on its own: npm run test:balance
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVELS, ROUNDS, aliveOf, forecast, myCells, randomSeeds, runSim, scoreBoard, type LevelKey } from './engine.ts';
import { mulberry32 } from './rng.ts';

const TRIALS = Number(process.env.BALANCE_TRIALS) || 4000;

// [min, max] in percent for win and podium rates; survival ratio is checked against the forecast factor.
const BANDS: Record<LevelKey, { win: [number, number]; podium: [number, number] }> = {
  easy: { win: [21, 29], podium: [48, 59] },
  medium: { win: [12, 21], podium: [56, 67] },
  hard: { win: [1, 7], podium: [54, 65] },
};

for (const level of Object.keys(LEVELS) as LevelKey[]) {
  test(`balance: ${level} (${LEVELS[level].name})`, () => {
    const rng = mulberry32(1000 + Object.keys(LEVELS).indexOf(level));
    let wins = 0;
    let podium = 0;
    let beatForecast = 0;
    let ratioSum = 0;
    let ratioN = 0;
    for (let t = 0; t < TRIALS; t++) {
      const mine = randomSeeds(rng);
      const result = runSim(mine, false, level, true);
      const rows = scoreBoard(result, false, 6);
      const me = rows.find((r) => r.id === 'me');
      assert.ok(me);
      const rank = 1 + rows.filter((r) => r.cells > me.cells).length;
      if (rank === 1) wins++;
      if (rank <= 3) podium++;
      const clean = myCells(aliveOf(runSim(mine, false, level, false).frames[ROUNDS]!), false);
      if (clean) {
        ratioSum += me.cells / clean;
        ratioN++;
      }
      if (me.cells > forecast(mine, false, level)) beatForecast++;
    }
    const pct = (n: number) => (n / TRIALS) * 100;
    const ratio = ratioSum / ratioN;
    console.log(
      `${level.padEnd(6)} win ${pct(wins).toFixed(1)}%  podium ${pct(podium).toFixed(1)}%  ` +
        `beat forecast ${pct(beatForecast).toFixed(1)}%  survival ratio ${ratio.toFixed(2)}`,
    );
    const b = BANDS[level];
    assert.ok(pct(wins) >= b.win[0] && pct(wins) <= b.win[1], `win rate ${pct(wins).toFixed(1)}% outside ${b.win}`);
    assert.ok(pct(podium) >= b.podium[0] && pct(podium) <= b.podium[1], `podium rate ${pct(podium).toFixed(1)}% outside ${b.podium}`);
    assert.ok(Math.abs(ratio - LEVELS[level].fc) < 0.03, `survival ratio ${ratio.toFixed(2)} vs forecast factor ${LEVELS[level].fc}`);
  });
}
