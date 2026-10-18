"""User-assigned geometry roles: local Soul recomposition, no cloud calls."""
from pathlib import Path
import json,sys,uuid,subprocess,time,re
ROOT=Path(__file__).resolve().parent

def atomic(path,value):
    temp=path.with_suffix('.pending');temp.write_text(json.dumps(value,ensure_ascii=False),encoding='utf8');temp.replace(path)

def validate(payload,assignments):
    valid={p['id'] for p in payload['contours']}
    if not isinstance(assignments,dict) or not 1<=len(assignments)<=10000:raise ValueError('请先点选或框选结构并指定角色。')
    if any(k not in valid or type(v) is not int or v not in range(5) for k,v in assignments.items()):raise ValueError('结构或角色无效，请刷新后重试。')
    return assignments

def validate_regions(assignments,regions):
    if regions is None:return []
    if not isinstance(regions,list) or len(regions)>24:raise ValueError('每次最多保留24个独立区域。')
    seen=set();region_ids=set();clean=[]
    for i,r in enumerate(regions):
        if not isinstance(r,dict):raise ValueError('区域无效。')
        rid=r.get('id');voice=r.get('voice');sources=r.get('sources')
        if not isinstance(rid,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',rid) or rid in region_ids:raise ValueError('区域编号无效。')
        if type(voice) is not int or voice not in range(5) or not isinstance(sources,list) or not sources:raise ValueError('区域角色无效。')
        if any(not isinstance(s,str) or s in seen or assignments.get(s)!=voice for s in sources) or len(set(sources))!=len(sources):raise ValueError('区域路径冲突，请重新选择。')
        seen.update(sources);region_ids.add(rid);clean.append(dict(id=rid,voice=voice,sources=sources))
    return clean

def launch(pipeline,jid,assignments,regions=None):
    folder=pipeline.runtime/jid
    payload=json.loads((folder/'workspace/studio/sample5.json').read_text(encoding='utf8'))
    assignments=validate(payload,assignments)
    regions=validate_regions(assignments,regions)
    with pipeline.lock:
        if any((f/'status.json').exists() and json.loads((f/'status.json').read_text(encoding='utf8')).get('status') in ('queued','processing') for f in (folder/'role-remixes').glob('*')):raise ValueError('当前作品正在重新编曲，请稍候。')
        token=uuid.uuid4().hex;task=folder/'role-remixes'/token;task.mkdir(parents=True)
        atomic(task/'request.json',dict(assignments=assignments,regions=regions));atomic(task/'status.json',dict(status='queued',token=token))
    def worker():
        try:
            with pipeline.music_lock:
                atomic(task/'status.json',dict(status='processing',token=token))
                result=subprocess.run([sys.executable,str(Path(__file__).resolve()),str(folder),token],capture_output=True,timeout=300,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                if result.returncode:raise RuntimeError('本地音乐渲染未完成，请重试。')
        except Exception as e:atomic(task/'status.json',dict(status='failed',token=token,error=str(e)))
    pipeline.pool.submit(worker)
    return dict(status='queued',token=token)

def status(pipeline,jid,token):
    if len(token)!=32 or any(c not in '0123456789abcdef' for c in token):raise ValueError('无效版本。')
    return json.loads((pipeline.runtime/jid/'role-remixes'/token/'status.json').read_text(encoding='utf8'))

def build(folder,token):
    experiment=ROOT.parent/'experiment';sys.path[:0]=[str(experiment/'vendor'),str(experiment)]
    import studio_grammar as grammar
    from soul_composition import compose,make_demo_cut
    import render_soundfont as renderer
    import build_studio as studio
    folder=Path(folder);assets=folder/'workspace/studio';task=folder/'role-remixes'/token
    payload=json.loads((assets/'sample5.json').read_text(encoding='utf8'))
    request=json.loads((task/'request.json').read_text(encoding='utf8'))
    assignments=validate(payload,request['assignments'])
    regions=validate_regions(assignments,request.get('regions'))
    by_source={s:(r['id'],i+1) for i,r in enumerate(regions) for s in r['sources']}
    units,_=grammar.classify_units(payload['contours'],payload['width'],payload['height'])
    for unit in units:
        if unit['id'] in assignments:unit['user_voice']=assignments[unit['id']]
        if unit['id'] in by_source:unit['user_region'],unit['user_region_number']=by_source[unit['id']]
    if not any('user_voice' in u for u in units):raise ValueError('选区内没有可编曲路径。')
    music=make_demo_cut(compose(units,grammar));music['version']='soul-user-1';music['region_method']='用户改派优先，未指定部分沿用系统推荐';music['role_assignments']=assignments
    prefix='soul-user-'+token;sf=renderer.find_soundfont()
    if not sf:raise RuntimeError('未找到本地乐器音源。')
    pool=renderer._SoundFontPool.get(sf,rate=22050,gain=1.2)
    try:
        for v in range(5):renderer.render_wav([n for n in music['notes'] if n['voice']==v],assets/f'sample5-{prefix}-{v}.wav',sf_path=sf,total_seconds=music['duration']+1,rate=22050,pool=pool)
    finally:pool.close()
    studio.ASSETS=assets;studio.export_spatial_mix('sample5-'+prefix,music);studio.export_midi(music['notes'],assets/f'sample5-{prefix}.mid',music['tempo'],music['spatial_pan'])
    atomic(task/'status.json',dict(status='completed',token=token,music=music,audio_prefix=prefix,assignments=assignments,regions=regions))

if __name__=='__main__':
    build(sys.argv[1],sys.argv[2])
