// Devvit Journeys: what the game reports to Reddit's own analytics (no outside services, no usernames in the payload).
// One journey per run: it starts on the first planted dot (a committed action, never a page view, as Reddit asks),
// moves with each dot and the release, and ends when the run finishes. "Win" means beating the lab's forecast; the score
// is the run's immunity percentage. Telemetry must never get in the way of play, so every call is fire-and-forget.
import { telemetry } from '@devvit/analytics/client/reddit';

let ready = false;
let inRun = false;

function send(call: () => Promise<unknown>): void {
  try {
    void call().catch(() => undefined);
  } catch {
    /* never let analytics break the game */
  }
}

export const journey = {
  /** The board is drawn and accepts taps. */
  appReady(): void {
    if (ready) return;
    ready = true;
    send(() => telemetry.appReady());
  },
  /** A dot was planted; n = dots planted now (1-3). The first one opens the run's journey. */
  planted(n: number): void {
    if (!inRun) {
      inRun = true;
      send(async () => {
        await telemetry.startJourney();
        await telemetry.progress({ progress: 0.2 * n, action: 'dot_planted', actionDetails: `${n}_of_3` });
      });
      return;
    }
    send(() => telemetry.progress({ progress: 0.2 * n, action: 'dot_planted', actionDetails: `${n}_of_3` }));
  },
  /** The pink button: the run is saved and the germs are out. */
  released(): void {
    if (inRun) send(() => telemetry.progress({ progress: 0.8, action: 'germs_released' }));
  },
  /** The run finished (all rounds played or skipped). */
  finished(immunity: number, beatLab: boolean): void {
    if (!inRun) return;
    inRun = false;
    send(() => telemetry.endJourney({ complete: true, game: { win: beatLab, score: Math.round(immunity) } }));
  },
  /** Something worth counting outside a run: a vote, another try, a flair opt-in. */
  interaction(action: string, actionDetails?: string): void {
    send(() => telemetry.interaction(actionDetails ? { action, actionDetails } : { action }));
  },
};
