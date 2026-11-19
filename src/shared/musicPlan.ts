// The in-game tune, as data: which notes play in each bar of each phase. Pure, so it can be tested without audio.
// Same piece as the demo video (D minor tiptoe bass, pizzicato stabs, a motif that turns major), adapted to the game:
// - 'plant': quiet, no melody (placing dots is the thinking part; busy music hurts hard tasks);
// - 'run': the full minor motif while the germs spread (watching, not thinking);
// - 'calm': the warm D major version under the result card, a few bars, then silence while people read.

export type MusicPhase = 'plant' | 'run' | 'calm';
export type Voice = 'bass' | 'snap' | 'hat' | 'stab' | 'lead' | 'bell';
export type NoteEvent = { beat: number; voice: Voice; midi: number; vol: number };

/** 120 bpm, like the demo video: one beat = 0.5 s. */
export const BEAT_S = 0.5;
/** One round of the run lasts exactly two beats, so the rounds land on the music. */
export const ROUND_MS = 2 * BEAT_S * 1000;
export const BEATS_PER_BAR = 4;
/** Bars of 'calm' before the music stops by itself. */
export const CALM_BARS = 8;

type Chord = [root: number, quality: 'm' | 'M' | '7'];

const CHORDS: Record<MusicPhase, Chord[]> = {
  plant: [[50, 'm'], [50, 'm'], [46, 'M'], [45, '7']],
  run: [[50, 'm'], [55, 'm'], [45, '7'], [50, 'm']],
  calm: [[50, 'M'], [55, 'M'], [57, '7'], [50, 'M']],
};

const ENERGY: Record<MusicPhase, number> = { plant: 0.5, run: 1, calm: 0.65 };

// Two bars of eighths each (null = rest): the video's motif in D minor and its D major twin.
const MOTIF_MIN = [62, null, 64, 65, null, 66, 67, null, 68, 69, null, 69, 70, 69, 67, 65];
const MOTIF_MAJ = [62, null, 66, 69, null, 66, 64, 62, 61, 64, null, 69, 71, 69, 66, 64];

export function triad([root, q]: Chord): number[] {
  if (q === 'm') return [root, root + 3, root + 7];
  if (q === '7') return [root, root + 4, root + 7, root + 10];
  return [root, root + 4, root + 7];
}

/** Bars in one loop of a phase ('calm' plays once). */
export const CYCLE_BARS: Record<MusicPhase, number> = { plant: 4, run: 4, calm: CALM_BARS };

/** The chord of a bar (for the string pads in the rendered files). */
export function barChord(phase: MusicPhase, bar: number): number[] {
  const chords = CHORDS[phase];
  return triad(chords[bar % chords.length] ?? chords[0]!);
}

/** The notes of bar `bar` (0-based, counted from the start of the phase). Empty once 'calm' has run its course. */
export function barEvents(phase: MusicPhase, bar: number): NoteEvent[] {
  if (bar < 0 || (phase === 'calm' && bar >= CALM_BARS)) return [];
  const chords = CHORDS[phase];
  const chord = chords[bar % chords.length] ?? chords[0]!;
  const [root] = chord;
  const tri = triad(chord);
  const e = ENERGY[phase];
  const last = phase === 'calm' && bar === CALM_BARS - 1;
  const out: NoteEvent[] = [];

  // tiptoe bass on every beat, root / fifth (the last calm bar is one long 'bom')
  for (let b = 0; b < BEATS_PER_BAR; b++) {
    if (last && b > 0) break;
    out.push({ beat: b, voice: 'bass', midi: root - 12 + (b % 2 ? 7 : 0), vol: 0.22 * (0.8 + 0.2 * e) });
  }
  if (last) {
    out.push({ beat: 1, voice: 'bell', midi: 86, vol: 0.12 });
    return out;
  }
  // finger snaps on 2 and 4
  for (const b of [1, 3]) out.push({ beat: b, voice: 'snap', midi: 0, vol: 0.1 * (0.7 + 0.3 * e) });
  // hats in eighths only while the germs spread
  if (phase === 'run') for (let k = 0; k < 8; k++) out.push({ beat: k / 2, voice: 'hat', midi: 0, vol: k % 2 ? 0.03 : 0.02 });
  // chord stabs on the offbeats: two per bar while planting, four otherwise
  [0.5, 1.5, 2.5, 3.5].forEach((b, k) => {
    if (phase === 'plant' && k % 2) return;
    out.push({ beat: b, voice: 'stab', midi: (tri[1] ?? root) + 12, vol: 0.09 * e });
    out.push({ beat: b, voice: 'stab', midi: root + 12, vol: 0.08 * e });
  });
  // the motif (never while planting)
  if (phase !== 'plant') {
    const line = phase === 'run' ? MOTIF_MIN : MOTIF_MAJ;
    const half = bar % 2 ? 8 : 0;
    for (let k = 0; k < 8; k++) {
      const n = line[half + k];
      if (n == null) continue;
      out.push({ beat: k / 2, voice: 'lead', midi: n + 12, vol: 0.17 * (0.8 + 0.2 * e) });
    }
  }
  return out;
}
