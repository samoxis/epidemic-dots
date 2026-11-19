import { context, reddit, redis } from '@devvit/web/server';
import {
  ATTEMPTS_PER_DAY,
  PROMOTION_IMMUNITY,
  VACCINE_MIN_PLAYERS,
  VACCINE_WAKE_DELAY,
  LEVELS,
  N,
  ROUNDS,
  aliveOf,
  MUTATIONS,
  calibratedGoal,
  effectiveStrain,
  immunityScore,
  myCells,
  runSim,
  type Ghost,
  type LevelKey,
  type Mutation,
  type Point,
} from '../../shared/engine';
import { COLONY_NAMES, dayKey, labRatName, levelForDay, secondsToReset, weekKey, type RealColony } from '../../shared/board';
import { recapText } from '../../shared/recap';
import { cleanKept, labForecast, pickBoard } from '../../shared/dayBoard';
import { rngFromText } from '../../shared/rng';
import { LEAGUES, leagueName, nextLeague } from '../../shared/league';
import { shareText } from '../../shared/share';
import { mergeAttempt } from '../../shared/attempts';
import { playStreak, streakView, type Streak } from '../../shared/streak';
import { botPlayers, ratMutation, type BotPlayer } from '../../shared/bots';
import type { NearRow, PlayResult, StateResponse, StrainInfo } from '../../shared/api';

type DayBoard = {
  level: LevelKey;
  ghosts: Ghost[];
  /** Anonymous slot behind each ghost (0 = lab-rat bot colony); absent on boards made before real colonies existed. */
  slots?: number[];
  best: number;
  bestSeeds: Point[];
  vaccine: boolean;
  mutation: Mutation;
  mutationBy?: 'players' | 'rats';
  /** True when the picked mutation was dropped because it made the board unfair. */
  mutationCancelled?: boolean;
  /** The mutation that was picked before the fairness check (set when it was cancelled). */
  pickedMutation?: Mutation;
  /** The lab's forecast factor for this board (absent on boards made before it existed: the strain's factor is used). */
  fc?: number;
  /** Team goal for the day (average immunity score), calibrated when the board is created. */
  goal: number;
};

const DAY_TTL = 60 * 60 * 24 * 14;
const voteKey = (day: string) => `vote:${day}`;
const myVoteKey = (day: string, uid: string) => `vote:${day}:${uid}`;
const prevDay = (day: string) => dayKey(new Date(new Date(`${day}T00:00:00Z`).getTime() - 86400000));

/** Mutation that won yesterday's vote (most votes; ties broken by a fixed daily draw). No votes means no mutation. */
async function mutationFor(day: string): Promise<{ mutation: Mutation; by: 'players' | 'rats' }> {
  const tally = await redis.hGetAll(voteKey(prevDay(day)));
  const counts = MUTATIONS.map((m) => ({ m, n: Number(tally[m] ?? 0) }));
  const top = Math.max(...counts.map((c) => c.n));
  if (top <= 0) return { mutation: ratMutation(day), by: 'rats' }; // nobody voted: the lab rats pick
  const leaders = counts.filter((c) => c.n === top);
  const pick = Math.floor(rngFromText(`mutation:${day}`)() * leaders.length);
  return { mutation: leaders[pick]?.m ?? ratMutation(day), by: 'players' };
}

const boardKey = (day: string) => `day:${day}:board`;
const statsKey = (day: string) => `day:${day}:stats`;
const playKey = (day: string, uid: string) => `day:${day}:play:${uid}`;
const sharedKey = (day: string, uid: string) => `share:${day}:${uid}`;
const leagueKey = (uid: string) => `league:${uid}`;
const flairKey = (uid: string) => `flair:${uid}`;
const streakKey = (uid: string) => `streak:${uid}`;
const nameKey = (uid: string) => `name:${uid}`;
const hideNameKey = (uid: string) => `hidename:${uid}`;
const slotNamesKey = (day: string) => `day:${day}:slotnames`;

