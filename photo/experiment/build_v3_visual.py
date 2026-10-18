"""S0.6: Build the v3 demo page with 3 tabs.

  Tab 1 — Blueprint Score:   12k symbol spatial score (no sound, just
                            looking at the music) per sample.
  Tab 2 — Soul Symphony:    the v2 multi-voice single-snapshot piece
                            (33-90 notes, 18s, 4 ablations).
  Tab 3 — Progressive Revelation: 6 audio phases that add one more
                            primitive type at a time (105s total).

The three modes correspond to the three narrative modes in the
Handoff doc (Blueprint / Soul Symphony / Progressive Revelation)
and respect the philosophy "preserve more pixels, but split them
into basic geometric units, do not rebuild the structure".
"""
from __future__ import annotations
import json
import base64
import sys
import wave
from pathlib import Path
from typing import List

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / 'vendor'))
import run as lab
import primitives
import grammar
import blueprint as bpmod  # for the spatial-score SVG
import compose_blueprint as cbp
import render_staff as staff


OUT = lab.OUT

COLOURS = {
    'roof':       '#c0392b',
    'column':     '#27ae60',
    'support':    '#2980b9',
    'decoration': '#e67e22',
    'curve':      '#8e44ad',
    'unknown':    '#7f8c8d',
}
COLOUR_NAMES = {
    'roof':       'Roof ridge',
    'column':     'Columns',
    'support':    'Support / beam',
    'decoration': 'Decoration',
    'curve':      'Curve / contour',
    'unknown':    'Other',
}

SOUL_VARIANTS = [
    ('all', 'All rules (full mapping)'),
    ('no-contour', 'Without curve/contour'),
    ('no-support', 'Without support/beams'),
    ('no-repeat', 'Without column pulses'),
]

PHASE_NAMES = [f'Phase {i+1}' for i in range(6)]
PHASE_LABELS = grammar.PHASE_LABELS


def _waveform_svg(wav_path: Path, width: int = 800, height: int = 80) -> str:
    try:
        with wave.open(str(wav_path), 'rb') as w:
            nframes = w.getnframes()
            pcm = np.frombuffer(w.readframes(nframes), dtype='<i2').astype(float)
        if len(pcm) == 0:
            return ''
        idx = np.linspace(0, len(pcm) - 1, width).astype(int)
        samples = pcm[idx]
        peak = float(np.max(np.abs(samples)) + 1e-9)
        samples = samples / peak
        points = ' '.join(f'{x},{height/2 - s * (height/2 - 2):.1f}'
                          for x, s in enumerate(samples))
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
            f'viewBox="0 0 {width} {height}"><rect width="{width}" height="{height}" '
            f'fill="#0d1b1e"/><polyline fill="none" stroke="#7dd3c0" stroke-width="0.7" '
            f'points="{points}"/></svg>'
        )
    except Exception:
        return ''


