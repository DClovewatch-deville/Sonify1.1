"""Data-driven additions to the shared scroll player; never copies Photo audio."""
from pathlib import Path
import sys,json,hashlib,math
ROOT=Path(__file__).resolve().parent
sys.path[:0]=[str(ROOT.parent/'experiment/vendor'),str(ROOT.parent/'experiment')]
from engine_snapshot import EngineSnapshot
ENGINE=EngineSnapshot(ROOT.parent/'experiment').install()
import cv2
import numpy as np
from PIL import Image
import blueprint
import build_studio as studio
from scroll_score import compose
from render_scroll_samples import render
from build_scroll_display import build as display_contours
BASE=ROOT/'web/museum/scroll'
CONFIG=json.loads((ROOT/'scroll_works.json').read_text(encoding='utf8'))
def save(path,data):path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def music_profile(music,config,geometry):
    profile=config['music'];notes=[];last={}
    for n in music['notes']:
        gap=profile['soul_gap'] if music['mode']=='soul' else .07
        if n['start']-last.get(n['voice'],-100)<gap:continue
        last[n['voice']]=n['start']
        shift=profile['transpose'];n['pitch']+=shift
        for s in n.get('contributing_sources',[]):s['pitch']+=shift
        n['calculation']['transpose_semitones']=shift
        n['calculation']['scale']='G gong: G A B D E' if shift==5 else 'C gong: C D E G A'
        n['mix_gain']=n.get('mix_gain',1)*profile['gain']
        notes.append(n)
    music['notes']=notes;music['work_profile']=profile
    music['key_pc']=(music['key_pc']+profile['transpose'])%12
    music['scale_pcs']=[(p+profile['transpose'])%12 for p in music['scale_pcs']]
    music['fingerprint']=hashlib.sha256(json.dumps([(n['source_point'],n['pitch'],n['start'],n['duration']) for n in notes]).encode()).hexdigest()
    ids={s['source'] for n in notes for s in n.get('contributing_sources',[{'source':n['source']}])}|{n['source'] for n in notes}
    lengths={p['id']:sum(math.dist(a,b) for a,b in zip(p['points'],p['points'][1:])) for p in geometry['paths']}
    music['coverage'].update(audible_notes=len(notes),audible_paths=len(ids),audible_path_length_share=round(sum(lengths[k] for k in ids)/sum(lengths.values()),4),
        layers=[dict(voice=v,notes=sum(n['voice']==v for n in notes)) for v in range(5)],
        note_roles={role:sum(n['note_role']==role for n in notes) for role in ('geometry_anchor','dense_spatial_texture')})
    return music

