"""Dense spatial graphic score. No original raster is painted into the score."""
import json, math, struct, wave
import run as lab
import numpy as np

def build(skeleton, spacing=5):
    h,w=skeleton.shape
    paths=lab.trace(skeleton)
    occupied=set(); symbols=[]; accepted=[]
    # Retain short connected strokes; sample globally instead of selecting top-N paths.
    for path in sorted(paths,key=lambda p:-len(p)):
        if len(path)<4:continue
        a=np.array([(x,y) for y,x in path],dtype=float)
        d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(a,axis=0),axis=1))]
        if d[-1]<4:continue
        pid=f'b{len(accepted):05d}'
        simple=lab.cv2.approxPolyDP(a.astype(np.float32).reshape(-1,1,2),.8,False).reshape(-1,2)
        accepted.append(dict(id=pid,points=(simple/[w,h]).round(6).tolist()))
        for distance in np.arange(0,d[-1]+.1,spacing):
            j=min(int(np.searchsorted(d,distance,side='right')),len(a)-1)
            # actual skeleton pixel, not generated shape or unrelated template
            x,y=a[j];cell=(int(x//3),int(y//3))
            if cell in occupied:continue
            occupied.add(cell)
            delta=a[min(j+2,len(a)-1)]-a[max(0,j-2)]
            nx,ny=float(x/w),float(y/h)
            symbols.append(dict(id=f'bp{len(symbols):05d}',path=pid,x=round(nx,6),y=round(ny,6),angle=round(math.atan2(delta[1],delta[0]),3),pitch=round(84-48*ny),start=round(nx*12,4),duration=.10))
    return dict(symbols=symbols,paths=accepted,source_width=w,source_height=h,spacing=spacing,mode='spatial_graphic_score',mapping='x → 12 seconds; y → MIDI 84..36; graphic y stays unquantized')

def svg(bp):
    w,h=bp['source_width'],bp['source_height']; W,H=w+80,h+130
    s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',f'<rect width="{W}" height="{H}" fill="#f7f4eb"/>','<text x="40" y="32" font-family="serif" font-size="19" fill="#183e3b">Sonify · Blueprint Score</text>']
    for y in range(90,int(H-45),95):
        for k in range(5):s.append(f'<path d="M25 {y+k*5} H{W-25}" stroke="#bdc4b8" stroke-width=".4"/>')
    s.append('<g fill="#163c39" stroke="#163c39">')
    for n in bp['symbols']:
        x=40+n['x']*w;y=65+n['y']*h
        s.append(f'<ellipse cx="{x:.2f}" cy="{y:.2f}" rx="1.55" ry="1.05" transform="rotate(-22 {x:.2f} {y:.2f})" stroke="none"/>')
        if int(n['id'][2:])%3==0:s.append(f'<path d="M{x+1.2:.2f} {y:.2f} v-5.5" fill="none" stroke-width=".45"/>')
    s.append('</g><text x="40" y="'+str(H-15)+'" font-size="10" fill="#65796c">Spatial graphic score · symbols follow extracted image geometry</text></svg>')
    return ''.join(s)

def midi(bp,path):
    events=[]
    for n in bp['symbols']:
        on=round(n['start']*960);off=round((n['start']+n['duration'])*960)
        events.extend([(on,1,bytes([0x90,n['pitch'],28])),(off,0,bytes([0x80,n['pitch'],0]))])
    track=bytearray(b'\x00\xff\x51\x03\x07\xa1\x20');last=0
    for t,_,msg in sorted(events):track+=lab.vlq(t-last)+msg;last=t
    track+=b'\x00\xff\x2f\x00'
    path.write_bytes(b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(track))+track)

def audio_preview(bp, path):
    """Render all geometric events and normalize the dense mix."""
    rate=22050
    audio=np.zeros(rate*13,dtype=np.float64)
    for n in bp['symbols']:
        t=np.arange(int((n['duration']+.08)*rate))/rate
        env=np.minimum(t/.008,1)*np.maximum(0,1-t/(n['duration']+.08))**2
        tone=np.sin(2*np.pi*440*2**((n['pitch']-69)/12)*t)*env
        a=round(n['start']*rate);b=min(a+len(tone),len(audio))
        audio[a:b]+=tone[:b-a]
    peak=np.max(np.abs(audio))
    if peak: audio*=.7/peak
    with wave.open(str(path),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate)
        f.writeframes((audio*32767).astype('<i2').tobytes())

def main():
    result=[]
    for f in sorted(lab.OUT.glob('sample*.json')):
        if '-blueprint' in f.stem: continue
        data=json.loads(f.read_text(encoding='utf-8'));skel=255-np.array(lab.Image.open(lab.OUT/(data['id']+'-skeleton.png')).convert('L'))
        bp=build(skel);bp.update(id=data['id'],name=data['name'],exclusions=data['exclusions']);result.append(bp)
        (lab.OUT/(data['id']+'-blueprint.json')).write_text(json.dumps(bp,ensure_ascii=False),encoding='utf-8')
        (lab.OUT/(data['id']+'-blueprint.svg')).write_text(svg(bp),encoding='utf-8');midi(bp,lab.OUT/(data['id']+'-blueprint.mid'))
        print(data['name'],len(bp['paths']),'paths',len(bp['symbols']),'symbols')
        audio_preview(bp,lab.OUT/(data['id']+'-blueprint.wav'))
    (lab.OUT/'blueprints.js').write_text('window.BLUEPRINTS='+json.dumps(result,ensure_ascii=False)+';',encoding='utf-8')
if __name__=='__main__':main()
