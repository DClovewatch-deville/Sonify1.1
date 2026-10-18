"""Reproducible line-art -> path graph -> musical events experiment."""
from pathlib import Path
import sys, json, math, hashlib, zipfile, wave, struct
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'vendor'))
import cv2
import numpy as np
from PIL import Image, ImageOps

SOURCE = ROOT.parent / '线稿示例图'
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
SCALE = [48,50,52,55,57,60,62,64,67,69,72,74,76,79]

def trace(skeleton):
    pixels = set(map(tuple, np.argwhere(skeleton > 0)))
    def neighbors(p):
        y,x=p
        result=[]
        for dy,dx in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
            q=(y+dy,x+dx)
            if q not in pixels: continue
            if dx and dy and ((y,x+dx) in pixels or (y+dy,x) in pixels): continue
            result.append(q)
        return sorted(result)
    adjacency={p:neighbors(p) for p in sorted(pixels)}
    visited=set(); paths=[]
    def walk(p,q):
        path=[p]; previous=p; current=q
        while True:
            visited.add(tuple(sorted((previous,current)))); path.append(current)
            ns=adjacency[current]
            if len(ns)!=2 or current==p: break
            nxt=ns[0] if ns[1]==previous else ns[1]
            if tuple(sorted((current,nxt))) in visited: break
            previous,current=current,nxt
        return path
    for p in sorted(pixels, key=lambda p:(len(adjacency[p])==2,p)):
        for q in adjacency[p]:
            if tuple(sorted((p,q))) not in visited: paths.append(walk(p,q))
    return paths

def extract(gray):
    # Thin strokes, never redraw model-generated geometry.
    mask=cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,25,12)
    mask[:8]=0;mask[-8:]=0;mask[:,:8]=0;mask[:,-8:]=0
    n,labels,stats,_=cv2.connectedComponentsWithStats(mask)
    keep=np.zeros(n,dtype=np.uint8); keep[1:]=(stats[1:,cv2.CC_STAT_AREA]>=12)*255
    mask=keep[labels]
    skeleton=cv2.ximgproc.thinning(mask)
    raw=trace(skeleton); h,w=gray.shape; candidates=[]
    for path in raw:
        a=np.array([(x,y) for y,x in path],dtype=np.float32)
        length=float(np.linalg.norm(np.diff(a,axis=0),axis=1).sum())
        if length<max(w,h)*.025: continue
        simplified=cv2.approxPolyDP(a.reshape(-1,1,2),1.4,False).reshape(-1,2)
        if len(simplified)<2: continue
        chord=float(np.linalg.norm(a[-1]-a[0])); straight=chord/max(length,1)
        dx,dy=a[-1]-a[0]; angle=math.degrees(math.atan2(float(dy),float(dx)))%180
        kind='horizontal' if straight>.9 and min(angle,180-angle)<12 else 'vertical' if straight>.9 and abs(angle-90)<12 else 'curve'
        candidates.append(dict(points=(simplified/[w,h]).round(5).tolist(),length=round(length,2),kind=kind,angle=round(angle,1),closed=bool(chord<3),bbox=[float(a[:,0].min()/w),float(a[:,1].min()/h),float(a[:,0].max()/w),float(a[:,1].max()/h)],score=length*(1.15 if kind=='curve' else 1)))
    # Repetition candidates: nearby, similarly long, similarly directed vertical strokes.
    vertical=[p for p in candidates if p['kind']=='vertical']; groups=[]; used=set()
    for i,p in enumerate(vertical):
        if i in used:continue
        cx=(p['bbox'][0]+p['bbox'][2])/2;cy=(p['bbox'][1]+p['bbox'][3])/2
        g=[]
        for j,q in enumerate(vertical):
            if j in used:continue
            qx=(q['bbox'][0]+q['bbox'][2])/2;qy=(q['bbox'][1]+q['bbox'][3])/2
            if abs(qy-cy)<.045 and abs(qx-cx)<.25 and .65<p['length']/q['length']<1.55:g.append(j)
        if len(g)>=3:
            used.update(g);groups.append([vertical[j] for j in g])
    ranked=sorted(candidates,key=lambda p:-p['score'])
    selected=ranked[:36]
    for g in groups[:3]:
        for p in g:
            if p not in selected:selected.append(p)
    selected=selected[:60]
    for i,p in enumerate(selected):p['id']=f'p{i:03d}'
    repeat=[]
    for g in groups:
        ids=[p['id'] for p in g if 'id' in p]
        if len(ids)>=3:repeat.append(ids)
    return mask,skeleton,selected,repeat,dict(raw_paths=len(raw),eligible_paths=len(candidates),selected_paths=len(selected))

def sample(p,n):
    a=np.array(p['points']); d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(a,axis=0),axis=1))]
    return np.array([np.interp(np.linspace(0,d[-1],n),d,a[:,i]) for i in range(2)]).T

