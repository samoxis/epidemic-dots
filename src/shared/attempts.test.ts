import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeAttempt } from './attempts.ts';
import type { PlayResult } from './api.ts';

const run = (immunity: number): PlayResult => ({ seeds: [[0, 0], [1, 1], [2, 2]], kept: immunity, immunity, clean: false, forecast: 5 });

test('first run of the day counts in full', () => {
  const u = mergeAttempt(null, run(40));
  assert.equal(u.first, true);
  assert.equal(u.delta, 40);
  assert.equal(u.best.immunity, 40);
});

test('a better run replaces the best and adds only the difference', () => {
  const u = mergeAttempt(run(40), run(55));
  assert.equal(u.first, false);
  assert.equal(u.delta, 15);
  assert.equal(u.best.immunity, 55);
});

test('a worse or equal run changes nothing', () => {
  const worse = mergeAttempt(run(40), run(30));
  assert.equal(worse.delta, 0);
  assert.equal(worse.best.immunity, 40);
  const tie = mergeAttempt(run(40), run(40));
  assert.equal(tie.delta, 0);
  assert.equal(tie.best.immunity, 40);
});
