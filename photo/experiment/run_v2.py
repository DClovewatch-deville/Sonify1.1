"""S0.3 driver: feed run.extract() output through primitives + grammar +
new exporter, producing the same per-sample artifact set the v0.1 pipeline
emits, but with semantic primitives and multi-channel MIDI.

The output filenames use the suffix -v2 so they coexist with the v0.1
artifacts (which the test harness in test_pipeline.py still relies on).
"""
from __future__ import annotations
import hashlib
import json
import sys
import zipfile
from pathlib import Path
from typing import Dict, List

from PIL import Image
import numpy as np
import cv2

import run as lab                       # reuse extract() from v0.1
import primitives                       # S0.1
import grammar                          # S0.2
import compose_v2 as cv2_exporter       # S0.3


SOURCE = lab.SOURCE
OUT = lab.OUT


def _hash_image(file: Path) -> str:
    return hashlib.sha256(file.read_bytes()).hexdigest()


def _process_one(index: int, file: Path, existing_results: List[dict]) -> dict:
    image = Image.open(file).convert('RGB')
    image.thumbnail((640, 840))
    gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
    exclusions: List[str] = []
    if file.name in ['线稿1.jpg', '线稿2.jpg']:
        h, w = gray.shape
        box = (int(w * .15), int(h * .74), int(w * .83), int(h * .84))
        gray[box[1]:box[3], box[0]:box[2]] = 255
        exclusions.append('人工屏蔽字幕区域 y=74%–84%')

    mask, skel, paths, groups, metrics = lab.extract(gray)
    prims, leftovers, facade_meta = primitives.classify(paths)
    summary = primitives.summarise(prims)
    summary['facade'] = facade_meta

    # Emit variants: all + 3 ablations matching v0.1 naming.
    variants: Dict[str, List[dict]] = {}
    for key, disabled in [
        ('all', None),
        ('no-contour', 'contour'),
        ('no-support', 'support'),
        ('no-repeat', 'repeat'),
    ]:
        notes = grammar.compose(prims, disabled=disabled)
        midi_path = OUT / f'sample{index}-v2-{key}.mid'
        wav_path = OUT / f'sample{index}-v2-{key}.wav'
        cv2_exporter.export_midi(notes, midi_path)
        cv2_exporter.render_wav(notes, wav_path)
        variants[key] = notes

    return dict(
        id=f'sample{index}',
        name=file.name,
        sha256=_hash_image(file),
        primitives=prims,
        leftover_paths=leftovers,
        primitive_summary=summary,
        v0_metrics=metrics,
        v0_groups=groups,
        variants=variants,
        exclusions=exclusions,
        width=image.width,
        height=image.height,
    )


def main():
    results: List[dict] = []
    for index, file in enumerate(sorted(SOURCE.glob('*'))):
        if file.suffix.lower() not in ['.jpg', '.png']:
            continue
        if file.name == '原图.jpg':
            continue
        print(f'[v2] processing {file.name} ...', flush=True)
        results.append(_process_one(index, file, results))

    payload = dict(
        samples=results,
        version='0.2',
        limitations=[
            'classification uses geometric evidence only (length, bbox, direction); no architectural priors',
            'rendering is additive synthesis (sine partials + noise), not a real SoundFont instrument bank',
            'pitch mapping is pentatonic and quantised; no microtonal or modal logic',
        ],
    )
    (OUT / 'data_v2.js').write_text(
        'window.EXPERIMENT_V2=' + json.dumps(payload, ensure_ascii=False) + ';',
        encoding='utf-8',
    )

    # Compact log: primitive distribution per sample.
    print(json.dumps(
        [dict(name=r['name'], **r['primitive_summary']) for r in results],
        ensure_ascii=False, indent=2,
    ))
    return payload


if __name__ == '__main__':
    main()
