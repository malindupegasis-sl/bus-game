"""
LANKAN BUS LEGENDZ - 8-bit baila drafts (NOT used by the game).

Three original tunes in the bouncy 6/8 baila feel, synthesised from scratch: a bright square-wave
"trumpet" lead with brass stabs, a driving triangle bass, a choppy pulse "guitar" strum, and a
deliberately cheap, crunchy drum machine with far too many fills (plus a bus air-horn in the break).

    python3 music-drafts/src/compose.py music-drafts

writes <slug>.mp3 for each variation plus tracks.json (exact loop length, for seamless looping).
All melodies here are original; nothing is transcribed from an existing song.
"""
import json
import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 130                       # dotted-quarter beats per minute (two per 6/8 bar)
EIGHTH = 60.0 / BPM / 3         # seconds per eighth note
BAR = 6                         # eighths per bar
RNG = np.random.default_rng(1234)

NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def midi(name):
    pitch, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + NOTE[pitch]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pos(eighths):
    """Sample index of a time in eighths (rounded once, so nothing drifts over 96 bars)."""
    return int(round(eighths * EIGHTH * SR))


# ------------------------------------------------------------------ oscillators

def polyblep(t, dt):
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt[m]
    y[m] = x * x + x + x + 1
    return y


def pulse(freq, duty):
    """Band-limited pulse wave for a per-sample frequency array."""
    dt = np.clip(freq / SR, 1e-6, 0.45)
    ph = np.cumsum(dt) % 1.0
    naive = np.where(ph < duty, 1.0, -1.0)
    return naive + polyblep(ph, dt) - polyblep((ph - duty) % 1.0, dt)


def triangle(freq, steps=16):
    ph = np.cumsum(freq / SR) % 1.0
    tri = 4 * np.abs(ph - 0.5) - 1
    return np.round(tri * (steps / 2)) / (steps / 2)   # 4-bit stepped, like an old console


def env_adsr(n, a=0.005, d=0.08, s=0.7, r=0.04, gate=None):
    gate = n if gate is None else min(gate, n)
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel_start = gate / SR
    after = t > rel_start
    e[after] *= np.exp(-(t[after] - rel_start) / max(r, 1e-6))
    return e


# ------------------------------------------------------------------ instruments

def trumpet(m, dur_s, vel=1.0):
    """Bright square 'trumpet': two detuned pulses, a brassy pitch scoop, vibrato on long notes."""
    n = int((dur_s + 0.06) * SR)
    t = np.arange(n) / SR
    cents = -35 * np.exp(-t / 0.025)                                  # scoop up into the note
    if dur_s > 0.3:
        cents += 14 * np.sin(2 * np.pi * 6.0 * t) * np.clip((t - 0.12) / 0.15, 0, 1)
    f = hz(m) * 2 ** (cents / 1200)
    x = 0.6 * pulse(f * 2 ** (5 / 1200), 0.5) + 0.4 * pulse(f * 2 ** (-6 / 1200), 0.25)
    gate = int(dur_s * SR)
    return x * env_adsr(n, a=0.006, d=0.09, s=0.72, r=0.035, gate=gate) * vel


