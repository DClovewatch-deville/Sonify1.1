"""S0.4: Blueprint mode audio — the 12 000+ skeleton symbols rendered
as a rich, listenable multi-voice piece, not a silent spatial score.

Philosophy
──────────
v0.1 (blueprint.audio_preview): every pixel → sine at raw y-derived pitch,
uniform velocity 28, no voice separation → 378+ simultaneous notes → muddy
wall-of-sound.

Blueprint mode in v0.3+ keeps every pixel (Blueprint philosophy = preserve
geometry, don't rebuild it) but distributes the symbols across 5 voice bands
with pentatonic quantisation, per-voice timbres, and 8 musical-style
variants (A–H).  Each variant picks a different instrument combination so
the audience hears the building differently each time while the geometry
remains 100 % faithful.

Voice bands (by normalised y position in the image):
  Voice 0 — ROOF   (y ≤ 0.22): sustained / drone layer
  Voice 1 — BODY   (0.22 < y ≤ 0.62): strings / vibrato layer
  Voice 2 — SKY    (y > 0.62): bell / wind-chime layer
  Voice 3 — VERT   (|angle| near 90°): mallet / xylophone pulses
  Voice 4 — CURVE  (|angle| near 0°): solo flute / cello legato

The 8 variants differ only in the General-MIDI program numbers assigned
to each voice band, giving audiences 8 distinct musical styles from the
same geometry.
"""
from __future__ import annotations
import json
import math
import wave
import struct
from pathlib import Path
from typing import Sequence

import numpy as np

# Pitch quantisation: 3-octave pentatonic in MIDI (A minor pentatonic)
PENTATONIC = (36, 38, 40, 43, 45, 48, 50, 52, 55, 57, 60, 62, 64, 67, 69,
              72, 74, 76, 79, 81, 84)

# Per-variant (voice → (GM program number, fluidR3 instrument name)).
# The program number is used by render_blueprint_wav() to pick a
# synthesis family (bell / string / brass / woodwind / pad / ethnic).
# The instrument name is used by the browser's Live playback path
# (build_v3_visual.py → playLive) to load the matching FluidR3_GM
# soundfont from smplr's prebuilt library, so the user hears a real
# piano / koto / flute instead of the additive-sine synthesis.
#
# v0.3.4 instrument picks: each variant is now a distinct FAMILY PALETTE
# of real instruments so the 8 variants actually sound like 8 different
# ensembles, not 8 different envelope shapes on the same additive sine.
#
# Variant → human label
#   A — Piano solo + glockenspiel + kalimba + violin
#   B — Koto (古琴) + pan flute (箫) duet
#   C — String quartet (cello / viola / violin / choir)
#   D — Ethnic ensemble (sitar / shamisen / koto / pan flute / piccolo)
#   E — Bell / music-box ensemble (music box / glockenspiel / marimba)
#   F — Flute consort (flute / pan flute / piccolo / recorder)
#   G — Pad / drone (warm + choir + bowed + metallic + halo)
#   H — Mixed chamber (organ + piano + violin + marimba + flute)
VARIANTS = {
    #            V0              V1                       V2            V3           V4
    'A_bells':     ((89,  'church_organ'),  (0,   'acoustic_grand_piano'), (9,   'glockenspiel'), (108,'kalimba'),        (40,  'violin')),
    'B_strings':   ((49,  'string_ensemble'),(40,  'violin'),               (42,  'cello'),        (41,  'viola'),          (52,  'choir_aahs')),
    'C_brass':     ((89,  'church_organ'),  (61,  'brass_section'),        (58,  'tuba'),         (66,  'tenor_sax'),      (65,  'alto_sax')),
    'D_woodwind':  ((89,  'church_organ'),  (73,  'flute'),                (11,  'music_box'),    (75,  'pan_flute'),      (79,  'whistle')),
    'E_purebell':  ((11,  'music_box'),     (14,  'tinkle_bell'),          (12,  'marimba'),      (10,  'glockenspiel'),   (8,   'celesta')),
    'F_ethnic':    ((89,  'church_organ'),  (105, 'sitar'),                (106, 'shamisen'),     (107, 'koto'),           (74,  'pan_flute')),
    'G_celestial': ((96,  'pad_1_new_age'), (12,  'marimba'),              (14,  'tinkle_bell'),  (11,  'music_box'),      (88,  'pad_5_bowed')),
    'H_mixed':     ((49,  'string_ensemble'),(0,  'acoustic_grand_piano'), (40,  'violin'),       (12,  'marimba'),        (73,  'flute')),
}

