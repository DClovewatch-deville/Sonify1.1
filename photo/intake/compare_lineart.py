"""Preserved comparison of deterministic edge variants and supplied model art."""
from pathlib import Path
import hashlib, html, json, shutil, subprocess, sys, time
from server import cv2, np, EXPERIMENT
from PIL import Image, ImageOps, ImageDraw
sys.path.insert(0, str(EXPERIMENT))
import run as geometry

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'batch_results'/'2026-10-17-lineart-comparison'


def metrics(gray):
    small=Image.fromarray(gray);small.thumbnail((640,840));a=np.array(small)
    mask,skel,paths,groups,stats=geometry.extract(a)
    return dict(**stats,edge_ratio=round(float((gray<128).mean()),4)),skel


def prune(edge,area):
    n,labels,stats,_=cv2.connectedComponentsWithStats(edge)
    keep=np.zeros(n,np.uint8);keep[1:]=(stats[1:,cv2.CC_STAT_AREA]>=area)*255
    return keep[labels]


def main():
    OUT.mkdir(parents=True,exist_ok=True); rows=[]
    # Visual candidate matches only: model outputs are not verified pairs.
    candidates={1:8,6:1,8:9,9:6,15:10,20:11,22:7}
    files=sorted((ROOT.parent/'上传测试图').glob('*.jpg'))
    for index,file in enumerate(files,1):
        started=time.perf_counter();folder=OUT/f'photo-{index:02d}';folder.mkdir(exist_ok=True)
        im=ImageOps.exif_transpose(Image.open(file)).convert('RGB');im.thumbnail((840,840));im.save(folder/'original.png')
        rgb=np.array(im);gray=cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY)
        baseline=255-cv2.Canny(cv2.GaussianBlur(gray,(5,5),0),60,150)
        smooth=rgb.copy()
        for _ in range(3):smooth=cv2.bilateralFilter(smooth,9,90,9)
        smooth=255-prune(cv2.Canny(cv2.cvtColor(smooth,cv2.COLOR_RGB2GRAY),65,160),24)
        scale=min(1,420/max(im.size));coarse=cv2.resize(rgb,None,fx=scale,fy=scale,interpolation=cv2.INTER_AREA)
        coarse=cv2.bilateralFilter(coarse,9,100,9)
        coarse=255-prune(cv2.Canny(cv2.cvtColor(coarse,cv2.COLOR_RGB2GRAY),45,110),18)
        record=dict(index=index,filename=file.name,variants={},candidate_model=candidates.get(index),pairing='视觉候选，原图与模型参数未核实；不作像素保真度结论')
        for name,array in [('baseline',baseline),('smooth',smooth),('coarse',coarse)]:
            Image.fromarray(array).save(folder/f'{name}.png');record['variants'][name]=metrics(array)[0]
        record['elapsed_seconds']=round(time.perf_counter()-started,3);rows.append(record)
        print(f'photo {index}/22 compared',flush=True)
    models=[]
    for i in range(1,12):
        folder=OUT/f'model-{i:02d}';folder.mkdir(exist_ok=True)
        source=ROOT.parent.parent/'tmp'/'local-lineart-review'/f'image{i}.jpeg'
        shutil.copyfile(source,folder/'source-model.jpeg')
        im=Image.open(source).convert('RGB');im.save(folder/'original.png')
        gray=ImageOps.autocontrast(im.convert('L'),cutoff=.3);gray.thumbnail((840,840))
        gray.save(folder/'structural.png')
        stats,skel=metrics(np.array(gray));Image.fromarray(skel).save(folder/'skeleton.png')
        started=time.perf_counter()
        result=subprocess.run([sys.executable,str(ROOT/'bridge.py'),str(folder)],capture_output=True,timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        (folder/'bridge.log').write_bytes(result.stdout+result.stderr)
        models.append(dict(index=i,stats=stats,music_completed=result.returncode==0,elapsed_seconds=round(time.perf_counter()-started,2),
                           processing='模型现成线稿 → 对比度规范化 → 几何；没有再次使用 Canny。时间不包含模型推理。'))
        print(f'model {i}/11 music={result.returncode==0}',flush=True)
    (OUT/'comparison.json').write_text(json.dumps(dict(photos=rows,models=models),ensure_ascii=False,indent=2),encoding='utf-8')
    cards=[]
    for r in rows:
        columns=[]
        for label,name in [('原图','original'),('当前 OpenCV','baseline'),('保边平滑＋碎块过滤','smooth'),('降低尺度＋碎块过滤','coarse')]:
            columns.append(f'<figure><figcaption>{label}</figcaption><img src="photo-{r["index"]:02d}/{name}.png"></figure>')
        if r['candidate_model']:
            columns.append(f'<figure><figcaption>模型线稿（候选配对，待确认）</figcaption><img src="model-{r["candidate_model"]:02d}/original.png"><a href="model-{r["candidate_model"]:02d}/workspace/studio.html">模型线稿对应音乐 ↗</a></figure>')
        cards.append(f'<article><h2>{r["index"]:02d} · {html.escape(r["filename"])}</h2><div class="row">'+''.join(columns)+'</div></article>')
    page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>线稿路线对照</title><style>body{font:14px/1.8 sans-serif;background:#f6f5ef;color:#294337;margin:24px}h2{font-size:14px}article{background:#fff;padding:16px;margin:20px 0;border-radius:12px}.row{display:flex;gap:12px;overflow-x:auto}figure{margin:0;min-width:200px;flex:1}img{width:100%;height:300px;object-fit:contain;background:#f5f5ef}figcaption{font-size:12px}a{color:#42694d}</style><h1>OpenCV 与现成模型线稿 · 路线对照</h1><p>传统图像处理的两个减细节候选均保留原图构图；是否保住主体必须视觉检查。模型图只按视觉选取候选配对，未核实同源，不能据此计算几何保真度。</p><p><a href="REVIEW.md">评估结论</a> · <a href="comparison.json">完整记录</a></p>'''+''.join(cards)+'<h2>全部11张模型线稿作品</h2>'+''.join(f'<p><a href="model-{i:02d}/workspace/studio.html">模型示例 {i:02d} · 三模式作品</a></p>' for i in range(1,12))+'</html>'
    (OUT/'index.html').write_text(page,encoding='utf-8')
    for start in range(0,22,4):
        sheet=Image.new('RGB',(1600,1280),'#efefe8');draw=ImageDraw.Draw(sheet)
        for offset,r in enumerate(rows[start:start+4]):
            for k,name in enumerate(('original','baseline','smooth','coarse')):
                im=Image.open(OUT/f'photo-{r["index"]:02d}'/f'{name}.png');im.thumbnail((390,285))
                x=k*400;y=offset*320;sheet.paste(im,(x+(400-im.width)//2,y+25+(285-im.height)//2));draw.text((x+8,y+5),f'{r["index"]:02d} {name}',fill='black')
        sheet.save(OUT/f'comparison-{start//4+1:02d}.jpg',quality=90)


if __name__=='__main__':main()
