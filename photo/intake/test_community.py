"""Community tests use synthetic completed jobs; no AI calls or music generation."""
import copy, io, json, sys, tempfile, threading, time, unittest, wave
from pathlib import Path
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError
from http.cookiejar import CookieJar
from http.server import ThreadingHTTPServer
from PIL import Image
from community import Community
# The HTTP tests never execute image extraction. Allow running without optional OpenCV.
try: import cv2
except ImportError: sys.modules['cv2'] = SimpleNamespace()
from server import make_handler

class Fixture:
    def __init__(self, root):
        self.runtime=Path(root); self.jobs={}; self.lock=threading.Lock()
        self.community=Community(self.runtime)
        self.share=SimpleNamespace(sessions={'alice':time.time()+3600,'bob':time.time()+3600})
    def snapshot(self,jid): return copy.deepcopy(self.jobs[jid])
    def add(self, number, owner='alice', completed=True):
        jid=f'{number:032x}'; folder=self.runtime/jid
        (folder/'workspace'/'studio').mkdir(parents=True)
        Image.new('RGB',(60,80),'#718c6b').save(folder/'original.png')
        with wave.open(str(folder/'workspace'/'studio'/'sample5-progressive-mix.wav'),'wb') as f:
            f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000);f.writeframes(b'\0\0'*8000)
        self.jobs[jid]=dict(id=jid,guest_owner=owner,created_at=time.time(),updated_at=time.time(),status='completed' if completed else 'processing',music_status='completed' if completed else 'processing',original=f'/media/{jid}/original.png',workspace=f'/works/{jid}/studio.html',stage='作品准备完成',provider='local')
        return jid

class CommunityTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.p=Fixture(self.tmp.name);self.c=self.p.community;self.jid=self.p.add(1)
    def publish(self,jid=None,category='music-flow'):
        return self.c.publish(self.p,jid or self.jid,'guest:alice',dict(title='我的旋律',category=category))
    def listing(self,category='music-flow',sort='newest',actor='guest:alice',limit=12,offset=0):
        return self.c.listing(self.p,actor,category,sort,limit,offset)
    def test_opt_in_and_field_allowlist(self):
        self.assertEqual(self.listing()['total'],0);self.publish();item=self.listing()['items'][0]
        self.assertEqual(set(item),{'id','title','category','published_at','likes','liked_by_me','thumbnail_url','preview_url'})
    def test_owner_completion_and_assets(self):
        with self.assertRaises(PermissionError):self.c.publish(self.p,self.jid,'guest:bob',dict(title='x',category='music-flow'))
        pending=self.p.add(2,completed=False)
        with self.assertRaises(ValueError):self.publish(pending)
        (self.p.runtime/self.jid/'workspace/studio/sample5-progressive-mix.wav').unlink()
        with self.assertRaises(ValueError):self.publish()
    def test_idempotent_likes_cancel_and_restart(self):
        self.publish()
        for _ in range(3):self.c.like(self.p,self.jid,'guest:alice',True)
        self.assertEqual(self.listing()['items'][0]['likes'],1)
        self.c=Community(self.p.runtime)
        self.assertTrue(self.listing()['items'][0]['liked_by_me'])
        for _ in range(3):self.c.like(self.p,self.jid,'guest:alice',False)
        self.assertEqual(self.listing()['items'][0]['likes'],0)
    def test_concurrent_likes(self):
        self.publish()
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _:self.c.like(self.p,self.jid,'guest:alice',True),range(24)))
        self.assertEqual(self.listing()['items'][0]['likes'],1)
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda i:self.c.like(self.p,self.jid,'viewer:'+str(i),True),range(12)))
        self.assertEqual(self.listing()['items'][0]['likes'],13)
    def test_sort_category_and_pagination(self):
        self.publish();second=self.p.add(2);self.publish(second);third=self.p.add(3);self.publish(third,'masterpiece')
        self.c.like(self.p,self.jid,'guest:alice',True)
        self.assertEqual(self.listing()['items'][0]['id'],second)
        self.assertEqual(self.listing(sort='likes')['items'][0]['id'],self.jid)
        self.assertEqual(self.listing(category='masterpiece')['total'],1)
        self.assertTrue(self.listing(limit=1)['has_more']);self.assertEqual(len(self.listing(limit=1,offset=1)['items']),1)
    def test_withdraw_hides_assets_and_preserves_job(self):
        before=self.p.snapshot(self.jid);self.publish()
        self.c.publish(self.p,self.jid,'guest:alice',{'published':False})
        self.assertFalse(self.c.visible(self.p,self.jid));self.assertEqual(self.listing()['total'],0)
        with self.assertRaises(ValueError):self.c.like(self.p,self.jid,'guest:bob',True)
        self.assertEqual(before,self.p.snapshot(self.jid))
    def test_input_validation(self):
        for body in ({'title':'','category':'music-flow'},{'title':'x','category':'bad'},{'published':'false'}):
            with self.assertRaises(ValueError):self.c.publish(self.p,self.jid,'guest:alice',body)
        with self.assertRaises(ValueError):self.c.publish(self.p,'../','host:test',{'published':False})
    def test_http_permissions_range_and_persistence(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.p,guest=True))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        base=f'http://127.0.0.1:{server.server_port}'
        def call(path,method='GET',body=None,owner='alice',headers=None):
            h={'Cookie':'sonify_guest='+owner,**(headers or {})}
            data=json.dumps(body).encode() if body is not None else None
            return urlopen(Request(base+path,data=data,method=method,headers=h))
        with self.assertRaises(HTTPError) as e:call('/api/community',owner='unknown')
        self.assertEqual(e.exception.code,403)
        route='/api/community/'+self.jid
        with self.assertRaises(HTTPError):call(route+'/thumbnail')
        with self.assertRaises(HTTPError) as e:call(route+'/publish','POST',dict(title='x',category='music-flow'),owner='bob')
        self.assertEqual(e.exception.code,403)
        with call(route+'/publish','POST',dict(title='作品',category='music-flow')) as r:self.assertEqual(r.status,200)
        with call('/api/community',owner='bob') as r:self.assertEqual(len(json.load(r)['items']),1)
        with call(route+'/thumbnail',owner='bob') as r:self.assertEqual(r.headers['Content-Type'],'image/jpeg')
        with call(route+'/preview',owner='bob',headers={'Range':'bytes=0-43'}) as r:
            self.assertEqual(r.status,206);self.assertEqual(len(r.read()),44)
        with self.assertRaises(HTTPError) as e:call(route+'/preview',headers={'Range':'bytes=999999-'})
        self.assertEqual(e.exception.code,416)
        with self.assertRaises(HTTPError):call('/media/'+self.jid+'/original.png',owner='bob')
        with self.assertRaises(HTTPError):call('/works/'+self.jid+'/studio/sample5-progressive-mix.wav',owner='bob')
        with self.assertRaises(HTTPError):call(route+'/like','PUT',{'liked':True},headers={'Origin':'http://elsewhere'})
        with call(route+'/like','PUT',{'liked':True},owner='bob') as r:self.assertEqual(json.load(r)['likes'],1)
        with call('/api/host') as r:self.assertTrue(json.load(r)['jobs'][0]['community']['published'])
        with call('/community') as r:self.assertIn(b'community-modules',r.read())
        with call(route+'/publish','POST',{'published':False}):pass
        with self.assertRaises(HTTPError):call(route+'/preview',owner='bob')
    def test_host_cookie_identity(self):
        self.publish();self.p.share=None
        server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.p))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        base=f'http://127.0.0.1:{server.server_port}';client=build_opener(HTTPCookieProcessor(CookieJar()))
        with client.open(base+'/api/community') as r:self.assertIn('sonify_community',r.headers['Set-Cookie'])
        req=Request(base+'/api/community/'+self.jid+'/like',data=b'{"liked":true}',method='PUT')
        with client.open(req) as r:self.assertEqual(json.load(r)['likes'],1)
        with client.open(base+'/api/community') as r:self.assertTrue(json.load(r)['items'][0]['liked_by_me'])

if __name__=='__main__':unittest.main()