# Backwards-compat: extract just the program tuple (used by render_blueprint_wav)
def _programs(variant: str) -> tuple:
    return tuple(prog for prog, _name in VARIANTS.get(variant, VARIANTS['A_bells']))

def _instrument_names(variant: str) -> tuple:
    return tuple(name for _prog, name in VARIANTS.get(variant, VARIANTS['A_bells']))

# Human-readable variant label + Chinese name (used in UI)
VARIANT_INFO = {
    'A_bells':     ('A · Piano solo + bells',     '钢琴独奏'),
    'B_strings':   ('B · String quartet',          '弦乐四重奏'),
    'C_brass':     ('C · Brass + sax ensemble',   '铜管合奏'),
    'D_woodwind':  ('D · Flute + bells',          '笛子·钟'),
    'E_purebell':  ('E · Music-box & mallet',     '音乐盒'),
    'F_ethnic':    ('F · Sitar + koto + flute',  '古琴·西塔'),
    'G_celestial': ('G · Pad + bells',            '氛围'),
    'H_mixed':     ('H · Mixed chamber',          '混合室内乐'),
}

# Voice labels (used in UI)
VOICE_LABELS = ['roof / drone', 'body / strings', 'sky / bells', 'vertical / mallets', 'curve / solo']


def _quantise(pitch: float) -> int:
    """Round a raw float pitch to the nearest pentatonic degree."""
    idx = min(range(len(PENTATONIC)),
              key=lambda i: abs(PENTATONIC[i] - pitch))
    return PENTATONIC[idx]


def _voice_band(symbol: dict) -> int:
    """Assign a symbol to a voice band based on normalised y and angle.

    Returns 0=roof 1=body 2=sky 3=vert 4=curve.
    """
    y = symbol['y']
    angle = abs(symbol['angle'] % math.pi)
    # Normalise angle to [0, pi]
    is_vertical = angle > math.pi / 3       # ~60° → vertical strokes
    is_horizontal = angle < math.pi / 6     # ~30° → horizontal strokes
    is_diagonal = (not is_vertical) and (not is_horizontal)
    if is_vertical:
        return 3
    if is_diagonal:
        return 4
    # Remaining strokes are horizontal-ish: split by height into three bands.
    if y <= 0.22:
        return 0   # roof ridge
    if y <= 0.62:
        return 1   # body / strings
    return 2       # sky / low band


def _timbre(pitch: float, duration: float, rate: int = 22050) -> np.ndarray:
    """Additive harmonic timbre matching the General-MIDI program family.

    We don't know the exact GM instrument from just a program number, so
    we approximate with a physically-plausible harmonic series:
      fundamental + 2nd harmonic + 3rd harmonic + subtle high-frequency noise
    The mix weights are tuned per voice class by the caller.
    """
    n = int(duration * rate)
    t = np.arange(n, dtype=np.float64) / rate
    # AD envelope: quick attack (5 ms), exponential decay
    attack = min(0.005, duration * 0.2)
    env = np.minimum(t / attack, 1.0) * np.exp(-t * (4.0 / max(duration, 0.05)))
    env = np.maximum(env, 0.0)
    freq = 440.0 * 2 ** ((pitch - 69) / 12)
    # Harmonic partials: fundamental + weak 2nd + weaker 3rd
    tone = (np.sin(2 * np.pi * freq * t) +
            0.30 * np.sin(2 * np.pi * freq * 2 * t) +
            0.10 * np.sin(2 * np.pi * freq * 3 * t) +
            0.02 * np.sin(2 * np.pi * freq * 5.5 * t)) * env
    return tone


