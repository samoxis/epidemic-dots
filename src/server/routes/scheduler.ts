import { Hono } from 'hono';
import { ensureDailyPost } from '../core/post';

export const scheduler = new Hono();

// Cron at 00:00 UTC (see devvit.json): the new day's post.
scheduler.post('/daily-post', async (c) => {
  try {
    const { id, created } = await ensureDailyPost();
    return c.json({ status: 'ok', id, created }, 200);
  } catch (error) {
    console.error(`Daily post failed: ${error}`);
    return c.json({ status: 'error' }, 500);
  }
});