def stab(ms, vel=1.0, length=0.11):
    """Short brass-like chord stab."""
    n = int((length + 0.05) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in ms:
        f = hz(m) * 2 ** ((-25 * np.exp(-t / 0.015)) / 1200)
        out += pulse(f, 0.5)
    e = np.minimum(t / 0.003, 1) * np.exp(-t / (length * 0.55))
    return out / len(ms) * e * vel


def strum(ms, vel=1.0):
    """Choppy off-beat chord 'guitar' chk (thin 12.5% pulse)."""
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    out = sum(pulse(np.full(n, hz(m)), 0.125) for m in ms) / len(ms)
    return out * np.minimum(t / 0.002, 1) * np.exp(-t / 0.025) * vel


def bass(m, dur_s, vel=1.0):
    n = int((dur_s + 0.03) * SR)
    x = triangle(np.full(n, hz(m)))
    return x * env_adsr(n, a=0.002, d=0.12, s=0.85, r=0.02, gate=int(dur_s * 0.9 * SR)) * vel


def noise(n):
    return RNG.uniform(-1, 1, n)


def hp(x, k=1):
    for _ in range(k):
        x = np.diff(x, prepend=0.0)
    return x


def smooth(x, n):
    return np.convolve(x, np.ones(n) / n, mode='same')


_drum_cache = {}


def drum(name, p=1.0):
    key = (name, round(p, 3))
    if key in _drum_cache:
        return _drum_cache[key]
    if name == 'kick':
        n = int(0.32 * SR); t = np.arange(n) / SR
        f = 44 + 120 * np.exp(-t / 0.028)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.17)
        x[: int(0.004 * SR)] += noise(int(0.004 * SR)) * 0.6
    elif name == 'snare':                       # p = tone pitch multiplier (machine-gun rolls rise)
        n = int(0.24 * SR); t = np.arange(n) / SR
        x = hp(noise(n)) * 0.7 * np.exp(-t / 0.085) + 0.55 * np.sin(2 * np.pi * 185 * p * t) * np.exp(-t / 0.045)
    elif name == 'clap':
        n = int(0.25 * SR); t = np.arange(n) / SR
        e = np.zeros(n)
        for off in (0, 0.011, 0.022):
            k = t >= off
            e[k] += np.exp(-(t[k] - off) / 0.008)
        e += 0.5 * np.exp(-t / 0.11) * (t > 0.022)
        x = hp(smooth(noise(n), 3)) * e
    elif name == 'hat':
        n = int(0.05 * SR); t = np.arange(n) / SR
        x = hp(noise(n), 2) * 0.5 * np.exp(-t / 0.014)
    elif name == 'tamb':
        n = int(0.12 * SR); t = np.arange(n) / SR
        x = hp(noise(n), 2) * 0.45 * np.exp(-t / 0.04) * (1 + 0.5 * np.sin(2 * np.pi * 70 * t))
    elif name == 'tom':                          # p = pitch in Hz
        n = int(0.26 * SR); t = np.arange(n) / SR
        f = p * (1 + 0.7 * np.exp(-t / 0.04))
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13)
    elif name == 'crash':
        n = int(1.7 * SR); t = np.arange(n) / SR
        metal = sum(pulse(np.full(n, fr), 0.5) for fr in (587, 845, 1043, 1351, 1693, 2211)) / 6
        x = (hp(noise(n), 2) * 0.8 + 0.35 * hp(metal)) * np.exp(-t / 0.55)
    elif name == 'cowbell':
        n = int(0.22 * SR); t = np.arange(n) / SR
        x = 0.5 * (pulse(np.full(n, 545.0), 0.5) + pulse(np.full(n, 815.0), 0.5)) * np.exp(-t / 0.07)
    elif name == 'zap':                          # cheesy laser
        n = int(0.28 * SR); t = np.arange(n) / SR
        f = 2400 * np.exp(-t / 0.06) + 90
        x = pulse(f, 0.5) * 0.55 * np.exp(-t / 0.12)
    else:
        raise ValueError(name)
    _drum_cache[key] = x
    return x


def airhorn(root_m, dur_s=0.75):
    """Party-bus air horn: two detuned square chords that sag in pitch at the end."""
    n = int((dur_s + 0.08) * SR); t = np.arange(n) / SR
    sag = np.where(t > dur_s * 0.7, -60 * (t - dur_s * 0.7) / (dur_s * 0.3), 0)
    out = np.zeros(n)
    for m in (root_m, root_m + 4, root_m + 7):
        for det in (-9, 9):
            f = hz(m) * 2 ** ((det + sag + 4 * np.sin(2 * np.pi * 5 * t)) / 1200)
            out += pulse(f, 0.5)
    return out / 6 * env_adsr(n, a=0.01, d=0.3, s=0.85, r=0.06, gate=int(dur_s * SR))


# ------------------------------------------------------------------ helpers for writing music

