import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { ensureDailyPost } from '../core/post';

export const triggers = new Hono();

async function dailyPost() {
  try {
    const { id, created } = await ensureDailyPost();
    return { status: 'success', message: created ? `Created today's post ${id}` : `Today's post already exists (${id})` } as const;
  } catch (error) {
    console.error(`Error ensuring today's post: ${error}`);
    return { status: 'error', message: "Failed to create today's post" } as const;
  }
}

// Installing or upgrading the app makes sure today's game post exists (never more than one per day).
triggers.post('/on-app-install', async (c) => {
  const r = await dailyPost();
  return c.json<TriggerResponse>(r, r.status === 'success' ? 200 : 400);
});

triggers.post('/on-app-upgrade', async (c) => {
  const r = await dailyPost();
  return c.json<TriggerResponse>(r, r.status === 'success' ? 200 : 400);
});