/** The player's Reddit username for display (u/name), or null when unknown or when they chose to hide it. */
async function shownName(uid: string): Promise<string | null> {
  const [hiddenFlag, stored] = await Promise.all([redis.get(hideNameKey(uid)), redis.get(nameKey(uid))]);
  if (hiddenFlag) return null;
  let name = stored;
  if (!name && uid.startsWith('t2_')) {
    // players from before names were stored: ask Reddit once, then keep it like any other name
    try {
      name = (await reddit.getUserById(uid as `t2_${string}`))?.username;
      if (name) {
        await redis.set(nameKey(uid), name);
        await redis.expire(nameKey(uid), DAY_TTL);
      }
    } catch (error) {
      console.error(`[names] could not look up ${uid}: ${error}`);
    }
  }
  return name ? `u/${name}` : null;
}

/** Whether the player chose to stay anonymous. */
async function nameHidden(uid: string): Promise<boolean> {
  return Boolean(await redis.get(hideNameKey(uid)));
}

/**
 * Show or hide the player's username in the rank, on tomorrow's board and in the daily recap. Hiding also removes the
 * name from the colony they already left for tomorrow.
 */
export async function setNameHidden(day: string, uid: string, hidden: boolean): Promise<void> {
  const play = await readPlay(day, uid);
  if (hidden) {
    await redis.set(hideNameKey(uid), '1');
    await redis.expire(hideNameKey(uid), DAY_TTL);
    if (play && play.slot > 0) await redis.hDel(slotNamesKey(day), [`s${play.slot}`]);
  } else {
    await redis.del(hideNameKey(uid));
    const name = await redis.get(nameKey(uid));
    if (play && play.slot > 0 && name) {
      await redis.hSet(slotNamesKey(day), { [`s${play.slot}`]: name });
      await redis.expire(slotNamesKey(day), DAY_TTL);
    }
  }
}

async function readStreak(uid: string): Promise<Streak | null> {
  const raw = await redis.get(streakKey(uid));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Streak;
  } catch {
    return null;
  }
}

async function writeStreak(uid: string, s: Streak): Promise<void> {
  await redis.set(streakKey(uid), JSON.stringify(s));
  await redis.expire(streakKey(uid), DAY_TTL);
}

/** Hide or show the player's streak (it keeps counting either way). */
export async function setStreakHidden(uid: string, hidden: boolean): Promise<void> {
  const s = await readStreak(uid);
  if (s) await writeStreak(uid, { ...s, hidden });
}
const placementsKey = (day: string) => `day:${day}:placements`;
const lbKey = (day: string) => `lb:day:${day}`;
const weekUserKey = (day: string, uid: string) => `week:${weekKey(day)}:${uid}`;

/** Vaccine day: yesterday's team goal was reached by enough players, so the germs sleep in today. */
async function vaccineFor(day: string): Promise<boolean> {
  const prev = dayKey(new Date(new Date(`${day}T00:00:00Z`).getTime() - 86400000));
  const prevBoard = await redis.get(boardKey(prev));
  if (!prevBoard) return false; // nobody opened yesterday's board
  const b = JSON.parse(prevBoard) as DayBoard;
  const stats = await redis.hGetAll(statsKey(prev));
  const players = Number(stats.players ?? 0);
  if (players < VACCINE_MIN_PLAYERS) return false;
  // Only real players count toward the team goal. The lab rats (bots) are for rank and company, never for the goal.
  return Number(stats.sum ?? 0) / players >= (b.goal ?? LEVELS[b.level].teamGoal);
}

/** Yesterday's best placements, stored by anonymous slot number only (no user ids). */
async function yesterdaysColonies(day: string): Promise<RealColony[]> {
  const h = await redis.hGetAll(placementsKey(prevDay(day)));
  const out: RealColony[] = [];
  for (const [field, value] of Object.entries(h)) {
    const slot = Number(field.slice(1));
    if (!field.startsWith('s') || !Number.isInteger(slot) || slot <= 0) continue;
    try {
      out.push({ slot, seeds: JSON.parse(value) as Point[] });
    } catch {
      // ignore a malformed entry
    }
  }
  return out;
}

