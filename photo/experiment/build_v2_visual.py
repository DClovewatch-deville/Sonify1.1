"""S0.5: Build the v2 visual demo.

Produces:
  - dist/lab-v2.html  : interactive page showing each sample's primitive
    overlay (color-coded by type) and an audio player for the four
    variants (all / no-contour / no-support / no-repeat) plus a waveform
    + spectrogram thumbnail.
  - dist/data_v2_visual.js  : JSON payload consumed by the page.

Visual design priorities for the audience / 评委:
  1.  show the geometry -> semantic primitive mapping side-by-side with
      the audio, so the mapping is traceable end-to-end;
  2.  highlight differences between the four variants, so the
      contribution of each grammar rule is visible;
  3.  stay self-contained (no external CDN, no third-party JS).
  4.  keep the HTML small (<2MB) by referencing WAV and JPG files
      instead of base64-embedding them.
"""
from __future__ import annotations
import json
import base64
import sys
import wave
from pathlib import Path
from typing import List

import numpy as np

sys.path.insert(0, r'D:\Hackathon_SKD_Laptop\MusicPhoto\experiment\vendor')
import run as lab
import primitives
import grammar


OUT = lab.OUT

COLOURS = {
    'roof':       '#c0392b',  # red
    'column':     '#27ae60',  # green
    'support':    '#2980b9',  # blue
    'decoration': '#e67e22',  # orange
    'curve':      '#8e44ad',  # purple
    'unknown':    '#7f8c8d',  # grey
}
COLOUR_NAMES = {
    'roof':       'Roof ridge',
    'column':     'Columns',
    'support':    'Support / beam',
    'decoration': 'Decoration',
    'curve':      'Curve / contour',
    'unknown':    'Other',
}

VARIANTS = [('all', 'All rules (full mapping)'),
            ('no-contour', 'Without curve/contour'),
            ('no-support', 'Without support/beams'),
            ('no-repeat', 'Without column pulses')]


def _waveform_svg(wav_path: Path, width: int = 600, height: int = 80) -> str:
    """SVG waveform thumbnail (no external deps)."""
    try:
        with wave.open(str(wav_path), 'rb') as w:
            rate = w.getframerate()
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


def _spectrogram_png_b64(wav_path: Path, width: int = 200, height: int = 50) -> str:
    """Log-magnitude spectrogram as a base64-encoded PNG (small, ~10kB).
    Avoids the 10000+ <rect> elements an equivalent SVG would need.
    """
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
        rows = max(8, min(height, 32))
        img = np.zeros((rows, cols), dtype=float)
        window = np.hanning(win)
        for ci, fi in enumerate(idx):
            start = fi * hop
            seg = pcm[start:start + win] * window
            spec = np.abs(np.fft.rfft(seg))[:rows]
            if spec.max() > 0:
                spec = spec / spec.max()
            img[:, ci] = spec[::-1]
        # Map intensity to RGB.  Use a warm colormap: dark blue -> orange.
        rgb = np.zeros((rows, cols, 3), dtype=np.uint8)
        for c in range(cols):
            for r in range(rows):
                v = float(img[r, c])
                # dark navy -> teal -> orange
                rgb[r, c, 0] = int(255 * min(1.0, v * 1.6))         # red
                rgb[r, c, 1] = int(180 * min(1.0, v * 1.2))         # green
                rgb[r, c, 2] = int(120 * (1.0 - v))                  # blue
        # Render to PNG via PIL.
        from PIL import Image
        im = Image.fromarray(rgb, mode='RGB')
        im = im.resize((width, height), Image.NEAREST)
        import io
        buf = io.BytesIO()
        im.save(buf, format='PNG', optimize=True)
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ''


def _overlay_svg(image_path: Path, prims: List[dict], width: int = 320) -> str:
    """SVG overlay of the primitive classification on top of the line-art.
    The image is shown as a separate file (not base64-embedded) so the
    HTML stays under 1MB even for samples with 50+ paths.
    """
    from PIL import Image
    img = Image.open(image_path)
    w, h = img.size
    scale = width / w
    h_disp = int(h * scale)
    # Combine all paths into a single SVG <path> per primitive type for
    # compactness.  One <path> with multiple sub-paths beats dozens of
    # tiny paths in bytes and rendering speed.
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
    variants = {}
    for key, label in VARIANTS:
        wav_path = OUT / f'sample{idx}-v2-{key}.wav'
        variants[key] = dict(
            label=label,
            audio=wav_path.name,
            waveform=_waveform_svg(wav_path, 400, 60),
            spectrogram=_spectrogram_png_b64(wav_path, 200, 50),
        )
    overlay = _overlay_svg(OUT / f'sample{idx}.jpg', prims, 320)
    return dict(
        idx=idx,
        name=file_name,
        width=w, height=h,
        facade=facade,
        summary=summary,
        primitives=[dict(
            type=p['type'],
            count=p['count'],
            avg_length=p['avg_length'],
            max_length=p['max_length'],
        ) for p in prims],
        variants=variants,
        overlay_svg=overlay,
    )


