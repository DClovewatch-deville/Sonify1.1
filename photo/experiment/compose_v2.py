"""S0.3: mido-based multi-channel MIDI export + WAV render with program change.

Replaces run.export() for the S0.2 grammar pipeline.  Each note carries
its target voice, program and velocity; we emit one program-change per
voice (channel) before the first note on that channel.

The WAV render uses simple additive synthesis (sine + 2nd and 3rd partials)
to keep the dependency footprint minimal.  A real SoundFont render is
deferred to S0.4.
"""
from __future__ import annotations
import math
import struct
import wave
from pathlib import Path
from typing import List, Sequence

import numpy as np

try:
    import mido
    HAVE_MIDO = True
except Exception:
    HAVE_MIDO = False


# Instrument program -> timbral partials (sine fundamentals + harmonic mix).
# The values are weights for sin(2π·f·t), sin(4π·f·t), sin(6π·f·t) and a small
# noise component.  The numbers are deliberately small (under 1.0) so the
# additive sum is at most ~0.3 and tanh saturation keeps headroom.
TIMBRE: dict = {
    4:  dict(partials=(1.00, 0.20, 0.10), noise=0.010, attack=0.012, decay=0.45),  # EP1
    11: dict(partials=(1.00, 0.45, 0.18), noise=0.020, attack=0.006, decay=0.30),  # Vibraphone
    42: dict(partials=(1.00, 0.32, 0.08), noise=0.015, attack=0.060, decay=1.40),  # Cello
    48: dict(partials=(1.00, 0.20, 0.05), noise=0.025, attack=0.080, decay=0.60),  # Strings
    73: dict(partials=(1.00, 0.10, 0.04), noise=0.008, attack=0.020, decay=0.25),  # Flute
    80: dict(partials=(0.70, 0.20, 0.00), noise=0.030, attack=0.005, decay=0.20),  # Lead square
}


def _render_one(rate: int, note: dict) -> np.ndarray:
    prog = int(note.get('program', 4))
    timbre = TIMBRE.get(prog, TIMBRE[4])
    dur = float(note['duration'])
    start = float(note['start'])
    pitch = int(note['pitch'])
    velocity = max(1, min(127, int(note.get('velocity', 64)))) / 127.0

    f = 440.0 * (2.0 ** ((pitch - 69) / 12.0))
    count = int((dur + 0.10) * rate)
    t = np.arange(count) / rate
    a1, a2, a3 = timbre['partials']
    sig = (a1 * np.sin(2 * np.pi * f * t)
           + a2 * np.sin(4 * np.pi * f * t)
           + a3 * np.sin(6 * np.pi * f * t))
    # Small noise component to break the perfect periodicity.
    rng = np.random.default_rng(seed=(pitch * 31 + prog) & 0xFFFF)
    sig = sig + timbre['noise'] * rng.standard_normal(count)
    # AD envelope: fast attack, exponential decay.
    atk = max(0.001, timbre['attack'])
    env = np.minimum(t / atk, 1.0) * np.exp(-t / max(0.05, timbre['decay']))
    sig = sig * env * velocity
    # Place the note at its start time.
    a = int(round(start * rate))
    out = np.zeros(max(a + count, a + 1), dtype=np.float64)
    out[a:a + count] = sig[:count]
    return out


def render_wav(notes: Sequence[dict], path: Path, total_seconds: float = 18.0) -> None:
    """Render notes into a single mono 22050 Hz 16-bit WAV file."""
    rate = 22050
    if not notes:
        audio = np.zeros(int(total_seconds * rate), dtype=np.float64)
        _write_wav(audio, rate, path)
        return
    end = max(float(n['start']) + float(n['duration']) for n in notes) + 0.2
    audio = np.zeros(int(max(end, total_seconds)) * rate, dtype=np.float64)
    for n in notes:
        rendered = _render_one(rate, n)
        if len(rendered) > len(audio):
            audio = np.concatenate([audio, np.zeros(len(rendered) - len(audio))])
        audio[:len(rendered)] += rendered
    # Soft saturate.
    audio = np.tanh(audio * 0.7)
    # Add a small algorithmic reverb tail (2 comb filters summed).
    audio = _add_simple_reverb(audio, rate)
    # Normalise so peak is around -3 dB FS (≈ 0.7).
    peak = float(np.max(np.abs(audio)))
    if peak > 1e-9:
        audio = audio * (0.7 / peak)
    _write_wav(audio, rate, path)


def _add_simple_reverb(audio: np.ndarray, rate: int) -> np.ndarray:
    """Schroeder-style reverb: 2 parallel comb filters summed with a
    short all-pass.  Tiny CPU cost, sounds noticeably less dry than
    the dry signal alone."""
    delays_ms = (37, 53, 71, 97)
    decays = (0.84, 0.83, 0.82, 0.80)
    wet = np.zeros_like(audio)
    for d_ms, g in zip(delays_ms, decays):
        d = int(d_ms * rate / 1000)
        if d <= 0 or d >= len(audio):
            continue
        comb = np.zeros_like(audio)
        comb[d:] = audio[:-d] * g
        wet += comb
    # All-pass diffusion: smear the early reflections.
    ap = np.zeros_like(wet)
    delay = int(11 * rate / 1000)
    if 0 < delay < len(wet):
        ap[delay:] = wet[:-delay]
    wet = 0.55 * wet + 0.30 * ap
    return 0.78 * audio + 0.35 * wet