/** The day's board, created on first request. "Best possible" takes about half a second, so it is cached. */
export async function loadBoard(day: string): Promise<DayBoard> {
  const cached = await redis.get(boardKey(day));
  if (cached) return JSON.parse(cached) as DayBoard;
  const level = levelForDay(day);
  const vaccine = await vaccineFor(day);
  const voted = await mutationFor(day);
  const delay = vaccine ? VACCINE_WAKE_DELAY : 0;
  // A fair board (see shared/dayBoard.ts); Patient Zero comes from a server-only random seed.
  const picked = pickBoard({
    day,
    level,
    real: await yesterdaysColonies(day),
    mutation: voted.mutation,
    mutationBy: voted.by,
    wakeDelay: delay,
    zeroSeed: globalThis.crypto?.randomUUID?.() ?? `${Math.random()}:${Date.now()}`,
  });
  const { ghosts, slots, best, bestSeeds, mutation, mutationCancelled, fc } = picked;
  const goal = calibratedGoal(rngFromText(`goal:${day}`), level, ghosts, best, delay, mutation);
  const board: DayBoard = {
    level, ghosts, slots, best, bestSeeds, vaccine, mutation, mutationBy: voted.by, mutationCancelled,
    ...(mutationCancelled ? { pickedMutation: voted.mutation } : {}),
    fc, goal,
  };
  // Two first requests at once must not create two different boards: only the first write wins.
  await redis.set(boardKey(day), JSON.stringify(board), { nx: true });
  await redis.expire(boardKey(day), DAY_TTL);
  const stored = await redis.get(boardKey(day));
  return stored ? (JSON.parse(stored) as DayBoard) : board;
}

export function strainInfo(b: DayBoard): StrainInfo {
  const l = LEVELS[b.level];
  const e = effectiveStrain(b.level, b.vaccine ? VACCINE_WAKE_DELAY : 0, b.mutation ?? 'none');
  return {
    level: b.level,
    label: l.label,
    name: l.name,
    wake: e.wake,
    vaccine: b.vaccine,
    mutation: b.mutation ?? 'none',
    mutationBy: b.mutation && b.mutation !== 'none' ? (b.mutationBy ?? 'players') : 'none',
    ...(b.mutationCancelled && b.pickedMutation && b.pickedMutation !== 'none'
      ? { cancelled: { mutation: b.pickedMutation, by: b.mutationBy ?? 'rats' } }
      : {}),
    jump: e.jump,
    every: e.every,
    fc: b.fc ?? l.fc,
    teamGoal: b.goal ?? l.teamGoal,
  };
}

function forecastFor(seeds: readonly Point[], board: DayBoard): number {
  return labForecast(cleanKept(seeds, board.level, board.ghosts), board.fc ?? LEVELS[board.level].fc, board.best);
}

export function validSeeds(seeds: unknown, ghosts: readonly Ghost[]): seeds is Point[] {
  if (!Array.isArray(seeds) || seeds.length !== 3) return false;
  const taken = new Set<string>();
  for (const g of ghosts) for (const [x, y] of g.seeds) taken.add(`${x},${y}`);
  const mine = new Set<string>();
  for (const p of seeds) {
    if (!Array.isArray(p) || p.length !== 2) return false;
    const [x, y] = p as unknown[];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) return false;
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    const k = `${x},${y}`;
    if (taken.has(k) || mine.has(k)) return false;
    mine.add(k);
  }
  return true;
}

async function readPlay(day: string, uid: string): Promise<{ result: PlayResult; attempts: number; slot: number } | null> {
  const h = await redis.hGetAll(playKey(day, uid));
  if (!h.seeds) return null;
  return {
    result: {
      seeds: JSON.parse(h.seeds) as Point[],
      kept: Number(h.kept),
      immunity: Number(h.immunity),
      clean: h.clean === '1',
      forecast: Number(h.forecast),
    },
    attempts: Number(h.attempts ?? 1),
    slot: Number(h.slot ?? 0),
  };
}

export type PlayOutcome = { ok: true } | { ok: false; message: string };