def _spectrogram_png_b64(wav_path: Path, width: int = 400, height: int = 80) -> str:
    try:
        with wave.open(str(wav_path), 'rb') as w:
            nframes = w.getnframes()
            pcm = np.frombuffer(w.readframes(nframes), dtype='<i2').astype(float)
        if len(pcm) < 1024:
            return ''
        win = 1024
        hop = 512
        n_frames = (len(pcm) - win) // hop + 1
        if n_frames < 4:
            return ''
        cols = min(width, n_frames)
        idx = np.linspace(0, n_frames - 1, cols).astype(int)
        rows = max(8, min(height // 2, 32))
        img = np.zeros((rows, cols), dtype=float)
        window = np.hanning(win)
        for ci, fi in enumerate(idx):
            start = fi * hop
            seg = pcm[start:start + win] * window
            spec = np.abs(np.fft.rfft(seg))[:rows]
            if spec.max() > 0:
                spec = spec / spec.max()
            img[:, ci] = spec[::-1]
        rgb = np.zeros((rows, cols, 3), dtype=np.uint8)
        for c in range(cols):
            for r in range(rows):
                v = float(img[r, c])
                rgb[r, c, 0] = int(255 * min(1.0, v * 1.6))
                rgb[r, c, 1] = int(180 * min(1.0, v * 1.2))
                rgb[r, c, 2] = int(120 * (1.0 - v))
        from PIL import Image
        im = Image.fromarray(rgb, mode='RGB').resize((width, height), Image.NEAREST)
        import io
        buf = io.BytesIO()
        im.save(buf, format='PNG', optimize=True)
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ''


def _blueprint_svg(idx: int, width: int = 480) -> str:
    """Render the spatial-score SVG (12k+ symbol dots) for a sample.
    Use the same algorithm as blueprint.svg() but cap at 480 wide.
    """
    bp = json.loads((OUT / f'sample{idx}-blueprint.json').read_text(encoding='utf-8'))
    w, h = bp['source_width'], bp['source_height']
    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{int(width * h / w + 1)}" '
         f'viewBox="0 0 {w+80} {h+130}">']
    s.append(f'<rect width="{w+80}" height="{h+130}" fill="#f7f4eb"/>')
    s.append(f'<text x="40" y="32" font-family="serif" font-size="19" fill="#183e3b">'
             f'Blueprint Score - sample{idx}</text>')
    for y in range(90, int(h+95), 95):
        for k in range(5):
            s.append(f'<path d="M25 {y+k*5} H{w+55}" stroke="#bdc4b8" stroke-width=".4"/>')
    s.append('<g fill="#163c39" stroke="#163c39">')
    for n in bp['symbols']:
        x = 40 + n['x'] * w
        y = 65 + n['y'] * h
        s.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="1.5" ry="1.0" '
                 f'transform="rotate(-22 {x:.1f} {y:.1f})"/>')
        if int(n['id'][2:]) % 3 == 0:
            s.append(f'<path d="M{x+1.2:.1f} {y:.1f} v-5.5" fill="none" stroke-width=".45"/>')
    s.append('</g>')
    s.append(f'<text x="40" y="{h+115}" font-size="10" fill="#65796c">'
             f'{len(bp["symbols"])} symbols on {len(bp["paths"])} paths (v0.1 Blueprint Score, no music)</text>')
    s.append('</svg>')
    return ''.join(s)


def _overlay_svg(image_path: Path, prims: List[dict], width: int = 320) -> str:
    from PIL import Image
    img = Image.open(image_path)
    w, h = img.size
    scale = width / w
    h_disp = int(h * scale)
    type_paths = {}
    for pr in prims:
        col = COLOURS.get(pr['type'], '#999')
        d_parts = []
        for p in pr['paths']:
            pts = p['points']
            if len(pts) < 2:
                continue
            d_parts.append('M ' + ' L '.join(f'{x:.4f} {y:.4f}' for x, y in pts))
        if d_parts:
            type_paths.setdefault(pr['type'], (col, ' '.join(d_parts)))
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{h_disp}" '
        f'viewBox="0 0 1 1" preserveAspectRatio="none" '
        f'style="background:#f7f4eb">',
        f'<image x="0" y="0" width="1" height="1" preserveAspectRatio="none" '
        f'href="./{image_path.name}" opacity="0.55"/>',
    ]
    for t, (col, d) in type_paths.items():
        parts.append(
            f'<path d="{d}" fill="none" stroke="{col}" '
            f'stroke-width="0.008" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>'
        )
    parts.append('</svg>')
    return ''.join(parts)


def _load_paths(idx: int) -> list:
    d = json.loads((OUT / f'sample{idx}.json').read_text(encoding='utf-8'))
    return d['paths']


