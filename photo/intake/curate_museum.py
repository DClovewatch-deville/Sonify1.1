"""Fetch individually licensed photography; keep source facts separate from curation."""
import json
import time
import urllib.parse
from build_museum import OUT, fetch, clean

# Descriptive themes are editorial labels, never a guessed geolocation.
SELECTION = [
 ('clementinum', '穹顶下的时间', '建筑与空间', ['室内','透视','暖色'], 'Clementinum baroque library 2.jpg', '捷克 · 布拉格 · 克莱门特学院图书馆', '书架与穹顶汇聚在同一条视线里，金色的光缓慢铺开。'),
 ('longroom', '书页的回廊', '建筑与空间', ['室内','重复','暖色'], 'Long Room Interior, Trinity College Dublin, Ireland - Diliff.jpg', '爱尔兰 · 都柏林 · 圣三一学院旧图书馆', '重复的书架与拱顶，把空间延伸成一段无声的长句。'),
 ('viktor', '光落在寂静里', '建筑与空间', ['室内','对称','明暗'], 'Dülmen, St.-Viktor-Kirche, Innenansicht -- 2020 -- 6115.jpg', '德国 · 迪尔门 · 圣维克多教堂', '窗光穿过安静的室内，秩序与明暗在这里相遇。'),
 ('courtyard', '庭院的留白', '建筑与空间', ['室外','几何','明亮'], 'At Victoria and Albert Museum 2024 004.jpg', '英国 · 伦敦 · 维多利亚与艾尔伯特博物馆', '建筑的边界围出一片留白，让视线在庭院中停驻。'),
 ('allos', '山湖之间', '山水与自然', ['山峦','水面','开阔'], 'Mont Pelat + Lake Allos tour 17.jpg', '法国 · 阿洛斯湖与佩拉山地区', '山脊与水面展开层次，远方的轮廓给旋律留下呼吸。'),
 ('luang', '河流的慢拍', '山水与自然', ['水面','桥梁','层次'], 'Landscape of Luang Prabang with a temporary wooden footbridge.jpg', '老挝 · 琅勃拉邦', '河流与步桥连接两岸，细小的线条落在广阔的景色里。'),
 ('sninsky', '冬日的余晖', '山水与自然', ['山峦','雪景','暮色'], 'Sninský kameň (v zime) 046.jpg', '斯洛伐克 · 维霍拉特山地 · Sninský kameň', '冬日山岩迎着最后的光，冷暖在地平线附近交织。'),
 ('woodland', '林间的呼吸', '山水与自然', ['树林','透视','柔光'], 'Dülmen, Börnste, Waldweg -- 2015 -- 4649.jpg', '德国 · 迪尔门 · Börnste', '林间小径穿过层层枝叶，让视线朝光的方向缓慢前行。'),
]

def prepare():
    catalog = []
    for slug, title, category, tags, filename, place, story in SELECTION:
        folder = OUT / slug
        folder.mkdir(parents=True, exist_ok=True)
        source_path = folder / 'source.json'
        if source_path.exists():
            source = json.loads(source_path.read_text(encoding='utf-8'))
        else:
            query = urllib.parse.urlencode(dict(action='query', format='json', prop='imageinfo|categories', cllimit='max', iiprop='url|extmetadata', iiurlwidth=1920, titles='File:' + filename))
            page = next(iter(json.loads(fetch('https://commons.wikimedia.org/w/api.php?' + query))['query']['pages'].values()))
            info = page['imageinfo'][0]; meta = info['extmetadata']
            license_name = clean(meta['LicenseShortName']['value'])
            if license_name not in ('CC BY-SA 4.0', 'CC BY-SA 3.0', 'CC BY 4.0', 'CC BY 3.0', 'CC0'):
                raise ValueError('License needs review: ' + license_name)
            categories = [c['title'] for c in page.get('categories', [])]
            quality = 'Featured picture' if 'Category:Featured pictures on Wikimedia Commons' in categories else ('Quality image' if 'Category:Quality images' in categories else None)
            if not quality:
                raise ValueError('Quality designation not verified: ' + filename)
            source = dict(page=info['descriptionurl'], image=info.get('thumburl', info['url']), author=clean(meta['Artist']['value']), attribution=clean(meta.get('Attribution', meta['Artist'])['value']), license=license_name, license_url=meta['LicenseUrl']['value'], description=clean(meta.get('ImageDescription', {'value':''})['value']), filename=filename, quality=quality, categories=categories, changes='下载来源提供的 1920 像素预览；封面可能裁切，详情保留完整构图。', checked_at='2026-10-17')
            source_path.write_text(json.dumps(source, ensure_ascii=False, indent=2), encoding='utf-8')
        image_path = folder / 'photo.jpg'
        if not image_path.exists():
            for attempt in range(3):
                try:
                    raw = fetch(source['image']); image_path.write_bytes(raw); break
                except Exception:
                    if attempt == 2: raise
                    time.sleep(2)
        catalog.append(dict(id=slug, object_id=slug, title=title, category=category, tags=tags, place=place, location_basis='来源文件标题及说明', story=story, source=source, image=f'/museum/{slug}/photo.jpg'))
        print('Sourced:', slug, source['quality'], source['license'], flush=True)
    (OUT / 'curation.json').write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    prepare()