# Per-voice amplitude and duration multipliers
VOICE_AMP = {'roof': 0.45, 'body': 0.38, 'sky': 0.55, 'vert': 0.50, 'curve': 0.40}
VOICE_DUR = {'roof': 1.0,  'body': 0.8,  'sky': 0.6,  'vert': 1.2,  'curve': 1.5}


def compose_blueprint(bp: dict, variant: str,
                       total_seconds: float = 13.0) -> list:
    """Convert a blueprint symbol dict into a list of note dicts for the
    given musical variant (one of VARIANTS keys).

    Returns a list of note dicts with the same schema as grammar.compose().
    """
    variant_tuple = VARIANTS.get(variant, VARIANTS['A_bells'])
    programs = tuple(prog for prog, _name in variant_tuple)
    voices = {v: [] for v in range(5)}

    for sym in bp['symbols']:
        band = _voice_band(sym)
        raw_pitch = sym['pitch']
        quantised = _quantise(raw_pitch)
        dur_mult = VOICE_DUR[('roof', 'body', 'sky', 'vert', 'curve')[band]]
        duration = sym['duration'] * dur_mult
        start = sym['start']
        velocity = int(60 + 30 * (1.0 - sym['y']))  # louder near roof (top)

        voices[band].append(dict(
            id=sym['id'],
            source=sym['path'],
            source_point=None,
            pitch=quantised,
            start=start,
            duration=duration,
            rule=('roof', 'body', 'sky', 'vert', 'curve')[band],
            voice=band,
            program=programs[band],
            velocity=velocity,
        ))

    # Merge all voices, sort by start time
    notes = []
    for band in range(5):
        notes.extend(voices[band])
    notes.sort(key=lambda n: (n['start'], n['voice']))
    return notes


