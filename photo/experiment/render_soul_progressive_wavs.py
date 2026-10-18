"""v0.3.5: Re-render Soul Symphony and Progressive Revelation WAVs
using the real FluidR3_GM soundfont (via render_soundfont.py) instead
of the additive-sine synth.  The .wav files now match what the Live
button in the browser plays.

The Blueprint .wav files are kept as additive-sine (the 12 000-symbol
polyphony exceeds tinysoundfont's voice pool) — the Live button for
Blueprint still uses smplr for real-instrument playback.

Idempotent: skips samples whose .wav is already newer than the .json
and the new renderer.
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'vendor'))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import run as lab
import primitives
import grammar
import render_soundfont as rsf

OUT = lab.OUT
SOUL_VARIANTS = [('all', 18.0), ('no-contour', 18.0), ('no-support', 18.0), ('no-repeat', 18.0)]
PHASE_TOTALS = (15.0, 30.0, 45.0, 60.0, 80.0, 105.0)


def main() -> int:
    sf = rsf.find_soundfont()
    if not sf:
        print('[render] no FluidR3 .sf2/.sf3 found, aborting')
        return 1
    print(f'[render] using soundfont: {sf}')
    # Acquire the soundfont pool (loads the .sf3 once, ~7 s; reused for
    # every subsequent render which then takes <0.1 s per file).
    pool = rsf._SoundFontPool.get(sf, rate=44100, gain=1.2)
    n_rendered = 0
    for idx in range(6):
        meta_path = OUT / f'sample{idx}.json'
        if not meta_path.exists():
            print(f'[render] {meta_path} missing, skipping')
            continue
        d = json.loads(meta_path.read_text(encoding='utf-8'))
        prims, _, _ = primitives.classify(d['paths'])

        # Soul Symphony: 4 ablations
        for key, total in SOUL_VARIANTS:
            wav_path = OUT / f'sample{idx}-v2-{key}.wav'
            notes = grammar.compose(
                prims,
                disabled=('contour' if key == 'no-contour'
                          else 'support' if key == 'no-support'
                          else 'repeat' if key == 'no-repeat'
                          else None)
            )
            t0 = time.time()
            budget = rsf.render_wav(notes, wav_path, sf_path=sf,
                                    total_seconds=total, rate=44100, pool=pool)
            dt = time.time() - t0
            print(f'[render] sample{idx} soul {key}: {len(notes)} notes '
                  f'(poly {budget}) -> {wav_path.name} in {dt:.2f}s')
            n_rendered += 1

        # Progressive Revelation: 6 phases
        for p in range(1, 7):
            wav_path = OUT / f'sample{idx}-v3-phase{p}.wav'
            notes = grammar.compose_progressive(prims, p)
            t0 = time.time()
            budget = rsf.render_wav(notes, wav_path, sf_path=sf,
                                    total_seconds=PHASE_TOTALS[p - 1],
                                    rate=44100, pool=pool)
            dt = time.time() - t0
            print(f'[render] sample{idx} phase{p}: {len(notes)} notes '
                  f'(poly {budget}) -> {wav_path.name} in {dt:.2f}s')
            n_rendered += 1

    pool.close()
    print(f'[render] done: {n_rendered} wav files re-rendered with FluidR3_GM')
    return 0


if __name__ == '__main__':
    sys.exit(main())
