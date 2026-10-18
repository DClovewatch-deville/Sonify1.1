"""Prepare a local, attributed campus collection using the existing Photo engine."""
from pathlib import Path
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT.parent / 'experiment' / 'vendor'), str(ROOT.parent / 'experiment')]
import numpy as np
from PIL import Image
import cv2
import blueprint
import compose_blueprint as composer
import render_soundfont as renderer
import build_studio as studio
from color_dna import analyze
import run as photo

OUT = ROOT / 'web' / 'museum'
ITEMS = [
    ('library', '留白与知识', '图书馆西立面', 'ShanghaiTech University Library West Facade.jpg', '立面的秩序，留给旋律一片安静的空间。'),
    ('tower', '夜色的坐标', '校园标志塔', 'ShanghaiTech Tower.jpg', '灯光勾勒出熟悉的轮廓，让夜晚慢下来。'),
    ('crescent', '光的行进', '校园长廊与标志塔', 'Contemporary Crescent Walkway and Iconic Tower ShanghaiTech University.jpg', '沿着长廊翻阅校园，听见线条的转折。'),
    ('axis', '展开的校园', '校园主轴全景', 'ShanghaiTech Center.jpg', '让视线沿建筑与天空展开，听一幅校园的全景。'),
]

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'SonifyCampusMuseum/1.0'}), timeout=60) as response:
        return response.read()

def clean(value):
    return html.unescape(re.sub('<[^>]+>', '', value)).strip()

def build():
    OUT.mkdir(parents=True, exist_ok=True)
    sf = renderer.find_soundfont()
    if not sf:
        raise RuntimeError('Photo SoundFont is missing')
    albums = []
    for slug, title, place, filename, story in ITEMS:
        folder = OUT / slug
        folder.mkdir(exist_ok=True)
        metadata_file = folder / 'source.json'
        if metadata_file.exists():
            source = json.loads(metadata_file.read_text(encoding='utf-8'))
        else:
            query = urllib.parse.urlencode(dict(action='query', format='json', prop='imageinfo', iiprop='url|extmetadata', iiurlwidth=1280, titles='File:' + filename))
            info = next(iter(json.loads(fetch('https://commons.wikimedia.org/w/api.php?' + query))['query']['pages'].values()))['imageinfo'][0]
            meta = info['extmetadata']
            source = dict(page=info['descriptionurl'], image=info.get('thumburl', info['url']), author=clean(meta['Artist']['value']), license=clean(meta['LicenseShortName']['value']), license_url=meta['LicenseUrl']['value'], changes='缩小至最大 1280 像素；封面在界面中裁切显示。', filename=filename)
            if source['license'] != 'CC BY-SA 4.0':
                raise ValueError('Review license before inclusion: ' + source['license'])
            metadata_file.write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding='utf-8')
        image_path = folder / 'photo.jpg'
        if not image_path.exists():
            image_path.write_bytes(fetch(source['image']))
        audio = folder / 'blueprint.wav'
        if not audio.exists():
            im = Image.open(image_path).convert('L')
            im.thumbnail((840, 840))
            edges = cv2.Canny(cv2.GaussianBlur(np.array(im), (5, 5), 0), 60, 150)
            structure = Image.fromarray(255 - edges)
            structure.thumbnail((640, 840))
            _, skeleton, _, _, _ = photo.extract(np.array(structure))
            Image.fromarray(skeleton).save(folder / 'structure.png')
            bp = blueprint.build(skeleton)
            notes = composer.compose_blueprint(bp, studio.BLUEPRINT_VARIANT, total_seconds=13)
            if not notes:
                raise ValueError('No music for ' + slug)
            renderer.render_blueprint_soundfont(notes, audio, sf_path=sf, total_seconds=13, rate=22050, gain=1.2)
            studio.export_midi(notes, folder / 'blueprint.mid')
            evidence = dict(image_sha256=hashlib.sha256(image_path.read_bytes()).hexdigest(), paths=len(bp['paths']), notes=len(notes), color_dna=analyze(image_path, 'Wikimedia campus photograph'), engine='MusicPhoto blueprint', variant=studio.BLUEPRINT_VARIANT, duration=13, color_used_in_audio=False, engine_sha256={name:hashlib.sha256((ROOT.parent/'experiment'/name).read_bytes()).hexdigest() for name in ['run.py','blueprint.py','compose_blueprint.py','render_soundfont.py']})
            (folder / 'evidence.json').write_text(json.dumps(evidence, ensure_ascii=False), encoding='utf-8')
        evidence = json.loads((folder / 'evidence.json').read_text(encoding='utf-8'))
        albums.append(dict(id=slug, object_id=slug, title=title, place=place, story=story, image=f'/museum/{slug}/photo.jpg', source=source, tracks=[dict(label='几何乐章 · Photo Blueprint', audio=f'/museum/{slug}/blueprint.wav', midi=f'/museum/{slug}/blueprint.mid', duration=13)], evidence=evidence))
        print('Ready:', slug, flush=True)
        (OUT / 'albums.json').write_text(json.dumps(dict(title='Campus Symphony', albums=albums), ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    build()
