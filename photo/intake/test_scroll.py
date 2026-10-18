"""Exhibition provenance, playable audio and HTTP integration checks."""
import hashlib
import json
from pathlib import Path
import threading
from types import SimpleNamespace
import unittest
from urllib.request import urlopen, Request
from http.server import ThreadingHTTPServer
import wave
import math
import server
import numpy as np
from PIL import Image
from copy import deepcopy
from scroll_score import compose, interval_signature, PENTA

OUT = server.ROOT / 'web/museum/scroll'

class ScrollTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.make_handler(SimpleNamespace()))
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.http.server_port}'
        cls.manifest = json.loads((OUT/'manifest.json').read_text(encoding='utf8'))
        cls.evidence = json.loads((server.ROOT/'web'/cls.manifest['evidence'].lstrip('/')).read_text(encoding='utf8'))
        cls.geometry=json.loads((server.ROOT/'web'/cls.manifest['geometry'].lstrip('/')).read_text(encoding='utf8'))

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()

    def test_provenance_and_crop(self):
        for file, key in [(OUT/'hongqiao.jpg', 'input_sha256'), (server.ROOT/'web'/self.manifest['audio'].lstrip('/'), 'audio_sha256')]:
            self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), self.evidence[key])
        with Image.open(OUT/'hongqiao.jpg') as image:
            self.assertEqual(list(image.size), self.evidence['image_provenance']['display_size'])
            self.assertAlmostEqual(image.width/image.height, 8600/1800, places=3)
        self.assertLess((OUT/'hongqiao.jpg').stat().st_size, 3*1024*1024)

    def test_notes_trace_to_actual_geometry(self):
        geometry = self.geometry
        sources = {path['id']:path for path in geometry['paths']}
        samples={s['id']:s for s in geometry['samples']}
        for variant in self.manifest['variants']:
            music=json.loads((server.ROOT/'web'/variant['score'].lstrip('/')).read_text(encoding='utf8'))
            self.assertGreater(len({n['source'] for n in music['notes']}), 30)
            self.assertFalse(music['shared_photo_arrangement'])
            for note in music['notes']:
                if 'source_sample' in note:
                    self.assertEqual(note['source_point'],samples[note['source_sample']]['point'])
                    self.assertEqual(note['source'],samples[note['source_sample']]['path'])
                else:
                    self.assertEqual(note['source_point'],sources[note['source']]['points'][note['vertex_index']])
                self.assertAlmostEqual(note['start'],1.2+(1-note['source_point'][0])*45,places=5)
                degree=round((1-note['source_point'][1])*(8 if note['voice']==1 else 12))+(11 if note['voice']==1 else 2)
                self.assertEqual(note['calculation']['height_degree'],degree)
                index=max(0,min(len(PENTA)-1,degree+note['calculation']['tangent_step']))
                self.assertEqual(note['pitch'],PENTA[index])
                self.assertEqual(note['sample']['license'],'CC0-1.0')
                self.assertEqual(note['sample']['target_midi'],note['pitch'])
                for contributor in note.get('contributing_sources',[]):
                    sample=samples[contributor['source_sample']]
                    self.assertEqual(sample['point'],contributor['source_point'])
                    self.assertEqual(sample['path'],contributor['source'])
                    x,y=sample['point']
                    degree=round((1-y)*(8 if note['voice']==1 else 12))+(11 if note['voice']==1 else 2)
                    step=(1 if math.sin(sample['angle'])<-.37 else -1 if math.sin(sample['angle'])>.37 else 0) if music['mode']=='soul' else 0
                    self.assertEqual(PENTA[max(0,min(len(PENTA)-1,degree+step))],note['pitch'])
                    self.assertLessEqual(abs(contributor['raw_start']-note['start']),note['merge_window']+.00001)

    def test_dense_coverage_across_the_entire_crop(self):
        g=self.geometry
        self.assertGreaterEqual(g['width'],5000)
        self.assertGreaterEqual(g['height'],1000)
        self.assertGreater(len(g['samples']),100000)
        # Every horizontal eighth and every vertical band must carry actual
        # sampled geometry, rather than enriching only the bridge's centre.
        for band in range(8):
            self.assertGreater(sum(band/8<=s['point'][0]<(band+1)/8 for s in g['samples']),1000)
        for band in range(5):
            self.assertGreater(sum(band/5<=s['point'][1]<(band+1)/5 for s in g['samples']),1000)
        for variant in self.manifest['variants']:
            coverage=variant['coverage']
            self.assertGreater(coverage['audible_notes'],1000)
            self.assertGreater(coverage['audible_paths'],10000)
            self.assertTrue(all(layer['notes']>100 for layer in coverage['layers']))

    def test_geometry_changes_melody_intervals_and_rhythm(self):
        geometry=self.geometry
        original=compose(geometry)
        modified=deepcopy(geometry)
        for path in modified['paths']:
            path['points']=[[x,min(.99,max(.01,y*.55+.16+.12*np.sin(x*13)))] for x,y in path['points']]
        for sample in modified['samples']:
            x,y=sample['point'];sample['point']=[x,min(.99,max(.01,y*.55+.16+.12*np.sin(x*13)))]
        other=compose(modified)
        self.assertNotEqual(original['fingerprint'],other['fingerprint'])
        self.assertNotEqual(interval_signature(original),interval_signature(other))
        self.assertNotEqual([n['start'] for n in original['notes']],[n['start'] for n in other['notes']])

    def test_distinct_modes_and_audio_provenance(self):
        scores=[];hashes=[]
        for variant in self.manifest['variants']:
            evidence=json.loads((server.ROOT/'web'/variant['evidence'].lstrip('/')).read_text(encoding='utf8'))
            audio=server.ROOT/'web'/variant['audio'].lstrip('/')
            self.assertEqual(hashlib.sha256(audio.read_bytes()).hexdigest(),evidence['audio_sha256'])
            self.assertFalse(evidence['shared_photo_arrangement'])
            hashes.append(evidence['audio_sha256'])
            scores.append(json.loads((server.ROOT/'web'/variant['score'].lstrip('/')).read_text(encoding='utf8')))
        self.assertNotEqual(hashes[0],hashes[1])
        self.assertNotEqual(interval_signature(scores[0]),interval_signature(scores[1]))

    def test_audio_duration_signal_and_tail(self):
        with wave.open(str(server.ROOT/'web'/self.manifest['audio'].lstrip('/'))) as wav:
            self.assertEqual(wav.getnchannels(), 2)
            self.assertAlmostEqual(wav.getnframes()/wav.getframerate(), 48, places=2)
            data = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').reshape(-1, 2)/32768
        self.assertGreater(float(np.sqrt(np.mean(data**2))), .02)
        self.assertLess(float(np.max(np.abs(data))), .99)
        self.assertLess(float(np.sqrt(np.mean(data[-2205:]**2))), .01)

    def test_page_routes_and_seek_range(self):
        for path in ['/scroll','/musiclab','/capture','/museum/scroll/manifest.json']:
            with self.subTest(path=path), urlopen(self.url+path) as response:
                self.assertEqual(response.status, 200)
        raw = (server.ROOT/'web'/self.manifest['audio'].lstrip('/')).read_bytes()
        with urlopen(Request(self.url+self.manifest['audio'], headers={'Range':'bytes=44000-45000'})) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.read(), raw[44000:45001])

if __name__ == '__main__':
    unittest.main()