def build_html(samples: List[dict]) -> str:
    css = """
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
           background: #0d1b1e; color: #e8e4d9; margin: 0; padding: 0; }
    .page-header { background: #163c39; padding: 20px 48px; border-bottom: 3px solid #2a7a6a; }
    h1 { font-size: 26px; margin: 0 0 4px 0; color: #7dd3c0; font-weight: 300; letter-spacing: 0.5px; }
    .tagline { color: #a0c4b8; font-size: 14px; margin: 0; font-weight: 300; }
    .intro { max-width: 900px; background: #112d2a; margin: 0; padding: 20px 48px;
             border-bottom: 1px solid #1f5048; line-height: 1.6; font-size: 14px; }
    .intro p { margin: 0 0 10px 0; }
    .intro strong { color: #7dd3c0; }
    .intro em { color: #a0c4b8; font-style: normal; }
    h2 { font-size: 16px; margin: 24px 0 6px 0; color: #7dd3c0; font-weight: 400;
         letter-spacing: 0.3px; text-transform: uppercase; font-size: 12px; }
    .sample { display: grid; grid-template-columns: 360px 1fr; gap: 28px;
              align-items: start; margin: 0; padding: 20px 48px;
              border-bottom: 1px solid #1f5048; }
    .sample:hover { background: #0f2422; }
    .sample h3 { grid-column: 1 / -1; font-size: 18px; color: #c9e8e0; margin: 0 0 8px 0;
                 font-weight: 400; }
    .overlay { background: #fff; border: 1px solid #1f5048; padding: 6px;
               max-width: 360px; border-radius: 4px; }
    .overlay svg { display: block; max-width: 100%; height: auto; }
    .meta { font-size: 12px; color: #6b9e92; line-height: 1.7; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; margin: 8px 0; }
    .swatch { display: inline-block; width: 9px; height: 9px;
              border-radius: 2px; margin-right: 3px; vertical-align: middle; }
    audio { width: 100%; margin-top: 6px; }
    .var { margin: 8px 0; padding: 8px 10px; background: #112d2a;
           border: 1px solid #1f5048; border-radius: 4px; }
    .var audio { width: 100%; }
    .vis { display: flex; gap: 10px; align-items: flex-start; margin-top: 6px; }
    .vis svg, .vis img { border: 1px solid #1f5048; background: #0a1a18; }
    .label { font-size: 11px; color: #6b9e92; margin-bottom: 2px; }
    .summary { font-size: 12px; color: #a0c4b8; line-height: 1.7; }
    .facade-badge { display: inline-block; padding: 2px 6px; border-radius: 3px;
                    font-size: 11px; font-weight: bold; margin-left: 6px; }
    .facade-yes { background: #27ae60; color: #fff; }
    .facade-no { background: #555; color: #ccc; }
    """
    body = ['<!doctype html><meta charset="utf-8"><title>Sonify v2 - Geometry to Music</title>',
            f'<style>{css}</style>',
            '<div class="page-header">',
            '<div style="display:flex; justify-content:space-between; align-items:center;">',
            '<div>',
            '<h1>Sonify v2: from line-art geometry to multi-voice music</h1>',
            '<p class="tagline">Sprint 0 &mdash; Semantic Primitive Classification + Sonic Grammar Engine</p>',
            '</div>',
            '<div style="font-size:13px;">',
            '<a href="index.html" style="color:#7dd3c0; text-decoration:none; '
            'border:1px solid #2a7a6a; padding:6px 12px; border-radius:4px;">'
            '&#8592; v0.1 Blueprint Score</a>',
            '&nbsp;&nbsp;',
            '<a href="lab.html" style="color:#7dd3c0; text-decoration:none; '
            'border:1px solid #2a7a6a; padding:6px 12px; border-radius:4px;">'
            'v0.1 Rule Lab &#8594;</a>',
            '</div>',
            '</div>',
            '</div>',
            '<div class="intro">',
            '<p><strong>What you are seeing:</strong> each line-art image (left) is decomposed '
            'into <em>semantic geometry primitives</em>: <span style="color:#c0392b">roof ridge</span>, '
            '<span style="color:#27ae60">columns</span>, '
            '<span style="color:#2980b9">support beams</span>, '
            '<span style="color:#e67e22">decoration</span>, '
            '<span style="color:#8e44ad">curve contours</span>, '
            '<span style="color:#7f8c8d">other</span>. '
            'A declarative rule table maps each primitive type to a <strong>General-MIDI instrument</strong>, '
            'a <strong>note density</strong>, and a <strong>velocity envelope</strong>. '
            'A global scheduler caps simultaneous active notes at 5 so the output '
            'stays musical instead of collapsing into a wall of sound.</p>',
            '<p><strong>What you are hearing:</strong> four audio variants per sample. '
            '"All rules" is the full mapping. '
            '"Without curve/contour" removes the melody layer. '
            '"Without support/beams" removes the pad layer. '
            '"Without column pulses" removes the pulse layer. '
            'The difference between any pair is the <em>audible contribution of that rule</em>.</p>',
            '</div>']

    legend_html = ['<h2>Colour Legend</h2><div class="legend">']
    for t, c in COLOURS.items():
        legend_html.append(
            f'<span><span class="swatch" style="background:{c}"></span>'
            f'{COLOUR_NAMES[t]}</span>'
        )
    legend_html.append('</div>')
    body.append(''.join(legend_html))

    for s in samples:
        body.append('<section class="sample">')
        facade_class = 'facade-yes' if s['facade']['is_column_facade'] else 'facade-no'
        facade_label = 'Column-façade (Greek/Roman temple)' if s['facade']['is_column_facade'] else 'Non-column (Chinese pavilion / mixed style)'
        body.append(f'<h3>Sample {s["idx"]}: {s["name"]} '
                    f'<span class="facade-badge {facade_class}">{facade_label}</span></h3>')
        body.append('<div>')
        body.append(f'<div class="overlay">{s["overlay_svg"]}</div>')
        body.append('<div class="summary">')
        body.append(f'<div>Structural element: tallest vertical = '
                    f'{s["facade"]["max_vertical_height_fraction"]:.2f} '
                    f'(threshold 0.30 for column-façade detection)</div>')
        body.append('<div>Path distribution by type: ')
        for t, c in s['summary']['paths_by_type'].items():
            body.append(f' <span style="color:{COLOURS.get(t, "#aaa")}"><b>{t}</b>=<i>{c}</i></span>')
        body.append('</div>')
        body.append(f'<div>Total: {s["summary"]["total_paths"]} paths classified into '
                    f'{s["summary"]["primitive_count"]} primitive groups</div>')
        body.append('</div>')
        body.append('</div>')
        body.append('<div>')
        for key, label in VARIANTS:
            v = s['variants'][key]
            body.append(f'<div class="var"><div class="label"><b>{label}</b></div>')
            body.append(f'<audio controls preload="none" src="{v["audio"]}"></audio>')
            body.append('<div class="vis">')
            if v['waveform']:
                body.append(f'<div><div class="label">Waveform</div>{v["waveform"]}</div>')
            if v['spectrogram']:
                body.append(f'<div><div class="label">Spectrogram</div>'
                            f'<img src="{v["spectrogram"]}" alt="spectrogram"/></div>')
            body.append('</div>')
            body.append('</div>')
        body.append('</div>')
        body.append('</section>')

    body.append('</body>')
    return ''.join(body)


def main():
    samples = []
    for idx in range(6):
        meta = json.loads((OUT / f'sample{idx}.json').read_text(encoding='utf-8'))
        name = meta['name']
        print(f'[v2-vis] sample{idx} ({name}) ...', flush=True)
        samples.append(_sample_payload(idx, name))
    html = build_html(samples)
    (OUT / 'lab-v2.html').write_text(html, encoding='utf-8')
    (OUT / 'data_v2_visual.js').write_text(
        'window.VISUAL=' + json.dumps(samples, ensure_ascii=False) + ';',
        encoding='utf-8',
    )
    print(f'[v2-vis] wrote {OUT / "lab-v2.html"} ({len(html):,} bytes)')


if __name__ == '__main__':
    main()
