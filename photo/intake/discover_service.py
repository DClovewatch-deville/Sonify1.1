"""Loopback-only open-art discovery and queued music album generation."""
from pathlib import Path
import json,hashlib,uuid,time,threading,io,re,html,sys,shutil
from urllib.request import Request,urlopen
from urllib.parse import urlencode,urlsplit,parse_qs
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from concurrent.futures import ThreadPoolExecutor
from build_museum import ROOT,OUT,Image,np,renderer,studio
from build_museum_extensions import read_json,write_json,local,express,compact_mapping,mix_portrait,export_lab,STYLE_NAMES
from build_museum_v2 import render_album,hashes,mix
from upgrade_campus_geometry import extract_layers,score,overview
from progressive_arrangement import arrange
import studio_grammar as grammar

STATE=OUT/'discover';STATE.mkdir(parents=True,exist_ok=True)
CATALOG=OUT/'discover-albums.json'
if not CATALOG.exists():write_json(CATALOG,dict(works=[],albums=[]))
LOCK=threading.Lock();QUEUE=ThreadPoolExecutor(max_workers=1);JOBS={};RESULTS={};CACHE={}
ALLOWED_LICENSES={'CC0','Public domain','CC BY 4.0','CC BY-SA 4.0','CC BY 3.0','CC BY-SA 3.0','CC BY 2.0','CC BY-SA 2.0','CC BY 2.5','CC BY-SA 2.5'}

def plain(value):return html.unescape(re.sub('<[^>]*>','',str(value))).strip()[:1200]
def download(url,limit=16*1024*1024):
    if urlsplit(url).scheme!='https' or urlsplit(url).hostname not in {'commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'}:raise ValueError('来源图片地址未通过检查。')
    with urlopen(Request(url,headers={'User-Agent':'SonifyHackathon/1.0 (open art discovery; educational prototype)'}),timeout=25) as r:
        if urlsplit(r.url).hostname not in {'commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'}:raise ValueError('图片跳转到了未支持的来源。')
        raw=r.read(limit+1)
    if len(raw)>limit:raise ValueError('图片文件过大，请选另一件作品。')
    return raw

def commons(params):
    return json.loads(download('https://commons.wikimedia.org/w/api.php?'+urlencode(dict(action='query',format='json',**params)),4*1024*1024))

def normalize(page):
    info=(page.get('imageinfo') or [{}])[0];meta=info.get('extmetadata',{})
    value=lambda k:plain(meta.get(k,{}).get('value',''))
    license=value('LicenseShortName')
    if license not in ALLOWED_LICENSES or info.get('mime') not in ('image/jpeg','image/png'):return None
    title=page['title'];key=hashlib.sha256(title.encode()).hexdigest()[:20]
    item=dict(id=key,file_title=title,title=title.removeprefix('File:').rsplit('.',1)[0],author=value('Artist') or '来源未注明作者',description=value('ImageDescription'),license=license,license_url=value('LicenseUrl') or info.get('descriptionurl'),source=info.get('descriptionurl'),thumbnail=info.get('thumburl',info.get('url')),image=info.get('thumburl',info.get('url')),width=info.get('width'),height=info.get('height'),provider='Wikimedia Commons')
    RESULTS[key]=item;return item

def search(query,offset=0):
    query=query.strip()[:160]
    if not query:query='landscape photography'
    translations={'森林':'forest landscape','山川':'mountain landscape','建筑':'architecture photography','东方山水':'Chinese landscape painting','摄影':'photography','花卉':'flowers','海洋':'seascape','星空':'night sky','上海':'Shanghai','图书馆':'library interior','上科大':'ShanghaiTech University','梵高':'Vincent van Gogh','莫奈':'Claude Monet'}
    resolved=translations.get(query,query);key=(resolved,offset)
    if key in CACHE and time.time()-CACHE[key][0]<600:return CACHE[key][1]
    data=commons(dict(generator='search',gsrsearch=resolved+' filetype:bitmap',gsrnamespace=6,gsrlimit=18,gsroffset=offset,prop='imageinfo',iiprop='url|extmetadata|mime|size',iiurlwidth=720))
    items=[normalize(p) for p in sorted(data.get('query',{}).get('pages',{}).values(),key=lambda p:p.get('index',0))];items=[i for i in items if i]
    result=dict(items=items,next=data.get('continue',{}).get('gsroffset'),query=query,provider='Wikimedia Commons')
    CACHE[key]=(time.time(),result);return result

