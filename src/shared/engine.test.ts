import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ALLY_ID,
  GHOSTS,
  LEVELS,
  N,
  ROUNDS,
  aliveOf,
  forecast,
  myCells,
  randomSeeds,
  runSim,
  scoreBoard,
  titleFor,
  type Ghost,
  type Point,
} from './engine.ts';
import { mulberry32 } from './rng.ts';

const lone: Ghost[] = [{ id: 'A', seeds: [[0, 0]] }];

test('frames: start plus one per round, seeds placed', () => {
  const mine: Point[] = [[4, 4], [8, 8], [3, 9]];
  const { frames } = runSim(mine, false, 'easy');
  assert.equal(frames.length, ROUNDS + 1);
  const start = frames[0];
  assert.ok(start);
  for (const [x, y] of mine) assert.equal(start.own[y * N + x], 'me');
  for (const g of GHOSTS) for (const [x, y] of g.seeds) assert.equal(start.own[y * N + x], g.id);
});

test('a lone colony grows by one ring per round when the plague is off', () => {
  const { frames } = runSim([], false, 'easy', false, lone);
  const alive = (r: number) => aliveOf(frames[r]!).A;
  assert.equal(alive(0), 1);
  assert.equal(alive(1), 3); // (0,0) + right + below
  assert.ok((alive(ROUNDS) ?? 0) > (alive(1) ?? 0));
});

test('an empty square touched by two different colonies stays empty', () => {
  const two: Ghost[] = [
    { id: 'A', seeds: [[0, 0]] },
    { id: 'B', seeds: [[2, 0]] },
  ];
  const { frames } = runSim([], false, 'easy', false, two);
  assert.equal(frames[1]!.own[1], null);
});

test('allies merge: the contested square joins the team', () => {
  // Player at (0,0) and ally D at (2,0): square (1,0) is claimed when they are teamed up.
  const g: Ghost[] = [{ id: ALLY_ID, seeds: [[2, 0]] }];
  const apart = runSim([[0, 0]], false, 'easy', false, g).frames[1]!;
  const together = runSim([[0, 0]], true, 'easy', false, g).frames[1]!;
  assert.equal(apart.own[1], null);
  assert.notEqual(together.own[1], null);
});

test('no plague means no infection and no touched colonies', () => {
  const r = runSim([[4, 4], [8, 8], [3, 9]], false, 'hard', false);
  assert.deepEqual(r.touched, {});
  assert.equal(r.firstHit, 0);
  assert.ok(r.frames.every((f) => f.inf.every((v) => v === -1)));
});

test('the plague wakes in Patient Zero on the wake round', () => {
  for (const key of Object.keys(LEVELS) as (keyof typeof LEVELS)[]) {
    const wake = LEVELS[key].wake;
    const { frames } = runSim([[4, 0], [8, 0], [11, 5]], false, key);
    const before = frames[wake - 1]!;
    const at = frames[wake]!;
    assert.ok(before.inf.every((v) => v === -1));
    assert.ok(at.inf.some((v) => v === wake));
    // Every infected cell at wake belongs to Patient Zero (C).
    at.inf.forEach((v, i) => {
      if (v === wake) assert.equal(at.own[i], 'C');
    });
  }
});

test('infected cells die two rounds later and stay dead', () => {
  const { frames } = runSim([[4, 4], [8, 8], [3, 9]], false, 'medium');
  const last = frames[ROUNDS]!;
  last.inf.forEach((v, i) => {
    if (v >= 0 && v <= ROUNDS - 2) assert.equal(last.dead[i], true);
  });
});

test('scoring formula: cells x 10 + clean bonus + podium, times streak multiplier', () => {
  const mine: Point[] = [[4, 4], [8, 8], [3, 9]];
  const result = runSim(mine, false, 'easy');
  const rows = scoreBoard(result, false, 6);
  assert.equal(rows.length, GHOSTS.length + 1);
  rows.forEach((row, i) => {
    assert.equal(row.pos, i + 1);
    const podium = [100, 60, 30][i] ?? 0;
    const mult = row.id === 'me' ? 1.3 : 1;
    assert.equal(row.points, Math.round((row.cells * 10 + (row.clean && row.cells > 0 ? 50 : 0) + podium) * mult));
  });
  // Sorted by cells, descending.
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1]!.cells >= rows[i]!.cells);
});

test('with an ally the ally row disappears and cells are shared', () => {
  const result = runSim([[4, 4], [8, 8], [3, 9]], true, 'easy');
  const rows = scoreBoard(result, true, 0);
  assert.equal(rows.length, GHOSTS.length);
  assert.ok(rows.every((r) => r.id !== ALLY_ID));
  const alive = aliveOf(result.frames[ROUNDS]!);
  assert.equal(myCells(alive, true), Math.round(((alive.me ?? 0) + (alive[ALLY_ID] ?? 0)) / 2));
});

test('forecast needs 3 seeds and is at least 1', () => {
  assert.equal(forecast([[4, 4]], false, 'easy'), 0);
  assert.ok(forecast([[4, 4], [8, 8], [3, 9]], false, 'hard') >= 1);
});

test('titles follow the xp thresholds', () => {
  assert.equal(titleFor(0).cur[1], 'Lonely Spore');
  assert.equal(titleFor(499).cur[1], 'Lonely Spore');
  assert.equal(titleFor(500).cur[1], 'Mildly Cultured');
  assert.equal(titleFor(4000).cur[1], 'Supreme Petri Overlord');
  assert.equal(titleFor(4000).nxt, null);
});

test('randomSeeds: distinct, on the board, off the ghosts, reproducible', () => {
  const a = randomSeeds(mulberry32(5));
  const b = randomSeeds(mulberry32(5));
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((p) => `${p[0]},${p[1]}`)).size, 3);
  const taken = new Set(GHOSTS.flatMap((g) => g.seeds.map((p) => `${p[0]},${p[1]}`)));
  for (const [x, y] of a) {
    assert.ok(x >= 0 && x < N && y >= 0 && y < N);
    assert.ok(!taken.has(`${x},${y}`));
  }
});
