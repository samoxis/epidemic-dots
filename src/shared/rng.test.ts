import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashSeed, mulberry32, randomInt, rngFromText } from './rng.ts';

test('same seed gives the same sequence', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('different seeds give different sequences', () => {
  const a = Array.from({ length: 10 }, mulberry32(1));
  const b = Array.from({ length: 10 }, mulberry32(2));
  assert.notDeepEqual(a, b);
});

test('values stay in [0, 1) and randomInt stays in [0, n)', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 10_000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1);
  }
  const r2 = mulberry32(8);
  const seen = new Set<number>();
  for (let i = 0; i < 10_000; i++) seen.add(randomInt(r2, 12));
  assert.deepEqual([...seen].sort((x, y) => x - y), Array.from({ length: 12 }, (_, i) => i));
});

test('text seeds are stable and distinct', () => {
  assert.equal(hashSeed('2026-12-01:board-3'), hashSeed('2026-12-01:board-3'));
  assert.notEqual(hashSeed('2026-12-01:board-3'), hashSeed('2026-12-01:board-4'));
  assert.equal(rngFromText('x')(), rngFromText('x')());
});