/** Validates and stores one run. The result is computed here, never trusted from the client. Only the best run counts. */
export async function recordPlay(day: string, uid: string, seeds: unknown): Promise<PlayOutcome> {
  const board = await loadBoard(day);
  if (!validSeeds(seeds, board.ghosts)) return { ok: false, message: 'Invalid placement: plant 3 different free squares.' };
  const prev = await readPlay(day, uid);
  const used = prev?.attempts ?? 0;
  if (used >= ATTEMPTS_PER_DAY) {
    return { ok: false, message: `You used all ${ATTEMPTS_PER_DAY} runs today. The lab is closed until midnight UTC.` };
  }
  const res = runSim(seeds, false, board.level, true, board.ghosts, board.vaccine ? VACCINE_WAKE_DELAY : 0, board.mutation ?? 'none');
  const last = res.frames[ROUNDS];
  const kept = last ? myCells(aliveOf(last), false) : 0;
  const run: PlayResult = {
    seeds,
    kept,
    immunity: immunityScore(kept, board.best),
    clean: !res.touched.me,
    forecast: forecastFor(seeds, board),
  };
  const { best, first, delta } = mergeAttempt(prev?.result ?? null, run);
  let slot = prev?.slot ?? 0;
  if (first) {
    await redis.hIncrBy(statsKey(day), 'players', 1);
    // An anonymous handle for tomorrow's colony. Its own counter never goes down (unlike 'players', which the moderator
    // reset decrements), so two players can never share a slot. A day that started before this counter existed seeds it
    // from the highest slot already stored.
    if ((await redis.hGet(statsKey(day), 'slots')) === undefined) {
      const used = Object.keys(await redis.hGetAll(placementsKey(day)))
        .map((f) => Number(f.slice(1)))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (used.length > 0) await redis.hSet(statsKey(day), { slots: String(Math.max(...used)) });
    }
    slot = await redis.hIncrBy(statsKey(day), 'slots', 1);
    await redis.hIncrBy(weekUserKey(day, uid), 'days', 1);
    await writeStreak(uid, playStreak(await readStreak(uid), day).streak);
  }
  await redis.hSet(playKey(day, uid), {
    slot: String(slot),
    seeds: JSON.stringify(best.seeds),
    kept: String(best.kept),
    immunity: String(best.immunity),
    clean: best.clean ? '1' : '0',
    forecast: String(best.forecast),
    attempts: String(used + 1),
  });
  await redis.expire(playKey(day, uid), DAY_TTL);
  if ((first || delta !== 0) && slot > 0) {
    await redis.hSet(placementsKey(day), { [`s${slot}`]: JSON.stringify(best.seeds) });
    await redis.expire(placementsKey(day), DAY_TTL);
  }
  if (delta !== 0) {
    await redis.hIncrBy(statsKey(day), 'sum', delta);
    await redis.hIncrBy(weekUserKey(day, uid), 'sum', delta);
  }
  // a first run that scored 0% still belongs in the rank
  if (first || delta !== 0) await redis.zAdd(lbKey(day), { member: uid, score: best.immunity });
  await redis.expire(statsKey(day), DAY_TTL);
  await redis.expire(lbKey(day), DAY_TTL);
  await redis.expire(weekUserKey(day, uid), DAY_TTL);
  await updateLeague(day, uid);
  // remember the username for display (rank, tomorrow's colony, recap) unless the player hid it
  try {
    const username = await reddit.getCurrentUsername();
    if (username) {
      await redis.set(nameKey(uid), username);
      await redis.expire(nameKey(uid), DAY_TTL);
      if (slot > 0 && !(await nameHidden(uid))) {
        await redis.hSet(slotNamesKey(day), { [`s${slot}`]: username });
        await redis.expire(slotNamesKey(day), DAY_TTL);
      }
    }
  } catch (error) {
    console.error(`[names] could not read the username: ${error}`);
  }
  return { ok: true };
}

