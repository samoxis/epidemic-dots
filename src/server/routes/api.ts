import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { dayKey } from '../../shared/board';
import { SHARE_ENABLED } from '../../shared/share';
import type { ErrorResponse, FlairRequest, PlayRequest, ShareResponse, StateResponse, VoteRequest } from '../../shared/api';
import { buildState, castVote, hasShared, markShared, recordPlay, setFlairOptIn, setNameHidden, setStreakHidden, shareTextFor } from '../core/game';

export const api = new Hono();

api.get('/state', async (c) => {
  try {
    const state = await buildState(context.userId);
    return c.json<StateResponse>(state);
  } catch (error) {
    console.error('state failed', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Could not load today\'s board.' }, 500);
  }
});

api.post('/play', async (c) => {
  const uid = context.userId;
  if (!uid) return c.json<ErrorResponse>({ status: 'error', message: 'Log in to join the lab.' }, 401);
  try {
    const body = await c.req.json<Partial<PlayRequest>>().catch(() => ({}) as Partial<PlayRequest>);
    const outcome = await recordPlay(dayKey(), uid, body.seeds);
    if (!outcome.ok) return c.json<ErrorResponse>({ status: 'error', message: outcome.message }, 400);
    return c.json<StateResponse>(await buildState(uid));
  } catch (error) {
    console.error('play failed', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Could not save your play.' }, 500);
  }
});

api.post('/vote', async (c) => {
  const uid = context.userId;
  if (!uid) return c.json<ErrorResponse>({ status: 'error', message: 'Log in to vote.' }, 401);
  try {
    const body = await c.req.json<Partial<VoteRequest>>().catch(() => ({}) as Partial<VoteRequest>);
    const outcome = await castVote(dayKey(), uid, body.choice);
    if (!outcome.ok) return c.json<ErrorResponse>({ status: 'error', message: outcome.message }, 400);
    return c.json<StateResponse>(await buildState(uid));
  } catch (error) {
    console.error('vote failed', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Could not save your vote.' }, 500);
  }
});

/**
 * Posts the player's score as a comment FROM THEIR OWN account, only when they tap the share button.
 * The text is rebuilt on the server from their saved best run. It replies to the pinned how-to comment when there is one.
 */
api.post('/share', async (c) => {
  const uid = context.userId;
  const postId = context.postId;
  if (!SHARE_ENABLED) return c.json<ShareResponse>({ status: 'error', message: 'Sharing opens once the app is approved.' }, 403);
  if (!uid || !postId) return c.json<ShareResponse>({ status: 'error', message: 'Open the game from a post to share.' }, 401);
  try {
    const day = dayKey();
    if (await hasShared(day, uid)) return c.json<ShareResponse>({ status: 'error', message: 'You already shared today. One brag a day is plenty.' }, 400);
    const text = await shareTextFor(day, uid);
    if (!text) return c.json<ShareResponse>({ status: 'error', message: 'Play a run first, then share it.' }, 400);
    let target: `t1_${string}` | `t3_${string}` = postId;
    try {
      const comments = await reddit.getComments({ postId, limit: 20 }).all();
      const sticky = comments.find((x) => x.stickied);
      if (sticky) target = sticky.id;
    } catch (error) {
      console.error('sticky lookup failed, commenting on the post', error);
    }
    const comment = await reddit.submitComment({ id: target, text, runAs: 'USER' });
    await markShared(day, uid);
    return c.json<ShareResponse>({ status: 'ok', url: comment.url ?? null });
  } catch (error) {
    console.error('share failed', error);
    return c.json<ShareResponse>({ status: 'error', message: 'Reddit would not post it. Nothing was shared.' }, 500);
  }
});

/** Opt in or out of showing the league as the player's flair in this subreddit. Explicit tap only. */
api.post('/name', async (c) => {
  const uid = context.userId;
  if (!uid) return c.json<ErrorResponse>({ status: 'error', message: 'Log in first.' }, 401);
  try {
    const body = await c.req.json<{ hidden?: unknown }>().catch(() => ({}) as { hidden?: unknown });
    await setNameHidden(dayKey(), uid, body.hidden === true);
    return c.json<StateResponse>(await buildState(uid));
  } catch (error) {
    console.error('name failed', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Could not change your name setting.' }, 500);
  }
});

api.post('/streak', async (c) => {
  const uid = context.userId;
  if (!uid) return c.json<ErrorResponse>({ status: 'error', message: 'Log in first.' }, 401);
  try {
    const body = await c.req.json<{ hidden?: unknown }>().catch(() => ({}) as { hidden?: unknown });
    await setStreakHidden(uid, body.hidden === true);
    return c.json<StateResponse>(await buildState(uid));
  } catch (error) {
    console.error('streak failed', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Could not change your streak setting.' }, 500);
  }
});

api.post('/flair', async (c) => {
  const uid = context.userId;
  if (!uid) return c.json<ErrorResponse>({ status: 'error', message: 'Log in first.' }, 401);
  try {
    const body = await c.req.json<Partial<FlairRequest>>().catch(() => ({}) as Partial<FlairRequest>);
    const outcome = await setFlairOptIn(uid, body.on === true);
    if (!outcome.ok) return c.json<ErrorResponse>({ status: 'error', message: outcome.message }, 400);
    return c.json<StateResponse>(await buildState(uid));
  } catch (error) {
    console.error('flair failed', error);
    return c.json<ErrorResponse>({ status: 'error', message: 'Could not change your flair.' }, 500);
  }
});
