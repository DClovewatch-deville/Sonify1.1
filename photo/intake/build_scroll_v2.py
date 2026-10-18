"""Publish independent spatial Blueprint and Soul scores for the Hongqiao crop."""
from pathlib import Path
import sys
import json
import hashlib
import shutil
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parent
sys.path[:0]=[str(ROOT.parent/'experiment/vendor'),str(ROOT.parent/'experiment')]
from engine_snapshot import EngineSnapshot
ENGINE=EngineSnapshot(ROOT.parent/'experiment').install()
import build_studio as studio
from scroll_score import compose
from render_scroll_samples import render

BASE=ROOT/'web/museum/scroll'
OUT=BASE/'v3'
def save(path,data):path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def main():
    OUT.mkdir(exist_ok=True)
    geometry=json.loads((OUT/'geometry.json').read_text(encoding='utf8'))
    # A raster of the retained, actual paths supplies dense context without
    # putting 36000 individual SVG elements into the live player.
    w,h=geometry['width'],geometry['height']
    context=Image.new('RGBA',(w,h),(0,0,0,0));draw=ImageDraw.Draw(context)
    for p in geometry['paths']:
        draw.line([(round(x*w),round(y*h)) for x,y in p['points']],fill=(157,187,169,230),width=2)
    context.save(OUT/'outline.png',optimize=True)
    old=json.loads((BASE/'manifest.json').read_text(encoding='utf8'))
    prior=ROOT/'scroll-work/v1-manifest.json'
    if not prior.exists():shutil.copy2(BASE/'manifest.json',prior)
    variants=[]
    for mode,label in [('soul','Soul Symphony · 山河叙事'),('blueprint','Blueprint · 逐线成声')]:
        music=compose(geometry,mode)
        stats=render(music,OUT/f'{mode}.wav')
        studio.export_midi(music['notes'],OUT/f'{mode}.mid',music['tempo'],music['spatial_pan'])
        save(OUT/f'{mode}.json',music)
        evidence=dict(schema_version='sonify.scroll.evidence.v3',input_sha256=sha(BASE/'hongqiao.jpg'),
            audio_sha256=sha(OUT/f'{mode}.wav'),score_sha256=sha(OUT/f'{mode}.json'),
            score_fingerprint=music['fingerprint'],composer_sha256=sha(ROOT/'scroll_score.py'),
            renderer_sha256=sha(ROOT/'render_scroll_samples.py'),source_paths=music['coverage']['audible_paths'],
            notes=len(music['notes']),duration=music['duration'],shared_photo_arrangement=False,
            coverage=music['coverage'],geometry_sha256=sha(OUT/'geometry.json'),
            sync='Every onset = 1.2 + (1-x)*45 seconds; actual source vertices drive audio and highlighting',
            **stats)
        provenance=OUT/'image-provenance.json'
        if not provenance.exists():provenance=BASE/'evidence.json'
        evidence['image_provenance']={k:v for k,v in json.loads(provenance.read_text(encoding='utf8')).items()
            if k in ('original_sha256','crop','original_size','display_size','analysis_size')}
        save(OUT/f'{mode}-evidence.json',evidence)
        variants.append(dict(id=mode,label=label,audio=f'/museum/scroll/v3/{mode}.wav',
            midi=f'/museum/scroll/v3/{mode}.mid',score=f'/museum/scroll/v3/{mode}.json',
            evidence=f'/museum/scroll/v3/{mode}-evidence.json',duration=music['duration'],coverage=music['coverage']))
        print(mode,len(music['notes']),evidence['source_paths'],round(stats['rms'],4),flush=True)
    save(OUT/'samples.json',stats['sample_sources'])
    default=variants[0]
    manifest=dict(old,version='dense-spatial-3',audio=default['audio'],midi=default['midi'],
        score=default['score'],evidence=default['evidence'],duration=48,variants=variants,
        geometry='/museum/scroll/v3/geometry.json',outline='/museum/scroll/v3/outline.png',
        reading=dict(start=1.2,span=45),sample_sources='/museum/scroll/v3/samples.json')
    temp=BASE/'manifest.tmp';save(temp,manifest);temp.replace(BASE/'manifest.json')
    print('Published independent scroll scores',flush=True)
if __name__=='__main__':main()
