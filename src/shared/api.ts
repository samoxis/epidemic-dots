import type { Ghost, LevelKey, Mutation, Point } from './engine.ts';

export type StrainInfo = {
  level: LevelKey;
  /** Short label such as "Wed · Spicy". */
  label: string;
  /** Strain name such as "#7 HOPPER". */
  name: string;
  /** Effective wake round, already including a Vaccine day delay. */
  wake: number;
  /** True when yesterday's team goal was reached, so the germs sleep in today. */
  vaccine: boolean;
  /** Mutation voted yesterday and applied today ('none' when nobody voted). */
  mutation: Mutation;
  /** Who picked it: the players' vote, or the lab rats (bots) when nobody voted. */
  mutationBy: 'players' | 'rats' | 'none';
  /** A mutation that was picked but cancelled because it made today's board unfair, and who picked it. */
  cancelled?: { mutation: Mutation; by: 'players' | 'rats' };
  jump: number;
  every: number;
  /** Lab forecast factor. */
  fc: number;
  teamGoal: number;
};

export type PlayResult = {
  seeds: Point[];
  /** Dots that survived round 8. */
  kept: number;
  /** Kept dots as a percentage of the best possible, 0-100. */
  immunity: number;
  /** True when no germ ever touched the player's colony. */
  clean: boolean;
  /** The lab's prediction for this placement. */
  forecast: number;
};

export type NearRow = { name: string; immunity: number; you: boolean; bot: boolean; position: number };

export type StateResponse = {
  type: 'state';
  day: string;
  strain: StrainInfo;
  ghosts: Ghost[];
  bestPossible: number;
  /** Real players who played today. */
  players: number;
  /** Lab rats (bots) added so a small subreddit still has a rank and a team average. Always shown as bots. */
  bots: number;
  /** How many of today's six neighbour colonies are yesterday's real players (the rest are lab-rat bots). */
  realColonies: number;
  /** Id of today's colony that is the player's own best placement from yesterday, if it made the cut. */
  yourColony: string | null;
  /** Average best-run immunity of today's real players, 0-100 (lab rats never count). */
  avgImmunity: number;
  secondsToReset: number;
  /** The player's best run today, or null if they have not played. */
  played: PlayResult | null;
  attemptsUsed: number;
  maxAttempts: number;
  /** Votes cast today for tomorrow's mutation. */
  votes: { zoomier: number; jumpier: number; grumpier: number };
  myVote: Mutation | null;
  rank: { position: number; total: number; near: NearRow[] } | null;
  /** Average immunity over the days played this week. */
  week: { avg: number; days: number } | null;
  /** The player's league (never drops), and whether they were promoted this week. */
  league: { index: number; name: string; next: string | null; promotedThisWeek: boolean };
  /** True when the player opted in to showing their league as their flair in this subreddit. */
  flair: boolean;
  promotion: number;
  /** True once the player has posted today's score comment (one per day). */
  shared: boolean;
};

export type PlayRequest = { seeds: Point[] };
export type VoteRequest = { choice: Mutation };

export type ShareResponse = { status: 'ok'; url: string | null } | { status: 'error'; message: string };

export type FlairRequest = { on: boolean };

export type ErrorResponse = { status: 'error'; message: string };
