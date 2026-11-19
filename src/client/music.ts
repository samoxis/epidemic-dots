/**
 * The in-game tune. The notes come from shared/musicPlan.ts. It plays three small MP3 loops rendered from those notes
 * with the demo video's instruments (tools/render-music.py: strings, pizzicato, reverb), fetched only after the first
 * tap; until they arrive, or if they cannot load, the same notes are synthesized live with Web Audio.
 * It starts only from a player's tap, plays through the sound effects' output (so the Sound switch silences it too),
 * has its own Music switch remembered per browser, pauses while the tab is hidden, and never plays in the feed card.
 */
import { BEAT_S, BEATS_PER_BAR, CYCLE_BARS, barEvents, type MusicPhase, type NoteEvent } from '../shared/musicPlan';
import plantUrl from './music/plant.mp3';
import runUrl from './music/run.mp3';
import calmUrl from './music/calm.mp3';
import { audio } from './sound';

const KEY = 'epidemic-dots-music';
const LEVEL = 0.5;
const AHEAD_S = 0.15;

let off = readOff();
let gain: GainNode | null = null;
let phase: MusicPhase | null = null;
let bar = 0;
let barStart = 0;
let timer: number | undefined;
/** Decoded loops, once loaded. */
const loops: Partial<Record<MusicPhase, AudioBuffer>> = {};
let loading = false;
/** Loop sources still sounding (faded out on a phase change). */
let active: { src: AudioBufferSourceNode; g: GainNode }[] = [];
/** True while the current loop cycle comes from a file (so the live synth stays quiet). */
let cycleFromFile = false;
const LOOP_LEVEL = 0.75;

function loadLoops(ac: AudioContext) {
  if (loading) return;
  loading = true;
  const urls: Record<MusicPhase, string> = { plant: plantUrl, run: runUrl, calm: calmUrl };
  for (const p of Object.keys(urls) as MusicPhase[]) {
    void fetch(urls[p])
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => {
        loops[p] = buf;
      })
      .catch((e: unknown) => console.warn(`[music] ${p} loop unavailable, using the live synth`, e));
  }
}

function startLoop(ac: AudioContext, out: GainNode, buf: AudioBuffer, t: number) {
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = LOOP_LEVEL;
  src.connect(g).connect(out);
  src.start(t);
  const item = { src, g };
  active.push(item);
  src.onended = () => {
    active = active.filter((x) => x !== item);
  };
}

function fadeLoops(at: number) {
  for (const { src, g } of active) {
    g.gain.setTargetAtTime(0, at, 0.08);
    try {
      src.stop(at + 0.5);
    } catch {
      /* already stopped */
    }
  }
  active = [];
}

function readOff(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function bus(): { ac: AudioContext; out: GainNode } | null {
  const a = audio();
  if (!a) return null;
  if (!gain) {
    gain = a.ac.createGain();
    gain.gain.value = off ? 0 : LEVEL;
    gain.connect(a.out);
  }
  return { ac: a.ac, out: gain };
}

function tone(ac: AudioContext, out: GainNode, t: number, n: NoteEvent) {
  const g = ac.createGain();
  g.connect(out);
  if (n.voice === 'snap' || n.voice === 'hat') {
    const len = n.voice === 'snap' ? 0.05 : 0.04;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = n.voice === 'snap' ? 1800 : 7000;
    g.gain.setValueAtTime(n.vol * 2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g);
    src.start(t);
    return;
  }
  const osc = ac.createOscillator();
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  let len: number;
  if (n.voice === 'bass') {
    osc.type = 'sawtooth';
    f.frequency.value = 900;
    len = 0.22;
  } else if (n.voice === 'bell') {
    osc.type = 'sine';
    f.frequency.value = 8000;
    len = 2.5;
  } else {
    // stab and lead: a pizzicato-ish pluck that darkens quickly
    osc.type = 'triangle';
    f.frequency.setValueAtTime(hz(n.midi) * 6, t);
    f.frequency.exponentialRampToValueAtTime(hz(n.midi) * 1.2, t + 0.3);
    len = n.voice === 'lead' ? 0.35 : 0.25;
  }
  osc.frequency.value = hz(n.midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(n.vol, t + (n.voice === 'bass' ? 0.012 : 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(f).connect(g);
  osc.start(t);
  osc.stop(t + len + 0.05);
}

/** Schedules every bar that starts before now + AHEAD_S. */
function tick() {
  const a = bus();
  if (!a || !phase || document.hidden) return;
  const barLen = BEAT_S * BEATS_PER_BAR;
  // after a pause (hidden tab) do not play a backlog: restart on the next beat
  if (barStart < a.ac.currentTime - barLen) barStart = a.ac.currentTime + 0.05;
  while (barStart < a.ac.currentTime + AHEAD_S) {
    const notes = barEvents(phase, bar);
    if (notes.length === 0 && phase === 'calm') {
      // the calm loop rings out by itself; just stop scheduling
      phase = null;
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      return;
    }
    if (bar % CYCLE_BARS[phase] === 0) {
      const buf = loops[phase];
      cycleFromFile = Boolean(buf);
      if (buf) startLoop(a.ac, a.out, buf, barStart);
    }
    if (!cycleFromFile) for (const n of notes) tone(a.ac, a.out, barStart + n.beat * BEAT_S, n);
    bar++;
    barStart += barLen;
  }
}

export function isMusicOff(): boolean {
  return off;
}

export function setMusicOff(m: boolean): void {
  off = m;
  try {
    window.localStorage.setItem(KEY, m ? 'off' : 'on');
  } catch {
    /* private mode: the switch still works for this visit */
  }
  const a = audio();
  if (gain && a) gain.gain.setTargetAtTime(m ? 0 : LEVEL, a.ac.currentTime, 0.05);
}

/**
 * Switches the tune to a phase. `now` starts the new phase at once (the run, so its rounds land on the beat);
 * otherwise it starts on the next beat. Calling it with the phase already playing does nothing.
 */
export function playMusic(next: MusicPhase, now = false): void {
  if (phase === next) return;
  const a = bus();
  if (!a) return;
  loadLoops(a.ac);
  const t = a.ac.currentTime;
  fadeLoops(t);
  cycleFromFile = false;
  if (now || !phase) {
    barStart = t + 0.03;
  } else {
    const sinceBar = t - (barStart - BEAT_S * BEATS_PER_BAR);
    barStart = t + (BEAT_S - (((sinceBar % BEAT_S) + BEAT_S) % BEAT_S));
  }
  phase = next;
  bar = 0;
  if (timer === undefined) timer = window.setInterval(tick, 40);
  tick();
}

export function stopMusic(): void {
  const a = audio();
  if (a) fadeLoops(a.ac.currentTime);
  phase = null;
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
}

// A hidden tab goes quiet at once (a loop could otherwise ring on for seconds); the live synth covers the rest of
// the cycle when the player comes back.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    const a = audio();
    if (a) fadeLoops(a.ac.currentTime);
    cycleFromFile = false;
  });
}
