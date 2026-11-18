/**
 * Tiny sound effects, synthesized with Web Audio (no audio files, nothing to license).
 * Same family as the demo video's music: pizzicato plinks, a bassoon-ish 'bom', a comic 'bwomp'.
 * Sounds only ever start from a player's tap (or the run that tap started), never on their own,
 * and a mute switch is remembered per browser. The feed card (splash) has no sound at all.
 */
import type { RoundCue } from '../shared/soundPlan';

const KEY = 'epidemic-dots-sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    window.localStorage.setItem(KEY, m ? 'off' : 'on');
  } catch {
    /* private mode: the switch still works for this visit */
  }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.35, ctx.currentTime, 0.02);
}

/** Lazily opens the audio context; must first be called from a tap. Returns null when muted or unsupported. */
function audio(): { ac: AudioContext; out: GainNode } | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return master ? { ac: ctx, out: master } : null;
  } catch {
    return null;
  }
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** A short plucked note (pizzicato-ish): bright attack that darkens quickly. */
function pluck(midi: number, at = 0, vol = 0.5, len = 0.35) {
  const a = audio();
  if (!a) return;
  const t = a.ac.currentTime + at;
  const osc = a.ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = hz(midi);
  const f = a.ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(hz(midi) * 6, t);
  f.frequency.exponentialRampToValueAtTime(hz(midi) * 1.2, t + len);
  const g = a.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(f).connect(g).connect(a.out);
  osc.start(t);
  osc.stop(t + len + 0.05);
}

/** A reedy low note, optionally sliding down (the comic 'bwomp'). */
function reed(midi: number, at = 0, vol = 0.35, len = 0.25, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t = a.ac.currentTime + at;
  const osc = a.ac.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(hz(midi), t);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(hz(slideTo), t + len);
  const f = a.ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  const g = a.ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(f).connect(g).connect(a.out);
  osc.start(t);
  osc.stop(t + len + 0.05);
}

/** A soft bell (celesta-ish). */
function bell(midi: number, at = 0, vol = 0.18, len = 0.6) {
  const a = audio();
  if (!a) return;
  const t = a.ac.currentTime + at;
  for (const [mult, v] of [[1, 1], [3, 0.25]] as const) {
    const osc = a.ac.createOscillator();
    osc.frequency.value = hz(midi) * mult;
    const g = a.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len * (mult === 1 ? 1 : 0.4));
    osc.connect(g).connect(a.out);
    osc.start(t);
    osc.stop(t + len + 0.05);
  }
}

/** A short breathy noise burst (the release 'tsss'). */
function hiss(at = 0, vol = 0.2, len = 0.6) {
  const a = audio();
  if (!a) return;
  const t = a.ac.currentTime + at;
  const buf = a.ac.createBuffer(1, Math.floor(a.ac.sampleRate * len), a.ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.ac.createBufferSource();
  src.buffer = buf;
  const f = a.ac.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 3500;
  const g = a.ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(a.out);
  src.start(t);
}

// D minor / D major, like the video's tune.
const PLANT_NOTES = [74, 77, 81]; // D, F, A: plink, plink, plink

export const sfx = {
  /** First tap on the board: the zoom. */
  zoom: () => pluck(93, 0, 0.18, 0.12),
  /** A dot planted; n = how many are planted now (1-3). */
  plant: (n: number) => {
    pluck(PLANT_NOTES[Math.min(2, Math.max(0, n - 1))] ?? 74, 0, 0.55, 0.5);
    bell((PLANT_NOTES[Math.min(2, Math.max(0, n - 1))] ?? 74) + 12, 0, 0.08, 0.5);
  },
  /** A dot taken back. */
  recall: () => {
    pluck(77, 0, 0.4, 0.2);
    pluck(72, 0.08, 0.35, 0.3);
  },
  /** Not allowed (taken square, fourth dot, release too early). */
  nope: () => reed(43, 0, 0.25, 0.14),
  /** The pink button. */
  release: () => {
    for (let k = 0; k < 6; k++) pluck(69 + k * 2, k * 0.035, 0.25, 0.12);
    hiss(0.21, 0.12, 0.7);
    reed(38, 0.21, 0.35, 0.3);
  },
  /** One round of the run. */
  round: (r: number, cues: readonly RoundCue[]) => {
    for (const c of cues) {
      if (c === 'tick') bell(74 + 2 * Math.min(r, 8), 0, 0.1, 0.4);
      if (c === 'wake') reed(38, 0, 0.42, 0.65, 30);
      if (c === 'hit') {
        // a sad little 'boing' when the germs reach your dots
        reed(62, 0.12, 0.2, 0.35, 55);
      }
    }
  },
  /** End of the run. */
  result: (cue: 'cheer' | 'meh') => {
    if (cue === 'cheer') {
      [74, 78, 81, 86].forEach((n, k) => pluck(n, k * 0.07, 0.5, 0.6));
      bell(86, 0.28, 0.14, 1.0);
    } else {
      // deadpan 'wah-wah'
      reed(57, 0, 0.25, 0.35);
      reed(56, 0.35, 0.25, 0.35);
      reed(55, 0.7, 0.25, 0.7, 53);
    }
  },
  /** A vote or a small toggle. */
  click: () => pluck(86, 0, 0.25, 0.08),
};
