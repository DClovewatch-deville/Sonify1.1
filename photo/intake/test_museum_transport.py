"""Exercise browser WAV seeking through the real museum HTTP handler."""
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from types import SimpleNamespace
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import server


class MuseumTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        manifest = json.loads((server.ROOT/'web/museum/albums-v2.json').read_text(encoding='utf-8'))
        cls.path = manifest['albums'][0]['tracks'][2]['audio']
        cls.raw = (server.ROOT/'web'/cls.path.lstrip('/')).read_bytes()
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.make_handler(SimpleNamespace()))
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.http.server_port}'+cls.path

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()

    def test_full_audio(self):
        with urlopen(self.url) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers['Accept-Ranges'], 'bytes')
            self.assertEqual(response.read(), self.raw)

    def test_seek_ranges(self):
        for value, expected, start, end in [
            ('bytes=0-43', self.raw[:44], 0, 43),
            ('bytes=44000-45000', self.raw[44000:45001], 44000, 45000),
            ('bytes=-64', self.raw[-64:], len(self.raw)-64, len(self.raw)-1),
            (f'bytes={len(self.raw)-32}-', self.raw[-32:], len(self.raw)-32, len(self.raw)-1),
            (f'bytes={len(self.raw)-8}-{len(self.raw)+100}', self.raw[-8:], len(self.raw)-8, len(self.raw)-1),
        ]:
            with self.subTest(value=value), urlopen(Request(self.url, headers={'Range':value})) as response:
                self.assertEqual(response.status, 206)
                self.assertEqual(response.headers['Content-Range'], f'bytes {start}-{end}/{len(self.raw)}')
                self.assertEqual(response.read(), expected)

    def test_unsatisfiable_ranges(self):
        for value in ['bytes=999999999-','bytes=40-20','bytes=-0','bytes=0-1,4-5','items=0-10','bytes=abc-']:
            with self.subTest(value=value), self.assertRaises(HTTPError) as caught:
                urlopen(Request(self.url, headers={'Range':value}))
            self.assertEqual(caught.exception.code, 416)
            self.assertEqual(caught.exception.headers['Content-Range'], f'bytes */{len(self.raw)}')


if __name__ == '__main__':
    unittest.main()
