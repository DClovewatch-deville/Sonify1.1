"""Render Soul Symphony notes as a 5-track staff (pentatonic) SVG.

For each Soul Symphony variant, draw a per-voice pentatonic staff:
  - 5 lines, treble clef range
  - one track per voice (program / instrument)
  - note heads as filled ellipses
  - stems (符干) per note
  - beams (符杠) connecting consecutive 8th-note pairs
  - horizontal time axis with bar lines

This gives the Soul Symphony mode a "五线谱上能看见几何" feel:
each note traces back to a primitive, and the staff shows the
mapping.
"""
from __future__ import annotations
import math
from typing import Sequence


# Pentatonic note names for label rendering
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# Lines of the staff (5 lines).  E4-G4-B4-D5-F5 are the 5 lines (treble).
# We anchor the centre of the staff at C4 (= MIDI 60).  Each staff step
# is a diatonic semitone (2 pentatonic degrees = whole step up in staff).
# For our pentatonic scale, we have 21 degrees (3 octaves), 7 per octave.
STAFF_TOP = 81      # MIDI 81 = A5
STAFF_BOTTOM = 43   # MIDI 43 = G2
STAFF_LINES = 5
STAFF_HEIGHT = 80   # pixels between top and bottom lines
STAFF_LINE_GAP = STAFF_HEIGHT / (STAFF_LINES - 1)  # 20 px


def _pitch_to_y(pitch: int) -> float:
    """Map MIDI pitch to a y-coordinate on the staff.

    Pentatonic degrees span 3 octaves.  Each pentatonic step = 0.5 staff
    line in y.  Map linearly into the staff height.
    """
    # Pentatonic is in 7-degree-per-octave non-uniform layout; here we
    # treat MIDI pitch as continuous for visual clarity.
    span = STAFF_TOP - STAFF_BOTTOM
    if span <= 0:
        return 0.0
    frac = (STAFF_TOP - pitch) / span
    frac = max(0.0, min(1.0, frac))
    return frac * STAFF_HEIGHT


def _draw_staff(staff_x: float, staff_y: float,
                clef: str = 'treble') -> str:
    """Draw a 5-line staff at the given top-left position."""
    parts = []
    parts.append(f'<rect x="{staff_x:.1f}" y="{staff_y:.1f}" '
                 f'width="0" height="0" fill="none"/>')
    for k in range(STAFF_LINES):
        y = staff_y + k * STAFF_LINE_GAP
        parts.append(f'<line x1="{staff_x:.1f}" y1="{y:.1f}" '
                     f'x2="{staff_x + 600:.1f}" y2="{y:.1f}" '
                     f'stroke="#0d1b1e" stroke-width="0.8"/>')
    # Treble clef glyph (use Unicode 𝄞)
    parts.append(
        f'<text x="{staff_x + 4:.1f}" y="{staff_y + 64:.1f}" '
        f'font-family="serif" font-size="60" fill="#0d1b1e" '
        f'text-anchor="start">{clef}</text>'
    )
    return ''.join(parts)


def _voice_color(voice: int) -> str:
    return ('#c0392b', '#27ae60', '#2980b9', '#e67e22', '#8e44ad', '#7f8c8d')[voice]


