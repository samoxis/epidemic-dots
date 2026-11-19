// Prints the in-game tune (src/shared/musicPlan.ts) as JSON for tools/render-music.py.
// Usage: node --experimental-strip-types tools/music-plan.ts > plan.json
import { BEAT_S, BEATS_PER_BAR, CYCLE_BARS, barChord, barEvents, type MusicPhase } from '../src/shared/musicPlan.ts';

const phases: MusicPhase[] = ['plant', 'run', 'calm'];
const out = {
  beat: BEAT_S,
  beatsPerBar: BEATS_PER_BAR,
  phases: Object.fromEntries(
    phases.map((p) => [
      p,
      Array.from({ length: CYCLE_BARS[p] }, (_, bar) => ({ chord: barChord(p, bar), notes: barEvents(p, bar) })),
    ])
  ),
};
process.stdout.write(JSON.stringify(out));