def compose(paths,groups,disabled=None):
    notes=[]
    def add(p,pitch,start,duration,rule,voice,point=None):
        notes.append(dict(id=f'n{len(notes):03d}',source=p['id'],source_point=point,pitch=int(pitch),start=round(float(start),3),duration=round(float(duration),3),rule=rule,voice=voice))
    if disabled!='contour':
        chosen=[p for p in paths if p['kind']=='curve'][:3]
        for k,p in enumerate(chosen):
            points=sample(p,8); center=float(points[:,1].mean());span=max(float(np.ptp(points[:,1])),.12)
            for j,(x,y) in enumerate(points):
                degree=(1-center)*(len(SCALE)-1)+(center-y)/span*6
                pitch=SCALE[int(np.clip(round(degree),0,len(SCALE)-1))]
                add(p,pitch,k*4+j*.5,.43,'contour',0,[round(float(x),5),round(float(y),5)])
                notes[-1]['calculation']=dict(center=center,span=span,degree=degree,scale_index=int(np.clip(round(degree),0,len(SCALE)-1)),sample_index=j)
    if disabled!='support':
        for k,p in enumerate([p for p in paths if p['kind']=='horizontal'][:3]):add(p,48+(k%2)*7,k*4,3.6,'support',1)
    if disabled!='repeat':
        byid={p['id']:p for p in paths}
        for g in groups[:1]:
            for j,pid in enumerate(g[:8]):
                for k in range(2):add(byid[pid],60+(j%2)*7,k*6+j*.5,.22,'repeat',2)
    return notes

def vlq(v):
    a=[v&127];v>>=7
    while v:a.insert(0,(v&127)|128);v>>=7
    return bytes(a)

def export(notes,path):
    events=[]
    for n in notes:
        ch=n['voice'];pitch=n['pitch'];on=round(n['start']*960);off=round((n['start']+n['duration'])*960)
        events.extend([(on,1,bytes([0x90+ch,pitch,55])),(off,0,bytes([0x80+ch,pitch,0]))])
    track=bytearray(b'\x00\xff\x51\x03\x07\xa1\x20');last=0
    for t,_,msg in sorted(events):track+=vlq(t-last)+msg;last=t
    track+=b'\x00\xff\x2f\x00'
    path.with_suffix('.mid').write_bytes(b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(track))+track)
    rate=22050;audio=np.zeros(rate*14,dtype=np.float64)
    for n in notes:
        count=int((n['duration']+.12)*rate);t=np.arange(count)/rate;freq=440*2**((n['pitch']-69)/12)
        env=np.minimum(t/.025,1)*np.exp(-t/(.5 if n['voice']!=1 else 2))*np.minimum(np.maximum((n['duration']+.12-t)/.12,0),1)
        tone=(np.sin(2*np.pi*freq*t)+.15*np.sin(4*np.pi*freq*t))*env*.08
        a=int(n['start']*rate);b=min(a+count,len(audio));audio[a:b]+=tone[:b-a]
    audio=np.tanh(audio)
    with wave.open(str(path.with_suffix('.wav')),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes((audio*32767).astype('<i2').tobytes())

def main():
    results=[]
    for index,file in enumerate(sorted(SOURCE.glob('*'))):
        if file.suffix.lower() not in ['.jpg','.png'] or file.name=='原图.jpg':continue
        slug=f'sample{len(results)}';image=Image.open(file).convert('RGB');image.thumbnail((640,840));image.save(OUT/f'{slug}.jpg')
        gray=cv2.cvtColor(np.array(image),cv2.COLOR_RGB2GRAY)
        exclusions=[]
        if file.name in ['线稿1.jpg','线稿2.jpg']:
            # Explicitly declared manual exclusion for embedded video captions.
            h,w=gray.shape;box=(int(w*.15),int(h*.74),int(w*.83),int(h*.84));gray[box[1]:box[3],box[0]:box[2]]=255;exclusions.append('人工屏蔽字幕区域 y=74%–84%（也可能排除少量建筑线条）')
        mask,skel,paths,groups,metrics=extract(gray)
        Image.fromarray(255-mask).save(OUT/f'{slug}-binary.png');Image.fromarray(255-skel).save(OUT/f'{slug}-skeleton.png')
        variants={}
        for key,disabled in [('all',None),('no-contour','contour'),('no-support','support'),('no-repeat','repeat')]:
            ns=compose(paths,groups,disabled);export(ns,OUT/f'{slug}-{key}');variants[key]=ns
        result=dict(id=slug,name=file.name,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),paths=paths,groups=groups,metrics=metrics,variants=variants,exclusions=exclusions,width=image.width,height=image.height)
        (OUT/f'{slug}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');results.append(result)
    refs=[]
    for file in SOURCE.glob('*.docx'):
        with zipfile.ZipFile(file) as z:
            for entry in z.namelist():
                if entry.startswith('word/media/'):
                    try:
                        import io
                        im=Image.open(io.BytesIO(z.read(entry))).convert('RGB');im.thumbnail((800,800));name=f'reference{len(refs)}.jpg';im.save(OUT/name);refs.append(dict(file=name,source=file.name,pairing='未确认，不参与配对保真度评价'))
                    except Exception:pass
    payload=dict(samples=results,references=refs,version='0.1',limitations=['不识别屋顶/窗户语义；分类是几何候选','重复组按方向、长度和位置启发式识别，尚未验证等间距','没有自动深度估计、原图对齐或标准五线谱','音乐为固定五声音阶规则与简单合成音色，不是 AI 编曲'])
    (OUT/'data.js').write_text('window.EXPERIMENT='+json.dumps(payload,ensure_ascii=False)+';',encoding='utf-8')
    print(json.dumps([dict(name=r['name'],**r['metrics'],groups=len(r['groups']),notes=len(r['variants']['all'])) for r in results],ensure_ascii=False,indent=2))
    return payload

if __name__=='__main__':main()
