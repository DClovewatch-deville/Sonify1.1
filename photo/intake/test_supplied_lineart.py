"""Test supplied cloud/local line-art files without another Canny pass."""
from pathlib import Path
import hashlib, html, json, shutil, subprocess, sys, time, wave
from PIL import Image, ImageOps, ImageDraw
from compare_lineart import metrics
from server import np

ROOT=Path(__file__).resolve().parent


def main():
    source=ROOT.parent/'线稿示例图'/'豆包线稿'
    output=ROOT/'batch_results'/'2026-10-17-doubao-five';output.mkdir(parents=True,exist_ok=True)
    files=sorted(p for p in source.iterdir() if p.suffix.lower() in ('.png','.jpg','.jpeg','.webp'))
    labels=['河流草地','红树山水','林间溪流','夕阳山谷','山林溪流']
    local_candidates=[6,7,9,11,10]
    rows=[]
    for i,file in enumerate(files,1):
        folder=output/f'cloud-{i:02d}';folder.mkdir(exist_ok=True)
        shutil.copyfile(file,folder/('source-cloud'+file.suffix.lower()))
        original=ImageOps.exif_transpose(Image.open(file)).convert('RGB');original.save(folder/'original.png')
        gray=ImageOps.autocontrast(original.convert('L'),cutoff=.3);gray.thumbnail((840,840));gray.save(folder/'structural.png')
        stats,skeleton=metrics(np.array(gray));Image.fromarray(skeleton).save(folder/'skeleton.png')
        started=time.perf_counter()
        process=subprocess.run([sys.executable,str(ROOT/'bridge.py'),str(folder)],capture_output=True,timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        (folder/'bridge.log').write_bytes(process.stdout+process.stderr)
        record=dict(index=i,name=labels[i-1] if i<=5 else file.stem,filename=file.name,
            source_sha256=hashlib.sha256(file.read_bytes()).hexdigest(),source_size=list(original.size),analysis_size=list(gray.size),
            stats=stats,music_completed=process.returncode==0,postprocess_seconds=round(time.perf_counter()-started,2),
            local_candidate=local_candidates[i-1] if i<=5 else None,
            pairing='按视觉选择的本地模型候选，未确认同源输入或生成参数；不进行像素保真度结论。',
            processing='用户保存的豆包线稿 → 灰度/对比度规范化 → 几何骨架 → 当前音乐引擎；未调用图生图API，未再次使用Canny。')
        if process.returncode==0:
            payload=json.loads((folder/'workspace/studio/sample5.json').read_text(encoding='utf-8'));ids={p['id'] for p in payload['contours']}
            record.update(full_paths=len(ids),note_counts={mode:len(payload[mode]['notes']) for mode in ['soul','soul_demo','progressive']},
                all_sources_valid=all(n['source'] in ids for mode in ['soul','soul_demo','progressive'] for n in payload[mode]['notes']),
                structure_hash_valid=payload['source_hash']==hashlib.sha256((folder/'structural.png').read_bytes()).hexdigest())
            wavs=list((folder/'workspace/studio').glob('*.wav'));assert len(wavs)==18
            for f in wavs:
                with wave.open(str(f)) as wav:assert wav.getnframes()>0
            record['wav_count']=len(wavs)
        rows.append(record);(output/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'{i}/{len(files)} {file.name} music={process.returncode==0}',flush=True)
    cards=[]
    sheet=Image.new('RGB',(1500,len(rows)*400),'#f2f2eb');draw=ImageDraw.Draw(sheet)
    for r in rows:
        i=r['index'];folder=f'cloud-{i:02d}'
        cells=[]
        for k,(name,label) in enumerate([('original','豆包原线稿'),('structural','用于几何的规范化输入'),('skeleton','实际骨架')]):
            cells.append(f'<figure><figcaption>{label}</figcaption><img src="{folder}/{name}.png"></figure>')
            im=Image.open(output/folder/(name+'.png')).convert('RGB')
            if name=='skeleton':im=ImageOps.invert(im)
            im.thumbnail((480,350));x=k*500;y=(i-1)*400;sheet.paste(im,(x+(500-im.width)//2,y+35+(350-im.height)//2));draw.text((x+10,y+10),f'{i:02d} {name}',fill='black')
        candidate=f'../2026-10-17-lineart-comparison/model-{r["local_candidate"]:02d}/workspace/studio.html'
        cards.append(f'<article><h2>{i:02d} · {html.escape(r["name"])}</h2><p>{html.escape(r["filename"])}</p><div class="row">'+''.join(cells)+f'</div><p>完整路径 {r.get("full_paths")} · 来源校验 {r.get("all_sources_valid")} · 后处理与音乐 {r["postprocess_seconds"]} 秒（不含豆包生成）</p><a href="{folder}/workspace/studio.html">豆包线稿三模式作品 ↗</a> · <a href="{candidate}">本地线稿候选作品 ↗</a></article>')
    sheet.save(output/'contact.jpg',quality=92)
    (output/'index.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>豆包五张线稿 · 解析测试</title><style>body{font:14px/1.8 sans-serif;color:#294337;background:#f6f5ef;margin:24px}article{padding:20px;background:white;border-radius:12px;margin:20px 0}h2{font-size:19px}.row{display:flex;gap:12px;overflow-x:auto}figure{min-width:210px;flex:1;margin:0}img{width:100%;height:400px;object-fit:contain;background:#ededdf}p,figcaption{font-size:12px}a{color:#456b50}</style><h1>豆包五张线稿 · 作为结构输入的实测</h1><p>手机软件生成的现成文件，不代表API性能；链路成功不等于结构质量或音乐审美合格。</p><p><a href="REVIEW.md">逐张评估与结论</a> · <a href="results.json">完整记录</a></p>'''+''.join(cards),encoding='utf-8')


if __name__=='__main__':main()
