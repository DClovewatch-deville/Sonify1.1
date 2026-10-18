"""Deterministic geometry features -> musical-arrangement parameters.

Reads the classified geometry (units from studio_grammar.classify_units) plus the
derived Soul material, and produces a small set of image-driven features that
change the arrangement (register, pitch direction, rhythm/density, voice count,
articulation, climax) so different images produce recognisably different music —
not just a different timbre.  Fully deterministic; no new dependencies.
"""
from __future__ import annotations


def _spread(points):
    ys = [p[1] for p in points]
    return (max(ys) - min(ys)) if ys else 0.0


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def compute(units, soul=None):
    units = [u for u in (units or []) if u.get('points')]
    n = len(units)
    subject = [u for u in units if u.get('layer') == 'subject'] or units
    # verticality: tallest subject stroke (normalised y extent)
    vert = max((_spread(u['points']) for u in subject), default=0.0)
    # curvature: how far subject strokes bend away from a straight chord
    strs = [float(u.get('straight', 1.0)) for u in subject]
    curve = 1.0 - (sum(strs) / len(strs)) if strs else 0.5
    # repetition: share of subject strokes that are closed loops or axial lines
    rep = (sum(1 for u in subject if u.get('type') in ('loop', 'h_line', 'v_line'))
           / len(subject)) if subject else 0.0
    # density: strokes per normalised area
    density = min(1.0, n / 6000.0)
    # soul-derived: melodic range and stepwise-ness of the lead line
    span, step = 0.0, 0.0
    if soul and soul.get('notes'):
        lead = sorted([x for x in soul['notes'] if x.get('voice') == 0], key=lambda z: z['start'])
        if lead:
            ps = [x['pitch'] for x in lead]
            span = _clamp((max(ps) - min(ps)) / 24.0, 0.0, 1.0)
            ivs = [abs(b - a) for a, b in zip(ps, ps[1:])]
            step = (sum(1 for v in ivs if v <= 3) / len(ivs)) if ivs else 0.5
    total=sum(float(u.get('length',1)) for u in units) or 1
    shares={kind:sum(float(u.get('length',1)) for u in units if u.get('type')==kind)/total for kind in ['v_line','h_line','d_line','curve','loop']}
    points=[p for u in subject for p in u['points']]
    xspan=max((p[0] for p in points),default=1)-min((p[0] for p in points),default=0)
    yspan=max((p[1] for p in points),default=1)-min((p[1] for p in points),default=0)
    return dict(vertical_share=round(shares['v_line'],4),diagonal_share=round(shares['d_line'],4),curve_share=round(shares['curve'],4),aspect=round(yspan/max(.01,xspan),4),verticality=round(vert, 4), curve=round(curve, 4), repeat=round(rep, 4),
                density=round(density, 4), span=round(span, 4), step=round(step, 4),
                strokes=n)


def params(features):
    f = features
    # register: taller / wider-range subjects lift the development register
    register = _clamp(int(round((f['verticality'] - 0.20) * 12 + (f['span'] - 0.5) * 6)), -4, 6)
    # articulation: curved contours -> longer (legato); axial/grid -> shorter
    legato = 1.25 if f['curve'] >= 0.6 else (1.0 if f['curve'] >= 0.4 else 0.8)
    # rhythm: regular/repetitive structures -> denser pulse
    if f['repeat'] >= 0.7 or f['step'] >= 0.8:
        pulse = [0, .5, 1.0, 1.5, 2, 2.5, 3, 3.5]
    elif f['repeat'] >= 0.5:
        pulse = [0, .5, 1.5, 2, 3, 3.5]
    else:
        pulse = [0, 1.5, 2.5]
    voices = [0, 2, 3]                                    # melody + bass + harmony
    if f['density'] >= 0.75 or f['repeat'] >= 0.82:
        voices.append(1)                                  # rhythmic response
    if f['verticality'] >= 0.25 or f['curve'] >= 0.6:
        voices.append(4)                                  # octave strings (tall/curvy)
    climax_lift = 2 if f['verticality'] >= 0.28 else 0
    return dict(register=register, legato=legato, pulse=pulse,
                voices=sorted(set(voices)), climax_lift=climax_lift)


def musical_dna(features,preset):
    f=features
    vertical=f.get('vertical_share',0);diagonal=f.get('diagonal_share',0)
    profile='vertical' if vertical>.34 else 'angular' if diagonal>.2 else 'flow'
    key=2 if profile=='vertical' else 5 if profile=='angular' else 0
    count=8 if f['curve']>.14 else 6 if f['curve']>.08 else 4
    pulse=[0,.5,1.5,2.5,3.5] if f['repeat']>.77 else [0,1,2.5] if f['repeat']>.65 else [0,1.5,3]
    if preset=='chamber':pulse=[0,.75,1.5,2,3.25]
    elif preset=='piano':pulse=[0,1,2,3] if f['repeat']>.7 else [0,1.5,3]
    elif preset=='strings':pulse=[0,2]
    voices=[0,2,3] if preset=='piano' else [0,2,3,4] if preset=='strings' else [0,1,2,3,4]
    return dict(profile=profile,key_pc=key,theme_count=count,pulse=pulse,voices=voices,
                bass_entry=6 if vertical>.25 else 8,response_entry=8 if f['repeat']>.75 else 12,
                articulation='legato' if preset in ('nature','strings') else 'measured',
                legato=1.25 if preset=='strings' else 1.08 if preset=='nature' else .8 if preset=='piano' else .92)
