"""Local contrast recovery and traceable, spatially distributed portrait accompaniment."""
from copy import deepcopy
import hashlib
from build_museum import cv2, np, Image, renderer, studio
from build_museum_extensions import ROOT, OUT, read_json, write_json, local, compact_mapping, mix_portrait
import studio_grammar as grammar

def recover(album, geometry):
    im=Image.open(local(album['image'])).convert('L').resize((geometry['width'],geometry['height']))
    gray=np.array(im)
    enhanced=cv2.createCLAHE(clipLimit=2.5,tileGridSize=(8,8)).apply(gray)
    edges=cv2.Canny(enhanced,28,80)
    contours,_=cv2.findContours(edges,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
    cells={}; candidates=[]
    for c in sorted(contours,key=lambda c:-cv2.arcLength(c,False)):
        if cv2.arcLength(c,False)<18:continue
        pts=cv2.approxPolyDP(c,1.1,False).reshape(-1,2)/[geometry['width'],geometry['height']]
        x,y=pts.mean(axis=0);cell=(int(x*6),int(y*6))
        if cells.get(cell,0)>=5:continue
        cells[cell]=cells.get(cell,0)+1
        candidates.append(dict(id=f'local{len(candidates):04d}',points=pts.round(6).tolist()))
    # Keep original path IDs for all historical editions.
    geometry=deepcopy(geometry);geometry['paths']+=candidates
    geometry['recovery']='CLAHE 2.5, 8x8; Canny 28/80; spatial quota; original photo coordinates'
    return geometry,candidates,edges

def main():
    manifest=read_json(OUT/'museum-extensions.json');sf=renderer.find_soundfont()
    pool=renderer._SoundFontPool.get(sf,rate=22050,gain=1.2)
    try:
        for album in read_json(OUT/'albums-v2.json')['albums']:
            extra=manifest['works'][album['id']]
            if extra.get('refinement')=='local-coverage-v1':continue
            music=read_json(local(extra['track']['audio']).with_name('portrait.json'))
            geo,paths,edges=recover(album,read_json(local(album['evidence']['geometry'])))
            folder=OUT/album['id']/('coverage-'+hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:12]);folder.mkdir(exist_ok=True)
            url='/museum/'+album['id']+'/'+folder.name+'/'
            write_json(folder/'geometry.json',geo);Image.fromarray(255-edges).save(folder/'structure.png')
            # Distribute accompaniment over spatial cells; pitch is derived from actual y,
            # snapped to the existing scale. Three overlapping notes at most are added.
            paths=sorted(paths,key=lambda p:(int(np.mean(p['points'],axis=0)[0]*6),np.mean(p['points'],axis=0)[1]))
            selected=paths[::max(1,len(paths)//96)][:96]
            scale=music.get('scale_pcs') or [0,2,4,7,9]
            template=deepcopy(next((n for n in music['notes'] if n['voice']==1),music['notes'][0]))
            for i,p in enumerate(selected):
                point=p['points'][len(p['points'])//2];target=round(76-24*point[1])
                pitch=min([v for v in range(48,85) if v%12 in scale],key=lambda v:abs(v-target))
                n=deepcopy(template);n.update(id='coverage'+str(i),source=p['id'],source_point=point,start=round(.25+i*(music['duration']-2)/max(1,len(selected)),5),duration=.85,pitch=pitch,velocity=72,voice=1)
                n['calculation']={'method':'local contrast path accompaniment','normalized_y':point[1],'scale_pitch':pitch}
                music['notes'].append(n)
            music['notes'].sort(key=lambda n:n['start'])
            if extra['curator_style']=='piano':
                for n in music['notes']:n['velocity']=min(110,round(n.get('velocity',75)*1.23))
                music['mix_gains']=[.82,.38,.25,.2,.16]
            else:music['mix_gains']=[.68,.3,.19,.16,.13]
            music['museum_expression']['recovered_paths']=len(paths)
            music['museum_expression']['accompaniment_notes']=len(selected)
            for v in range(5):renderer.render_wav([n for n in music['notes'] if n['voice']==v],folder/f'portrait-{v}.wav',sf_path=sf,total_seconds=music['duration']+1,rate=22050,pool=pool,normalize=False)
            mix_portrait(folder,music);write_json(folder/'portrait.json',music);studio.export_midi(music['notes'],folder/'portrait.mid',music['tempo'],music['spatial_pan'])
            write_json(folder/'portrait-mapping.json',compact_mapping(music,geo,'portrait'))
            extra['track'].update(audio=url+'portrait-mix.wav',midi=url+'portrait.mid',mapping=url+'portrait-mapping.json',notes=len(music['notes']))
            extra['mappings']['portrait']=url+'portrait-mapping.json';extra['geometry']=url+'geometry.json';extra['refinement']='local-coverage-v1'
            lab=ROOT/'batch_results/museum-lab'/album['id']/'studio/sample5.json';payload=read_json(lab)
            units,meta=grammar.classify_units(geo['paths'],geo['width'],geo['height'])
            payload.update(contours=geo['paths'],units=studio.compact_units(units),unit_meta=meta,progressive=music)
            payload['progressive_presets']['portrait']=music;payload['stem_urls']['progressive-portrait']=[url+f'portrait-{v}.wav' for v in range(5)]
            write_json(lab,payload)
            print(album['id'],len(paths),'recovered paths;',len(selected),'new audible notes',flush=True)
    finally:pool.close()
    write_json(OUT/'museum-extensions.tmp',manifest);(OUT/'museum-extensions.tmp').replace(OUT/'museum-extensions.json')

from pathlib import Path
if __name__=='__main__':main()
