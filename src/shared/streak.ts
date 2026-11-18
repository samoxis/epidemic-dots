// Daily streak with a free "lazy day": miss one day a week and the streak survives. Players can hide it.
// Design rule: streaks always have a freeze and can be hidden, and nothing punishes missing a day beyond a reset.

import { weekKey } from './board.ts';

export type Streak = {
  /** Consecutive days played (a lazy day counts as kept, not as played). */
  days: number;
  /** Last UTC day (YYYY-MM-DD) the player ran a board. */
  last: string;
  /** ISO week (YYYY-Www) in which the free lazy day was used, if any. */
  freezeWeek: string | null;
  hidden: boolean;
};

export type StreakView = { days: number; freezeAvailable: boolean; hidden: boolean };

function gapDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** The streak after the player's first run of `today`. */
export function playStreak(prev: Streak | null, today: string): { streak: Streak; usedFreeze: boolean } {
  if (!prev) return { streak: { days: 1, last: today, freezeWeek: null, hidden: false }, usedFreeze: false };
  const gap = gapDays(prev.last, today);
  if (gap <= 0) return { streak: prev, usedFreeze: false };
  if (gap === 1) return { streak: { ...prev, days: prev.days + 1, last: today }, usedFreeze: false };
  if (gap === 2 && prev.freezeWeek !== weekKey(today)) {
    return { streak: { ...prev, days: prev.days + 1, last: today, freezeWeek: weekKey(today) }, usedFreeze: true };
  }
  return { streak: { ...prev, days: 1, last: today }, usedFreeze: false };
}

/** What the player sees today: the live streak (0 once it can no longer be saved) and whether the lazy day is left. */
export function streakView(s: Streak | null, today: string): StreakView | null {
  if (!s) return null;
  const gap = gapDays(s.last, today);
  const freezeAvailable = s.freezeWeek !== weekKey(today);
  const alive = gap <= 1 || (gap === 2 && freezeAvailable);
  return { days: alive ? s.days : 0, freezeAvailable, hidden: s.hidden };
}