def verified_item(item):
    data=commons(dict(titles=item['file_title'],prop='imageinfo',iiprop='url|extmetadata|mime|size',iiurlwidth=1600))
    result=normalize(next(iter(data.get('query',{}).get('pages',{}).values())))
    if not result:raise ValueError('这件作品的图片格式或许可暂不支持导入。')
    return result

def build_work(item,style,update):
    slug='online-'+item['id'];checkpoint=STATE/(slug+'.json')
    if checkpoint.exists():return read_json(checkpoint)
    item=verified_item(item);folder=OUT/slug;folder.mkdir(exist_ok=True)
    update('正在获取所选原图')
    raw=download(item['image']);im=Image.open(io.BytesIO(raw));
    if im.width*im.height>24000000:raise ValueError('图片像素过大，请选另一件作品。')
    im=im.convert('RGB');im.thumbnail((1600,1600));im.save(folder/'photo.jpg',quality=94)
    source=dict(page=item['source'],image=item['image'],author=item['author'],attribution=item['author'],license=item['license'],license_url=item['license_url'],changes='按需获取来源提供的预览，保留完整构图，缩放用于声音画册。',checked_at=time.strftime('%Y-%m-%d'))
    album=dict(id=slug,object_id=slug,title=item['title'],category='在线发现',tags=['开放作品',item['provider']],place='开放作品 · 来源未确认具体拍摄地点',location_basis='保留来源说明，不根据搜索词猜测地点',story=item['description'][:180] or '一次新的发现，留在这本声音画册里。',source=source,image='/museum/'+slug+'/photo.jpg')
    sf=renderer.find_soundfont();pool=renderer._SoundFontPool.get(sf,rate=22050,gain=1.2)
    try:
        update('正在分析图像结构与色彩')
        album=render_album(album,sf,pool,hashes());geo=extract_layers(album,read_json(local(album['evidence']['geometry'])))
        units,_=grammar.classify_units(geo['paths'],geo['width'],geo['height']);soul=grammar.compose_units(units,'soul')
        assets=folder/'discovered-v1';assets.mkdir(exist_ok=True);url='/museum/'+slug+'/discovered-v1/'
        write_json(assets/'geometry.json',geo);overview(geo,assets/'structure.png')
        music_by_prefix={};newtracks=[t for t in album['tracks'] if t['mode']=='blueprint'];mapping_urls={}
        for name in ['soul']+list(STYLE_NAMES):
            update('正在生成'+('灵魂交响' if name=='soul' else STYLE_NAMES[name]))
            music=soul if name=='soul' else score(express(arrange(soul,name,units=units,color_dna=album['evidence']['color_dna'],color_strength='auto')),geo)[0]
            prefix='soul' if name=='soul' else 'progressive-'+name
            for v in range(5):renderer.render_wav([n for n in music['notes'] if n['voice']==v],assets/f'{prefix}-{v}.wav',sf_path=sf,total_seconds=music['duration']+1,rate=22050,pool=pool,normalize=name=='soul')
            mix(assets,prefix,music,name!='soul');write_json(assets/(prefix+'.json'),music);studio.export_midi(music['notes'],assets/(prefix+'.mid'),music.get('tempo',120),music['spatial_pan'])
            mapping=compact_mapping(music,geo,'soul' if name=='soul' else 'progressive');mapping['context_paths']=geo['paths'];write_json(assets/(prefix+'-mapping.json'),mapping);mapping_urls[prefix]=url+prefix+'-mapping.json';music_by_prefix[prefix]=music
            newtracks.append(dict(mode='soul' if name=='soul' else 'progressive',style=None if name=='soul' else name,label='灵魂交响' if name=='soul' else STYLE_NAMES[name],audio=url+prefix+'-mix.wav',midi=url+prefix+'.mid',duration=music['duration'],notes=len(music['notes']),color_used=name!='soul',mapping=mapping_urls[prefix]))
        album['tracks']=newtracks
        portrait=deepcopy(music_by_prefix['progressive-'+style])
        for v in range(5):shutil.copyfile(assets/f'progressive-{style}-{v}.wav',assets/f'portrait-{v}.wav')
        mix_portrait(assets,portrait);write_json(assets/'portrait.json',portrait);studio.export_midi(portrait['notes'],assets/'portrait.mid',portrait['tempo'],portrait['spatial_pan'])
        mapping=compact_mapping(portrait,geo,'portrait');mapping['context_paths']=geo['paths'];write_json(assets/'portrait-mapping.json',mapping)
        lab=export_lab(album,geo,music_by_prefix,portrait,assets,ROOT.parent/'experiment/ui')
        bp=next(t for t in newtracks if t['mode']=='blueprint');bp['mapping']=url+'blueprint-mapping.json'
        album['tracks'].insert(0,dict(mode='portrait',style=None,label='本页肖像 · '+STYLE_NAMES[style],audio=url+'portrait-mix.wav',midi=url+'portrait.mid',duration=portrait['duration'],notes=len(portrait['notes']),color_used=True,mapping=url+'portrait-mapping.json'))
        album['lab_url']=lab;album['museum_expression']=portrait['museum_expression'];album['evidence']['enhanced_geometry']=url+'geometry.json'
        write_json(checkpoint,album);return album
    finally:
        pool.close();renderer._SoundFontPool._instance=None