/** Rank among real players and the day's lab rats (bots), with two rows above and two below the player. */
async function rankFor(day: string, uid: string, immunity: number, bots: readonly BotPlayer[]): Promise<StateResponse['rank']> {
  const [realTotal, asc] = await Promise.all([redis.zCard(lbKey(day)), redis.zRank(lbKey(day), uid)]);
  if (asc === undefined || realTotal === 0) return null;
  const realPos = realTotal - asc; // 1 = best among real players
  const position = realPos + bots.filter((b) => b.immunity > immunity).length;
  const rows = await redis.zRange(lbKey(day), Math.max(0, realPos - 3), realPos + 1, { by: 'rank', reverse: true });
  type Entry = { name: string; immunity: number; you: boolean; bot: boolean };
  const names = await Promise.all(rows.map((r) => (r.member === uid ? Promise.resolve(null) : shownName(r.member))));
  const entries: Entry[] = [
    ...rows.map((r, i) => ({
      // real players show their username; those who hid it stay anonymous, marked as people (never mistaken for bots)
      name: r.member === uid ? 'You' : (names[i] ?? `${labRatName(r.member)} (player)`),
      immunity: Math.round(r.score),
      you: r.member === uid,
      bot: false,
    })),
    ...bots.map((b) => ({ name: b.name, immunity: b.immunity, you: false, bot: true })),
  ];
  if (!entries.some((e) => e.you)) entries.push({ name: 'You', immunity, you: true, bot: false });
  entries.sort((a, b) => b.immunity - a.immunity || Number(b.you) - Number(a.you));
  const me = entries.findIndex((e) => e.you);
  const start = Math.max(0, me - 2);
  const near: NearRow[] = entries.slice(start, me + 3).map((e, i) => ({
    name: e.name,
    immunity: e.immunity,
    you: e.you,
    bot: e.bot,
    position: position - (me - start) + i,
  }));
  return { position, total: realTotal + bots.length, near };
}

export async function buildState(uid: string | undefined, date: Date = new Date()): Promise<StateResponse> {
  const t0 = Date.now();
  const day = dayKey(date);
  const prev = prevDay(day);
  // Every read below is independent, so they run in parallel: on Devvit each Redis call is a network round trip,
  // and one after another they made opening the game take seconds.
  const [board, stats, tally, myVote, saved, streakRaw, w, before, byslot, hidden, league, flair, shared, storedName] = await Promise.all([
    loadBoard(day),
    redis.hGetAll(statsKey(day)),
    redis.hGetAll(voteKey(day)),
    uid ? redis.get(myVoteKey(day, uid)) : Promise.resolve(undefined),
    uid ? readPlay(day, uid) : Promise.resolve(null),
    uid ? readStreak(uid) : Promise.resolve(null),
    uid ? redis.hGetAll(weekUserKey(day, uid)) : Promise.resolve({} as Record<string, string>),
    uid ? readPlay(prev, uid) : Promise.resolve(null),
    redis.hGetAll(slotNamesKey(prev)),
    uid ? nameHidden(uid) : Promise.resolve(false),
    leagueState(uid, day),
    uid ? redis.get(flairKey(uid)) : Promise.resolve(undefined),
    uid ? redis.get(sharedKey(day, uid)) : Promise.resolve(undefined),
    uid ? redis.get(nameKey(uid)) : Promise.resolve(undefined),
  ]);
  const players = Number(stats.players ?? 0);
  const bots = botPlayers(day, board.level, board.ghosts, board.best, board.vaccine ? VACCINE_WAKE_DELAY : 0, undefined, board.mutation ?? 'none');
  const votes = { zoomier: Number(tally.zoomier ?? 0), jumpier: Number(tally.jumpier ?? 0), grumpier: Number(tally.grumpier ?? 0) };
  const sum = Number(stats.sum ?? 0);
  const played = saved?.result ?? null;
  const rank = uid && played ? await rankFor(day, uid, played.immunity, bots) : null;
  const streak = uid ? streakView(streakRaw, day) : null;
  const weekDays = Number(w.days ?? 0);
  const week: StateResponse['week'] = weekDays > 0 ? { avg: Math.round(Number(w.sum ?? 0) / weekDays), days: weekDays } : null;
  const slots = board.slots ?? [];
  const realColonies = slots.filter((x) => x > 0).length;
  const idx = before && before.slot > 0 ? slots.indexOf(before.slot) : -1;
  const yourColony = idx >= 0 ? (board.ghosts[idx]?.id ?? null) : null;
  // which of today's colonies were yesterday's players who show their name
  const neighbourNames: Record<string, string> = {};
  slots.forEach((sl, i) => {
    const id = board.ghosts[i]?.id;
    const n = sl > 0 ? byslot[`s${sl}`] : undefined;
    if (id && n) neighbourNames[id] = `u/${n}`;
  });
  const ms = Date.now() - t0;
  if (ms > 700) console.log(`[state] slow: ${ms} ms`);
  return {
    type: 'state',
    day,
    strain: strainInfo(board),
    votes,
    myVote: myVote && (MUTATIONS as readonly string[]).includes(myVote) ? (myVote as Mutation) : null,
    // Patient Zero stays secret until the player has run today's board once (the run itself needs it).
    ghosts: played ? board.ghosts : board.ghosts.map((g) => ({ id: g.id, seeds: g.seeds })),
    bestPossible: board.best,
    players,
    bots: bots.length,
    realColonies,
    yourColony,
    avgImmunity: players > 0 ? Math.round(sum / players) : 0,
    streak,
    neighbourNames,
    nameHidden: hidden,
    myName: !hidden && storedName ? `u/${storedName}` : null,
    secondsToReset: secondsToReset(date),
    played,
    attemptsUsed: saved?.attempts ?? 0,
    maxAttempts: ATTEMPTS_PER_DAY,
    rank,
    week,
    promotion: PROMOTION_IMMUNITY,
    league,
    flair: Boolean(flair),
    shared: Boolean(shared),
  };
}

