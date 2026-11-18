// "Lab rats": labelled bot players that keep a small or new subreddit lively (rank, team average, near-you list).
// They are always shown as bots. Deterministic per day, so every request sees the same ones.

import {
  ATTEMPTS_PER_DAY,
  MUTATIONS,
  ROUNDS,
  aliveOf,
  immunityScore,
  myCells,
  randomSeeds,
  runSim,
  type Ghost,
  type LevelKey,
  type Mutation,
} from './engine.ts';
import { rngFromText } from './rng.ts';

export const BOT_COUNT = 24;

/** When nobody voted for tomorrow's mutation, the lab rats (bots) pick one, so every day still has a twist to show. */
export function ratMutation(day: string): Mutation {
  const pick = Math.floor(rngFromText(`ratvote:${day}`)() * MUTATIONS.length);
  return MUTATIONS[pick] ?? 'zoomier';
}

export type BotPlayer = { id: string; name: string; immunity: number };

/** Each bot takes 1 to ATTEMPTS_PER_DAY random runs and keeps its best, like a casual player. */
export function botPlayers(
  day: string,
  level: LevelKey,
  ghosts: readonly Ghost[],
  bestPossible: number,
  wakeDelay: number,
  count: number = BOT_COUNT,
  mutation: Mutation = 'none',
): BotPlayer[] {
  const rng = rngFromText(`bots:${day}`);
  const bots: BotPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const runs = 1 + Math.floor(rng() * ATTEMPTS_PER_DAY);
    let best = 0;
    for (let r = 0; r < runs; r++) {
      const last = runSim(randomSeeds(rng, ghosts), false, level, true, ghosts, wakeDelay, mutation).frames[ROUNDS];
      best = Math.max(best, immunityScore(last ? myCells(aliveOf(last), false) : 0, bestPossible));
    }
    bots.push({ id: `bot-${i}`, name: `lab rat #${100 + ((i * 37 + 11) % 900)} (bot)`, immunity: best });
  }
  return bots;
}
