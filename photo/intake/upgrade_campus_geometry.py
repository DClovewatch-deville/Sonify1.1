"""Campus-only multiscale evidence, broad source coverage and isolated Photo UI."""
from pathlib import Path
from copy import deepcopy
import hashlib,math
from build_museum import ROOT,OUT,Image,np,cv2,renderer,studio
from build_museum_extensions import read_json,write_json,local,compact_mapping,mix_portrait
import studio_grammar as grammar

VERSION='multiscale-spatial-v2'

def extract_layers(album,original):
    im=Image.open(local(album['image'])).convert('L');im.thumbnail((1280,1280));gray=np.array(im);h,w=gray.shape
    enhanced=cv2.createCLAHE(clipLimit=2.5,tileGridSize=(12,12)).apply(gray)
    candidates=[]
    for name,field,lo,hi in [('fine',enhanced,25,65),('structure',cv2.GaussianBlur(enhanced,(5,5),1.2),35,90)]:
        edge=cv2.Canny(field,lo,hi)
        cs,_=cv2.findContours(edge,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        for c in cs:
            length=cv2.arcLength(c,False)
            if length<14:continue
            pts=cv2.approxPolyDP(c,.65,False).reshape(-1,2)
            if len(pts)<2:continue
            candidates.append((length,name,pts/[w,h]))
    # Smooth tonal isocontours retain clouds and shadow transitions. These are
    # explicitly tonal boundaries, not semantic outlines or invented objects.
    smooth=cv2.GaussianBlur(gray,(0,0),4)
    for threshold in range(35,226,25):
        mask=(smooth>threshold).astype(np.uint8)*255
        cs,_=cv2.findContours(mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        for c in cs:
            length=cv2.arcLength(c,False)
            if length<85:continue
            pts=cv2.approxPolyDP(c,1.1,False).reshape(-1,2)/[w,h]
            if np.mean((pts[:,0]<.003)|(pts[:,0]>.997)|(pts[:,1]<.003)|(pts[:,1]>.997))>.25:continue
            candidates.append((length,'tone_boundary',pts))
    cells={};new=[];occupied=set()
    for length,kind,points in sorted(candidates,key=lambda p:-p[0]):
        center=points.mean(axis=0);cell=(int(center[0]*12),int(center[1]*8),kind)
        if cells.get(cell,0)>=4:continue
        # Suppress near-duplicate contours from the two Canny scales.
        signature=tuple(np.round(np.r_[points.min(axis=0),points.max(axis=0)]*160).astype(int))
        if signature in occupied:continue
        occupied.add(signature);cells[cell]=cells.get(cell,0)+1
        new.append(dict(id='ms'+str(len(new)).zfill(5),points=points.round(6).tolist(),evidence_kind=kind))
    geo=deepcopy(original);geo['paths']+=new
    geo['extraction']=dict(version=VERSION,analysis_resolution=[w,h],methods=['CLAHE','fine Canny 25/65','structure Canny 35/90','smoothed intensity isocontours'],note='明暗等值线不是物体语义分割；所有坐标来自同一张原照片。')
    return geo

def score(music,geo):
    music=deepcopy(music)
    # Rebuild from the saved original portrait on each run, not from a previous
    # upgraded score. Only the lead motif persists; support becomes spatially broad.
    music['notes']=[n for n in music['notes'] if n['voice']!=4]
    units,meta=grammar.classify_units(geo['paths'],geo['width'],geo['height'])
    buckets={}
    for u in units:
        if u['length']<8:continue
        p=np.array(u['points']);center=p.mean(axis=0);cell=(min(7,int(center[0]*8)),min(7,int(center[1]*8)))
        buckets.setdefault(cell,[]).append(u)
    # Fair round-robin across occupied cells rather than a global longest-path cut.
    for bucket in buckets.values():bucket.sort(key=lambda u:-u['length'])
    selected=[]
    for rank in range(8):
        for cell,bucket in sorted(buckets.items()):
            if len(bucket)>rank:selected.append(bucket[rank])
            if len(selected)>=160:break
        if len(selected)>=160:break
    selected.sort(key=lambda u:(int(np.mean(u['points'],axis=0)[0]*8),np.mean(u['points'],axis=0)[1]))
    pcs=music.get('scale_pcs') or [0,2,4,7,9];ladder=[p for p in range(48,84) if p%12 in pcs]
    templates={v:next((n for n in music['notes'] if n['voice']==v),music['notes'][0]) for v in range(5)}
    for i,u in enumerate(selected):
        points=u['points'];point=points[len(points)//2];voice=1 if u['type']=='v_line' else 2 if u['type']=='h_line' else 3
        template=templates[voice];pitch=min(ladder,key=lambda p:abs(p-(78-26*point[1])))
        start=.2+i*(music['duration']-1.6)/max(1,len(selected));n=deepcopy(template)
        # New evidence must not inherit an unrelated phrase/group/calculation.
        for key in ['group','parent_note_id','theme_index','phrase','section']:n.pop(key,None)
        n.update(id='spatial-'+str(i),source=u['id'],source_point=point,voice=voice,voice_id=voice,pitch=pitch,start=round(start,6),duration=round(min(.42,max(.18,(music['duration']-1.6)/len(selected)*1.3)),6),velocity=68,program=template.get('program',0),type=u['type'],layer=u['layer'],role='spatial_support',arrangement_role='spatial_support',calculation=dict(method='spatial cell path -> vertical-position scale pitch',path_id=u['id'],normalized_y=point[1],geometric_type=u['type']))
        music['notes'].append(n)
    music['notes'].sort(key=lambda n:n['start']);music['museum_expression']['spatial_coverage']=dict(version=VERSION,paths=len(geo['paths']),support_sources=len(selected),occupied_cells=len(buckets),rule='8x8 spatial round-robin; normalized y -> existing scale; geometric family -> support voice')
    return music,units,meta

def overview(geo,path):
    w=1280;h=round(w*geo['height']/geo['width']);im=Image.new('RGB',(w,h),'#f5f0e5')
    from PIL import ImageDraw
    d=ImageDraw.Draw(im)
    for p in geo['paths']:d.line([(x*w,y*h) for x,y in p['points']],fill='#89958a' if p.get('evidence_kind')=='tone_boundary' else '#375a50',width=1)
    im.save(path)

def main():
    manifest=read_json(OUT/'museum-extensions.json');sf=renderer.find_soundfont();pool=renderer._SoundFontPool.get(sf,rate=22050,gain=1.2);audit=[]
    try:
        for album in read_json(OUT/'albums-v2.json')['albums']:
            if not (album['id'].startswith('campus-') or album['id'] in ['axis','library','crescent','tower']):continue
            extra=manifest['works'][album['id']]
            if extra.get('geometry_upgrade')==VERSION:continue
            oldmusic=read_json(local(extra['track']['audio']).with_name('portrait.json'));oldgeo=read_json(local(extra.get('geometry',album['evidence']['geometry'])))
            geo=extract_layers(album,oldgeo);music,units,meta=score(oldmusic,geo)
            signature=hashlib.sha256((album['evidence']['image_sha256']+Path(__file__).read_text(encoding='utf-8')).encode()).hexdigest()[:12]
            folder=OUT/album['id']/('spatial-'+signature);folder.mkdir(exist_ok=True);url='/museum/'+album['id']+'/'+folder.name+'/'
            write_json(folder/'geometry.json',geo);overview(geo,folder/'structure.png')
            for v in range(5):renderer.render_wav([n for n in music['notes'] if n['voice']==v],folder/f'portrait-{v}.wav',sf_path=sf,total_seconds=music['duration']+1,rate=22050,pool=pool,normalize=False)
            mix_portrait(folder,music);write_json(folder/'portrait.json',music);studio.export_midi(music['notes'],folder/'portrait.mid',music['tempo'],music['spatial_pan'])
            mapping=compact_mapping(music,geo,'portrait');mapping['context_paths']=geo['paths']
            write_json(folder/'portrait-mapping.json',mapping)
            oldused=len({n['source'] for n in oldmusic['notes']});used=len({n['source'] for n in music['notes']})
            extra['track'].update(audio=url+'portrait-mix.wav',midi=url+'portrait.mid',mapping=url+'portrait-mapping.json',notes=len(music['notes']))
            extra.update(geometry=url+'geometry.json',geometry_upgrade=VERSION,expression=music['museum_expression']);extra['mappings']['portrait']=url+'portrait-mapping.json'
            lab=ROOT/'batch_results/museum-lab'/album['id']/'studio/sample5.json';payload=read_json(lab)
            payload.update(contours=geo['paths'],units=studio.compact_units(units),unit_meta=meta,progressive=music,geometry_evidence=geo['extraction'])
            payload['progressive_presets']['portrait']=music;payload['stem_urls']['progressive-portrait']=[url+f'portrait-{v}.wav' for v in range(5)]
            write_json(lab,payload);shutil.copyfile(folder/'structure.png',lab.parent.parent/'sample5.jpg')
            audit.append(dict(id=album['id'],old_paths=len(oldgeo['paths']),new_paths=len(geo['paths']),old_music_sources=oldused,new_music_sources=used,geometry=extra['geometry']))
            print(audit[-1],flush=True)
    finally:pool.close()
    write_json(OUT/'museum-extensions.tmp',manifest);(OUT/'museum-extensions.tmp').replace(OUT/'museum-extensions.json')
    write_json(ROOT/'campus-source-research/geometry-upgrade-audit.json',audit)
    from museum_ui.install_structure_context import install
    install(ROOT)

import shutil
if __name__=='__main__':main()
