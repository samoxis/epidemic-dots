import { Hono } from 'hono';
import { ensureDailyPost } from '../core/post';
import { loadBoard } from '../core/game';
import { dayKey } from '../../shared/board';

export const scheduler = new Hono();

// Cron at 00:00 UTC (see devvit.json): the new day's post.
scheduler.post('/daily-post', async (c) => {
  try {
    // Build and cache the new day's board now, so the first player after midnight does not wait for the fairness check.
    await loadBoard(dayKey());
    const { id, created } = await ensureDailyPost();
    return c.json({ status: 'ok', id, created }, 200);
  } catch (error) {
    console.error(`Daily post failed: ${error}`);
    return c.json({ status: 'error' }, 500);
  }
});
