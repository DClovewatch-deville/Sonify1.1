"""Build the Hongqiao exhibition from a verified crop and a frozen Photo engine.

No cloud calls, changes to Photo samples, or shared engine writes.
"""
from pathlib import Path
import hashlib
import json
import sys
import math

ROOT = Path(__file__).resolve().parent
EXP = ROOT.parent / 'experiment'
sys.path[:0] = [str(EXP / 'vendor'), str(EXP)]
from engine_snapshot import EngineSnapshot
ENGINE = EngineSnapshot(EXP).install()
import numpy as np
from PIL import Image
import cv2
import run as photo
import blueprint

OUT = ROOT / 'web/museum/scroll'
SOURCE = ROOT / 'scroll-work/qingming-original.jpg'
# Visually checked on the downloaded 38414 x 1800 version, not another scan.
CROP = (15600, 0, 24200, 1800)

def main(publish=True):
    OUT.mkdir(parents=True, exist_ok=True)
    data_dir=OUT/'v3'
    data_dir.mkdir(exist_ok=True)
    original = Image.open(SOURCE).convert('RGB')
    if original.size != (38414, 1800):
        raise ValueError('This crop requires the inspected Commons image version')
    crop = original.crop(CROP)
    crop.thumbnail((6000, 1200))
    crop.save(OUT / 'hongqiao.jpg', quality=87, optimize=True)
    cover = crop.copy(); cover.thumbnail((1600, 400))
    cover.save(OUT / 'cover.jpg', quality=84, optimize=True)
    # Keep the panorama's geometry; do not squeeze it into a square.
    analysis = crop.copy()
    gray = np.array(analysis.convert('L'))
    local = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(24, 8)).apply(gray)
    edges = cv2.Canny(cv2.GaussianBlur(local, (3, 3), 0), 40, 95)
    structure = 255 - edges
    # Same threshold / component / thinning stage as Photo.extract; defer path
    # tracing to Blueprint once, instead of tracing the full 6.9 MP field twice.
    mask=cv2.adaptiveThreshold(structure,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,25,12)
    mask[:8]=0;mask[-8:]=0;mask[:,:8]=0;mask[:,-8:]=0
    n,labels,stats,_=cv2.connectedComponentsWithStats(mask)
    keep=np.zeros(n,dtype=np.uint8);keep[1:]=(stats[1:,cv2.CC_STAT_AREA]>=12)*255
    skeleton=cv2.ximgproc.thinning(keep[labels])
    Image.fromarray(skeleton).save(data_dir / 'structure.png')
    bp = blueprint.build(skeleton, spacing=7)
    w,h=bp['source_width'],bp['source_height']
    retained=[p for p in bp['paths'] if sum(math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h)
        for a,b in zip(p['points'],p['points'][1:]))>=12]
    if not retained:
        raise ValueError('No geometry in the inspected crop')
    retained_ids={p['id'] for p in retained}
    samples=[dict(id=s['id'],path=s['path'],point=[s['x'],s['y']],angle=s['angle']) for s in bp['symbols'] if s['path'] in retained_ids]
    geometry = dict(width=w, height=h, paths=retained,
        samples=samples,spacing=7,min_path_pixels=12,extraction='Photo dense Blueprint / actual skeleton arc samples / local contrast + Canny')
    (data_dir / 'geometry.json').write_text(json.dumps(geometry, ensure_ascii=False,separators=(',',':')), encoding='utf8')
    provenance = dict(original_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        crop=list(CROP), original_size=list(original.size), display_size=list(crop.size),
        analysis_size=list(analysis.size), image_sha256=hashlib.sha256((OUT/'hongqiao.jpg').read_bytes()).hexdigest())
    (data_dir/'image-provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(dict(analysis_size=analysis.size,paths=len(retained),samples=len(samples)),ensure_ascii=False),flush=True)
    if publish:
        from build_scroll_v2 import main as publish_spatial_scores
        publish_spatial_scores()

if __name__ == '__main__':
    main()
