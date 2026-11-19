import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shareText } from './share.ts';

test('share text shows the score and never any coordinates', () => {
  const t = shareText({ day: '2026-11-17', kept: 24, bestPossible: 36, immunity: 67, clean: false });
  assert.match(t, /Epidemic Dots, 17 Nov/);
  assert.match(t, /67% immune: I kept 24 of 36 dots\./);
  assert.ok(!/\[\d|\(\d+,/.test(t));
  assert.equal((t.match(/🟩/g) ?? []).length, 7);
});

test('clean runs say so and the bar stays within 10 squares', () => {
  const t = shareText({ day: '2026-12-01', kept: 40, bestPossible: 40, immunity: 100, clean: true });
  assert.match(t, /never touched me/);
  assert.equal((t.match(/🟩/g) ?? []).length + (t.match(/⬜/g) ?? []).length, 10);
});

test('lab-posted comments name the player, or stay anonymous when the name is hidden', () => {
  const named = shareText({ day: '2026-11-19', kept: 24, bestPossible: 36, immunity: 67, clean: true, who: 'u/samoxis' });
  assert.match(named, /u\/samoxis is 67% immune: kept 24 of 36 dots\. The germs never touched them\./);
  assert.match(named, /Posted by the lab/);
  assert.ok(!/\bI kept\b/.test(named));
  const hidden = shareText({ day: '2026-11-19', kept: 24, bestPossible: 36, immunity: 67, clean: false, who: null });
  assert.match(hidden, /stay anonymous is 67% immune/);
  assert.ok(!/u\//.test(hidden));
});
