"""Cross-work provenance and transport checks for the curated collection."""
from pathlib import Path
import unittest,json,hashlib,wave,urllib.request
ROOT=Path(__file__).resolve().parent
WEB=ROOT/'web'
def read(path):return json.loads(path.read_text(encoding='utf8'))
def local(url):
    p=(WEB/url.lstrip('/')).resolve()
    if not p.is_relative_to(WEB.resolve()):raise ValueError(url)
    return p
class LibraryTests(unittest.TestCase):
    def test_three_distinct_works_and_audio(self):
        catalog=read(WEB/'museum/scroll/catalog.json');self.assertEqual([w['id'] for w in catalog['works']],['qingming','qianli','fuchun'])
        audio_hashes=set();fingerprints=set()
        for work in catalog['works']:
            m=read(local(work['manifest']));g=read(local(m['geometry']));paths={p['id']:p for p in g['paths']};samples={s['id']:s for s in g.get('samples',[])}
            self.assertLess(local(m['image']).stat().st_size,3_000_000)
            for v in m['variants']:
                music=read(local(v['score']));evidence=read(local(v['evidence']))
                self.assertGreater(len(music['notes']),250)
                self.assertNotIn(music['fingerprint'],fingerprints);fingerprints.add(music['fingerprint'])
                sha=hashlib.sha256(local(v['audio']).read_bytes()).hexdigest();self.assertNotIn(sha,audio_hashes);audio_hashes.add(sha)
                self.assertEqual(sha,evidence['audio_sha256']);self.assertFalse(music['shared_photo_arrangement'])
                with wave.open(str(local(v['audio']))) as f:self.assertAlmostEqual(f.getnframes()/f.getframerate(),48)
                shift=music.get('work_profile',{}).get('transpose',0)
                penta=[p for p in range(43,87) if p%12 in (2,4,6,9,11)]
                for n in music['notes']:
                    self.assertIn(n['source'],paths)
                    self.assertAlmostEqual(n['start'],1.2+(1-n['source_point'][0])*45,places=5)
                    self.assertEqual(n['pitch'],penta[n['calculation']['scale_index']]+shift)
                    self.assertEqual(n['sample']['target_midi'],n['pitch']);self.assertIn(n['sample']['license'],('CC0','CC0-1.0'))
                    for s in n.get('contributing_sources',[]):
                        self.assertIn(s['source'],paths);actual=samples[s['source_sample']]
                        self.assertEqual(actual['point'],s['source_point']);self.assertEqual(actual['path'],s['source']);self.assertEqual(s['pitch'],n['pitch'])
        self.assertEqual(len(audio_hashes),6)
    def test_public_routes_and_audio_ranges(self):
        for work in read(WEB/'museum/scroll/catalog.json')['works']:
            m=read(local(work['manifest']))
            with urllib.request.urlopen('http://127.0.0.1:8781'+work['href']) as r:self.assertEqual(r.status,200)
            for url in (m['image'],m['geometry'],m['variants'][0]['score']):
                with urllib.request.urlopen('http://127.0.0.1:8781'+url) as r:self.assertEqual(r.status,200)
            req=urllib.request.Request('http://127.0.0.1:8781'+m['variants'][0]['audio'],headers={'Range':'bytes=0-99'})
            with urllib.request.urlopen(req) as r:self.assertEqual(r.status,206);self.assertEqual(len(r.read()),100)
if __name__=='__main__':unittest.main()
