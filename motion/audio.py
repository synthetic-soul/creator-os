"""Sound design for "Considered." — synthesised from scratch, frame-locked to scene.js.

Every cue is placed from the same timeline constants the picture uses. The reverb is
applied circularly so the tail of the last second folds back into the first: the
piece loops without a seam in sound as well as picture.
"""
import math
import sys

import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

# ── timeline (mirrors scene.js) ──────────────────────────────────────────
TL = dict(
    dotIn=0.28, anticA=1.00, expand=1.30, sweepA=1.92, sweepB=2.78, fill=2.74,
    morph=3.36, sheenA=4.18, sheenB=4.92, grid=4.95, press=6.26, release=6.40,
    collapse=7.42, launchPrep=8.50, launch=8.64, land=9.40, type=8.78, sub=9.95,
    outSub=12.45, outType=12.55, retPrep=13.02, retA=13.14, retB=13.92,
    endA=14.22, endB=14.66,
)
COLS, ROWS, CC, CR, PITCH = 13, 7, 6, 3, 108
TILES = []
for r in range(ROWS):
    for c in range(COLS):
        i = r * COLS + c
        x = math.sin(i * 127.1 + 311.7) * 43758.5453
        h = x - math.floor(x)
        TILES.append(dict(c=c, r=r, dist=math.hypot(c - CC, r - CR), h=h))
MAX_DIST = max(t['dist'] for t in TILES)
LAST_ARRIVE = TL['collapse'] + MAX_DIST * 0.05 + 0.56


def hz(note):
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2,
             'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    n, o = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o - 4)) / 12)


# ── buses ────────────────────────────────────────────────────────────────
dry = np.zeros((2, N))
send = np.zeros((2, N))  # to reverb