def _sample_payload(idx: int, file_name: str) -> dict:
    image = lab.Image.open(OUT / f'sample{idx}.jpg')
    w, h = image.size
    prims, _, facade = primitives.classify(_load_paths(idx))
    summary = primitives.summarise(prims)
    summary['facade'] = facade

    # Tab 1: Blueprint Score (12k symbols + 8 musical variants)
    bp_meta = json.loads((OUT / f'sample{idx}-blueprint.json').read_text(encoding='utf-8'))
    bp_svg = _blueprint_svg(idx, 480)
    bp_variants = []
    for variant in cbp.VARIANTS:
        notes = cbp.compose_blueprint(bp_meta, variant)
        # Per-voice stats
        vstats = {}
        for n in notes:
            vstats.setdefault(n['voice'], 0)
            vstats[n['voice']] += 1
        wav_path = OUT / f'sample{idx}-bp-{variant}.wav'
        # Resolve instrument names + human labels (v0.3.4)
        variant_tuple = cbp.VARIANTS[variant]
        programs = [prog for prog, _name in variant_tuple]
        instruments = [name for _prog, name in variant_tuple]
        label_en, label_zh = cbp.VARIANT_INFO.get(variant, (variant, ''))
        bp_variants.append(dict(
            variant=variant,
            label=label_en,
            label_en=label_en,
            label_zh=label_zh,
            programs=programs,
            instruments=instruments,
            notes=len(notes),
            voices=vstats,
            audio=wav_path.name,
            waveform=_waveform_svg(wav_path, 800, 80),
            spectrogram=_spectrogram_png_b64(wav_path, 400, 80),
        ))
    bp_info = dict(symbols=len(bp_meta['symbols']),
                   paths=len(bp_meta['paths']),
                   svg=bp_svg,
                   variants=bp_variants)

    # Tab 2: Soul Symphony (4 audio variants with waveform + spectrogram + staff SVG)
    # Build the classified primitives ONCE (they're the same for every
    # variant — the variants just disable certain rule types).
    prims_for_soul, _, _ = primitives.classify(_load_paths(idx))
    soul = {}
    for key, label in SOUL_VARIANTS:
        wav_path = OUT / f'sample{idx}-v2-{key}.wav'
        # Render the 5-voice staff for this variant
        notes_for_staff = grammar.compose(
            prims_for_soul,
            disabled=('contour' if key == 'no-contour'
                      else 'support' if key == 'no-support'
                      else 'repeat' if key == 'no-repeat'
                      else None)
        )
        staff_svg = staff.render_full_staff_svg(
            notes_for_staff,
            title=f'Soul Symphony · sample{idx} · {label}',
        )
        # Compact note array for live soundfont playback (only fields
        # needed by the browser: start, duration, pitch, voice, program,
        # velocity).  ~30-90 notes per variant, ~150 bytes each.
        live_notes = [
            dict(start=n['start'], duration=n['duration'], pitch=n['pitch'],
                 voice=n['voice'], program=n['program'], velocity=n['velocity'])
            for n in notes_for_staff
        ]
        soul[key] = dict(label=label,
                        audio=wav_path.name,
                        staff=staff_svg,
                        notes=len(notes_for_staff),
                        live_notes=live_notes,
                        waveform=_waveform_svg(wav_path, 800, 80),
                        spectrogram=_spectrogram_png_b64(wav_path, 400, 80))

    # Tab 3: Progressive Revelation (6 phase audios)
    phases = []
    for p in range(1, 7):
        wav_path = OUT / f'sample{idx}-v3-phase{p}.wav'
        # Re-derive the note list for this phase so the Live button can
        # play the same notes through a real GM soundfont.
        prims_for_phase, _, _ = primitives.classify(_load_paths(idx))
        notes_for_phase = grammar.compose_progressive(prims_for_phase, p)
        live_notes_phase = [
            dict(start=n['start'], duration=n['duration'], pitch=n['pitch'],
                 voice=n['voice'], program=n['program'], velocity=n['velocity'])
            for n in notes_for_phase
        ]
        phases.append(dict(
            label=PHASE_LABELS[p - 1],
            audio=wav_path.name,
            notes=len(notes_for_phase),
            live_notes=live_notes_phase,
            waveform=_waveform_svg(wav_path, 800, 80),
            spectrogram=_spectrogram_png_b64(wav_path, 400, 80),
        ))

    return dict(idx=idx, name=file_name, width=w, height=h,
                facade=facade, summary=summary,
                primitives=[dict(type=p['type'], count=p['count'],
                                 avg_length=p['avg_length'],
                                 max_length=p['max_length'])
                            for p in prims],
                bp_info=bp_info, soul=soul, phases=phases,
                overlay_svg=_overlay_svg(OUT / f'sample{idx}.jpg', prims, 320))


