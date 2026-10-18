"""Lab-only expressive portraits and traceable exports; never writes Scroll or Photo."""
from pathlib import Path
from copy import deepcopy
import hashlib
import json
import wave
import shutil
from build_museum import ROOT, OUT, Image, np, renderer, studio, composer, blueprint
import studio_grammar as grammar

CURATION={'axis':'chamber','library':'piano','crescent':'nature','tower':'strings',
          'longroom':'chamber','clementinum':'strings','courtyard':'piano','viktor':'piano',
          'luang':'nature','allos':'strings','sninsky':'piano','woodland':'nature',
          'campus-sunset':'strings','campus-maple':'nature','campus-promenade':'piano',
          'campus-bluehour':'chamber','campus-stars':'strings','campus-dining':'piano'}
STYLE_NAMES={'nature':'东方自然','chamber':'室内交响','piano':'独奏钢琴','strings':'弦乐叙事'}

def read_json(path): return json.loads(Path(path).read_text(encoding='utf-8'))
def write_json(path,data): Path(path).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
def local(url): return ROOT/'web'/url.lstrip('/')

def express(source):
    """Preserve every source ID while exposing image differences in musical phrasing."""
    music=deepcopy(source);f=source['features'];color=f['color']['lab']
    light=color['L_mean']/100;density=f['density'];vertical=f['verticality']
    bpm=round(max(72,min(138,66+66*light+24*density+15*vertical)))
    shift=round(max(-4,min(4,(vertical-.4)*5+(f['repeat']-.65)*8)))
    gamma=round(.84+.36*max(0,min(1,f['curve']/.4)),4)
    old=source['duration'];duration=round(old*120/bpm,4)
    def warp(t):return duration*max(0,min(1,t/old))**gamma
    notes=[]
    for original in source['notes']:
        # Sparse pictures leave more room for their principal contour melody.
        if density<.3 and original['voice']==4:continue
        n=deepcopy(original);start=warp(n['start']);end=warp(n['start']+n['duration'])
        n.update(start=round(start,6),duration=round(max(.065,end-start),6),pitch=max(24,min(104,n['pitch']+shift)))
        n.setdefault('calculation',{})['museum_expression']=dict(tempo=bpm,transpose=shift,time_curve=gamma,original_start=original['start'],original_duration=original['duration'],original_pitch=original['pitch'])
        notes.append(n)
    music.update(notes=notes,duration=duration,tempo=bpm,key_pc=(source.get('key_pc',0)+shift)%12,version='museum-portrait-1',scale_pcs=[(p+shift)%12 for p in source.get('scale_pcs',[])])
    for key in ['phases','emotions']:
        for part in music.get(key,[]):
            part['start']=warp(part['start']);part['end']=warp(part['end'])
    for note in music.get('theme',[]):note['pitch']+=shift
    music['mix_gains']=[.68,.19,.19,.16,.13]
    music['museum_expression']=dict(tempo=bpm,transpose=shift,time_curve=gamma,brightness=light,density=density,verticality=vertical,method='continuous image-feature expression; curator-selected instrumentation',note='配器由策展选择；速度、整体移调与句法时间变化来自图像特征。原有旋律来源路径保留。')
    return music

def mix_portrait(folder,music):
    mixed=None
    for v,(gain,pan) in enumerate(zip(music['mix_gains'],music['spatial_pan'])):
        with wave.open(str(folder/f'portrait-{v}.wav')) as wav:
            rate=wav.getframerate();signal=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').reshape(-1,wav.getnchannels()).astype(np.float32)/32768
        signal=signal[:round(music['duration']*rate)]
        fade=min(round(.7*rate),len(signal));signal[-fade:]*=np.linspace(1,0,fade)[:,None]
        mono=signal.mean(axis=1)
        if mixed is None:mixed=np.zeros((len(mono),2),np.float32)
        angle=(pan+1)*np.pi/4;mixed[:,0]+=mono*gain*np.cos(angle);mixed[:,1]+=mono*gain*np.sin(angle)
    music['mix_master_gain']=float(min(48,.72/max(.001,np.max(np.abs(mixed)))))
    mixed*=music['mix_master_gain']
    with wave.open(str(folder/'portrait-mix.wav'),'wb') as wav:
        wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes((np.clip(mixed,-.98,.98)*32767).astype('<i2').tobytes())

def compact_mapping(music,geometry,kind):
    ids={n['source'] for n in music['notes']}
    return dict(schema_version='sonify.museum.mapping.v1',mode=kind,width=geometry['width'],height=geometry['height'],
                paths=[p for p in geometry['paths'] if p['id'] in ids],
                notes=[{k:n[k] for k in ['id','source','source_point','start','duration','voice','pitch'] if k in n} for n in music['notes']],
                description='当前音符的来源轮廓，不是物体语义分割，也不表示整栋建筑同时发声。')

