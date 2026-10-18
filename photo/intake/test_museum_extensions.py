"""Validate real source tracing, differentiated defaults and per-photo workspaces."""
from pathlib import Path
import hashlib
import json
import unittest
import wave
import numpy as np

ROOT=Path(__file__).resolve().parent
WEB=ROOT/'web'
def read(path):return json.loads(Path(path).read_text(encoding='utf-8'))

class MuseumExtensionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.albums=read(WEB/'museum/albums-v2.json')['albums']
        cls.extras=read(WEB/'museum/museum-extensions.json')['works']

    def test_each_note_has_the_actual_photo_source_and_saved_timing(self):
        for album in self.albums:
            extra=self.extras[album['id']]
            self.assertEqual(extra['image_sha256'],hashlib.sha256((WEB/album['image'].lstrip('/')).read_bytes()).hexdigest())
            geometry=read(WEB/extra.get('geometry',album['evidence']['geometry']).lstrip('/'));paths={p['id']:p['points'] for p in geometry['paths']}
            tracks=[extra['track']]+album['tracks']
            for track in tracks:
                key=track['mode']+('-'+track['style'] if track.get('style') else '')
                mapping=read(WEB/extra['mappings'][key].lstrip('/'))
                for path in mapping['paths']:self.assertEqual(path['points'],paths[path['id']])
                self.assertTrue(all(n['source'] in paths and n['start']>=0 and n['duration']>0 for n in mapping['notes']))
                if key=='blueprint':continue
                audio=WEB/track['audio'].lstrip('/');music=read(audio.with_name('portrait.json' if key=='portrait' else key+'.json'))
                self.assertEqual([(n['id'],n['start'],n['duration'],n['pitch']) for n in mapping['notes']],[(n['id'],n['start'],n['duration'],n['pitch']) for n in music['notes']])

    def test_portraits_have_distinct_musical_schedules_and_valid_audio(self):
        digests=set();schedules=set()
        for album in self.albums:
            extra=self.extras[album['id']];track=extra['track'];audio=WEB/track['audio'].lstrip('/')
            with wave.open(str(audio)) as wav:
                duration=wav.getnframes()/wav.getframerate();signal=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)/32768
            self.assertAlmostEqual(duration,track['duration'],places=3)
            self.assertGreater(float(np.sqrt(np.mean(signal**2))),.001)
            self.assertLess(float(np.max(np.abs(signal))),.99)
            digests.add(hashlib.sha256(audio.read_bytes()).hexdigest())
            music=read(audio.with_name('portrait.json'))
            schedules.add(hashlib.sha256(json.dumps([(n['start'],n['duration'],n['pitch'],n['program']) for n in music['notes']]).encode()).hexdigest())
        self.assertEqual(len(digests),len(self.albums));self.assertEqual(len(schedules),len(self.albums))
        for ids in [('axis','library','crescent','tower'),('longroom','clementinum','courtyard','viktor'),('luang','allos','sninsky','woodland')]:
            self.assertGreaterEqual(len({self.extras[i]['curator_style'] for i in ids}),3)
        campus=[self.extras[i]['expression']['tempo'] for i in ('axis','library','crescent','tower')]
        self.assertGreaterEqual(max(campus)-min(campus),25)

    def test_laboratory_contains_same_picture_and_same_portrait_notes(self):
        for album in self.albums:
            extra=self.extras[album['id']];folder=ROOT/'batch_results/museum-lab'/album['id']
            payload=read(folder/'studio/sample5.json')
            self.assertEqual(payload['museum_id'],album['id'])
            self.assertEqual(payload['source_hash'],album['evidence']['image_sha256'])
            self.assertEqual(payload['original_photo']['url'],album['image'])
            portrait=read((WEB/extra['track']['audio'].lstrip('/')).with_name('portrait.json'))
            self.assertEqual(payload['progressive_presets']['portrait']['notes'],portrait['notes'])
            for urls in payload['stem_urls'].values():
                self.assertTrue(all((WEB/url.lstrip('/')).is_file() for url in urls))
            self.assertTrue((folder/'studio.html').is_file())

    def test_campus_structure_and_music_cover_multiple_spatial_regions(self):
        for album in self.albums:
            if not album['id'].startswith('campus-'):continue
            extra=self.extras[album['id']]
            geometry=read(WEB/extra['geometry'].lstrip('/'))
            self.assertGreater(len(geometry['paths']),album['evidence']['paths'])
            self.assertTrue(any(p.get('evidence_kind')=='tone_boundary' for p in geometry['paths']))
            mapping=read(WEB/extra['mappings']['portrait'].lstrip('/'))
            self.assertGreaterEqual(len({n['source'] for n in mapping['notes']}),150)
            regions={(min(7,int(n['source_point'][0]*8)),min(7,int(n['source_point'][1]*8))) for n in mapping['notes'] if n['id'].startswith('spatial-')}
            self.assertGreaterEqual(len(regions),12)
            self.assertTrue(all(0<=v<=1 for p in geometry['paths'] for xy in p['points'] for v in xy))

if __name__=='__main__':unittest.main()