/** One vote a day, changeable until midnight. Today's votes decide tomorrow's mutation. */
export async function castVote(day: string, uid: string, choice: unknown): Promise<PlayOutcome> {
  if (typeof choice !== 'string' || !(MUTATIONS as readonly string[]).includes(choice)) {
    return { ok: false, message: 'Pick Zoomier, Jumpier or Grumpier.' };
  }
  const previous = await redis.get(myVoteKey(day, uid));
  if (previous === choice) return { ok: true };
  if (previous && (MUTATIONS as readonly string[]).includes(previous)) await redis.hIncrBy(voteKey(day), previous, -1);
  await redis.hIncrBy(voteKey(day), choice, 1);
  await redis.set(myVoteKey(day, uid), choice);
  await redis.expire(myVoteKey(day, uid), DAY_TTL);
  await redis.expire(voteKey(day), DAY_TTL);
  return { ok: true };
}

/** The text of the player's score comment, built from their saved best run (never from client input). */
export async function shareTextFor(day: string, uid: string): Promise<string | null> {
  const board = await loadBoard(day);
  const play = await readPlay(day, uid);
  if (!play) return null;
  const who = await shownName(uid);
  return shareText({ day, kept: play.result.kept, bestPossible: board.best, immunity: play.result.immunity, clean: play.result.clean, who });
}

export async function hasShared(day: string, uid: string): Promise<boolean> {
  return Boolean(await redis.get(sharedKey(day, uid)));
}

export async function markShared(day: string, uid: string): Promise<void> {
  await redis.set(sharedKey(day, uid), '1');
  await redis.expire(sharedKey(day, uid), DAY_TTL);
}

async function readLeague(uid: string): Promise<{ index: number; week: string }> {
  const h = await redis.hGetAll(leagueKey(uid));
  const index = Math.max(0, Math.min(LEAGUES.length - 1, Number(h.idx ?? 0) || 0));
  return { index, week: h.week ?? '' };
}

async function leagueState(uid: string | undefined, day: string): Promise<StateResponse['league']> {
  const cur = uid ? await readLeague(uid) : { index: 0, week: '' };
  return {
    index: cur.index,
    name: leagueName(cur.index),
    next: cur.index < LEAGUES.length - 1 ? leagueName(cur.index + 1) : null,
    promotedThisWeek: cur.week === weekKey(day),
  };
}

async function applyFlair(uid: string, index: number): Promise<boolean> {
  const subredditName = context.subredditName;
  const username = await reddit.getCurrentUsername();
  if (!subredditName || !username) return false;
  try {
    await reddit.setUserFlair({ subredditName, username, text: `${leagueName(index)} league` });
    return true;
  } catch (error) {
    console.error(`[flair] could not set flair for ${uid}: ${error}`);
    return false;
  }
}

/** Moves the player up a league when this week's average reaches the line. Leagues never drop. */
async function updateLeague(day: string, uid: string): Promise<void> {
  const wk = weekKey(day);
  const w = await redis.hGetAll(weekUserKey(day, uid));
  const days = Number(w.days ?? 0);
  const avg = days > 0 ? Number(w.sum ?? 0) / days : 0;
  const cur = await readLeague(uid);
  const next = nextLeague(cur.index, avg, cur.week === wk);
  await redis.hSet(leagueKey(uid), { idx: String(next.index), week: next.promoted ? wk : cur.week });
  await redis.expire(leagueKey(uid), DAY_TTL);
  const flairOn = Boolean(await redis.get(flairKey(uid)));
  if (flairOn) {
    if (next.promoted) await applyFlair(uid, next.index);
    await redis.expire(flairKey(uid), DAY_TTL);
  }
}

