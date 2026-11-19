"""Renders the in-game music files from the tune in src/shared/musicPlan.ts, with the demo video's instruments:
plucked-string pizzicato (Karplus-Strong), a reedy bassoon bass, finger snaps, string pads and a small room reverb.
Original synthesis, no samples.

Usage:
  node --experimental-strip-types tools/music-plan.ts > plan.json
  python tools/render-music.py plan.json OUT_DIR
Writes OUT_DIR/plant.wav, run.wav and calm.wav: one loop each (calm plays once) plus a reverb tail that rings over
the start of the next loop. Encode to MP3 afterwards (see the README in that folder's parent)."""
import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, lfilter

SR = 44100
TAIL = 2.5
rng = np.random.default_rng(5)


def hz(n):
    return 440 * 2 ** ((n - 69) / 12)


def tt(d):
    return np.arange(int(SR * d)) / SR


def lowpass(x, c):
    b, a = butter(2, c / (SR / 2))
    return lfilter(b, a, x)


def highpass(x, c):
    b, a = butter(2, c / (SR / 2), btype='high')
    return lfilter(b, a, x)


def pizz(n, dur=0.35, vol=0.3, bright=0.55):
    p = max(2, int(SR / hz(n)))
    b = rng.uniform(-1, 1, p)
    out = np.zeros(int(SR * dur))
    for i in range(len(out)):
        out[i] = b[i % p]
        b[i % p] = 0.996 * (bright * b[i % p] + (1 - bright) * b[(i + 1) % p])
    return vol * out * np.exp(-tt(dur) * 6)


def bassoon(n, dur=0.2, vol=0.22):
    t = tt(dur)
    f = hz(n) * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t))
    ph = np.cumsum(f) / SR
    reed = lowpass(2 * (ph % 1) - 1, 1100) + 0.3 * lowpass(np.sign(np.sin(2 * np.pi * ph)), 600)
    return vol * reed * np.minimum(1, t / 0.012) * np.exp(-t * 9)


def snap(vol=0.11):
    return vol * highpass(rng.standard_normal(int(SR * 0.05)), 1800) * np.exp(-tt(0.05) * 80)


def hat(vol=0.035):
    return vol * highpass(rng.standard_normal(int(SR * 0.04)), 7000) * np.exp(-tt(0.04) * 90)


def celesta(n, dur=0.8, vol=0.1):
    t = tt(dur)
    f = hz(n)
    return vol * (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(6 * np.pi * f * t) * np.exp(-t * 12)) * np.exp(-t * 5)


def strings(notes, dur, vol=0.045, attack=0.6, cutoff=2000):
    t = tt(dur)
    s = np.zeros(len(t))
    for n in notes:
        for det in (-0.006, 0.0, 0.007):
            ph = np.cumsum(np.full(len(t), hz(n) * (1 + det))) / SR
            s += 2 * (ph % 1) - 1
    s = lowpass(s / (3 * len(notes)), cutoff)
    return vol * s * np.minimum(1, t / attack) * np.minimum(1, np.maximum(0, dur - t) / 0.4)


PAN = {'bass': -0.15, 'snap': 0.45, 'hat': 0.6, 'lead': 0.1, 'bell': 0.2}
PAD_VOL = {'plant': 0.022, 'run': 0.035, 'calm': 0.045}


def render(phase, bars, beat, per_bar):
    bar_len = beat * per_bar
    length = len(bars) * bar_len
    n = int(SR * (length + TAIL))
    L = np.zeros(n)
    R = np.zeros(n)

    def add(sig, t, pan=0.0):
        i = int(round(t * SR))
        j = min(n, i + len(sig))
        a = (pan + 1) * np.pi / 4
        L[i:j] += np.cos(a) * sig[: j - i]
        R[i:j] += np.sin(a) * sig[: j - i]

    for b, bar in enumerate(bars):
        t0 = b * bar_len
        last = phase == 'calm' and b == len(bars) - 1
        stab_side = 1
        for note in bar['notes']:
            t = t0 + note['beat'] * beat
            v, m, kind = note['vol'], note['midi'], note['voice']
            if kind == 'bass':
                add(bassoon(m, dur=0.9 if last else 0.2, vol=v * (1.5 if last else 1)), t, PAN['bass'])
            elif kind == 'snap':
                add(snap(v), t, PAN['snap'])
            elif kind == 'hat':
                add(hat(v), t, PAN['hat'])
            elif kind == 'stab':
                add(pizz(m, vol=v), t, 0.35 * stab_side)
                stab_side = -stab_side
            elif kind == 'lead':
                add(pizz(m, vol=v, bright=0.6), t, PAN['lead'])
                if phase == 'run':
                    add(celesta(m + 12, dur=0.3, vol=0.025), t, 0.3)
            elif kind == 'bell':
                add(pizz(m, dur=2.0, vol=0.3, bright=0.7), t, PAN['bell'])
                add(celesta(m, dur=3.0, vol=0.12), t, PAN['bell'])
        # string pads: the 'violins' under every bar (softest while planting)
        chord = bar['chord']
        notes = [x + 12 for x in chord[:3]] + [chord[0] - 12]
        if last:
            add(strings([50, 57, 62, 66, 69], 3.8, vol=0.05, attack=0.3), t0)
        else:
            add(strings(notes, bar_len + 0.4, vol=PAD_VOL[phase], attack=0.8 if phase != 'calm' else 0.4), t0)

    # small room, same as the video
    ir_t = tt(1.4)
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 4.2)
    ir[: int(SR * 0.012)] = 0
    ir = lowpass(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    L = L + 0.17 * fftconvolve(L, ir)[:n]
    R = R + 0.17 * fftconvolve(R, np.roll(ir, 331))[:n]
    out = np.stack([L, R], axis=1)
    f = int(SR * 0.5)
    out[-f:] *= (np.linspace(1, 0, f) ** 2)[:, None]
    return out


def main():
    plan = json.load(open(sys.argv[1], encoding='utf-8'))
    outs = {p: render(p, bars, plan['beat'], plan['beatsPerBar']) for p, bars in plan['phases'].items()}
    # one shared scale, so 'plant' stays quieter than 'run'
    peak = max(np.max(np.abs(np.tanh(o * 1.15))) for o in outs.values())
    for p, o in outs.items():
        o = np.tanh(o * 1.15) / peak * 0.89
        wavfile.write(f'{sys.argv[2]}/{p}.wav', SR, (o * 32767).astype(np.int16))
        print('wrote', p, round(len(o) / SR, 2), 's')


main()
