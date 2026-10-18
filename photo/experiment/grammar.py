"""S0.2: Sonic Grammar engine.

Drives the mapping from semantic primitives (roof/column/support/decoration/
curve) to musical events via a declarative rule table.  Each rule names:

    - the output voice (MIDI channel)
    - the General-MIDI program number (instrument family)
    - the rhythmic / durational shape (sustain / pulse / melody / ornament /
      long pad)
    - the velocity envelope (dynamic range and weighting by primitive size)
    - the pitch source (top-of-primitive, centre, contour, fixed)

The output is a list of musical notes, each carrying the primitive type and
its path id, so downstream code (audio render, blueprint SVG) can still trace
back exactly which geometric element produced which event.

Time scheduling: primitives are emitted sequentially, but within each
primitive a `note_density` schedule chooses when notes land.  A global
MAX_CONCURRENT cap (default 6) prevents the "wall of sound" failure mode of
v0.1; if scheduling would put more than MAX_CONCURRENT notes within a 50ms
window, the new event is delayed until the budget clears.

If no ROOF primitive exists (e.g. column-façade images), the highest column
is used as a virtual roof so the piece still has a sustained anchor.

Each primitive triggers 2-3 "passes" so the piece has harmonic motion rather
than one-shot events.  This is musically important: a building is observed
from multiple angles, and each pass evokes one of those angles.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List, Sequence, Tuple
import math
import numpy as np

SCALE = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79]

MAX_CONCURRENT = 5
CONCURRENCY_WINDOW = 0.05  # 50ms
TOTAL_DURATION = 18.0       # seconds; pipeline output length


@dataclass
class Rule:
    voice: int
    program: int
    duration: float = 1.0
    velocity: int = 64
    note_density: str = 'sustain'
    pitch_source: str = 'primitive_centre'
    repeat_passes: int = 1    # how many times this primitive re-triggers


RULES: Dict[str, Rule] = {
    'roof':        Rule(voice=0, program=4,   duration=2.0,  velocity=96, note_density='sustain',  pitch_source='primitive_top',   repeat_passes=2),
    'column':      Rule(voice=1, program=48,  duration=0.30, velocity=72, note_density='pulse_8th',pitch_source='primitive_centre', repeat_passes=4),
    'support':     Rule(voice=2, program=42,  duration=1.6,  velocity=64, note_density='long_pad', pitch_source='primitive_top',   repeat_passes=2),
    'decoration':  Rule(voice=3, program=11,  duration=0.12, velocity=58, note_density='ornament', pitch_source='by_path_index',   repeat_passes=3),
    'curve':       Rule(voice=4, program=73,  duration=0.22, velocity=66, note_density='melody',   pitch_source='contour',         repeat_passes=2),
    'unknown':     Rule(voice=5, program=80,  duration=0.20, velocity=40, note_density='melody',   pitch_source='primitive_centre', repeat_passes=2),
}


def _bbox_y_top(bbox):
    return float(bbox[1])


def _bbox_y_centre(bbox):
    return (float(bbox[1]) + float(bbox[3])) / 2.0


def _pitch_from_y(y_norm: float) -> int:
    degree = (1.0 - y_norm) * (len(SCALE) - 1)
    idx = int(np.clip(round(degree), 0, len(SCALE) - 1))
    return SCALE[idx]


def _path_pitch(p: dict, source: str) -> int:
    if source == 'primitive_top':
        return _pitch_from_y(_bbox_y_top(p['bbox']))
    if source == 'primitive_centre':
        return _pitch_from_y(_bbox_y_centre(p['bbox']))
    return _pitch_from_y(_bbox_y_centre(p['bbox']))


def _contour_pitches(p: dict, n: int) -> List[int]:
    pts = np.asarray(p['points'], dtype=float)
    if len(pts) < 2:
        return [_path_pitch(p, 'primitive_centre')] * n
    d = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    if d[-1] <= 0:
        return [_path_pitch(p, 'primitive_centre')] * n
    sampled = np.array([np.interp(np.linspace(0, d[-1], n), d, pts[:, i]) for i in range(2)]).T
    return [_pitch_from_y(float(y)) for _, y in sampled]


def _note(*, source, source_point, pitch, start, duration, rule, voice, program, velocity):
    return dict(
        id=f'n{abs(hash((source, pitch, int(start * 1000), rule, voice))) % 100000:05d}',
        source=source, source_point=source_point,
        pitch=int(pitch), start=round(float(start), 3),
        duration=round(float(duration), 3),
        rule=rule, voice=voice, program=program, velocity=int(velocity),
    )


class _Scheduler:
    """Tracks currently-sounding events so a new note can be delayed until
    the MAX_CONCURRENT budget clears."""

    def __init__(self, notes_list: List[dict]):
        self.notes = notes_list

    def _active_at(self, t: float) -> int:
        return sum(1 for n in self.notes
                   if n['start'] <= t + 1e-6 < n['start'] + n['duration'])

    def earliest_slot(self, desired: float) -> float:
        """Return the earliest time >= desired where the number of active
        notes is below MAX_CONCURRENT."""
        t = max(0.0, desired)
        for _ in range(900):
            if self._active_at(t) < MAX_CONCURRENT:
                return t
            t += 0.02
        return t

    def add(self, note: dict):
        note['start'] = round(self.earliest_slot(note['start']), 3)
        self.notes.append(note)


def _emit_pass(rule: Rule, primitive: dict, t0: float, sched: _Scheduler,
               pass_index: int = 0) -> float:
    p_type = primitive['type']
    paths = primitive['paths']
    if not paths:
        return t0

    # Pass-dependent variation: alternate phrasing, velocity, and the order
    # in which paths are consumed.  This is what turns a one-shot
    # rendering into a piece with shape.
    if pass_index % 2 == 1:
        paths = list(reversed(paths))
    vel_offset = (pass_index * 6) - 6  # later passes are softer
    p0 = max(1, rule.velocity + vel_offset)

    if rule.note_density == 'sustain':
        p = min(paths, key=lambda x: x['bbox'][1])
        sched.add(_note(source=p['id'], source_point=None,
                        pitch=_path_pitch(p, rule.pitch_source),
                        start=t0, duration=rule.duration,
                        rule=p_type, voice=rule.voice, program=rule.program,
                        velocity=p0))
        return t0 + rule.duration

    if rule.note_density == 'long_pad':
        p = min(paths, key=lambda x: x['bbox'][1])
        sched.add(_note(source=p['id'], source_point=None,
                        pitch=_path_pitch(p, rule.pitch_source) - 4,
                        start=t0, duration=rule.duration,
                        rule=p_type, voice=rule.voice, program=rule.program,
                        velocity=p0))
        return t0 + rule.duration

    if rule.note_density == 'pulse_8th':
        # Spread pulses over the first 2.4 seconds.
        n_paths = min(len(paths), 6)
        spacing = 0.4
        for j in range(n_paths):
            p = paths[j]
            pitch = _path_pitch(p, rule.pitch_source)
            vel = p0 if (j % 2 == 0) else max(1, p0 - 18)
            sched.add(_note(source=p['id'], source_point=None,
                            pitch=pitch, start=t0 + j * spacing,
                            duration=rule.duration, rule=p_type,
                            voice=rule.voice, program=rule.program,
                            velocity=vel))
        return t0 + n_paths * spacing

    if rule.note_density == 'ornament':
        # Take at most 6 paths and stagger them.
        spacing = 0.30
        selected = paths[:6]
        for j, p in enumerate(selected):
            pitch = _path_pitch(p, rule.pitch_source) + (j % 3)
            sched.add(_note(source=p['id'], source_point=None,
                            pitch=pitch, start=t0 + j * spacing,
                            duration=rule.duration, rule=p_type,
                            voice=rule.voice, program=rule.program,
                            velocity=p0))
        return t0 + len(selected) * spacing

    if rule.note_density == 'melody':
        # For curve paths, sample 1 pitch (the curve's vertical centre).
        # For other paths, take the path's centre pitch.  Schedule the
        # primitives at a moderate density (one every 0.25s).
        spacing = 0.25
        last_t = t0
        for p in paths:
            if p.get('kind') == 'curve' and len(p.get('points', [])) >= 2:
                pitches = _contour_pitches(p, 1)
                pitch = pitches[0]
            else:
                pitch = _path_pitch(p, rule.pitch_source)
            sched.add(_note(source=p['id'], source_point=None,
                            pitch=pitch, start=t0, duration=rule.duration,
                            rule=p_type, voice=rule.voice,
                            program=rule.program, velocity=p0))
            t0 = sched.earliest_slot(t0 + spacing)
            last_t = t0
        return last_t

    return t0


def _emit(rule: Rule, primitive: dict, t0: float, sched: _Scheduler) -> float:
    """Emit all passes for one primitive."""
    t = t0
    for pass_i in range(max(1, rule.repeat_passes)):
        t = _emit_pass(rule, primitive, t, sched, pass_i)
        # Between passes of the same primitive, leave a small gap.
        if pass_i < rule.repeat_passes - 1:
            t += 0.20
    return t


def compose(primitives: Sequence[dict], disabled: str = None,
            disabled_types: Sequence[str] = ()) -> List[dict]:
    """Compose all primitives into a flat list of musical notes.

    Primitives are NOT triggered sequentially; instead each primitive starts
    at t=0 and the scheduler slots its events so global concurrency stays
    under MAX_CONCURRENT.  This produces a layered, polyphonic texture
    (the building read as a whole) rather than a serialised reading
    (one primitive after another).
    """
    notes: List[dict] = []
    sched = _Scheduler(notes)
    skip = set(disabled_types)
    if disabled == 'contour':
        skip.add('curve')
    elif disabled == 'support':
        skip.add('support')
    elif disabled == 'repeat':
        skip.add('column')

    # Special case: if there is no ROOF primitive, promote the tallest
    # column to act as a virtual roof so the piece still has a sustained
    # anchor.  This matters for column-façade images (sample2) where the
    # only structural element is vertical.
    has_roof = any(p['type'] == 'roof' for p in primitives)
    if not has_roof:
        col = next((p for p in primitives if p['type'] == 'column'), None)
        if col:
            top_p = min(col['paths'], key=lambda x: x['bbox'][1])
            sched.add(_note(source=top_p['id'], source_point=None,
                            pitch=_pitch_from_y(_bbox_y_top(top_p['bbox'])),
                            start=0.0, duration=2.0,
                            rule='roof', voice=0, program=4, velocity=96))

    # Each primitive's passes are spread across 0..15s so the piece
    # sustains rather than decays into silence.  The sustain primitive
    # is longer; the active primitives (column/decoration) get more
    # passes.
    type_starts = {'roof': 0.0, 'column': 0.5, 'support': 0.0,
                   'decoration': 0.4, 'curve': 0.6, 'unknown': 0.4}
    total_span = 15.0
    for pr in primitives:
        rule = RULES.get(pr['type'])
        if not rule or pr['type'] in skip:
            continue
        starts = [type_starts.get(pr['type'], 0.0)]
        for k in range(1, rule.repeat_passes):
            starts.append(starts[0] + (k * total_span / rule.repeat_passes))
        for pass_i, t in enumerate(starts):
            t = _emit_pass(rule, pr, t, sched, pass_i)

    return notes


# --------------------------------------------------------------------------
# Progressive Revelation mode: 6 phases, each adds one more primitive type.
# --------------------------------------------------------------------------
#
# Phase 1 (0-15s):  only roof         -> a single sustained tone, "ground"
# Phase 2 (15-30s): + column         -> pulse layer appears, "structure"
# Phase 3 (30-45s): + support        -> pad layer appears, "weight"
# Phase 4 (45-60s): + decoration     -> ornament layer, "texture"
# Phase 5 (60-80s): + curve          -> melody layer, "breath"
# Phase 6 (80-105s): all + ambient   -> full picture with reverb tail
#
# Each phase is 15s except the last (25s for the climax + tail).
# The reveal of a new primitive type is marked by a soft swell:
# the new layer enters on the first beat of the phase.
#
# This implements the "Progressive Revelation" mode of the product brief
# (see Handoff/Sonify_MusicPhoto_Agent_Handoff.docx).  It is the inverse
# of v0.1's wall-of-sound: instead of every pixel talking at once, the
# listener hears the building emerge layer by layer.

PHASE_BOUNDARIES = (0.0, 15.0, 30.0, 45.0, 60.0, 80.0, 105.0)
PHASE_TYPES = (
    ('roof',),
    ('roof', 'column'),
    ('roof', 'column', 'support'),
    ('roof', 'column', 'support', 'decoration'),
    ('roof', 'column', 'support', 'decoration', 'curve'),
    ('roof', 'column', 'support', 'decoration', 'curve', 'unknown'),
)
PHASE_LABELS = (
    'Phase 1: roof ridge (single sustained tone)',
    'Phase 2: + columns (pulse layer enters)',
    'Phase 3: + support beams (pad layer enters)',
    'Phase 4: + decoration (ornament layer enters)',
    'Phase 5: + curve contours (melody layer enters)',
    'Phase 6: full picture with reverb tail',
)


def compose_progressive(primitives, phase: int) -> list:
    """Emit notes for the given revelation phase (1..6).

    Notes from earlier phases are also included so the listener hears the
    building accumulate, not reset.  Within each phase, primitives are
    scheduled so the new type enters on the first beat of the phase and
    other types continue their existing rhythm.
    """
    if phase < 1 or phase > 6:
        return []
    notes: list = []
    sched = _Scheduler(notes)
    # Restrict primitives to the types this phase introduces.
    active_types = set(PHASE_TYPES[phase - 1])
    active_prims = [p for p in primitives if p['type'] in active_types]
    has_roof = any(p['type'] == 'roof' for p in active_prims)
    if not has_roof:
        # Look for a column in the FULL primitive set (not just this
        # phase's), so column-facade buildings (which have NO roof
        # primitive) still get a virtual roof for phase 1.
        col = next((p for p in primitives if p['type'] == 'column'), None)
        if not col:
            col = next((p for p in active_prims if p['type'] == 'column'), None)
        if col:
            top_p = min(col['paths'], key=lambda x: x['bbox'][1])
            sched.add(_note(source=top_p['id'], source_point=None,
                            pitch=_pitch_from_y(_bbox_y_top(top_p['bbox'])),
                            start=0.0, duration=2.0,
                            rule='roof', voice=0, program=4, velocity=96))
    # Schedule each primitive starting at the beginning of the phase that
    # introduces its type.  This means primitives in earlier phases start
    # at t=0 and primitives entering later start at their phase boundary.
    type_phase_start = {
        'roof': 0.0, 'column': PHASE_BOUNDARIES[1],
        'support': PHASE_BOUNDARIES[2], 'decoration': PHASE_BOUNDARIES[3],
        'curve': PHASE_BOUNDARIES[4], 'unknown': PHASE_BOUNDARIES[5],
    }
    # Earlier-phase primitives re-trigger at the current phase boundary so
    # the building's earlier footprint keeps humming while a new layer
    # enters - prevents the long silences of the v2 single-snapshot mix.
    earlier_types = set().union(*PHASE_TYPES[:max(0, phase - 1)])
    for pr in primitives:
        if pr['type'] not in earlier_types:
            continue
        rule = RULES.get(pr['type'])
        if not rule:
            continue
        t = PHASE_BOUNDARIES[phase - 1]
        _emit_pass(rule, pr, t, sched, pass_index=phase - 1)
    for pr in active_prims:
        rule = RULES.get(pr['type'])
        if not rule:
            continue
        t = type_phase_start.get(pr['type'], 0.0)
        for pass_i in range(max(1, rule.repeat_passes)):
            t = _emit_pass(rule, pr, t, sched, pass_i)
            if pass_i < rule.repeat_passes - 1:
                t += 0.20
    return notes
