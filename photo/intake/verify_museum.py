"""Check exhibition provenance, audio identity, integrity and served assets."""
from pathlib import Path
import hashlib
import json
import urllib.request
import wave
import numpy as np

ROOT=Path(__file__).resolve().parent/'web'

def verify(base='http://127.0.0.1:8783'):
    data=json.loads((ROOT/'museum/albums-v2.json').read_text(encoding='utf-8'))
    seen=set();audio_hashes=set();checked=0
    for album in data['albums']:
        assert album['id'] not in seen;seen.add(album['id'])
        image=ROOT/album['image'].lstrip('/')
        assert hashlib.sha256(image.read_bytes()).hexdigest()==album['evidence']['image_sha256']
        assert album['source']['author'] and album['source']['license_url'].startswith('https://creativecommons.org/')
        assert album['source']['page'].startswith('https://commons.wikimedia.org/wiki/File:')
        assert album['category'] in ('建筑与空间','山水与自然','校园交响') and album['tags']
        assert {t['mode'] for t in album['tracks']}=={'blueprint','soul','progressive'}
        assert {t['style'] for t in album['tracks'] if t['mode']=='progressive'}=={'nature','chamber','piano','strings'}
        geometry=json.loads((ROOT/album['evidence']['geometry'].lstrip('/')).read_text(encoding='utf-8'))
        path_ids={p['id'] for p in geometry['paths']}
        urls=[album['image'],album['evidence']['structure'],album['evidence']['geometry']]
        for track in album['tracks']:
            path=ROOT/track['audio'].lstrip('/')
            raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
            assert digest not in audio_hashes, 'Duplicated audio: '+track['audio']
            audio_hashes.add(digest)
            with wave.open(str(path)) as wav:
                duration=wav.getnframes()/wav.getframerate()
                signal=np.frombuffer(wav.readframes(wav.getnframes()),dtype='<i2').astype(np.float32)/32768
            assert abs(duration-track['duration'])<.1
            assert np.max(np.abs(signal))>.01 and np.sqrt(np.mean(signal**2))>.0005
            assert np.max(np.abs(signal))<.999
            assert (ROOT/track['midi'].lstrip('/')).read_bytes().startswith(b'MThd')
            if track['mode']!='blueprint':
                music=json.loads(path.with_name(path.name.replace('-mix.wav','.json')).read_text(encoding='utf-8'))
                assert len(music['notes'])==track['notes']
                assert all(note['source'] in path_ids for note in music['notes']), 'Untraceable music source'
            if track['mode']=='progressive':
                assert track['color_used'] and music['preset']==track['style'] and music['color_dna']['available']
            urls.extend([track['audio'],track['midi']]);checked+=1
        for url in urls:
            with urllib.request.urlopen(base+url,timeout=20) as response:
                assert response.status==200
                assert len(response.read())==(ROOT/url.lstrip('/')).stat().st_size
        print('Verified:',album['id'],len(album['tracks']),'unique non-silent tracks',flush=True)
    print('PASS:',len(seen),'photos,',checked,'unique audio and MIDI pairs; HTTP and provenance verified')

if __name__=='__main__':verify()
