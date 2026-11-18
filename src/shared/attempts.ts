import type { PlayResult } from './api.ts';

export type AttemptUpdate = {
  /** The run that counts: the better of the stored best and the new run. */
  best: PlayResult;
  /** True for the player's first run of the day (they join the day's stats). */
  first: boolean;
  /** Change in immunity score to apply to the day's and week's sums (0 when the new run is not better). */
  delta: number;
};

/** A player gets several runs a day; only the best counts. Ties keep the earlier run. */
export function mergeAttempt(prev: PlayResult | null, next: PlayResult): AttemptUpdate {
  if (!prev) return { best: next, first: true, delta: next.immunity };
  if (next.immunity > prev.immunity) return { best: next, first: false, delta: next.immunity - prev.immunity };
  return { best: prev, first: false, delta: 0 };
}
