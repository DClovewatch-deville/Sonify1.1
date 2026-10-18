"""Versioned museum assets, three Photo modes and four Progressive arrangements."""
from pathlib import Path
import hashlib
import json
import wave
import build_museum as base
from build_museum import np, Image, cv2, blueprint, composer, renderer, studio, analyze, photo, OUT, ROOT
import studio_grammar as grammar
from progressive_arrangement import arrange, PRESETS

ENGINE_NAMES = ['run.py','blueprint.py','compose_blueprint.py','render_soundfont.py','build_studio.py','studio_grammar.py','progressive_arrangement.py','progressive_features.py','color_dna.py']

def hashes():
    return {name:hashlib.sha256((ROOT.parent/'experiment'/name).read_bytes()).hexdigest() for name in ENGINE_NAMES}

def mix(folder, prefix, music, progressive):
    # Match Photo's existing stem gains and equal-power spatial mix; do not
    # import its build script, whose module initialization writes to dist.
    gains = music['mix_gains'] if progressive else [.38,.18,.25,.14,.12]
    mixed = None
    for voice, (gain, pan) in enumerate(zip(gains, music['spatial_pan'])):
        with wave.open(str(folder/f'{prefix}-{voice}.wav')) as f:
            rate = f.getframerate()
            signal = np.frombuffer(f.readframes(f.getnframes()), dtype='<i2').reshape(-1,f.getnchannels()).astype(np.float32)/32768
        if progressive:
            signal = signal[:round(music['duration']*rate)]
            fade = min(round(.7*rate),len(signal))
            signal[-fade:] *= np.linspace(1,0,fade)[:,None]
        mono = signal.mean(axis=1)
        if mixed is None: mixed = np.zeros((len(mono),2),np.float32)
        angle = (pan+1)*np.pi/4
        mixed[:,0] += mono*gain*np.cos(angle); mixed[:,1] += mono*gain*np.sin(angle)
    if progressive:
        mixed *= min(48,.72/max(.001,np.max(np.abs(mixed))))
    else:
        fade = min(round(.4*rate),len(mixed)); mixed[-fade:] *= np.linspace(1,0,fade)[:,None]
    with wave.open(str(folder/f'{prefix}-mix.wav'),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate)
        f.writeframes((np.clip(mixed,-.98,.98)*32767).astype('<i2').tobytes())