def chord_notes(sym, octave=4):
    minor = sym.endswith('m')
    root = sym[:-1] if minor else sym
    r = 12 * (octave + 1) + NOTE[root]
    return [r, r + (3 if minor else 4), r + 7], r


def parse_bar(s):
    """'D5:1 G5:1 r:1 B5:3' -> [(midi|None, eighths)], must fill exactly one bar."""
    out = []
    for tok in s.split():
        name, d = tok.split(':')
        out.append((None if name == 'r' else midi(name), float(d)))
    total = sum(d for _, d in out)
    assert abs(total - BAR) < 1e-9, f'bar "{s}" has {total} eighths'
    return out


# ------------------------------------------------------------------ the three tunes (all original)

TUNES = [
    {
        'slug': 'baila-a-bus-stop-shuffle',
        'title': 'A: Bus Stop Shuffle',
        'note': 'G major. Hook leaps up to the high D and tumbles back home.',
        'horn': 'G3',
        'intro': (['G', 'G', 'C', 'D', 'G', 'G', 'D', 'D'], [
            'G4:1 B4:1 D5:1 G5:3', 'r:1 G5:1 G5:1 B5:1 A5:1 G5:1', 'E5:1 G5:1 C6:1 C6:3',
            'r:1 A5:1 B5:1 C6:1 B5:1 A5:1', 'B5:1 r:1 B5:1 B5:1 r:1 B5:1', 'D6:3 B5:1 G5:2',
            'A5:1 r:1 A5:1 F#5:1 A5:1 D6:1', 'D6:1 r:5']),
        'verse': (['G', 'G', 'C', 'C', 'D', 'D', 'G', 'D'], [
            'B4:2 D5:1 B4:2 G4:1', 'A4:1 B4:1 D5:1 E5:3', 'E5:2 G5:1 E5:2 C5:1', 'D5:1 E5:1 G5:1 A5:3',
            'F#5:2 E5:1 D5:2 A4:1', 'C5:1 B4:1 A4:1 F#4:3', 'G4:1 B4:1 D5:1 G5:2 F#5:1', 'E5:1 D5:1 C5:1 B4:1 A4:2']),
        'verse_end': ('G', 'G4:3 r:3'),
        'hook': (['G', 'C', 'D', 'G'], [
            'D5:1 G5:1 G5:1 B5:2 A5:1', 'G5:1 E5:2 C5:1 E5:1 G5:1', 'F#5:2 A5:1 D6:2 C6:1', 'B5:3 G5:2 r:1']),
        'hook_end': ('G', 'B5:1 A5:1 G5:4'),
    },
    {
        'slug': 'baila-b-kandy-express',
        'title': 'B: Kandy Express',
        'note': 'A major. Climbing arpeggio hook with a sad-happy minor bar, very sing-along.',
        'horn': 'A3',
        'intro': (['A', 'A', 'D', 'E', 'A', 'F#m', 'D', 'E'], [
            'A4:1 C#5:1 E5:1 A5:1 C#6:1 E6:1', 'E6:3 C#6:1 r:1 A5:1', 'F#5:1 A5:1 D6:1 r:1 D6:1 D6:1',
            'E6:2 D6:1 C#6:1 B5:2', 'r:1 A5:1 r:1 A5:1 C#6:1 E6:1', 'F#6:3 E6:1 C#6:2',
            'D6:1 B5:1 A5:1 F#5:1 E5:2', 'E5:1 r:5']),
        'verse': (['A', 'A', 'D', 'D', 'A', 'A', 'E', 'E'], [
            'A4:2 C#5:1 E5:2 C#5:1', 'B4:1 A4:1 B4:1 C#5:3', 'D5:2 F#5:1 A5:2 F#5:1', 'E5:1 D5:1 C#5:1 B4:3',
            'C#5:1 E5:1 A5:1 G#5:1 F#5:1 E5:1', 'F#5:2 E5:1 C#5:2 A4:1', 'B4:1 C#5:1 D5:1 E5:2 G#4:1', 'B4:3 E5:3']),
        'verse_end': ('A', 'A4:3 r:3'),
        'hook': (['A', 'F#m', 'D', 'E'], [
            'E5:1 E5:1 A5:1 r:1 C#6:2', 'B5:1 A5:1 F#5:2 A5:1 C#6:1', 'D6:1 C#6:1 B5:1 A5:1 F#5:2', 'G#5:1 A5:1 B5:1 E5:3']),
        'hook_end': ('A', 'A5:3 E5:1 A5:2'),
    },
    {
        'slug': 'baila-c-galle-road-jump',
        'title': 'C: Galle Road Jump',
        'note': 'D major. Punchy repeated-note hook, the most trashy and bouncy of the three.',
        'horn': 'D3',
        'intro': (['D', 'D', 'G', 'A', 'D', 'G', 'A', 'A'], [
            'D5:1 r:1 D5:1 F#5:1 A5:1 D6:1', 'D6:2 r:1 D6:1 E6:1 F#6:1', 'G6:3 F#6:1 E6:1 D6:1',
            'E6:2 C#6:1 A5:3', 'r:1 F#5:1 r:1 A5:1 r:1 D6:1', 'B5:1 D6:1 G6:1 G6:3',
            'A5:1 C#6:1 E6:1 A6:3', 'A5:1 r:5']),
        'verse': (['D', 'D', 'G', 'G', 'A', 'A', 'D', 'A'], [
            'F#4:1 A4:1 D5:1 F#5:2 E5:1', 'D5:1 C#5:1 D5:1 A4:3', 'B4:1 D5:1 G5:1 B5:2 A5:1', 'G5:1 F#5:1 E5:1 D5:3',
            'C#5:1 E5:1 A5:1 G5:2 F#5:1', 'E5:1 C#5:1 A4:1 E5:3', 'F#5:2 A5:1 D6:2 C#6:1', 'B5:1 A5:1 G5:1 E5:3']),
        'verse_end': ('D', 'D5:3 r:3'),
        'hook': (['D', 'G', 'A', 'D'], [
            'A5:1 A5:1 r:1 A5:1 B5:1 A5:1', 'G5:1 B5:1 D6:2 B5:1 G5:1', 'A5:1 C#6:1 E6:1 C#6:1 A5:1 E5:1', 'F#5:3 D5:3']),
        'hook_end': ('D', 'F#5:1 E5:1 D5:4'),
    },
]


