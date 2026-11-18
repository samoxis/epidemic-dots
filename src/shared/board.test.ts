import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayKey, labRatName, levelForDay, makeGhosts, makeGhostsFromReal, secondsToReset, weekKey } from './board.ts';
import { N } from './engine.ts';

test('day key is the UTC date', () => {
  assert.equal(dayKey(new Date('2026-12-01T23:59:59Z')), '2026-12-01');
  assert.equal(dayKey(new Date('2026-12-02T00:00:00Z')), '2026-12-02');
});

test('strain follows the weekday: Mon easy, Wed medium, Fri hard', () => {
  assert.equal(levelForDay('2026-11-30'), 'easy'); // Monday
  assert.equal(levelForDay('2026-12-02'), 'medium'); // Wednesday
  assert.equal(levelForDay('2026-12-04'), 'hard'); // Friday
});

test('seconds to reset counts down to the next UTC midnight', () => {
  assert.equal(secondsToReset(new Date('2026-12-01T23:59:00Z')), 60);
  assert.equal(secondsToReset(new Date('2026-12-01T00:00:00Z')), 86400);
});

test('week key groups Monday to Sunday', () => {
  assert.equal(weekKey('2026-11-30'), weekKey('2026-12-06'));
  assert.notEqual(weekKey('2026-12-06'), weekKey('2026-12-07'));
});

test('ghosts are reproducible per day and differ between days', () => {
  assert.deepEqual(makeGhosts('2026-12-01'), makeGhosts('2026-12-01'));
  assert.notDeepEqual(makeGhosts('2026-12-01'), makeGhosts('2026-12-02'));
});

test('every generated board is valid for 120 days', () => {
  for (let i = 0; i < 120; i++) {
    const day = dayKey(new Date(Date.UTC(2026, 11, 1 + i)));
    const ghosts = makeGhosts(day);
    assert.equal(ghosts.length, 6);
    assert.equal(ghosts.filter((g) => g.zero).length, 1, `exactly one Patient Zero on ${day}`);
    const seen = new Set<string>();
    for (const g of ghosts) {
      assert.ok(g.seeds.length === 2 || g.seeds.length === 3);
      for (const [x, y] of g.seeds) {
        assert.ok(x >= 0 && y >= 0 && x < N && y < N, `seed on the board (${day})`);
        const k = `${x},${y}`;
        assert.ok(!seen.has(k), `no overlapping seeds (${day})`);
        seen.add(k);
      }
    }
    // Colonies of different ids keep their distance.
    for (const a of ghosts) {
      for (const b of ghosts) {
        if (a.id === b.id) continue;
        for (const [ax, ay] of a.seeds) {
          for (const [bx, by] of b.seeds) assert.ok(Math.max(Math.abs(ax - bx), Math.abs(ay - by)) >= 3, `gap on ${day}`);
        }
      }
    }
  }
});

test('lab rat names are stable and anonymous', () => {
  assert.equal(labRatName('t2_abc'), labRatName('t2_abc'));
  assert.match(labRatName('t2_abc'), /^lab rat #\d{3}$/);
});

test('real colonies become ghosts, the rest are bots, and the board stays valid', () => {
  const real = [
    { slot: 1, seeds: [[0, 0], [5, 5], [11, 11]] },
    { slot: 2, seeds: [[1, 0], [6, 6], [10, 10]] }, // too close to slot 1: skipped
    { slot: 3, seeds: [[3, 8], [4, 9], [3, 10]] },
  ] as const;
  for (let i = 0; i < 30; i++) {
    const day = dayKey(new Date(Date.UTC(2026, 11, 1 + i)));
    const { ghosts, slots } = makeGhostsFromReal(day, real);
    assert.deepEqual(makeGhostsFromReal(day, real), { ghosts, slots }, 'reproducible');
    assert.equal(ghosts.length, 6);
    assert.equal(slots.length, 6);
    assert.equal(ghosts.filter((g) => g.zero).length, 1);
    assert.ok(slots.includes(1) && slots.includes(3) && !slots.includes(2), `real colonies used (${day})`);
    assert.equal(slots.filter((s) => s === 0).length, 4);
    const seen = new Set<string>();
    for (const g of ghosts) {
      for (const [x, y] of g.seeds) {
        assert.ok(x >= 0 && y >= 0 && x < N && y < N);
        assert.ok(!seen.has(`${x},${y}`), 'no overlapping seeds');
        seen.add(`${x},${y}`);
      }
    }
  }
});

test('with no usable real colonies the day falls back to all-bot ghosts', () => {
  const out = makeGhostsFromReal('2026-12-01', [{ slot: 1, seeds: [[0, 0], [0, 0], [1, 1]] }]);
  assert.deepEqual(out.ghosts, makeGhosts('2026-12-01'));
  assert.deepEqual(out.slots, [0, 0, 0, 0, 0, 0]);
});

test('six real colonies fill the whole board', () => {
  const real = [0, 1, 2, 3, 4, 5].map((i) => ({ slot: i + 1, seeds: [[(i % 3) * 4, Math.floor(i / 3) * 6], [(i % 3) * 4 + 1, Math.floor(i / 3) * 6 + 1], [(i % 3) * 4 + 2, Math.floor(i / 3) * 6] ] as [number, number][] }));
  const { slots } = makeGhostsFromReal('2026-12-03', real);
  assert.deepEqual([...slots].sort(), [1, 2, 3, 4, 5, 6]);
});