def export_lab(a,geometry,music_by_prefix,portrait,extra_dir,ui_dir):
    """Use isolated copies of the real Photo UI and exactly the same saved music."""
    folder=ROOT/'batch_results'/'museum-lab'/a['id'];(folder/'studio').mkdir(parents=True,exist_ok=True)
    bp=blueprint.build(np.array(Image.open(local(a['evidence']['structure'])).convert('L')))
    # The stored PNG is a skeleton, so the unchanged Blueprint engine can be reused.
    units,meta=grammar.classify_units(geometry['paths'],geometry['width'],geometry['height'])
    notes=composer.compose_blueprint(bp,studio.BLUEPRINT_VARIANT,total_seconds=13)
    audible=[n for v in range(5) for n in renderer._thin_voice([n for n in notes if n['voice']==v],40)]
    symbols={s['id']:s for s in bp['symbols']}
    for note in audible:
        symbol=symbols[note['id']];note['source_point']=[symbol['x'],symbol['y']]
    write_json(extra_dir/'blueprint-mapping.json',compact_mapping(dict(notes=audible),geometry,'blueprint'))
    ids={n['id'] for n in audible};by_id={n['id']:n for n in notes};art=studio.art_symbols(bp)
    for symbol in art:
        note=by_id[symbol['id']];symbol.update(raw_pitch=symbol['pitch'],pitch=note['pitch'],duration=note['duration'],audible=symbol['id'] in ids)
    instruments=composer._instrument_names(studio.BLUEPRINT_VARIANT);programs=composer._programs(studio.BLUEPRINT_VARIANT)
    bp_track=next(t for t in a['tracks'] if t['mode']=='blueprint')
    payload=dict(id='sample5',name=a['title'],width=geometry['width'],height=geometry['height'],art=art,contours=geometry['paths'],units=studio.compact_units(units),unit_meta=meta,voice_catalog=grammar.VOICE_CATALOG,exclusions=[],source_hash=a['evidence']['image_sha256'],museum_id=a['id'],color_dna=a['evidence']['color_dna'])
    payload['blueprint']=dict(audio=bp_track['audio'],duration=13,variant=studio.BLUEPRINT_VARIANT,notes=len(audible),candidate_notes=len(notes),symbols=len(bp['symbols']),drawn=len(art),voices=[dict(voice=v,label=studio.BP_BAND_LABELS[v],instrument=instruments[v],program=programs[v],color=studio.BP_BAND_COLORS[v],notes=sum(n['voice']==v for n in audible)) for v in range(5)])
    payload['soul']=music_by_prefix['soul'];payload['progressive_presets']={preset:music_by_prefix['progressive-'+preset] for preset in STYLE_NAMES};payload['progressive_presets']['portrait']=portrait;payload['progressive']=portrait
    asset_url='/museum/'+str(extra_dir.relative_to(OUT)).replace('\\','/')+'/'
    payload['stem_urls']={'progressive-portrait':[asset_url+f'portrait-{v}.wav' for v in range(5)]}
    for prefix,music in music_by_prefix.items():
        track=next(t for t in a['tracks'] if (t['mode']=='soul' and prefix=='soul') or (t['mode']=='progressive' and prefix=='progressive-'+t['style']))
        audio_dir=track['audio'].rsplit('/',1)[0]
        payload['stem_urls'][prefix]=[audio_dir+'/'+prefix+f'-{v}.wav' for v in range(5)]
    payload['original_photo']=dict(url=a['image'],relationship='museum_original',alignment='normalized_source',reveal_start=max(0,portrait['duration']-3),reveal_end=portrait['duration']-1)
    write_json(folder/'studio/sample5.json',payload);write_json(folder/'studio/manifest.json',[dict(id='sample5',name=a['title'])])
    Image.open(local(a['evidence']['structure'])).convert('RGB').save(folder/'sample5.jpg')
    html=(ui_dir/'studio.html').read_text(encoding='utf-8')
    for file in ui_dir.iterdir():
        if file.suffix in ('.css','.js'):html=html.replace('"'+file.name, '"../shared/'+file.name)
    html=html.replace('href="lab-v3.html"','href="/musiclab"').replace('实验记录 ↗','返回声音画册 ↗').replace('<option value="nature">','<option value="portrait">本页音乐肖像</option><option value="nature">')
    (folder/'studio.html').write_text(html,encoding='utf-8')
    return '/batches/museum-lab/'+a['id']+'/studio.html'

