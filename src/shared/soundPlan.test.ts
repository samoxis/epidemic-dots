// Which sound plays when: the round cues and the result cue.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Frame } from './engine.ts';
import { infectedMine, resultCue, roundCues } from './soundPlan.ts';

const frame = (cells: [string | null, number][]): Frame => ({
  own: cells.map((c) => c[0]),
  inf: cells.map((c) => c[1]),
  dead: cells.map(() => false),
} as Frame);

test('counts only the player\'s infected cells', () => {
  assert.equal(infectedMine(frame([['me', -1], ['me', 3], ['A', 2], [null, -1]])), 1);
  assert.equal(infectedMine(undefined), 0);
});

test('a tick every round, a bwomp on the wake round', () => {
  const f = [frame([['me', -1]]), frame([['me', -1]]), frame([['me', -1]])];
  assert.deepEqual(roundCues(f, 1, 2), ['tick']);
  assert.deepEqual(roundCues(f, 2, 2), ['wake']);
});

test('a boing only when more of my dots got infected', () => {
  const f = [frame([['me', -1], ['me', -1]]), frame([['me', 1], ['me', -1]]), frame([['me', 1], ['me', -1]])];
  assert.deepEqual(roundCues(f, 1, 3), ['tick', 'hit']);
  assert.deepEqual(roundCues(f, 2, 3), ['tick']);
});

test('cheer only when the lab was beaten', () => {
  assert.equal(resultCue(14, 9), 'cheer');
  assert.equal(resultCue(9, 9), 'meh');
  assert.equal(resultCue(5, 9), 'meh');
});
