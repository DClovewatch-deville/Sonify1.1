import unittest
from unittest.mock import patch
import discover_service as d

class DiscoverTests(unittest.TestCase):
    def test_import_requires_supported_source_and_reusable_license(self):
        page=dict(title='File:Forest.jpg',imageinfo=[dict(mime='image/jpeg',url='https://upload.wikimedia.org/a.jpg',descriptionurl='https://commons.wikimedia.org/wiki/File:Forest.jpg',extmetadata=dict(LicenseShortName=dict(value='CC BY-SA 4.0'),Artist=dict(value='<a>Artist</a>')))])
        item=d.normalize(page)
        self.assertEqual(item['author'],'Artist')
        page['imageinfo'][0]['extmetadata']['LicenseShortName']['value']='CC BY-NC 4.0'
        self.assertIsNone(d.normalize(page))
        for url in ['http://127.0.0.1/private','https://localhost/admin','https://upload.wikimedia.org.example.com/a.jpg']:
            with self.assertRaises(ValueError):d.download(url)

    def test_spatial_generator_keeps_provenance_and_frame(self):
        from build_museum_extensions import read_json,OUT,local
        extra=read_json(OUT/'museum-extensions.json')['works']['campus-sunset']
        geometry=read_json(local(extra['geometry']))
        music=read_json(local(extra['track']['audio']).with_name('portrait.json'))
        points={p['id']:p['points'] for p in geometry['paths']}
        added=[n for n in music['notes'] if n['id'].startswith('spatial-')]
        self.assertGreaterEqual(len(added),150)
        self.assertTrue(all(n['source_point'] in points[n['source']] for n in added))

    def test_generated_album_has_real_audio_and_full_source_geometry(self):
        import wave
        from build_museum_extensions import read_json,OUT,local
        catalog=read_json(OUT/'discover-albums.json')
        self.assertTrue(catalog['albums'])
        for work in catalog['works']:
            geo=read_json(local(work['evidence']['enhanced_geometry']))
            paths={p['id'] for p in geo['paths']}
            for track in work['tracks']:
                self.assertTrue(local(track['audio']).exists())
                with wave.open(str(local(track['audio']))) as wav:self.assertGreater(wav.getnframes()/wav.getframerate(),10)
                mapping=read_json(local(track['mapping']))
                self.assertTrue(all(n['source'] in paths for n in mapping['notes']))
            default=work['tracks'][0]
            mapping=read_json(local(default['mapping']))
            self.assertGreater(len({n['source'] for n in mapping['notes']}),100)

if __name__=='__main__':unittest.main()