def build_html(samples: List[dict]) -> str:
    css = """
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
           background: #0d1b1e; color: #e8e4d9; margin: 0; padding: 0; }
    .page-header { background: #163c39; padding: 18px 48px; border-bottom: 3px solid #2a7a6a;
                   display:flex; justify-content:space-between; align-items:center; }
    h1 { font-size: 26px; margin: 0 0 4px 0; color: #7dd3c0; font-weight: 300; letter-spacing: 0.5px; }
    .tagline { color: #a0c4b8; font-size: 13px; margin: 0; font-weight: 300; }
    .topnav a { color: #7dd3c0; text-decoration: none; border: 1px solid #2a7a6a;
                padding: 5px 11px; border-radius: 4px; font-size: 12px; }
    .intro { max-width: 1000px; background: #112d2a; margin: 0; padding: 18px 48px;
             border-bottom: 1px solid #1f5048; line-height: 1.6; font-size: 14px; }
    .intro p { margin: 0 0 10px 0; }
    .intro strong { color: #7dd3c0; }
    .intro em { color: #a0c4b8; font-style: normal; }
    .sample { padding: 24px 48px; border-bottom: 1px solid #1f5048; }
    .sample:hover { background: #0f2422; }
    .sample h3 { font-size: 17px; color: #c9e8e0; margin: 0 0 4px 0; font-weight: 400; }
    .sample .meta { color: #6b9e92; font-size: 12px; margin-bottom: 14px; }
    .facade-badge { display: inline-block; padding: 1px 6px; border-radius: 3px;
                    font-size: 11px; font-weight: bold; margin-left: 6px; }
    .facade-yes { background: #27ae60; color: #fff; }
    .facade-no { background: #555; color: #ccc; }

    /* Tab UI */
    .tabs { display: flex; gap: 0; border-bottom: 1px solid #1f5048; margin: 0 0 18px 0; }
    .tab { padding: 10px 18px; cursor: pointer; color: #a0c4b8; border: 1px solid transparent;
           border-bottom: none; font-size: 13px; background: #112d2a; }
    .tab.active { background: #0d1b1e; color: #7dd3c0; border-color: #2a7a6a;
                  border-bottom: 1px solid #0d1b1e; margin-bottom: -1px; }
    .tab:hover:not(.active) { background: #163c39; }
    .tab-body { display: none; }
    .tab-body.active { display: block; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; margin: 8px 0; }
    .swatch { display: inline-block; width: 9px; height: 9px;
              border-radius: 2px; margin-right: 3px; vertical-align: middle; }

    audio { width: 100%; margin-top: 6px; }
    .var { margin: 8px 0; padding: 8px 10px; background: #112d2a;
           border: 1px solid #1f5048; border-radius: 4px; }
    .phase { margin: 8px 0; padding: 10px 12px; background: #112d2a;
             border: 1px solid #1f5048; border-left: 3px solid #2a7a6a; border-radius: 4px; }
    .phase .label { font-size: 13px; color: #c9e8e0; margin-bottom: 4px; }
    .phase .desc { font-size: 12px; color: #6b9e92; margin: 4px 0; }
    .vis { display: flex; gap: 10px; align-items: flex-start; margin-top: 6px; }
    .vis svg, .vis img { border: 1px solid #1f5048; background: #0a1a18; }
    .small { font-size: 11px; color: #6b9e92; line-height: 1.7; }
    .blueprint-wrap { background: #f7f4eb; padding: 8px; border-radius: 4px; max-width: 520px; }
    .blueprint-wrap svg { display: block; max-width: 100%; height: auto; }
    .staff-wrap { background: #f7f4eb; padding: 6px; border-radius: 4px; margin: 8px 0;
                  border: 1px solid #1f5048; overflow-x: auto; }
    .staff-wrap svg { display: block; max-width: 100%; height: auto; }
    .summary { font-size: 12px; color: #a0c4b8; line-height: 1.7; margin: 8px 0; }
    h4 { color: #7dd3c0; margin: 14px 0 6px 0; font-weight: 400; }
    """
    body = ['<!doctype html><meta charset="utf-8">',
            '<title>Sonify v3: Blueprint / Symphony / Progressive Revelation</title>',
            f'<style>{css}</style>',
            # v0.3.4: load smplr (Web Audio sampler) so the Live buttons can
            # play the blueprint notes through the real FluidR3_GM soundfont
            # (piano, koto, flute, sitar, violin, music box, etc.) instead
            # of the additive-sine synth used in the .wav files.
            '<script src="./vendor/sonify-soundfont-bridge.js"></script>',
            '<script src="./vendor/sonify-tabs.js"></script>',
            '<div class="page-header">',
            '<div>',
            '<h1>Sonify v3: one image, three listening modes</h1>',
            '<p class="tagline">Blueprint Score &middot; Soul Symphony &middot; Progressive Revelation</p>',
            '</div>',
            '<div class="topnav">',
            '<a href="studio.html">Geometry Studio 新版创作界面 &#8599;</a> &nbsp;',
            '<a href="index.html">&#8592; v0.1 Blueprint Score</a> &nbsp;',
            '<a href="lab.html">v0.1 Rule Lab &#8594;</a> &nbsp;',
            '<button type="button" id="sonify-stop-btn" '
            'style="background:#7a1f1f;color:#ffe5e5;border:1px solid #c0392b;'
            'padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px">'
            '&#9209; Stop Live</button>',
            '</div>',
            '</div>',
            '<div class="intro">',
            '<p><strong>The three modes share the same input geometry</strong> '
            '(a 12,000-symbol spatial score extracted from the line-art).  '
            'They differ only in how much of the geometry is heard and in what order:</p>',
            '<p><strong>1. Blueprint Score</strong> &mdash; <em>preserves every pixel</em>.  '
            'The 12 000+ symbols are played simultaneously across <strong>5 voices</strong> '
            '(roof / body / sky / vertical / curve) and offered in <strong>8 different '
            'instrument combinations</strong> (A academic, B orchestral, C celestial, '
            'D woodwind, E minimalist, F ethnic, G electronic, H bells).  '
            'You see the full spatial score and hear it as a rich, listenable piece '
            '&mdash; not the v0.1 wall-of-sound, and not a silent score.  '
            'This is the &ldquo;one glance tells you what it is, and you can listen to it eight ways&rdquo; mode.</p>',
            '<p><strong>2. Soul Symphony</strong> &mdash; <em>preserves only the basic geometric '
            'units</em> (roof / column / support / decoration / curve / unknown).  '
            '5 voices, 30&ndash;90 notes, 18 seconds, rendered on a <strong>real 5-track '
            'pentatonic staff</strong> so you can see the geometry-to-notation mapping.  '
            'You hear the building as a piece of music <em>and</em> see its score.  '
            'This is the &ldquo;feel the building as composition, see it as notation&rdquo; mode.</p>',
            '<p><strong>3. Progressive Revelation</strong> &mdash; <em>the same basic units as '
            'Soul Symphony, but introduced one layer at a time over 105 seconds</em>.  '
            'You hear the roof first (15 s of pure drone), then the columns enter, then the '
            'support, decoration, curve, and finally the full picture.  This is the &ldquo;watch '
            'a building emerge from silence&rdquo; mode.</p>',
            '<p>Pick a sample below, then switch between the three tabs to feel the difference.  '
            'The colour legend and primitive classification are the same across all three modes.</p>',
            '</div>']

    legend_html = ['<div class="legend">']
    for t, c in COLOURS.items():
        legend_html.append(
            f'<span><span class="swatch" style="background:{c}"></span>'
            f'{COLOUR_NAMES[t]}</span>'
        )
    legend_html.append('</div>')
    body.append(''.join(legend_html))

    for s in samples:
        body.append(f'<section class="sample" id="s{s["idx"]}">')
        facade_class = 'facade-yes' if s['facade']['is_column_facade'] else 'facade-no'
        facade_label = 'Column-façade (Greek/Roman temple)' if s['facade']['is_column_facade'] else 'Non-column (Chinese pavilion / mixed style)'
        body.append(f'<h3>Sample {s["idx"]}: {s["name"]} '
                    f'<span class="facade-badge {facade_class}">{facade_label}</span></h3>')
        body.append(f'<div class="meta">Structural element: tallest vertical = '
                    f'{s["facade"]["max_vertical_height_fraction"]:.2f} '
                    f'(threshold 0.30).  Primitive types: '
                    + ' '.join(f'<span style="color:{COLOURS.get(t, "#aaa")}">{t}({c})</span>'
                               for t, c in s['summary']['paths_by_type'].items())
                    + f'.  Total: {s["summary"]["total_paths"]} paths.</div>')

        # Tabs (inline onclick - the most reliable click path; no event
        # delegation, no capture-phase quirks, works in every browser).
        sid = f'sample{s["idx"]}'
        body.append(f'<div class="tabs" data-sample="{sid}">')
        body.append(f'<div class="tab active" data-target="bp-{sid}" '
                    f'onclick="sonifyActivate(\'bp-{sid}\')" '
                    f'role="button" tabindex="0" '
                    f'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){{sonifyActivate(\'bp-{sid}\');event.preventDefault();}}">'
                    f'1. Blueprint ({s["bp_info"]["symbols"]} symbols · 8 musical variants)</div>')
        body.append(f'<div class="tab" data-target="soul-{sid}" '
                    f'onclick="sonifyActivate(\'soul-{sid}\')" '
                    f'role="button" tabindex="0" '
                    f'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){{sonifyActivate(\'soul-{sid}\');event.preventDefault();}}">'
                    f'2. Soul Symphony (4 ablations · 5-voice staff)</div>')
        body.append(f'<div class="tab" data-target="prog-{sid}" '
                    f'onclick="sonifyActivate(\'prog-{sid}\')" '
                    f'role="button" tabindex="0" '
                    f'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){{sonifyActivate(\'prog-{sid}\');event.preventDefault();}}">'
                    f'3. Progressive Revelation (6 phases, 105s)</div>')
        body.append('</div>')

        # Tab 1: Blueprint Score (12k symbols + 8 musical variants)
        body.append(f'<div class="tab-body active" id="bp-{sid}">')
        body.append(f'<div class="blueprint-wrap">{s["bp_info"]["svg"]}</div>')
        body.append(f'<div class="small" style="margin-top:6px">'
                    f'v0.1 spatial score.  {s["bp_info"]["symbols"]} symbols on '
                    f'{s["bp_info"]["paths"]} paths.  Now played as 5 simultaneous '
                    f'voices (roof / body / sky / vertical / curve) in 8 different '
                    f'instrument combinations &mdash; pick a variant below and play.</div>')
        body.append('<h4 style="color:#7dd3c0; margin:14px 0 6px 0; font-weight:400">'
                    '8 musical variants of the same Blueprint</h4>')
        for v in s['bp_info']['variants']:
            inst_list = ' · '.join(f'{voice}={inst}' for voice, inst in
                                   zip(['roof','body','sky','vert','curve'], v['instruments']))
            body.append(f'<div class="var"><div class="small" style="color:#c9e8e0;margin-bottom:4px">'
                        f'<b>{v["label_zh"]}</b> · <span style="color:#7dd3c0">{v["label_en"]}</span> &mdash; '
                        f'{v["notes"]} notes</div>')
            body.append(f'<div class="small" style="color:#6b9e92;margin-bottom:6px">'
                        f'{inst_list}</div>')
            body.append(f'<audio controls preload="metadata" controlsList="nodownload" src="{v["audio"]}"></audio>')
            # Live button (v0.3.4): play the same blueprint notes through the
            # real FluidR3_GM soundfont via smplr in the browser.  The first
            # click lazy-loads the soundfont (~5-10 MB mp3 set) and then
            # streams playback in real time.
            body.append(f'<div style="margin:6px 0 4px 0">'
                        f'<button type="button" class="live-btn" '
                        f'data-sample="{s["idx"]}" data-variant="{v["variant"]}" '
                        f'style="background:#163c39;color:#7dd3c0;border:1px solid #2a7a6a;'
                        f'padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px">'
                        f'🎹 Live &middot; {v["label_zh"]} (real soundfont)</button>'
                        f'<span class="live-status" data-status-for="{s["idx"]}-{v["variant"]}" '
                        f'style="margin-left:8px;font-size:11px;color:#6b9e92"></span>'
                        f'</div>')
            body.append('<div class="vis">')
            if v['waveform']:
                body.append(f'<div><div class="small">Waveform (synth)</div>{v["waveform"]}</div>')
            if v['spectrogram']:
                body.append(f'<div><div class="small">Spectrogram (synth)</div>'
                            f'<img src="{v["spectrogram"]}" alt="spectrogram"/></div>')
            body.append('</div>')
            body.append('</div>')
        body.append('</div>')

        # Tab 2: Soul Symphony (4 ablations + 5-voice staff)
        body.append(f'<div class="tab-body" id="soul-{sid}">')
        body.append('<div class="overlay" style="max-width:320px;background:#fff;padding:6px;'
                    'border:1px solid #1f5048;border-radius:4px;margin-bottom:12px">'
                    f'{s["overlay_svg"]}</div>')
        for key, label in SOUL_VARIANTS:
            v = s['soul'][key]
            body.append(f'<div class="var"><div class="small" style="color:#c9e8e0;margin-bottom:4px"><b>{label}</b> &mdash; '
                        f'{v["notes"]} notes</div>')
            body.append(f'<audio controls preload="metadata" controlsList="nodownload" src="{v["audio"]}"></audio>')
            # 5-voice staff SVG
            body.append(f'<div class="staff-wrap">{v["staff"]}</div>')
            # v0.3.5: Live SoundFont playback for Soul Symphony.
            # Plays the same note list through the real FluidR3_GM
            # programs assigned by the grammar (electric piano, strings,
            # cello, music box, flute, etc.) so the user hears the
            # 5-track staff with REAL instruments instead of the
            # additive-sine synth in the .wav above.
            live_notes_json = json.dumps(v['live_notes'])
            body.append(f'<div style="margin:6px 0 4px 0">'
                        f'<button type="button" class="live-btn-soul" '
                        f'data-sample="{s["idx"]}" data-variant="{key}" '
                        f'data-notes=\'{live_notes_json}\' '
                        f'style="background:#163c39;color:#7dd3c0;border:1px solid #2a7a6a;'
                        f'padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px">'
                        f'🎹 Live &middot; Soul Symphony (real soundfont)</button>'
                        f'<span class="live-status-soul" data-status-for="{s["idx"]}-soul-{key}" '
                        f'style="margin-left:8px;font-size:11px;color:#6b9e92"></span>'
                        f'</div>')
            body.append('<div class="vis">')
            if v['waveform']:
                body.append(f'<div><div class="small">Waveform</div>{v["waveform"]}</div>')
            if v['spectrogram']:
                body.append(f'<div><div class="small">Spectrogram</div>'
                            f'<img src="{v["spectrogram"]}" alt="spectrogram"/></div>')
            body.append('</div>')
            body.append('</div>')
        body.append('</div>')

        # Tab 3: Progressive Revelation
        body.append(f'<div class="tab-body" id="prog-{sid}">')
        for p in s['phases']:
            body.append(f'<div class="phase"><div class="label"><b>{p["label"]}</b> '
                        f'<span class="small" style="color:#6b9e92">({p["notes"]} notes)</span></div>')
            body.append(f'<audio controls preload="metadata" controlsList="nodownload" src="{p["audio"]}"></audio>')
            # v0.3.5: Live SoundFont playback for Progressive Revelation
            live_notes_json = json.dumps(p['live_notes'])
            body.append(f'<div style="margin:6px 0 4px 0">'
                        f'<button type="button" class="live-btn-prog" '
                        f'data-sample="{s["idx"]}" data-phase="{s["phases"].index(p)+1}" '
                        f'data-notes=\'{live_notes_json}\' '
                        f'style="background:#163c39;color:#7dd3c0;border:1px solid #2a7a6a;'
                        f'padding:5px 12px;border-radius:3px;cursor:pointer;font-size:12px">'
                        f'🎹 Live &middot; {p["label"]} (real soundfont)</button>'
                        f'<span class="live-status-prog" data-status-for="{s["idx"]}-prog-{s["phases"].index(p)+1}" '
                        f'style="margin-left:8px;font-size:11px;color:#6b9e92"></span>'
                        f'</div>')
            body.append('<div class="vis">')
            if p['waveform']:
                body.append(f'<div><div class="small">Waveform</div>{p["waveform"]}</div>')
            if p['spectrogram']:
                body.append(f'<div><div class="small">Spectrogram</div>'
                            f'<img src="{p["spectrogram"]}" alt="spectrogram"/></div>')
            body.append('</div>')
            body.append('</div>')
        body.append('</div>')

        body.append('</section>')

    # Inject per-sample / per-variant instrument lists (consumed by the
    # Live button JS in the <script> below).  Built AFTER the samples
    # loop so we can iterate cbp.VARIANTS in deterministic order.
    body.append('<script>')
    body.append('var SONIFY_VARIANTS_INSTRUMENTS = {')
    for s in samples:
        body.append(f'  {s["idx"]}: [')
        for v in s['bp_info']['variants']:
            insts_json = json.dumps(v['instruments'])
            body.append(f'    {insts_json},')
        body.append('  ],')
    body.append('};')
    body.append('var SONIFY_VARIANTS_ORDER = ' + json.dumps(list(cbp.VARIANTS.keys())) + ';')
    body.append('</script>')
    body.append('<script>')
    body.append('// Inline onclick — most reliable. Each tab carries its')
    body.append('// target body id; the handler toggles .active on tabs and')
    body.append('// bodies *within the same .sample section* so the other')
    body.append('// samples are unaffected.  No event delegation, no capture')
    body.append('// phase quirks, no e.stopPropagation needed.')
    body.append('function sonifyActivate(bodyId) {')
    body.append('  var body = document.getElementById(bodyId);')
    body.append('  if (!body) { console.warn("[sonify] no body for", bodyId); return; }')
    body.append('  var section = body.closest(".sample");')
    body.append('  if (!section) { console.warn("[sonify] no section for", bodyId); return; }')
    body.append('  section.querySelectorAll(".tab").forEach(function(t){t.classList.remove("active");});')
    body.append('  section.querySelectorAll(".tab-body").forEach(function(b){b.classList.remove("active");});')
    body.append('  body.classList.add("active");')
    body.append('  var tabs = section.querySelectorAll(".tab");')
    body.append('  for (var i = 0; i < tabs.length; i++) {')
    body.append('    if (tabs[i].getAttribute("data-target") === bodyId) { tabs[i].classList.add("active"); break; }')
    body.append('  }')
    body.append('  // Pause any audio in the now-hidden tab bodies')
    body.append('  section.querySelectorAll(".tab-body:not(.active) audio").forEach(function(a){try{a.pause();}catch(e){}});')
    body.append('}')
    body.append('// Deep-link: ?tab=bp|soul|prog opens that tab for every sample.')
    body.append('var initialTab = new URLSearchParams(window.location.search).get("tab");')
    body.append('if (initialTab && ["bp", "soul", "prog"].indexOf(initialTab) >= 0) {')
    body.append('  document.querySelectorAll(".sample").forEach(function(s){')
    body.append('    var body = document.getElementById(initialTab + "-" + s.id);')
    body.append('    if (body) sonifyActivate(body.id);')
    body.append('  });')
    body.append('}')
    body.append('// Stop audio when the user navigates away from a sample')
    body.append('document.addEventListener("visibilitychange", function(){')
    body.append('  if (document.hidden) document.querySelectorAll("audio").forEach(function(a){try{a.pause();}catch(e){}});')
    body.append('});')
    body.append('</script>')
    # v0.3.4: tab switching is now in an external file (see
    # dist/vendor/sonify-tabs.js) to keep this giant 11-MB HTML
    # page free of inline script blocks that the Electron webview
    # sometimes fails to parse when the body is huge.  The file
    # exposes window.sonifyActivate(bodyId) — the same function the
    # inline onclick handlers call.
    # v0.3.4: Live playback (external file — keeps the HTML clean
    # and avoids any chance of inline-script parsing issues with the
    # 11-MB page).  This file dynamically loads smplr and exposes
    # window.sonifyLive.play(sampleIdx, variantKey, variantIdx).
    body.append('<script src="./vendor/sonify-live.js"></script>')
    body.append('</body>')
    return ''.join(body)


def main():
    samples = []
    for idx in range(6):
        meta = json.loads((OUT / f'sample{idx}.json').read_text(encoding='utf-8'))
        name = meta['name']
        print(f'[v3-vis] sample{idx} ({name}) ...', flush=True)
        # Also write a standalone staff SVG for the 'all' variant so we
        # can inspect the five-track layout outside the heavy HTML.
        prims_for_staff, _, _ = primitives.classify(_load_paths(idx))
        notes_for_staff = grammar.compose(prims_for_staff)
        staff_svg = staff.render_full_staff_svg(
            notes_for_staff, title=f'Soul Symphony · sample{idx} · {name}'
        )
        (OUT / f'sample{idx}-soul-staff.svg').write_text(staff_svg, encoding='utf-8')
        samples.append(_sample_payload(idx, name))
    html = build_html(samples)
    (OUT / 'lab-v3.html').write_text(html, encoding='utf-8')
    print(f'[v3-vis] wrote {OUT / "lab-v3.html"} ({len(html):,} bytes)')


if __name__ == '__main__':
    main()