def _write_wav(audio: np.ndarray, rate: int, path: Path) -> None:
    pcm = (audio * 32767.0).astype('<i2').tobytes()
    with wave.open(str(path), 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(pcm)


def export_midi(notes: Sequence[dict], path: Path, tempo_bpm: int = 80) -> None:
    """Write a multi-channel, multi-program MIDI file via mido (preferred)
    or a hand-rolled fallback if mido is not installed."""
    if HAVE_MIDO:
        _export_mido(notes, path, tempo_bpm)
    else:
        _export_fallback(notes, path, tempo_bpm)


def _export_mido(notes: Sequence[dict], path: Path, tempo_bpm: int) -> None:
    mid = mido.MidiFile(type=1)
    track = mido.MidiTrack()
    mid.tracks.append(track)
    track.append(mido.MetaMessage('set_tempo',
                                  tempo=mido.bpm2tempo(tempo_bpm), time=0))
    # Emit a program change for each voice (channel) that appears.
    used = sorted({int(n['voice']) for n in notes})
    programs = {}
    for ch in used:
        # pick the first note on this channel to source the program number
        for n in notes:
            if int(n['voice']) == ch:
                programs[ch] = int(n.get('program', 0))
                break
    # Pre-scan to collect (channel, program) pairs sorted by time.
    evs: list = []
    for n in notes:
        on = int(round(float(n['start']) * 480))
        off = int(round((float(n['start']) + float(n['duration'])) * 480))
        ch = int(n['voice'])
        pitch = int(n['pitch'])
        vel = max(1, min(127, int(n.get('velocity', 64))))
        evs.append((on, 'pc', ch, programs.get(ch, 0), 0))
        evs.append((on, 'on', ch, pitch, vel))
        evs.append((off, 'off', ch, pitch, 0))
    # de-dup program changes (keep first occurrence per channel).
    seen_pc = set()
    evs_dedup = []
    for t, kind, ch, p1, p2 in evs:
        if kind == 'pc':
            if ch in seen_pc:
                continue
            seen_pc.add(ch)
        evs_dedup.append((t, kind, ch, p1, p2))
    evs_dedup.sort(key=lambda e: (e[0], 0 if e[1] == 'pc' else (1 if e[1] == 'on' else 2)))
    last = 0
    for t, kind, ch, p1, p2 in evs_dedup:
        delta = max(0, t - last)
        last = t
        if kind == 'pc':
            track.append(mido.Message('program_change',
                                      channel=ch, program=p1, time=delta))
        elif kind == 'on':
            track.append(mido.Message('note_on',
                                      channel=ch, note=p1, velocity=p2, time=delta))
        else:
            track.append(mido.Message('note_off',
                                      channel=ch, note=p1, velocity=0, time=delta))
    track.append(mido.MetaMessage('end_of_track', time=0))
    mid.save(str(path))


def _export_fallback(notes: Sequence[dict], path: Path, tempo_bpm: int) -> None:
    """Hand-rolled Type-0 MIDI for environments where mido is missing."""
    def vlq(v):
        a = [v & 127]
        v >>= 7
        while v:
            a.insert(0, (v & 127) | 128)
            v >>= 7
        return bytes(a)

    # program changes per channel, only at the very start.
    pc_by_ch: dict = {}
    for n in notes:
        ch = int(n['voice'])
        pc_by_ch.setdefault(ch, int(n.get('program', 0)))
    events = []
    for ch, prog in sorted(pc_by_ch.items()):
        events.append((0, 'pc', ch, prog, 0))
    for n in notes:
        on = int(round(float(n['start']) * 480))
        off = int(round((float(n['start']) + float(n['duration'])) * 480))
        ch = int(n['voice'])
        pitch = int(n['pitch'])
        vel = max(1, min(127, int(n.get('velocity', 64))))
        events.append((on, 'on', ch, pitch, vel))
        events.append((off, 'off', ch, pitch, 0))
    events.sort(key=lambda e: (e[0], 0 if e[1] == 'pc' else (1 if e[1] == 'on' else 2)))
    body = bytearray()
    body += b'\x00\xff\x51\x03'
    body += struct.pack('>I', int(60_000_000 / tempo_bpm))[1:]
    last = 0
    for t, kind, ch, p1, p2 in events:
        delta = max(0, t - last)
        last = t
        if kind == 'pc':
            body += vlq(delta) + bytes([0xC0 | ch, p1 & 0x7F])
        elif kind == 'on':
            body += vlq(delta) + bytes([0x90 | ch, p1 & 0x7F, p2 & 0x7F])
        else:
            body += vlq(delta) + bytes([0x80 | ch, p1 & 0x7F, 0])
    body += b'\x00\xff\x2f\x00'
    path.write_bytes(b'MThd' + struct.pack('>IHHH', 6, 0, 1, 480)
                     + b'MTrk' + struct.pack('>I', len(body)) + body)
