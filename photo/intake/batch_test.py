"""Archive an image folder through the real intake and isolated music bridge."""
from pathlib import Path
import argparse
import hashlib
import html
import json
import shutil
import time
from server import Pipeline, cv2, np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent


def main(source, output):
    output.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in source.iterdir() if p.suffix.lower() in ('.jpg', '.jpeg', '.png'))
    pipeline = Pipeline(output / 'jobs', {'build_music': True})
    records = []
    try:
        for index, file in enumerate(files, 1):
            started = time.perf_counter()
            raw = file.read_bytes()
            record = dict(index=index, filename=file.name, source_sha256=hashlib.sha256(raw).hexdigest())
            try:
                job = pipeline.create(raw, 'local')
                jid = job['id']
                folder = output / 'jobs' / jid
                shutil.copyfile(file, folder / ('source-original' + file.suffix.lower()))
                while True:
                    job = pipeline.snapshot(jid)
                    if job['status'] in ('completed', 'failed'):
                        break
                    time.sleep(.2)
                record.update(job_id=jid, status=job['status'], music_status=job['music_status'],
                    elapsed_seconds=round(time.perf_counter()-started, 2), stats=job.get('stats'),
                    error=job.get('error') or job.get('music_error'))
                image = Image.open(folder / 'original.png')
                record['normalized_size'] = list(image.size)
                structural = np.array(Image.open(folder / 'structural.png').convert('L'))
                record['edge_pixel_ratio'] = round(float((structural < 128).mean()), 4)
                if job['music_status'] == 'completed':
                    payload = json.loads((folder / 'workspace/studio/sample5.json').read_text(encoding='utf-8'))
                    path_ids = {p['id'] for p in payload['contours']}
                    record['full_paths'] = len(path_ids)
                    record['note_counts'] = {key: len(payload[key]['notes']) for key in ('soul', 'soul_demo', 'progressive')}
                    record['all_note_sources_valid'] = all(n['source'] in path_ids for key in record['note_counts'] for n in payload[key]['notes'])
                    record['structure_hash_valid'] = payload['source_hash'] == hashlib.sha256((folder / 'structural.png').read_bytes()).hexdigest()
                    record['has_audio'] = all(f.stat().st_size > 44 for f in (folder / 'workspace/studio').glob('*.wav'))
            except Exception as exc:
                record.update(status='failed', error=type(exc).__name__ + ': ' + str(exc))
            records.append(record)
            (output / 'results.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f'{index}/{len(files)} {file.name}: {record["status"]} music={record.get("music_status")} {record.get("elapsed_seconds")}s', flush=True)
    finally:
        pipeline.pool.shutdown(wait=True)
    gallery(output, records)


def gallery(output, records):
    cards=[]
    for r in records:
        stem='jobs/'+r.get('job_id','')+'/'
        journey=f'/journey?batch={output.name}&job={r.get("job_id","")}'
        cards.append(f'''<article><h2>{r['index']:02d} · {html.escape(r['filename'])}</h2><div class="pair"><img src="{stem}original.png" alt="原图"><img src="{stem}structural.png" alt="本地边缘图"></div><p>{html.escape(str(r.get('stats')))} · {r.get('elapsed_seconds')} 秒（含音乐渲染）</p><p>边缘像素占比 {r.get('edge_pixel_ratio')} · 完整音乐路径 {r.get('full_paths','—')} · 音符来源校验 {r.get('all_note_sources_valid','—')}</p><nav><a href="{journey}">观看生成旅程 ↗</a> <a href="{stem}structural.png">边缘图</a> <a href="{stem}geometry.json">候选几何</a> <a href="{stem}workspace/studio/sample5.json">完整音乐映射</a> <a href="{stem}workspace/studio.html">三个模式作品 ↗</a></nav><p>{html.escape(r.get('error') or '')}</p></article>''')
    page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sonify · 22 张图片批量测试</title><style>body{background:#f6f5ef;color:#294337;font:14px/1.8 'Microsoft YaHei',sans-serif;margin:30px}h1{font-weight:500}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:20px}article{background:#fffef9;border:1px solid #dce1d5;padding:20px;border-radius:14px}h2{font-size:14px;overflow-wrap:anywhere}.pair{display:flex;height:300px;gap:10px}.pair img{width:calc(50% - 5px);object-fit:contain;background:#eeefe7}p{font-size:12px;color:#74816e}a{color:#456c50;margin-right:14px}@media(max-width:520px){body{margin:15px}.grid{grid-template-columns:1fr}.pair{height:230px}}</style><h1>22 张图片 · 原图与本地边缘图</h1><p>真实本地处理与独立音乐构建。处理成功仅说明链路可运行，不代表已通过语义识别或音乐审美验收。时间包含音乐渲染，不等于边缘提取时间。</p><p><a href="results.json">完整测试记录 JSON</a><a href="REVIEW.md">评估说明</a></p><div class="grid">'''+''.join(cards)+'</div></html>'
    (output/'index.html').write_text(page,encoding='utf-8')
    try:
        font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',17)
    except OSError:
        font=ImageFont.load_default()
    for start in range(0,len(records),6):
        sheet=Image.new('RGB',(1440,1200),'#f6f5ef'); draw=ImageDraw.Draw(sheet)
        for offset,r in enumerate(records[start:start+6]):
            x=(offset%2)*720;y=(offset//2)*400
            draw.text((x+15,y+10),f'{r["index"]:02d}  {r["filename"][:20]}',fill='#294337',font=font)
            for k,name in enumerate(('original.png','structural.png')):
                p=output/'jobs'/r.get('job_id','')/name
                if p.exists():
                    im=Image.open(p).convert('RGB');im.thumbnail((340,340));sheet.paste(im,(x+10+k*355+(340-im.width)//2,y+40+(340-im.height)//2))
        sheet.save(output/f'contact-{start//6+1:02d}.jpg',quality=90)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path)
    args=parser.parse_args();main(args.source.resolve(),args.output.resolve())
