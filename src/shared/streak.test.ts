// Streaks: one free lazy day per week, never more; hiding is kept across days.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playStreak, streakView, type Streak } from './streak.ts';

test('first run starts a streak; same day does not count twice', () => {
  const a = playStreak(null, '2026-11-18').streak;
  assert.equal(a.days, 1);
  assert.equal(playStreak(a, '2026-11-18').streak.days, 1);
});

test('consecutive days grow the streak', () => {
  let s: Streak | null = null;
  for (const d of ['2026-11-16', '2026-11-17', '2026-11-18']) s = playStreak(s, d).streak;
  assert.equal(s?.days, 3);
});

test('one missed day is forgiven once per week', () => {
  const s = { days: 4, last: '2026-11-16', freezeWeek: null, hidden: false }; // Monday
  const r = playStreak(s, '2026-11-18'); // missed Tuesday
  assert.equal(r.usedFreeze, true);
  assert.equal(r.streak.days, 5);
  const again = playStreak({ ...r.streak, last: '2026-11-18' }, '2026-11-20'); // missed Thursday, same week
  assert.equal(again.streak.days, 1);
  assert.equal(again.usedFreeze, false);
});

test('the lazy day comes back the next week', () => {
  const s = { days: 6, last: '2026-11-21', freezeWeek: '2026-W47', hidden: false }; // Saturday, freeze used this week
  const r = playStreak(s, '2026-11-23'); // missed Sunday, Monday is a new week
  assert.equal(r.usedFreeze, true);
  assert.equal(r.streak.days, 7);
});

test('two missed days reset the streak but keep it hidden if hidden', () => {
  const s = { days: 9, last: '2026-11-10', freezeWeek: null, hidden: true };
  const r = playStreak(s, '2026-11-13');
  assert.equal(r.streak.days, 1);
  assert.equal(r.streak.hidden, true);
});

test('the view shows 0 once the streak can no longer be saved', () => {
  const s = { days: 5, last: '2026-11-16', freezeWeek: null, hidden: false };
  assert.equal(streakView(s, '2026-11-17')?.days, 5);
  assert.equal(streakView(s, '2026-11-18')?.days, 5); // still savable with the lazy day
  assert.equal(streakView(s, '2026-11-19')?.days, 0);
  assert.equal(streakView(null, '2026-11-19'), null);
});
