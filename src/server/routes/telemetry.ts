// Devvit Journeys: the five telemetry routes the browser client of @devvit/analytics posts to (under /api/telemetry).
// The package ships them as Express middleware; this is the same contract on Hono, using the official server client.
// Telemetry must never break the game, so every failure answers with a receipt instead of throwing.
import { Hono, type Context } from 'hono';
import { telemetry } from '@devvit/analytics/server/reddit';
import { TELEMETRY_JOURNEY_ENDPOINTS, TELEMETRY_UNSPECIFIED_RECEIPT, type JourneyReceipt } from '@devvit/analytics/shared/reddit';

export const journeys = new Hono();

const invalid: JourneyReceipt = { status: 'JOURNEY_RECEIPT_INVALID', message: 'Invalid: Event payload was not recorded.' };
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

async function body(c: Context): Promise<unknown> {
  return c.req.json().catch(() => null);
}

function bad(c: Context, error: string) {
  return c.json({ error, receipt: invalid }, 400);
}

async function safe(c: Context, run: () => Promise<unknown>) {
  try {
    return c.json(await run());
  } catch (error) {
    console.error('[journeys]', error);
    return c.json({ error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT }, 500);
  }
}

journeys.post(TELEMETRY_JOURNEY_ENDPOINTS.start, (c) =>
  safe(c, async () => {
    const r = await telemetry.startJourney();
    if (!isText(r.journeyId)) throw new Error('Telemetry journey id missing');
    return r;
  })
);

journeys.post(TELEMETRY_JOURNEY_ENDPOINTS.progress, async (c) => {
  const b = await body(c);
  if (!isRecord(b) || !isText(b.journeyId)) return bad(c, 'journeyId is required.');
  if (typeof b.progress !== 'number' || !Number.isFinite(b.progress) || b.progress < 0 || b.progress > 1) {
    return bad(c, 'progress must be a number between 0 and 1.');
  }
  if (b.action !== undefined && !isText(b.action)) return bad(c, 'action must be a non-empty string.');
  if (b.actionDetails !== undefined && !isText(b.actionDetails)) return bad(c, 'actionDetails must be a non-empty string.');
  const { journeyId, progress, action, actionDetails } = b as { journeyId: string; progress: number; action?: string; actionDetails?: string };
  return safe(c, () =>
    telemetry.journeyProgress({
      journeyId,
      progress,
      ...(action !== undefined ? { action } : {}),
      ...(actionDetails !== undefined ? { actionDetails } : {}),
    })
  );
});

journeys.post(TELEMETRY_JOURNEY_ENDPOINTS.interaction, async (c) => {
  const b = await body(c);
  if (!isRecord(b) || !isText(b.action)) return bad(c, 'action is required.');
  if (b.journeyId !== undefined && typeof b.journeyId !== 'string') return bad(c, 'journeyId must be a string.');
  if (b.actionDetails !== undefined && !isText(b.actionDetails)) return bad(c, 'actionDetails must be a non-empty string.');
  const journeyId = isText(b.journeyId) ? b.journeyId : '';
  const action = b.action;
  const actionDetails = isText(b.actionDetails) ? b.actionDetails : '';
  return safe(c, () => telemetry.journeyInteraction({ journeyId, action, actionDetails }));
});

journeys.post(TELEMETRY_JOURNEY_ENDPOINTS.end, async (c) => {
  const b = await body(c);
  if (!isRecord(b) || !isText(b.journeyId)) return bad(c, 'journeyId is required.');
  if (b.complete !== undefined && typeof b.complete !== 'boolean') return bad(c, 'complete must be a boolean.');
  const game = b.game;
  if (game !== undefined) {
    if (!isRecord(game)) return bad(c, 'game must be an object.');
    if (game.win !== undefined && typeof game.win !== 'boolean') return bad(c, 'game.win must be a boolean.');
    if (game.score !== undefined && (typeof game.score !== 'number' || !Number.isFinite(game.score))) {
      return bad(c, 'game.score must be a number.');
    }
  }
  const journeyId = b.journeyId;
  const complete = b.complete === true;
  return safe(c, () =>
    telemetry.endJourney({
      journeyId,
      complete,
      ...(isRecord(game)
        ? { game: { win: game.win === true, score: typeof game.score === 'number' ? game.score : 0 } }
        : {}),
    })
  );
});

journeys.post(TELEMETRY_JOURNEY_ENDPOINTS.appReady, (c) => safe(c, () => telemetry.appReady()));
