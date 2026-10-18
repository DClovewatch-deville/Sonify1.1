"""Validate the upload workspace contract expected by the current studio UI."""
from pathlib import Path
import json
import wave

PRESETS = ('nature', 'chamber', 'piano', 'strings')

def check(folder):
    workspace = Path(folder) / 'workspace'
    assets = workspace / 'studio'
    manifest = json.loads((assets / 'manifest.json').read_text(encoding='utf-8'))
    assert len(manifest) == 1, 'Upload workspace must contain exactly one image'
    slug = manifest[0]['id']
    payload = json.loads((assets / (slug + '.json')).read_text(encoding='utf-8'))
    assert set(payload['progressive_presets']) == set(PRESETS), 'Missing Progressive styles'
    sources = {p['id'] for p in payload['contours']}
    checks = 0
    tracks = [('soul', payload['soul']), ('soul-demo', payload['soul_demo'])]
    strengths = ('off', 'soft', 'mid', 'auto', 'vivid') if (payload.get('color_dna') or {}).get('available') else ('auto',)
    for preset in PRESETS:
        assert set(payload['progressive_colors'][preset]) == set(strengths), 'Missing color expression assets'
        for strength in strengths:
            music = payload['progressive_colors'][preset][strength]
            assert music['duration'] == 36, 'Progressive duration differs from current UI'
            assert all(n['source'] in sources for n in music['notes']), 'Untraceable note source'
            tracks.append(('progressive' + ('' if preset == 'nature' else '-' + preset) + ('' if strength == 'auto' else '-color-' + strength), music))
    for prefix, music in tracks:
        for suffix in [str(v) for v in range(5)] + ['mix']:
            path = assets / f'{slug}-{prefix}-{suffix}.wav'
            with wave.open(str(path), 'rb') as audio:
                seconds = audio.getnframes() / audio.getframerate()
                assert abs(seconds - music['duration']) <= 1.1, f'Audio duration mismatch: {path.name}'
            checks += 1
        assert (assets / f'{slug}-{prefix}.mid').read_bytes().startswith(b'MThd')
        checks += 1
    assert (workspace / payload['original_photo']['url']).exists(), 'Missing original image'
    if payload.get('living_color'):
        assert len(payload['living_color']['states']) == 4, 'Missing seasonal state'
        assert (workspace / 'living_color.js').exists(), 'Missing living colour player'
        for state in payload['living_color']['states']:
            assert (workspace / state['image']).exists(), 'Missing seasonal colour image'
            for preset in PRESETS:
                music = state['music'][preset]
                assert music['preset'] == preset, 'Season overwrote selected music style'
                assert all(n['source'] in sources for n in music['notes']), 'Season lost geometry provenance'
                with wave.open(str(workspace / music['audio']), 'rb') as audio:
                    assert abs(audio.getnframes()/audio.getframerate()-36)<.01, 'Season audio duration mismatch'
                checks += 1
    for file in ('studio.html', 'studio.js', 'studio.css', 'soul_experience.js', 'soul_interaction.js', 'soul_hero.js', 'progressive_revelation.js'):
        assert (workspace / file).stat().st_size > 0
        checks += 1
    return dict(job=Path(folder).name, checks=checks, presets=list(PRESETS), audio_files=1+6*len(tracks))

if __name__ == '__main__':
    import sys
    for folder in sys.argv[1:]:
        print(json.dumps(check(folder), ensure_ascii=False))