# ------------------------------------------------------------------ arrangement

def arrange(tune):
    """Expand a tune into 96 bars: (chord, melody bar or None, section, bar-in-section, extras)."""
    bars = []

    def add(section, chords, mel, **kw):
        for i, (c, m) in enumerate(zip(chords, mel)):
            bars.append({'chord': c, 'mel': m, 'section': section, 'i': i, 'n': len(chords), **kw})

    ic, im = tune['intro']
    vc, vm = tune['verse']
    hc, hm = tune['hook']
    add('intro', ic, im, fill='toms')
    for k in (1, 2):
        chords = vc + vc[:-1] + [tune['verse_end'][0]]
        mel = vm + vm[:-1] + [tune['verse_end'][1]]
        add(f'verse{k}', chords, mel, fill='machinegun' if k == 1 else 'toms')
        add(f'chorus{k}', hc * 3 + hc[:-1] + [tune['hook_end'][0]], hm * 3 + hm[:-1] + [tune['hook_end'][1]],
            fill='laser' if k == 1 else 'machinegun')
    add('break', hc * 2, [None] * 8, fill='mega')
    add('final', hc * 3 + hc[:-1] + [tune['hook_end'][0]], hm * 3 + hm[:-1] + [tune['hook_end'][1]], fill='toms')
    assert len(bars) == 96, len(bars)
    return bars


