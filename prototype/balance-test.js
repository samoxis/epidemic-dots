// Balance test: random 3-seed placements per strain level.
// Usage: node prototype/balance-test.js [trials]
'use strict';

const E = require('./engine');

const trials = Number(process.argv[2]) || 4000;
const occupied = new Set();
E.GHOSTS.forEach((g) => g.seeds.forEach(([x, y]) => occupied.add(x + ',' + y)));

function randomSeeds() {
  const mine = [];
  while (mine.length < 3) {
    const x = Math.floor(Math.random() * E.N), y = Math.floor(Math.random() * E.N);
    if (occupied.has(x + ',' + y) || mine.some((p) => p[0] === x && p[1] === y)) continue;
    mine.push([x, y]);
  }
  return mine;
}

for (const level of Object.keys(E.LEVELS)) {
  let wins = 0, podium = 0, ratioSum = 0, ratioN = 0, beatForecast = 0;
  for (let t = 0; t < trials; t++) {
    const mine = randomSeeds();
    const result = E.runSim(mine, false, level, true);
    const rows = E.scoreBoard(result, mine, false, 6);
    const me = rows.find((r) => r.id === 'me');
    const rank = 1 + rows.filter((r) => r.cells > me.cells).length;
    if (rank === 1) wins++;
    if (rank <= 3) podium++;
    const clean = E.myCells(E.aliveOf(E.runSim(mine, false, level, false).frames[E.ROUNDS]), false);
    if (clean) { ratioSum += me.cells / clean; ratioN++; }
    if (me.cells > E.forecast(mine, false, level)) beatForecast++;
  }
  const pct = (n) => (n / trials * 100).toFixed(1) + '%';
  console.log(
    `${level.padEnd(6)} win ${pct(wins).padStart(6)}  podium ${pct(podium).padStart(6)}  ` +
    `beat forecast ${pct(beatForecast).padStart(6)}  survival ratio ${(ratioSum / ratioN).toFixed(2)}`
  );
}