from copy import deepcopy
def generate(jid,items,title,style):
    job=JOBS[jid]
    try:
        job.update(status='processing');works=[]
        for i,item in enumerate(items):
            def update(stage):job.update(stage=stage,current=i+1,total=len(items),updated=time.time())
            update('正在准备作品');works.append(build_work(item,style,update));job['completed']=i+1
        bid='album-'+uuid.uuid4().hex[:12]
        book=dict(id=bid,title=title or '我的声音画册',coverTitle=title or '我的声音\n画册',en='DISCOVERED BY YOU',label='YOUR LISTENING ALBUM',color='#4d6252',cover=works[0]['id'],ids=[w['id'] for w in works],note='从世界发现，留给此刻。',intro='每一件作品，都有自己的声音。',style=style,preferredStyle=style)
        with LOCK:
            catalog=read_json(CATALOG);byid={w['id']:w for w in catalog['works']};byid.update({w['id']:w for w in works});catalog['works']=list(byid.values());catalog['albums'].append(book)
            temp=CATALOG.with_suffix('.tmp');write_json(temp,catalog);temp.replace(CATALOG)
        job.update(status='completed',stage='画册已准备好',album=book,works=works)
    except Exception as e:
        job.update(status='failed',stage='这次生成未完成',error=str(e) if isinstance(e,ValueError) else '图片来源或生成暂时不可用，请重试或换一幅作品。')
        (STATE/(jid+'-error.txt')).write_text(repr(e),encoding='utf-8')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def cors(self):
        origin=self.headers.get('Origin','')
        if origin in {'http://127.0.0.1:8783','http://localhost:8783','http://127.0.0.1:8781','http://localhost:8781'}:self.send_header('Access-Control-Allow-Origin',origin)
        self.send_header('Vary','Origin');self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS')
    def send(self,value,status=200):
        raw=json.dumps(value,ensure_ascii=False).encode();self.send_response(status);self.cors();self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
    def do_OPTIONS(self):self.send({})
    def do_GET(self):
        path=urlsplit(self.path);q=parse_qs(path.query)
        try:
            if path.path=='/health':return self.send(dict(ok=True,provider='Wikimedia Commons'))
            if path.path=='/search':return self.send(search(q.get('q',[''])[0],min(180,max(0,int(q.get('offset',['0'])[0])))))
            if path.path.startswith('/jobs/'):return self.send(JOBS.get(path.path.split('/')[-1],dict(status='missing')),200)
            self.send(dict(error='未找到入口'),404)
        except Exception:self.send(dict(error='在线来源暂时连接不上，请重试，或先聆听现有画册。'),502)
    def do_POST(self):
        if self.headers.get('Origin','') not in {'http://127.0.0.1:8783','http://localhost:8783','http://127.0.0.1:8781','http://localhost:8781'}:return self.send(dict(error='不支持该来源。'),403)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>12000:raise ValueError('请求大小无效。')
            body=json.loads(self.rfile.read(size));ids=body.get('ids',[]);style=body.get('style','nature')
            if self.path!='/albums' or not 1<=len(ids)<=4 or len(set(ids))!=len(ids) or any(i not in RESULTS for i in ids) or style not in STYLE_NAMES:raise ValueError('请重新搜索并选择1—4幅支持的作品。')
            if sum(j['status'] in ('queued','processing') for j in JOBS.values())>=3:raise ValueError('当前生成队列已满，请稍后再试。')
            jid=uuid.uuid4().hex;JOBS[jid]=dict(id=jid,status='queued',stage='已进入生成队列',total=len(ids),current=0,completed=0)
            QUEUE.submit(generate,jid,[deepcopy(RESULTS[i]) for i in ids],plain(body.get('title',''))[:24],style);self.send(JOBS[jid],202)
        except (ValueError,TypeError,json.JSONDecodeError) as e:self.send(dict(error=str(e)),400)

if __name__=='__main__':
    Image.MAX_IMAGE_PIXELS=24000000
    import os
    port=int(os.environ.get('SONIFY_DISCOVER_PORT','8784'))
    print(f'Sonify Discover listening on 127.0.0.1:{port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
