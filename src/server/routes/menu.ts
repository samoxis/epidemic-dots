import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { dayKey } from '../../shared/board';
import { resetMyData } from '../core/game';
import { createPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

// Test tool for moderators: become a first-time player again (only your own data for today is touched).
menu.post('/reset-me', async (c) => {
  const uid = context.userId;
  if (!uid) return c.json<UiResponse>({ showToast: 'Log in first.' }, 400);
  try {
    return c.json<UiResponse>({ showToast: await resetMyData(dayKey(), uid) }, 200);
  } catch (error) {
    console.error(`Error resetting test data: ${error}`);
    return c.json<UiResponse>({ showToast: 'Could not reset your test data.' }, 400);
  }
});