def place(sig, t0, pan=0.0, gain=1.0, verb=0.25):
    """Equal-power pan, add to dry and reverb send."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    sig = sig[: N - max(i0, 0)] if i0 >= 0 else sig[-i0:]
    i0 = max(i0, 0)
    a = (pan + 1) * math.pi / 4
    l, r = math.cos(a) * gain, math.sin(a) * gain
    dry[0, i0:i0 + len(sig)] += l * sig
    dry[1, i0:i0 + len(sig)] += r * sig
    send[0, i0:i0 + len(sig)] += l * sig * verb
    send[1, i0:i0 + len(sig)] += r * sig * verb


def tvec(d):
    return np.arange(int(d * SR)) / SR


def env_ad(t, a, d, curve=1.0):
    e = np.where(t < a, (t / max(a, 1e-6)), np.exp(-(t - a) / d))
    return e ** curve


def lowpass(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR / 2 - 100) / (SR / 2))
    return signal.lfilter(b, a, x)


def bandpass(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def sweep_filter(x, f0, f1, q=0.9, curve=1.0):
    """Time-varying state-variable band-pass (Chamberlin), f0→f1 exponentially."""
    n = len(x)
    out = np.zeros(n)
    low = band = 0.0
    damp = 1.0 / q
    for i in range(n):
        u = (i / max(n - 1, 1)) ** curve
        fc = f0 * (f1 / f0) ** u
        f = 2 * math.sin(math.pi * min(fc, 12000) / SR)
        high = x[i] - low - damp * band
        band += f * high
        low += f * band
        out[i] = band
    return out


def layer(*sigs):
    out = np.zeros(max(len(x) for x in sigs))
    for x in sigs:
        out[:len(x)] += x
    return out


# ── instruments ──────────────────────────────────────────────────────────
def pop(f=1180, d=0.11, drop=0.35):
    """Soft UI pop: sine with a quick downward pitch glide + a warm body."""
    t = tvec(d * 4)
    fr = f * (1 - drop * (1 - np.exp(-t / 0.018)))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    s = np.sin(ph) * env_ad(t, 0.002, d)
    body = np.sin(2 * np.pi * np.cumsum(f * 0.25 * (1 - 0.3 * (1 - np.exp(-t / 0.03)))) / SR)
    s += 0.55 * body * env_ad(t, 0.003, d * 0.8)
    return s


def thump(f=58, d=0.28):
    t = tvec(d * 4)
    fr = f * (1 + 1.4 * np.exp(-t / 0.02))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * env_ad(t, 0.004, d)


def bell(f, d=1.6, bright=1.0):
    """FM-free additive bell: slightly inharmonic partials, higher ones die faster."""
    t = tvec(d * 4)
    parts = [(1.0, 1.0, 1.0), (2.0, 0.34 * bright, 0.55), (3.01, 0.12 * bright, 0.35),
             (4.17, 0.07 * bright, 0.22), (5.43, 0.035 * bright, 0.15)]
    s = np.zeros_like(t)
    for ratio, amp, dk in parts:
        s += amp * np.sin(2 * np.pi * f * ratio * t + rng.uniform(0, 6.28)) * env_ad(t, 0.0025, d * dk)
    return s


def pluck(f, d=0.35):
    """Glassy marimba-ish pluck for the pixels."""
    t = tvec(d * 4)
    s = np.sin(2 * np.pi * f * t) * env_ad(t, 0.0015, d)
    s += 0.28 * np.sin(2 * np.pi * f * 3.93 * t) * env_ad(t, 0.001, d * 0.18)
    s += 0.10 * np.sin(2 * np.pi * f * 9.2 * t) * env_ad(t, 0.0008, d * 0.06)
    return s


def tick(d=0.018, fc=5200):
    t = tvec(d * 5)
    n = rng.standard_normal(len(t))
    return bandpass(n, fc * 0.6, fc * 1.6) * env_ad(t, 0.0006, d)


def whoosh(d, f0, f1, q=1.4, shape='swell', curve=1.0):
    t = tvec(d)
    n = rng.standard_normal(len(t))
    s = sweep_filter(n, f0, f1, q, curve)
    u = t / d
    if shape == 'swell':      # rise then fall
        e = np.sin(np.pi * u) ** 2
    elif shape == 'in':       # reverse-cymbal style: grows to the end, cut clean
        e = u ** 2.6 * (1 - np.exp(-(1 - u) * 60))
    else:                     # out: hit then tail
        e = np.exp(-u * 4) * (1 - np.exp(-u * 200))
    return s * e


def pad(notes, d, attack, release, cutoff0, cutoff1):
    """Warm, slowly opening chord: detuned saw-ish stacks, low-passed."""
    t = tvec(d)
    s = np.zeros_like(t)
    for f in notes:
        for det in (-0.07, 0.0, 0.06):
            ff = f * 2 ** (det / 12)
            ph = rng.uniform(0, 6.28)
            # band-limited-ish saw from 6 harmonics
            for k in range(1, 7):
                s += (1 / k) * np.sin(2 * np.pi * ff * k * t + ph * k) / len(notes)
    # time-varying lowpass via blocks
    out = np.zeros_like(s)
    blk = 1024
    zi = None
    for i in range(0, len(s), blk):
        u = i / len(s)
        fc = cutoff0 * (cutoff1 / cutoff0) ** u
        b, a = signal.butter(2, fc / (SR / 2))
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        out[i:i + blk], zi = signal.lfilter(b, a, s[i:i + blk], zi=zi)
    e = np.minimum(1, t / attack) * np.minimum(1, np.maximum(0, (d - t) / release))
    e = e ** 1.6
    return out * e


# ── score ────────────────────────────────────────────────────────────────
# 0 · The point arrives.
place(pop(1320, 0.09), TL['dotIn'], gain=0.24, verb=0.4)
place(thump(62, 0.16), TL['dotIn'], gain=0.16, verb=0.1)

# Anticipation — a small inhale.
place(whoosh(0.30, 900, 2600, q=2.0, shape='in'), TL['anticA'], gain=0.05, verb=0.3)

# 1 · Ring blooms out.
place(thump(48, 0.42), TL['expand'], gain=0.26, verb=0.2)
place(whoosh(0.9, 350, 5200, q=1.1, shape='out', curve=0.5), TL['expand'], gain=0.22, verb=0.5)
place(bell(hz('D5'), 1.6, 0.6), TL['expand'] + 0.01, gain=0.10, verb=0.6)

# Colour sweeps round the ring — a rising pentatonic run that follows the ease.
run = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6']


def ease_in_out(x):  # matches bezier(0.65,0,0.35,1) closely enough for placement
    return 0.5 - 0.5 * math.cos(math.pi * x) if x < 1 else 1


for k, n in enumerate(run):
    # invert the ease so notes land where the colour front is
    target = (k + 0.5) / len(run)
    lo, hi = 0.0, 1.0
    for _ in range(30):
        mid = (lo + hi) / 2
        (lo, hi) = (mid, hi) if ease_in_out(mid) < target else (lo, mid)
    tt = TL['sweepA'] + lo * (TL['sweepB'] - TL['sweepA'])
    ang = 2 * math.pi * target - math.pi / 2
    place(bell(hz(n), 1.2, 0.8), tt, pan=0.55 * math.cos(ang), gain=0.055 + 0.006 * k, verb=0.7)

# Fill → icon: the pad arrives, the shape settles with a glass tap.
pad_notes = [hz('D3'), hz('A3'), hz('E4'), hz('F#4'), hz('C#5')]
pad_start = TL['fill'] - 0.2
pad_len = LAST_ARRIVE - pad_start + 0.05
place(pad(pad_notes, pad_len, 1.6, 0.9, 340, 2000), pad_start, gain=0.10, verb=0.45)
place(whoosh(0.7, 1800, 500, q=1.3, shape='swell'), TL['fill'], gain=0.07, verb=0.4)
place(bell(hz('A6'), 0.9, 1.2), TL['morph'] + 0.18, gain=0.07, verb=0.6)
place(bell(hz('E6'), 1.1, 1.0), TL['morph'] + 0.20, pan=0.1, gain=0.05, verb=0.6)
# Sheen: a breath of air.
place(whoosh(TL['sheenB'] - TL['sheenA'], 5000, 11000, q=1.5, shape='swell'), TL['sheenA'],
      pan=-0.2, gain=0.05, verb=0.5)

# 2 · Pixels — one note per tile, pitched by distance, panned by column.
scale = [hz(n) for n in ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6', 'B6']]
place(thump(70, 0.12), TL['grid'], gain=0.3, verb=0.15)
for q in TILES:
    if q['c'] == CC and q['r'] == CR:
        continue
    d = TL['grid'] + 0.14 + q['dist'] * 0.055 + (q['h'] - 0.5) * 0.03
    idx = min(len(scale) - 1, int(q['dist'] * 1.35))
    g = 0.030 * (1 - 0.06 * q['dist'])
    place(pluck(scale[idx] * (1 + (q['h'] - 0.5) * 0.004), 0.22), d + 0.03,
          pan=(q['c'] - CC) / CC * 0.8, gain=g, verb=0.55)

# Press and ripple.
place(layer(tick(0.012, 2400) * 0.9, thump(160, 0.05) * 0.5), TL['press'], gain=0.28, verb=0.15)
place(thump(96, 0.09), TL['release'], gain=0.25, verb=0.2)
place(whoosh(0.95, 250, 3200, q=1.2, shape='out', curve=0.6), TL['release'], gain=0.12, verb=0.5)
for k, n in enumerate(['A4', 'D5', 'F#5']):
    place(bell(hz(n), 1.3, 0.5), TL['release'] + 0.06 * k, pan=(k - 1) * 0.3, gain=0.05, verb=0.7)

# 3 · Collapse — everything drains into one point.
col_len = LAST_ARRIVE - TL['collapse']
place(whoosh(col_len, 400, 4800, q=1.8, shape='in', curve=1.6), TL['collapse'], gain=0.22, verb=0.2)
tt = tvec(col_len)
riser = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (2 * (tt / col_len) ** 2)) / SR) * (tt / col_len) ** 3
place(riser * (1 - np.exp(-(col_len - tt) * 80)), TL['collapse'], gain=0.05, verb=0.3)
# The merge: a deep, satisfying full stop.
place(thump(44, 0.42), LAST_ARRIVE, gain=0.5, verb=0.2)
place(pop(880, 0.14, 0.45), LAST_ARRIVE, gain=0.35, verb=0.5)
place(bell(hz('D4'), 2.2, 0.5), LAST_ARRIVE, gain=0.10, verb=0.8)

# Hop.
place(tick(0.01, 3000), TL['launchPrep'], gain=0.05, verb=0.2)
t = tvec(0.14)
place(np.sin(2 * np.pi * np.cumsum(700 + 900 * t / 0.14) / SR) * env_ad(t, 0.004, 0.05),
      TL['launch'], gain=0.10, verb=0.4)
# Letters: tiny ticks travelling left → right.
for i in range(10):
    place(tick(0.010, 4200 + 180 * i), TL['type'] + i * 0.034 + 0.03, pan=-0.6 + i * 0.13, gain=0.07, verb=0.35)
# Landing: marimba tock + the resolving chord.
place(layer(pluck(hz('D5'), 0.5), 0.6 * pluck(hz('A5'), 0.35)), TL['land'], pan=0.35, gain=0.22, verb=0.5)
place(thump(66, 0.18), TL['land'], pan=0.3, gain=0.35, verb=0.1)
chord = ['D4', 'A4', 'C#5', 'E5', 'F#5', 'A5']
for k, n in enumerate(chord):
    place(bell(hz(n), 3.2, 0.55), TL['land'] + 0.012 * k, pan=-0.4 + 0.16 * k, gain=0.05, verb=0.85)
place(pad([hz('D3'), hz('A3'), hz('F#4'), hz('C#5'), hz('E5')], TL['outType'] - TL['land'] + 0.8, 0.6, 1.2, 900, 1600),
      TL['land'], gain=0.12, verb=0.6)
place(whoosh(1.1, 3000, 8000, q=1.2, shape='swell'), TL['sub'], gain=0.03, verb=0.5)

# Outro: letters fall away, the point goes home.
for i in range(10):
    place(tick(0.009, 3600 - 150 * i), TL['outType'] + i * 0.026 + 0.18, pan=-0.6 + i * 0.13, gain=0.04, verb=0.4)
place(whoosh(0.7, 3000, 600, q=1.3, shape='swell'), TL['outType'], gain=0.07, verb=0.5)
t = tvec(0.5)
place(np.sin(2 * np.pi * np.cumsum(900 - 500 * t / 0.5) / SR) * np.sin(np.pi * t / 0.5) ** 2,
      TL['retA'] + 0.1, gain=0.035, verb=0.6)
place(pop(1320, 0.07), TL['retB'], gain=0.18, verb=0.4)
# The point breathes in and is gone — mirror of the opening pop.
place(whoosh(TL['endB'] - TL['endA'], 800, 3000, q=2.0, shape='in'), TL['endA'], gain=0.06, verb=0.3)
place(pop(1480, 0.05, 0.1)[::-1][-int(0.12 * SR):], TL['endB'] - 0.12, gain=0.18, verb=0.3)

# ── reverb (circular so the loop is seamless) ────────────────────────────
rt = 2.4
L = int(rt * SR)
ti = np.arange(L) / SR
ir = np.zeros((2, L))
for ch in range(2):
    n = rng.standard_normal(L) * np.exp(-6.9 * ti / rt)
    # darker as it decays
    hi = lowpass(n, 9000)
    lo = lowpass(n, 2200)
    mix = np.exp(-ti / 0.35)
    ir[ch] = hi * mix + lo * (1 - mix)
    ir[ch][: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))  # pre-delay softening
    for k in range(6):  # a few early reflections
        j = int((0.011 + 0.007 * k + 0.003 * ch) * SR)
        ir[ch][j] += 0.5 * (0.7 ** k)
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))

wet = np.zeros((2, N))
for ch in range(2):
    full = signal.fftconvolve(send[ch], ir[ch])
    wet[ch] += full[:N]
    tail = full[N:]
    wet[ch, :len(tail)] += tail  # fold the tail round to the top
wet = bandpass(wet, 180, 12000)

mix = dry + 0.55 * wet
# gentle master: high-pass rumble, soft saturation, normalise
mix = signal.lfilter(*signal.butter(2, 28 / (SR / 2), 'high'), mix)
peak = np.abs(mix).max()
mix = mix / peak * 0.9
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
mix = mix / np.abs(mix).max() * 10 ** (-3.0 / 20)  # ≈ -16 LUFS integrated

out = sys.argv[1] if len(sys.argv) > 1 else 'score.wav'
from scipy.io import wavfile
wavfile.write(out, SR, (mix.T * 32767).astype(np.int16))
print('wrote', out, 'rms dBFS', 20 * np.log10(np.sqrt((mix ** 2).mean())))