def main():
    albums=read_json(OUT/'albums-v2.json')['albums'];ui_dir=ROOT.parent/'experiment/ui';shared=ROOT/'batch_results/museum-lab/shared';shared.mkdir(parents=True,exist_ok=True)
    for file in ui_dir.iterdir():
        if file.suffix in ('.css','.js'):shutil.copyfile(file,shared/file.name)
    js=(shared/'studio.js').read_text(encoding='utf-8')
    js=js.replace("mode = 'blueprint'", "mode = (new URLSearchParams(location.search).get('mode')==='soul'?'soul':'progressive')",1).replace("let progressivePreset='nature'", "let progressivePreset='portrait'",1)
    js=js.replace("mode = (new URLSearchParams(location.search).get('mode')==='soul'?'soul':'progressive')", "mode = (['blueprint','soul','progressive'].includes(new URLSearchParams(location.search).get('mode'))?new URLSearchParams(location.search).get('mode'):'progressive')",1)
    js=js.replace("let progressivePreset='portrait'", "let progressivePreset=new URLSearchParams(location.search).get('preset')||'portrait'",1)
    js=js.replace("let soulEdition='demo'", "let soulEdition='full'",1).replace("$('#soul-edition').hidden=mode!=='soul';", "$('#soul-edition').hidden=mode!=='soul';document.querySelector('[data-edition=\"demo\"]').hidden=!data.soul_demo;",1)
    js=js.replace("configure();\n    sampleLoading=false", "configure();document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.mode===mode)));offset=Math.max(0,Math.min(duration(),Number(new URLSearchParams(location.search).get('time'))||0));draw();\n    sampleLoading=false",1)
    js=js.replace("return [0, 1, 2, 3, 4].map(v =>", "if(data.stem_urls?.[m])return data.stem_urls[m];\n  return [0, 1, 2, 3, 4].map(v =>",1)
    js += "\nwindow.addEventListener('pagehide',()=>halt(true));\n"
    js += "\nnew MutationObserver(()=>{document.querySelectorAll('a[href=\"color-evidence.html\"]').forEach(a=>a.hidden=true);}).observe(document.body,{childList:true,subtree:true});\n"
    (shared/'studio.js').write_text(js,encoding='utf-8')
    reveal=(shared/'progressive_revelation.js').read_text(encoding='utf-8')
    reveal=reveal.replace("data.color_dna?'色彩信息不足，保持几何编曲'", "data.color_dna?'已使用原照片色彩；本工作区未生成色彩强度对照版本'")
    (shared/'progressive_revelation.js').write_text(reveal,encoding='utf-8')
    mapping_ui=ROOT/'museum_ui/museum-mapping.js'
    if mapping_ui.exists():shutil.copyfile(mapping_ui,shared/'museum-mapping.js')
    sf=renderer.find_soundfont();pool=renderer._SoundFontPool.get(sf,rate=22050,gain=1.2);extensions={}
    try:
        for a in albums:
            for name in ['blueprint.py','compose_blueprint.py','render_soundfont.py','studio_grammar.py','build_studio.py']:
                current=hashlib.sha256((ROOT.parent/'experiment'/name).read_bytes()).hexdigest()
                if current!=a['evidence']['engine_sha256'][name]:
                    raise RuntimeError('Re-export requires the album engine version: '+name)
            geometry=read_json(local(a['evidence']['geometry']));music_by_prefix={};mappings={}
            signature=hashlib.sha256((a['evidence']['version']+Path(__file__).read_text(encoding='utf-8')).encode()).hexdigest()[:12]
            extra_dir=OUT/a['id']/('portrait-'+signature);extra_dir.mkdir(exist_ok=True);url='/museum/'+a['id']+'/'+extra_dir.name+'/'
            for track in a['tracks']:
                if track['mode']=='blueprint':continue
                prefix=track['mode']+('-'+track['style'] if track.get('style') else '')
                music=read_json(local(track['audio']).with_name(prefix+'.json'));music_by_prefix[prefix]=music
                write_json(extra_dir/(prefix+'-mapping.json'),compact_mapping(music,geometry,track['mode']));mappings[prefix]=url+prefix+'-mapping.json'
            portrait=express(music_by_prefix['progressive-'+CURATION[a['id']]])
            if not (extra_dir/'portrait-mix.wav').exists():
                for v in range(5):renderer.render_wav([n for n in portrait['notes'] if n['voice']==v],extra_dir/f'portrait-{v}.wav',sf_path=sf,total_seconds=portrait['duration']+1,rate=22050,pool=pool,normalize=False)
                mix_portrait(extra_dir,portrait);write_json(extra_dir/'portrait.json',portrait);studio.export_midi(portrait['notes'],extra_dir/'portrait.mid',portrait['tempo'],portrait['spatial_pan'])
            else:portrait=read_json(extra_dir/'portrait.json')
            write_json(extra_dir/'portrait-mapping.json',compact_mapping(portrait,geometry,'portrait'));mappings['portrait']=url+'portrait-mapping.json'
            lab_url=export_lab(a,geometry,music_by_prefix,portrait,extra_dir,ui_dir)
            mappings['blueprint']=url+'blueprint-mapping.json'
            track=dict(mode='portrait',style=None,label='本页肖像 · '+STYLE_NAMES[CURATION[a['id']]],audio=url+'portrait-mix.wav',midi=url+'portrait.mid',duration=portrait['duration'],notes=len(portrait['notes']),color_used=True,mapping=mappings['portrait'])
            extensions[a['id']]=dict(track=track,mappings=mappings,lab_url=lab_url,expression=portrait['museum_expression'],curator_style=CURATION[a['id']],image_sha256=a['evidence']['image_sha256'])
            print(a['id'],portrait['tempo'],'BPM',CURATION[a['id']],lab_url,flush=True)
    finally:pool.close()
    temp=OUT/'museum-extensions.tmp';write_json(temp,dict(schema_version='sonify.museum.extensions.v1',works=extensions));temp.replace(OUT/'museum-extensions.json')
    print('Published 12 portraits, mappings and isolated Photo workspaces',flush=True)

if __name__=='__main__':main()
