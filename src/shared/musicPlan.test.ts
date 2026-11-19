// The in-game tune: quiet while planting, full while the germs spread, and it stops by itself after the result.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEAT_S, BEATS_PER_BAR, CALM_BARS, ROUND_MS, barEvents } from './musicPlan.ts';

test('120 bpm, and one round of the run is exactly two beats', () => {
  assert.equal(60 / BEAT_S, 120);
  assert.equal(ROUND_MS / 1000 / BEAT_S, 2);
});

test('planting has no melody and fewer notes than the run', () => {
  for (let bar = 0; bar < 8; bar++) {
    const plant = barEvents('plant', bar);
    assert.ok(!plant.some((n) => n.voice === 'lead' || n.voice === 'hat'));
    assert.ok(plant.length < barEvents('run', bar).length);
  }
});

test('the run plays the motif and every note stays inside its bar', () => {
  assert.ok(barEvents('run', 0).some((n) => n.voice === 'lead'));
  for (const phase of ['plant', 'run', 'calm'] as const) {
    for (let bar = 0; bar < 8; bar++) {
      for (const n of barEvents(phase, bar)) {
        assert.ok(n.beat >= 0 && n.beat < BEATS_PER_BAR);
        assert.ok(n.vol > 0 && n.vol < 0.5);
      }
    }
  }
});

test('calm ends on a bom and a bell, then goes silent while people read', () => {
  const last = barEvents('calm', CALM_BARS - 1);
  assert.deepEqual(last.map((n) => n.voice).sort(), ['bass', 'bell']);
  assert.equal(barEvents('calm', CALM_BARS).length, 0);
  assert.equal(barEvents('calm', CALM_BARS + 5).length, 0);
});

test('the tune loops: bar 4 sounds like bar 0', () => {
  assert.deepEqual(barEvents('plant', 4), barEvents('plant', 0));
  assert.deepEqual(barEvents('run', 4), barEvents('run', 0));
});
