import json,threading,unittest,io
from types import SimpleNamespace
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.error import HTTPError
import server

class DiscoveryProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),server.make_handler(SimpleNamespace()))
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.http.server_port}'
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close();cls.thread.join()
    def test_lan_search_and_job_polling_stay_on_web_origin(self):
        for suffix in ['/search?q=forest','/jobs/abc123','/health']:
            response=io.BytesIO(b'{"ok":true}');response.status=200
            with patch('server.urlopen',return_value=response) as upstream:
                req=Request(self.base+'/api/discover'+suffix,headers={'Host':'10.19.73.127:8781'})
                with urlopen(req) as r:self.assertTrue(json.load(r)['ok'])
                self.assertEqual(upstream.call_args.args[0].full_url,'http://127.0.0.1:8784'+suffix)
    def test_generation_accepts_matching_lan_origin_but_blocks_cross_site(self):
        response=io.BytesIO(b'{"status":"queued"}');response.status=202
        with patch('server.urlopen',return_value=response) as upstream:
            req=Request(self.base+'/api/discover/albums',data=b'{"ids":["a"]}',headers={'Host':'10.20.206.92:8781','Origin':'http://10.20.206.92:8781','Content-Type':'application/json'})
            with urlopen(req) as r:self.assertEqual(r.status,202)
            self.assertEqual(upstream.call_args.args[0].get_header('Origin'),'http://127.0.0.1:8781')
        with self.assertRaises(HTTPError) as caught:
            urlopen(Request(self.base+'/api/discover/albums',data=b'{}',headers={'Origin':'https://other.example'}))
        self.assertEqual(caught.exception.code,403)
    def test_unlisted_upstream_path_is_rejected(self):
        with self.assertRaises(HTTPError) as caught:urlopen(self.base+'/api/discover/private')
        self.assertEqual(caught.exception.code,404)

if __name__=='__main__':unittest.main()