def drum_bar(b):
    """Drum hits for one bar as (eighth offset, name, param, velocity)."""
    sec, i, n = b['section'], b['i'], b['n']
    last = i == n - 1
    hits = []
    if i == 0:
        hits.append((0, 'crash', 1.0, 0.9))
    if last and b['fill'] == 'mega':
        # Break ending: the whole bar is a ridiculous fill.
        for k in range(10):
            hits += [(k * 0.5, 'tom', 260 - k * 18, 0.9), (k * 0.5, 'kick', 1.0, 0.5)]
        for k in range(8):
            hits.append((5 + k * 0.125, 'snare', 1 + k * 0.08, 0.4 + k * 0.08))
        hits.append((4, 'zap', 1.0, 0.8))
        return hits
    # Basic baila bounce: BOOM chk chk SNARE chk chk (kick pickup in the choruses).
    hits += [(0, 'kick', 1.0, 1.0), (3, 'kick', 1.0, 0.85), (3, 'snare', 1.0, 0.8)]
    for e in range(6):
        hits.append((e, 'hat', 1.0, 0.9 if e in (1, 2, 4, 5) else 0.5))
    hits += [(2, 'tamb', 1.0, 0.7), (5, 'tamb', 1.0, 0.7)]
    if sec.startswith('chorus') or sec == 'final':
        hits += [(3, 'clap', 1.0, 0.7), (5, 'kick', 1.0, 0.6)]
    if sec == 'break':
        if i in (4, 5, 6):
            hits += [(e, 'cowbell', 1.0, 0.55) for e in range(6)]       # unnecessary cowbell
        hits += [(1.5, 'kick', 1.0, 0.5), (4.5, 'kick', 1.0, 0.5)]
        if i == 3:
            hits += [(3 + k * 0.5, 'tom', 220 - k * 30, 0.9) for k in range(6)]
    # Mid-chorus mini fill.
    if (sec.startswith('chorus') or sec == 'final') and i == 7:
        hits += [(4 + k * 0.5, 'snare', 1.0 + k * 0.1, 0.5 + k * 0.1) for k in range(4)]
    if last:
        f = b['fill']
        hits = [h for h in hits if h[0] < 3 or h[1] in ('crash',)]
        if f == 'toms':
            hits += [(3 + k * 0.5, 'tom', 240 - k * 28, 1.0) for k in range(6)] + [(3 + k * 0.5, 'snare', 1.2, 0.35) for k in range(6)]
        elif f == 'machinegun':
            hits += [(3 + k * 0.25, 'snare', 0.8 + k * 0.06, 0.3 + k * 0.06) for k in range(12)]
            hits += [(e, 'kick', 1.0, 0.7) for e in (3, 4, 5)]
        elif f == 'laser':
            hits += [(e, 'kick', 1.0, 0.8) for e in (3, 3.5, 4, 4.5)]
            hits += [(3, 'zap', 1.0, 0.9), (5, 'tom', 200, 1.0), (5.33, 'tom', 150, 1.0), (5.67, 'tom', 110, 1.0)]
    return hits


