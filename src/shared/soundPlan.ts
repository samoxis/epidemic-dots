import type { Frame } from './engine.ts';

/** What to play when a round appears during a run. Pure, so it can be tested without audio. */
export type RoundCue = 'tick' | 'wake' | 'hit';

/** How many of the player's cells are infected in a frame. */
export function infectedMine(frame: Frame | undefined): number {
  if (!frame) return 0;
  let n = 0;
  frame.own.forEach((o, i) => {
    if (o === 'me' && (frame.inf[i] ?? -1) >= 0) n++;
  });
  return n;
}

/**
 * Cues for round r (1-based): a soft tick each round, a comic 'bwomp' on the round the germs wake,
 * and a sad 'boing' whenever more of the player's dots got infected than in the round before.
 */
export function roundCues(frames: readonly Frame[], r: number, wake: number): RoundCue[] {
  const cues: RoundCue[] = [r === wake ? 'wake' : 'tick'];
  if (infectedMine(frames[r]) > infectedMine(frames[r - 1])) cues.push('hit');
  return cues;
}

/** The end of a run: a little fanfare when the player beat the lab's prediction, a deadpan 'wah-wah' otherwise. */
export function resultCue(kept: number, forecast: number): 'cheer' | 'meh' {
  return kept > forecast ? 'cheer' : 'meh';
}