def build_work(id,config):
    out=BASE/id;out.mkdir(exist_ok=True);url=f'/museum/scroll/{id}'
    source=ROOT/f'scroll-work/{id}-source.jpg'
    original=Image.open(source).convert('RGB');crop=original.crop(config['crop']);crop.thumbnail(tuple(config['max_size']))
    crop.save(out/'painting.jpg',quality=87,optimize=True)
    cover=crop.copy();cover.thumbnail((1600,400));cover.save(out/'cover.jpg',quality=83,optimize=True)
    gray=np.array(crop.convert('L'));local=cv2.createCLAHE(clipLimit=1.5,tileGridSize=(24,8)).apply(gray)
    edges=cv2.Canny(cv2.GaussianBlur(local,(3,3),0),40,95)
    n,labels,stats,_=cv2.connectedComponentsWithStats(edges)
    keep=np.zeros(n,np.uint8);keep[1:]=(stats[1:,cv2.CC_STAT_AREA]>=12)*255
    skeleton=cv2.ximgproc.thinning(keep[labels]);print(id,'tracing image geometry',crop.size,flush=True)
    bp=blueprint.build(skeleton,spacing=7);w,h=bp['source_width'],bp['source_height']
    paths=[p for p in bp['paths'] if sum(math.hypot((a[0]-b[0])*w,(a[1]-b[1])*h) for a,b in zip(p['points'],p['points'][1:]))>=12]
    ids={p['id'] for p in paths}
    samples=[dict(id=f'{id}-{s["id"]}',path=f'{id}-{s["path"]}',point=[s['x'],s['y']],angle=s['angle']) for s in bp['symbols'] if s['path'] in ids]
    for p in paths:p['id']=f'{id}-{p["id"]}'
    geometry=dict(width=w,height=h,paths=paths,samples=samples,spacing=7,extraction='Photo Blueprint dense arc samples of this work only')
    save(out/'geometry.json',geometry)
    display_contours(out/'painting.jpg',out/'major-contours.png')
    variants=[]
    for mode,label in [('soul','Soul Symphony · 山河叙事'),('blueprint','Blueprint · 逐线成声')]:
        music=music_profile(compose(geometry,mode),config,geometry);music['work_id']=id
        stats=render(music,out/f'{mode}.wav');studio.export_midi(music['notes'],out/f'{mode}.mid',music['tempo'],music['spatial_pan'])
        save(out/f'{mode}.json',music)
        evidence=dict(work_id=id,input_sha256=sha(out/'painting.jpg'),geometry_sha256=sha(out/'geometry.json'),
            score_sha256=sha(out/f'{mode}.json'),audio_sha256=sha(out/f'{mode}.wav'),score_fingerprint=music['fingerprint'],
            source_original_sha256=sha(source),crop=config['crop'],original_size=list(original.size),display_size=list(crop.size),
            notes=len(music['notes']),source_paths=music['coverage']['audible_paths'],shared_photo_arrangement=False,
            profile=config['music'],peak=stats['peak'],rms=stats['rms'],sample_sources=stats['sample_sources'])
        save(out/f'{mode}-evidence.json',evidence)
        variants.append(dict(id=mode,label=label,audio=f'{url}/{mode}.wav',score=f'{url}/{mode}.json',midi=f'{url}/{mode}.mid',evidence=f'{url}/{mode}-evidence.json',duration=48,coverage=music['coverage']))
        print(id,mode,len(music['notes']),music['coverage']['audible_paths'],'paths',flush=True)
    source_info=dict(page=config['page'],image=config['source_url'],license='Public Domain Mark 1.0 / PD-Art on Wikimedia Commons',license_url='https://creativecommons.org/publicdomain/mark/1.0/',changes=config['changes'])
    manifest=dict(id=id,title=config['title'],subtitle=config['subtitle'],artist=config['artist'],collection=config['collection'],description=config['description'],
        mood=config['mood'],poem=config['poem'],music_character=config['music']['character'],image=f'{url}/painting.jpg',cover=f'{url}/cover.jpg',contours=f'{url}/major-contours.png',
        geometry=f'{url}/geometry.json',width=w,height=h,duration=48,reading=dict(start=1.2,span=45),variants=variants,source=source_info,style=config['style'],chapters=config['chapters'])
    save(out/'manifest.json',manifest)
    return dict(id=id,title=config['title'],subtitle=config['subtitle'],artist=config['artist'],collection=config['collection'],description=config['description'],mood=config['mood'],image=f'{url}/cover.jpg',manifest=f'{url}/manifest.json',href=f'/scroll?work={id}')

def main():
    original=json.loads((BASE/'manifest.json').read_text(encoding='utf8'))
    entries=[dict(id='qingming',title='清明上河图',subtitle='虹桥精华篇',artist='北宋 · 张择端',collection=original['collection'],description='市井节奏、建筑与人物。',mood='市井节奏 · 建筑与人物',image='/museum/scroll/cover.jpg',manifest='/museum/scroll/manifest.json',href='/scroll?work=qingming')]
    for id,config in CONFIG.items():entries.append(build_work(id,config))
    save(BASE/'catalog.tmp',dict(title='千古名卷',subtitle='择一卷山河，听一段千年。',works=entries))
    (BASE/'catalog.tmp').replace(BASE/'catalog.json')
    print('Published three-work collection',flush=True)
if __name__=='__main__':main()