def render_album(album, sf, pool, engine_hashes):
    slug = album['id']; folder = OUT/slug; image_path = folder/'photo.jpg'
    image_hash = hashlib.sha256(image_path.read_bytes()).hexdigest()
    signature = hashlib.sha256(json.dumps(dict(image=image_hash,engine=engine_hashes,builder=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),soundfont=sf),sort_keys=True).encode()).hexdigest()[:16]
    assets = folder / signature; assets.mkdir(exist_ok=True)
    checkpoint = assets/'result.json'
    if checkpoint.exists():
        result = json.loads(checkpoint.read_text(encoding='utf-8'))
        return dict(album, **result)
    im = Image.open(image_path).convert('L'); im.thumbnail((840,840))
    edges = cv2.Canny(cv2.GaussianBlur(np.array(im),(5,5),0),60,150)
    structure = Image.fromarray(255-edges); structure.thumbnail((640,840))
    _, skeleton, _, _, _ = photo.extract(np.array(structure))
    Image.fromarray(skeleton).save(assets/'structure.png')
    bp = blueprint.build(skeleton)
    units, _ = grammar.classify_units(bp['paths'], bp['source_width'], bp['source_height'])
    color = analyze(image_path,'licensed exhibition photograph')
    soul = grammar.compose_units(units,'soul')
    if not soul['notes']: raise ValueError('No Soul material: '+slug)
    url = f'/museum/{slug}/{signature}/'
    tracks=[]
    notes = composer.compose_blueprint(bp, studio.BLUEPRINT_VARIANT,total_seconds=13)
    renderer.render_blueprint_soundfont(notes,assets/'blueprint.wav',sf_path=sf,total_seconds=13,rate=22050,gain=1.2,pool=pool)
    studio.export_midi(notes,assets/'blueprint.mid')
    tracks.append(dict(mode='blueprint',style=None,label='蓝图谱',audio=url+'blueprint.wav',midi=url+'blueprint.mid',duration=13,notes=len(notes),color_used=False))
    versions = [('soul',None,'灵魂交响',soul)]
    versions += [('progressive',preset,style['name'],arrange(soul,preset,units=units,color_dna=color,color_strength='auto')) for preset,style in PRESETS.items()]
    for mode,preset,label,music in versions:
        prefix = mode + ('-'+preset if preset else '')
        for voice in range(5):
            renderer.render_wav([n for n in music['notes'] if n['voice']==voice],assets/f'{prefix}-{voice}.wav',sf_path=sf,total_seconds=music['duration']+1,rate=22050,pool=pool,normalize=mode!='progressive')
        mix(assets,prefix,music,mode=='progressive')
        studio.export_midi(music['notes'],assets/f'{prefix}.mid',music.get('tempo',120),music.get('spatial_pan'))
        (assets/f'{prefix}.json').write_text(json.dumps(music,ensure_ascii=False),encoding='utf-8')
        with wave.open(str(assets/f'{prefix}-mix.wav')) as wav:
            duration=wav.getnframes()/wav.getframerate()
        tracks.append(dict(mode=mode,style=preset,label=label,audio=url+prefix+'-mix.wav',midi=url+prefix+'.mid',duration=round(duration,2),notes=len(music['notes']),color_used=mode=='progressive' and bool(color.get('available'))))
        print('Rendered:',slug,prefix,flush=True)
    evidence = dict(image_sha256=image_hash,engine_sha256=engine_hashes,paths=len(bp['paths']),notes=len(notes),color_dna=color,structure=url+'structure.png',geometry=url+'geometry.json',engine='MusicPhoto local extraction / Blueprint / Soul / Progressive',version=signature)
    (assets/'geometry.json').write_text(json.dumps(dict(width=bp['source_width'],height=bp['source_height'],paths=bp['paths'],units=studio.compact_units(units)),ensure_ascii=False),encoding='utf-8')
    result = dict(tracks=tracks,evidence=evidence)
    checkpoint.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return dict(album,**result)

def main():
    engine_hashes=hashes(); sf=renderer.find_soundfont()
    if not sf: raise RuntimeError('Photo SoundFont missing')
    # Keep the original campus collection, but lead discovery with curated work.
    old=json.loads((OUT/'albums.json').read_text(encoding='utf-8'))['albums']
    campus=[]
    for album in old:
        if album['id'] not in {'library','tower','crescent','axis'}:continue
        campus.append(dict(album,category='校园交响',tags=['校园','建筑','夜景' if album['id']=='tower' else '室外'],location_basis='来源文件标题及说明'))
    curated=json.loads((OUT/'curation.json').read_text(encoding='utf-8'))
    # The mountain panorama has no clearly visible lake: avoid a false caption.
    for a in curated:
        if a['id']=='allos':a.update(title='群山的呼吸',story='山脊层层展开，远方的轮廓给旋律留下呼吸。',tags=['山峦','开阔','层次'])
    albums=[];pool=renderer._SoundFontPool.get(sf,rate=22050,gain=1.2)
    try:
        for album in curated+campus:
            albums.append(render_album(album,sf,pool,engine_hashes))
            if hashes()!=engine_hashes:raise RuntimeError('Photo engine changed during build; existing exhibition retained')
            print('Complete:',album['id'],len(albums),'/',len(curated+campus),flush=True)
    finally:pool.close()
    manifest=dict(schema_version='sonify.museum.v2',title='Sound Museum',classification=dict(method='人工策展的主题与可见画面标签；地点单独依据来源记录',unknown_location='来源未注明拍摄地点'),albums=albums)
    temp=OUT/'albums-v2.tmp';temp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(OUT/'albums-v2.json')
    print('Published manifest:',len(albums),'albums',sum(len(a['tracks']) for a in albums),'tracks',flush=True)

if __name__=='__main__':main()