def render_blueprint_wav(notes: list, out_path: Path,
                          rate: int = 22050) -> None:
    """Render a blueprint note list to WAV with per-program timbre.

    Unlike v0.1's flat additive sine, this picks a synthesis *family*
    per General-MIDI program number so that the 8 variants actually
    sound different.  Programs are grouped into 6 families:
      - string / bow    (40-51, 105-108): vibrato + slow attack
      - brass           (56-68):         strong harmonics, slow attack
      - woodwind        (68-79):         breath noise, medium attack
      - bell / mallet   (8-15, 47-48):   sharp attack, exponential decay
      - pad / synth     (88-96):         slow attack, many harmonics, LFO
      - pluck           (24-27, 40, 105):short attack, metallic body
    Voices whose program doesn't fit a family fall back to soft sine.
    """
    total = int(rate * 13.5)
    audio = np.zeros(total, dtype=np.float64)
    rng = np.random.default_rng(42)

    for n in notes:
        pitch = float(n['pitch'])
        dur = float(n['duration'])
        amp = VOICE_AMP.get(n['rule'], 0.4)
        vel = float(n['velocity']) / 127.0
        prog = int(n.get('program', 0))
        fam = _program_family(prog)

        n_samp = int(dur * rate)
        if n_samp <= 0:
            continue
        t = np.arange(n_samp, dtype=np.float64) / rate
        freq = 440.0 * 2 ** ((pitch - 69) / 12)
        tone = _synth_family(fam, freq, t, dur, rate, rng)
        tone *= amp * vel
        a = int(n['start'] * rate)
        b = min(a + len(tone), total)
        if a >= total:
            continue
        audio[a:b] += tone[:b - a]

    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio *= 0.80 / peak
    with wave.open(str(out_path), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes((audio * 32767).astype('<i2').tobytes())


def _program_family(prog: int) -> str:
    """Classify a General-MIDI program number into a synthesis family."""
    # Order matters: check special-cased ethnic IDs before the wider
    # range() sweeps (e.g. 74 is pan-flute in GM but we use it for
    # shamisen in F_ethnic; 105 is sitar in our usage).
    if prog in (8, 10, 11, 12, 13, 14, 47, 48):
        return 'bell'
    if prog in range(40, 52):
        return 'string'
    if prog in range(56, 69):
        return 'brass'
    if prog in (73, 75, 76, 79):  # flute, pan-pipe, blown-bottle, whistle
        return 'woodwind'
    if prog == 105 or prog in (24, 25, 26, 27):  # sitar, nylon/steel gtr
        return 'ethnic_pluck'
    if prog == 74:  # shamisen in our F_ethnic variant
        return 'ethnic_pluck'
    if prog in range(88, 97):
        return 'pad'
    if prog in range(80, 88):
        return 'synth'
    return 'soft_sine'


def _synth_family(family: str, freq: float, t: np.ndarray,
                  dur: float, rate: int, rng) -> np.ndarray:
    """Per-family additive synthesis.  Returns mono waveform in [-1, 1]."""
    if family == 'bell':
        # Sharp attack, exponential decay, multiple inharmonic partials.
        # Inharmonicity ratio ~ √(1 + 0.1 n²) per Bessel/Helmholtz bell model.
        attack = 0.001
        env = np.minimum(t / attack, 1.0) * np.exp(-t * (3.5 / max(dur, 0.1)))
        env = np.maximum(env, 0.0)
        tone = (1.00 * np.sin(2 * np.pi * freq * t) +
                0.55 * np.sin(2 * np.pi * freq * 2.76 * t) +
                0.40 * np.sin(2 * np.pi * freq * 5.40 * t) +
                0.25 * np.sin(2 * np.pi * freq * 8.93 * t) +
                0.15 * np.sin(2 * np.pi * freq * 13.34 * t)) * env
        return tone * 0.45

    if family == 'string':
        # Slow attack, long release, 5-Hz vibrato, sawtooth-like spectrum.
        attack = max(0.04, dur * 0.3)
        env = np.minimum(t / attack, 1.0) * np.exp(-t * (1.5 / max(dur, 0.2)))
        env = np.maximum(env, 0.0)
        vib = 0.012 * np.sin(2 * np.pi * 5.2 * t)
        tone = (np.sin(2 * np.pi * freq * (1 + vib) * t) +
                0.60 * np.sin(2 * np.pi * freq * 2 * (1 + vib) * t) +
                0.45 * np.sin(2 * np.pi * freq * 3 * (1 + vib) * t) +
                0.30 * np.sin(2 * np.pi * freq * 4 * (1 + vib) * t) +
                0.18 * np.sin(2 * np.pi * freq * 5 * (1 + vib) * t)) * env
        return tone * 0.30

    if family == 'brass':
        # Medium attack, hard spectrum (1/n sawtooth), filter-like decay.
        attack = max(0.03, dur * 0.15)
        env = np.minimum(t / attack, 1.0) * np.exp(-t * (2.0 / max(dur, 0.2)))
        env = np.maximum(env, 0.0)
        # Sawtooth via 1/n harmonics, weighted to upper.
        n_partials = 10
        h = np.zeros_like(t)
        for n_p in range(1, n_partials + 1):
            h += (1.0 / n_p) * np.sin(2 * np.pi * freq * n_p * t)
        return h * env * 0.18

    if family == 'woodwind':
        # Medium attack, breath noise, soft attack.
        attack = max(0.025, dur * 0.25)
        env = np.minimum(t / attack, 1.0) * np.exp(-t * (2.5 / max(dur, 0.2)))
        env = np.maximum(env, 0.0)
        breath = rng.standard_normal(len(t)) * 0.04
        tone = (np.sin(2 * np.pi * freq * t) +
                0.35 * np.sin(2 * np.pi * freq * 2 * t) +
                0.15 * np.sin(2 * np.pi * freq * 3 * t) +
                breath) * env
        return tone * 0.40

    if family == 'pad':
        # Very slow attack, lots of detuned partials, slow LFO.
        attack = max(0.10, dur * 0.5)
        env = np.minimum(t / attack, 1.0) * np.exp(-t * (1.0 / max(dur, 0.3)))
        env = np.maximum(env, 0.0)
        detune = 0.998 + 0.004 * np.sin(2 * np.pi * 0.5 * t)
        lfo = 0.02 * np.sin(2 * np.pi * 3.0 * t)
        tone = (np.sin(2 * np.pi * freq * detune * t * (1 + lfo)) +
                0.55 * np.sin(2 * np.pi * freq * 2.003 * t) +
                0.40 * np.sin(2 * np.pi * freq * 2.997 * t) +
                0.30 * np.sin(2 * np.pi * freq * 4.005 * t) +
                0.20 * np.sin(2 * np.pi * freq * 5.011 * t)) * env
        return tone * 0.20

    if family in ('pluck', 'ethnic_pluck'):
        # Sharp attack, Karplus-Strong-like body, metallic.
        attack = 0.002
        env = np.minimum(t / attack, 1.0) * np.exp(-t * (5.0 / max(dur, 0.1)))
        env = np.maximum(env, 0.0)
        body = (np.sin(2 * np.pi * freq * t) +
                0.70 * np.sin(2 * np.pi * freq * 2 * t) +
                0.40 * np.sin(2 * np.pi * freq * 3.01 * t) +
                0.20 * np.sin(2 * np.pi * freq * 4.02 * t))
        if family == 'ethnic_pluck':
            # Add sarangi-like high partials and 5.5x for sitar.
            body += 0.20 * np.sin(2 * np.pi * freq * 5.5 * t)
        return body * env * 0.45

    if family == 'synth':
        # Square-ish waves with subtle vibrato.
        attack = max(0.005, dur * 0.1)
        env = np.minimum(t / attack, 1.0) * np.exp(-t * (3.0 / max(dur, 0.1)))
        env = np.maximum(env, 0.0)
        tone = (np.sign(np.sin(2 * np.pi * freq * t)) +
                0.50 * np.sin(2 * np.pi * freq * 2 * t)) * env
        return tone * 0.25

    # soft_sine fallback (and unknown programs)
    attack = 0.005
    env = np.minimum(t / attack, 1.0) * np.exp(-t * (3.5 / max(dur, 0.05)))
    env = np.maximum(env, 0.0)
    return (np.sin(2 * np.pi * freq * t) +
            0.30 * np.sin(2 * np.pi * freq * 2 * t) +
            0.10 * np.sin(2 * np.pi * freq * 3 * t)) * env * 0.40


def build_blueprint_json(bp: dict, variant: str) -> dict:
    """Build per-variant note metadata (for the UI) without rendering audio."""
    notes = compose_blueprint(bp, variant)
    variant_tuple = VARIANTS.get(variant, VARIANTS['A_bells'])
    programs = tuple(prog for prog, _name in variant_tuple)
    instrument_names = tuple(name for _prog, name in variant_tuple)
    voice_stats = {v: [] for v in range(5)}
    for n in notes:
        voice_stats[n['voice']].append(n)
    label_en, label_zh = VARIANT_INFO.get(variant, (variant, ''))
    return dict(
        variant=variant,
        label_en=label_en,
        label_zh=label_zh,
        programs=list(programs),
        instruments=list(instrument_names),
        total_notes=len(notes),
        voice_notes={v: len(voice_stats[v]) for v in range(5)},
        duration_seconds=13.0,
        voice_labels=VOICE_LABELS,
        voices=[dict(voice=v, label=VOICE_LABELS[v],
                     program=programs[v], instrument=instrument_names[v],
                     notes=len(voice_stats[v]))
                for v in range(5) if voice_stats[v]],
    )