/** Opt in or out of showing the league as the player's flair in this subreddit. Only ever called from an explicit tap. */
export async function setFlairOptIn(uid: string, on: boolean): Promise<PlayOutcome> {
  if (!on) {
    const subredditName = context.subredditName;
    const username = await reddit.getCurrentUsername();
    await redis.del(flairKey(uid));
    if (subredditName && username) {
      try {
        await reddit.removeUserFlair(subredditName, username);
      } catch (error) {
        console.error(`[flair] could not remove flair for ${uid}: ${error}`);
      }
    }
    return { ok: true };
  }
  const { index } = await readLeague(uid);
  if (!(await applyFlair(uid, index))) return { ok: false, message: 'Reddit would not set your flair here. Nothing changed.' };
  await redis.set(flairKey(uid), '1');
  await redis.expire(flairKey(uid), DAY_TTL);
  return { ok: true };
}

/**
 * Moderator test tool: wipes the caller's own game data for today (runs, rank, weekly average, league, flair, share and
 * vote), so a test account can be a first-time player again. Touches only the caller's keys and today's counters.
 */
export async function resetMyData(day: string, uid: string): Promise<string> {
  const play = await readPlay(day, uid);
  if (play) {
    await redis.hIncrBy(statsKey(day), 'players', -1);
    await redis.hIncrBy(statsKey(day), 'sum', -play.result.immunity);
    await redis.zRem(lbKey(day), [uid]);
    if (play.slot > 0) await redis.hDel(placementsKey(day), [`s${play.slot}`]);
  }
  const vote = await redis.get(myVoteKey(day, uid));
  if (vote && (MUTATIONS as readonly string[]).includes(vote)) await redis.hIncrBy(voteKey(day), vote, -1);
  await redis.del(playKey(day, uid), weekUserKey(day, uid), leagueKey(uid), sharedKey(day, uid), myVoteKey(day, uid), streakKey(uid));
  if (await redis.get(flairKey(uid))) await setFlairOptIn(uid, false);
  return play ? 'Your test data for today is gone. You are a first-time player again.' : 'Nothing to reset. You are already a first-time player.';
}

const capital = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

/**
 * "Yesterday in the lab" for the top of today's pinned comment: yesterday's real players, average and goal, best run,
 * Patient Zero (spoiler-tagged), and today's twist. Bots never count. Returns '' if anything is missing.
 */
export async function recapFor(day: string): Promise<string> {
  try {
    const prev = prevDay(day);
    const prevRaw = await redis.get(boardKey(prev));
    const today = await loadBoard(day);
    const stats = await redis.hGetAll(statsKey(prev));
    const players = Number(stats.players ?? 0);
    const prevBoard = prevRaw ? (JSON.parse(prevRaw) as DayBoard) : null;
    const top = players > 0 ? await redis.zRange(lbKey(prev), 0, 0, { by: 'rank', reverse: true }) : [];
    const zeroId = prevBoard?.ghosts.find((g) => g.zero)?.id ?? null;
    const twist =
      today.mutation && today.mutation !== 'none' ? { name: capital(today.mutation), by: today.mutationBy ?? 'players' } : null;
    return recapText({
      dateLabel: new Date(`${prev}T00:00:00Z`).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
      players,
      avgImmunity: players > 0 ? Math.round(Number(stats.sum ?? 0) / players) : 0,
      goal: prevBoard?.goal ?? LEVELS[levelForDay(prev)].teamGoal,
      bestImmunity: top[0] ? Math.round(top[0].score) : null,
      bestName: top[0] ? await shownName(top[0].member) : null,
      zeroName: zeroId ? (COLONY_NAMES[zeroId] ?? null) : null,
      vaccineToday: today.vaccine,
      twist,
      cancelledTwist: today.mutationCancelled && today.pickedMutation && today.pickedMutation !== 'none' ? capital(today.pickedMutation) : null,
    });
  } catch (error) {
    console.error(`[recap] could not build the recap: ${error}`);
    return '';
  }
}