def render_voice_staff(notes: Sequence[dict],
                        voice: int,
                        program: int,
                        x_start: float = 80,
                        y_start: float = 20,
                        total_seconds: float = 18.0,
                        width: float = 720) -> str:
    """Render one voice as a pentatonic staff.

    Returns SVG fragment (no outer <svg> tag).
    """
    voice_notes = sorted(
        (n for n in notes if n.get('voice') == voice),
        key=lambda n: n['start']
    )
    if not voice_notes:
        return ''

    parts = []
    parts.append(
        f'<text x="{x_start - 4:.1f}" y="{y_start - 6:.1f}" '
        f'font-size="11" fill="#a0c4b8" text-anchor="end">'
        f'V{voice}</text>'
    )
    parts.append(
        f'<text x="{x_start + 4:.1f}" y="{y_start - 6:.1f}" '
        f'font-size="10" fill="#6b9e92">'
        f'prog {program} · {len(voice_notes)} notes</text>'
    )
    parts.append(_draw_staff(x_start, y_start))

    # x-scale: 13s of music across (width - x_start - 20) pixels
    x_span = width - x_start - 20
    def time_to_x(t: float) -> float:
        return x_start + 30 + (t / total_seconds) * x_span

    # bar lines every 3 seconds
    for t in range(0, int(total_seconds) + 1, 3):
        x = time_to_x(t)
        parts.append(f'<line x1="{x:.1f}" y1="{y_start:.1f}" '
                     f'x2="{x:.1f}" y2="{y_start + STAFF_HEIGHT:.1f}" '
                     f'stroke="#a0c4b8" stroke-width="0.4" stroke-dasharray="2,2"/>')
        parts.append(f'<text x="{x:.1f}" y="{y_start + STAFF_HEIGHT + 10:.1f}" '
                     f'font-size="8" fill="#6b9e92" text-anchor="middle">{t}s</text>')

    # Ledger lines for pitches outside the staff
    def ledger_lines(pitch: int, x: float):
        out = []
        if pitch > 79:    # above staff (MIDI > G5)
            y_top = y_start
            for lp in range(81, pitch, 2):
                ly = _pitch_to_y(lp) + y_start
                out.append(f'<line x1="{x-3.5:.1f}" y1="{ly:.1f}" '
                           f'x2="{x+3.5:.1f}" y2="{ly:.1f}" '
                           f'stroke="#0d1b1e" stroke-width="0.6"/>')
                y_top = ly
        if pitch < 43:    # below staff
            y_bottom = y_start + STAFF_HEIGHT
            for lp in range(41, pitch, -2):
                ly = _pitch_to_y(lp) + y_start
                out.append(f'<line x1="{x-3.5:.1f}" y1="{ly:.1f}" '
                           f'x2="{x+3.5:.1f}" y2="{ly:.1f}" '
                           f'stroke="#0d1b1e" stroke-width="0.6"/>')
                y_bottom = ly
        return out

    # Draw notes
    color = _voice_color(voice)
    for n in voice_notes:
        x = time_to_x(n['start'])
        y = y_start + _pitch_to_y(n['pitch'])
        # ledger lines
        parts.extend(ledger_lines(n['pitch'], x))
        # note head (filled ellipse, tilted)
        parts.append(
            f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="3.2" ry="2.2" '
            f'transform="rotate(-20 {x:.1f} {y:.1f})" '
            f'fill="{color}" stroke="{color}" stroke-width="0.4"/>'
        )
        # stem (符干) - upward from head, length 12 px
        stem_dir = -1 if y > y_start + STAFF_HEIGHT / 2 else 1
        stem_top_y = y + stem_dir * 12
        parts.append(
            f'<line x1="{x + 2.5 * (-stem_dir):.1f}" y1="{y:.1f}" '
            f'x2="{x + 2.5 * (-stem_dir):.1f}" y2="{stem_top_y:.1f}" '
            f'stroke="{color}" stroke-width="0.7"/>'
        )

    # Beams connecting consecutive short notes (< 0.4s) on similar pitch
    for i in range(len(voice_notes) - 1):
        a, b = voice_notes[i], voice_notes[i + 1]
        if b['start'] - a['start'] > 0.4:
            continue
        if abs(a['pitch'] - b['pitch']) > 7:
            continue
        x1 = time_to_x(a['start'])
        x2 = time_to_x(b['start'])
        y1 = y_start + _pitch_to_y(a['pitch']) + (-12 if a['pitch'] > 60 else 12)
        y2 = y_start + _pitch_to_y(b['pitch']) + (-12 if b['pitch'] > 60 else 12)
        parts.append(
            f'<line x1="{x1:.1f}" y1="{y1:.1f}" '
            f'x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" '
            f'stroke-width="1.4"/>'
        )

    return ''.join(parts)


def render_full_staff_svg(notes: Sequence[dict],
                           title: str = 'Soul Symphony staff') -> str:
    """Render all 5 voices as a stacked-staff SVG."""
    # Group by voice
    voices = sorted({n.get('voice', 0) for n in notes})
    if not voices:
        return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50"/>'

    staff_spacing = STAFF_HEIGHT + 30
    height = 30 + len(voices) * staff_spacing + 20
    width = 760
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" '
             f'height="{height}" viewBox="0 0 {width} {height}">',
             f'<rect width="{width}" height="{height}" fill="#f7f4eb"/>',
             f'<text x="20" y="20" font-family="serif" font-size="14" '
             f'fill="#183e3b">{title} · {len(notes)} notes '
             f'across {len(voices)} voices</text>']

    # get programs per voice
    programs = {}
    for n in notes:
        v = n.get('voice', 0)
        programs.setdefault(v, n.get('program', 0))

    for i, v in enumerate(voices):
        y_start = 30 + i * staff_spacing
        parts.append(render_voice_staff(
            notes, v, programs.get(v, 0),
            x_start=70, y_start=y_start,
            total_seconds=18.0, width=width
        ))

    parts.append('</svg>')
    return ''.join(parts)
