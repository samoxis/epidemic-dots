// Weekly leagues. You move up when your average immunity this week reaches the promotion line, one step per week,
// and you never move down. Rank inside a league is not shown here; only the league itself.

import { PROMOTION_IMMUNITY } from './engine.ts';

export const LEAGUES = ['Sniffle', 'Cough', 'Fever', 'Outbreak', 'Pandemic'] as const;

export function leagueName(index: number): string {
  return LEAGUES[Math.max(0, Math.min(LEAGUES.length - 1, Math.floor(index)))] ?? 'Sniffle';
}

/** League after a play. `promotedThisWeek` stops a second step in the same week. */
export function nextLeague(index: number, weekAvg: number, promotedThisWeek: boolean): { index: number; promoted: boolean } {
  const top = LEAGUES.length - 1;
  if (promotedThisWeek || index >= top || weekAvg < PROMOTION_IMMUNITY) return { index: Math.min(index, top), promoted: false };
  return { index: index + 1, promoted: true };
}