def render(tune):
    bars = arrange(tune)
    total = pos(len(bars) * BAR)
    pad = int(2.5 * SR)
    stems = {k: np.zeros(total + pad) for k in ('lead', 'stab', 'strum', 'bass', 'drums', 'fx')}

    def mix(stem, at, x, gain=1.0):
        stems[stem][at:at + len(x)] += x[: max(0, len(stems[stem]) - at)] * gain

    for bi, b in enumerate(bars):
        t0 = bi * BAR
        chord, root = chord_notes(b['chord'], 4)
        sec = b['section']
        # Lead (trumpet). Short notes are clipped a bit for bounce.
        if b['mel']:
            e = t0
            for m, d in parse_bar(b['mel']):
                if m is not None:
                    gate = d * EIGHTH * (0.82 if d <= 1 else 0.93)
                    vel = 0.85 if sec.startswith('verse') else 1.0
                    mix('lead', pos(e), trumpet(m, gate, vel))
                    if sec == 'final' or sec == 'intro':        # octave doubling for the big moments
                        mix('lead', pos(e), trumpet(m - 12, gate, 0.45))
                e += d
        # Brass stabs.
        stab_eighths = []
        if sec == 'intro':
            stab_eighths = [0, 3] if b['i'] % 2 == 0 else [5]
        elif sec.startswith('verse'):
            stab_eighths = [2, 5] if b['i'] % 2 == 1 else []
        elif sec.startswith('chorus'):
            stab_eighths = [5] + ([0] if b['i'] % 4 == 0 else [])
        elif sec == 'final':
            stab_eighths = [2, 5]
        elif sec == 'break':
            stab_eighths = [0, 1, 3, 4] if b['i'] in (2, 6) else [5]
        hi = [m + 12 for m in chord]
        for e in stab_eighths:
            if not (b['i'] == b['n'] - 1 and e >= 3):          # leave room for the drum fill
                mix('stab', pos(t0 + e), stab(hi, 1.0))
        # Off-beat strum.
        for e in (1, 2, 4, 5):
            mix('strum', pos(t0 + e), strum(chord, 0.9 if e in (1, 4) else 0.7))
        # Driving triangle bass: root, octave, fifth; walks up into the next chord on phrase ends.
        r = root - 24
        if b['i'] % 4 == 3 and b['i'] != b['n'] - 1:
            line = [r, r + 2, r + 4, r + 7, r + 9, r + 11]
        else:
            line = [r, None, r + 12, r + 7, None, r + 12]
        for e, m in enumerate(line):
            if m is not None:
                mix('bass', pos(t0 + e), bass(m, EIGHTH * (1.6 if line[(e + 1) % 6] is None and e < 5 else 0.9)))
        # Drums.
        for (e, name, p, v) in drum_bar(b):
            mix('drums', pos(t0 + e), drum(name, p), v)
        # Air horn at the top of the break (twice).
        if sec == 'break' and b['i'] in (0, 4):
            mix('fx', pos(t0), airhorn(midi(tune['horn'])), 1.0)

    # Wrap everything that rings past the end back onto the start: a seamless loop.
    for k, s in stems.items():
        s[:pad] += s[total:]
        stems[k] = s[:total]

    # Trashy drum machine: 5-bit, 14.7 kHz sample-and-hold, then overdriven.
    d = stems['drums']
    d = np.repeat(d[::3], 3)[:total]
    d = np.round(d * 16) / 16
    d = np.tanh(d * 1.8)
    mixd = (0.30 * stems['lead'] + 0.16 * stems['stab'] + 0.07 * stems['strum'] + 0.36 * stems['bass']
            + 0.42 * d + 0.28 * stems['fx'])
    # "Party-bus speaker": no deep lows, a honky mid boost, a bit of saturation.
    low = np.convolve(mixd, np.ones(400) / 400, mode='same')
    x = mixd - 0.85 * low
    mid = np.convolve(x, np.ones(9) / 9, mode='same') - np.convolve(x, np.ones(40) / 40, mode='same')
    x = x + 0.6 * mid
    x = np.tanh(x * 1.5)
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.93
    return x, total


def onset(x):
    """Same rule the preview page uses on the decoded mp3: first sample >= half the early peak."""
    w = x[: int(0.15 * SR)]
    thr = 0.5 * np.max(np.abs(w))
    return int(np.argmax(np.abs(w) >= thr))


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def main(out_dir):
    out = Path(out_dir)
    tmp = out / 'src' / 'wav'
    tmp.mkdir(parents=True, exist_ok=True)
    meta = []
    for tune in TUNES:
        x, total = render(tune)
        wav = tmp / f"{tune['slug']}.wav"
        write_wav(wav, x)
        mp3 = out / f"{tune['slug']}.mp3"
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '160k', '-ac', '1', str(mp3)], check=True)
        meta.append({'file': mp3.name, 'title': tune['title'], 'note': tune['note'],
                     'loopSamples': total, 'sampleRate': SR, 'onset': onset(x), 'seconds': round(total / SR, 2)})
        print(f"{tune['title']}: {total / SR:.1f} s, onset {onset(x)}")
    (out / 'tracks.json').write_text(json.dumps(meta, indent=2) + '\n')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'music-drafts')
