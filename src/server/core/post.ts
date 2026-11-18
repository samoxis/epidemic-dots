import { reddit, redis } from '@devvit/web/server';
import { dayKey } from '../../shared/board';

/** One title per day ("Epidemic Dots, Wed 18 Nov: the outbreak is live") so the feed reads as a daily series, not duplicates. */
const titleFor = (d: Date = new Date()): string =>
  `Epidemic Dots, ${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}: the outbreak is live`;

// A short welcome for newcomers, pinned under every daily post. It comes from the app account, which Reddit labels as an app.
const HOW_TO_PLAY = [
  '**Epidemic Dots** is a daily outbreak puzzle. New board every day (00:00 UTC).',
  '',
  '1. **Plant 3 dots.** Tap the board to zoom, then tap the exact square.',
  '2. **Press the pink button.** Your dots grow into empty squares next to them, one ring per round.',
  '3. **One colony is secretly sick.** Germs jump between nearby dots. Keep as many of your dots alive as you can.',
  '',
  'You get 3 runs a day and your best one counts. Your score is the share of the lab benchmark you saved (your immunity score).',
  'If everyone together reaches the team goal, tomorrow is a Vaccine day and the germs sleep in.',
  '',
  'The "rat bots" are bots, and they are always labelled as bots. Tap the post above to play.',
].join('\n');

/** Manual post, used by the moderator menu. Also pins a short how-to-play comment. */
export const createPost = async () => {
  const post = await reddit.submitCustomPost({ title: titleFor() });
  try {
    const comment = await reddit.submitComment({ id: post.id, text: HOW_TO_PLAY });
    await comment.distinguish(true);
  } catch (error) {
    // The post is what matters; a missing welcome comment must never stop the day.
    console.error(`[post] could not add the how-to-play comment: ${error}`);
  }
  return post;
};

/**
 * One game post per UTC day, however often this is called (cron, app install, app upgrade).
 * Returns the post id and whether it was just created.
 */
export const ensureDailyPost = async (): Promise<{ id: string; created: boolean }> => {
  const key = `post:${dayKey()}`;
  const existing = await redis.get(key);
  if (existing) {
    console.log(`[post] today's post already exists: ${existing}`);
    return { id: existing, created: false };
  }
  const post = await createPost();
  console.log(`[post] created today's post: ${post.id}`);
  await redis.set(key, post.id);
  await redis.expire(key, 60 * 60 * 24 * 14);
  return { id: post.id, created: true };
};
