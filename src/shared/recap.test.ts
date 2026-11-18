// The daily recap comment: honest about bots, spoiler-tagged Patient Zero, gentle tone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recapText } from './recap.ts';

const base = { dateLabel: 'Tue, Nov 18', avgImmunity: 0, goal: 53, bestImmunity: null, zeroName: 'violet', vaccineToday: false, twist: null, cancelledTwist: null };

test('a quiet day says only the lab rats played', () => {
  const t = recapText({ ...base, players: 0 });
  assert.match(t, /only the lab rats showed up/);
  assert.doesNotMatch(t, /Goal/);
});

test('a played day reports players, average, goal and best run', () => {
  const t = recapText({ ...base, players: 2, avgImmunity: 61, bestImmunity: 100, vaccineToday: true });
  assert.match(t, /2 real players, average immunity 61% \(goal 53%\)/);
  assert.match(t, /Best run: 100%/);
  assert.match(recapText({ ...base, players: 2, bestImmunity: 90, bestName: 'u/spore' }), /Best run: 90% by u\/spore\./);
  assert.match(t, /Vaccine day/);
});

test('Patient Zero is behind a spoiler tag', () => {
  assert.match(recapText({ ...base, players: 1 }), />!the violet colony!</);
});

test('the twist says who picked it, and a cancelled twist is explained', () => {
  assert.match(recapText({ ...base, players: 1, twist: { name: 'Zoomier', by: 'rats' } }), /lab rats \(bots\)/);
  assert.match(recapText({ ...base, players: 1, cancelledTwist: 'Jumpier' }), /cancelled: it made the board unfair/);
});
