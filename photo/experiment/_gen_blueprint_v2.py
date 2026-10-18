"""Generate v0.3.2 Blueprint mode audio: 8 distinct timbre families × 6 samples.

This is the post-fix generator.  Previous output was identical bytes for all
8 variants because render_blueprint_wav() used a single additive sine for
every program.  The new engine (_program_family + _synth_family) gives each
of the 8 variants its own harmonic structure (bell / string / brass /
woodwind / pure-bell / ethnic / celestial / mixed), so audiences hear 8
distinct musical readings of the same 12k-symbol score.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, r'D:\Hackathon_SKD_Laptop\MusicPhoto\experiment\vendor')
import run as lab
import compose_blueprint as cbp


OUT = lab.OUT
VARIANTS = list(cbp.VARIANTS.keys())


def main():
    for idx in range(6):
        bp_path = OUT / f'sample{idx}-blueprint.json'
        bp = json.loads(bp_path.read_text(encoding='utf-8'))
        t0 = time.time()
        for variant in VARIANTS:
            notes = cbp.compose_blueprint(bp, variant)
            out = OUT / f'sample{idx}-bp-{variant}.wav'
            cbp.render_blueprint_wav(notes, out)
        print(f'sample{idx} ({bp.get("name", "?")}) {len(VARIANTS)} variants '
              f'({time.time() - t0:.1f}s)', flush=True)


if __name__ == '__main__':
    main()
