"""Regression checks for the studio's actual geometry/audio contract (v0.5)."""
import json
import unittest
import wave
from pathlib import Path

import numpy as np

import studio_grammar as sg

ROOT = Path(__file__).parent / 'dist'
SAMPLES = range(6)


def _units(idx):
    bp = json.loads((ROOT / f'sample{idx}-blueprint.json').read_text(encoding='utf-8'))
    return sg.classify_units(bp['paths'], bp['source_width'], bp['source_height'])[0]


class StudioContract(unittest.TestCase):
    def test_coverage_and_schedule(self):
        for i in SAMPLES:
            units = _units(i)
            self.assertGreater(len(units), 500, f'sample{i} coverage too low')
            by = {u['id']: u for u in units}
            built = json.loads((ROOT / 'studio' / f'sample{i}.json').read_text(encoding='utf-8'))
            for mode in ['soul', 'progressive']:
                m = sg.compose_units(units, mode)
                if mode=='progressive':
                    from progressive_arrangement import arrange
                    m=arrange(built['soul'],units=units,color_dna=built.get('color_dna'))
                emitted = built[mode]['notes']
                self.assertEqual([n['id'] for n in emitted], [n['id'] for n in m['notes']])
                self.assertTrue(all(n.get('calculation') == source['calculation']
                                    for n, source in zip(emitted, m['notes'])))
                if mode=='soul':self.assertEqual(m, sg.compose_units(units, mode))  # deterministic
                self.assertLessEqual(sg._overlap_peak(m['notes']), sg.MAX_CONCURRENT)
                self.assertEqual(len({n['id'] for n in m['notes']}), len(m['notes']))
                for n in m['notes']:
                    if mode=='soul':self.assertIn(n['pitch'], sg.PENTA)
                    else:
                        self.assertIn((n['pitch']-m.get('key_pc',0))%12, (0,2,4,5,7,9,11))
                        self.assertTrue(36<=n['pitch']<=88)
                    self.assertIn(n['source'], by)
                    self.assertLessEqual(n['start'] + n['duration'], m['duration'] + 1e-6)
                    q = n['source_point']
                    p = by[n['source']]
                    def distance(a, b):
                        dx, dy = b[0] - a[0], b[1] - a[1]
                        den = dx * dx + dy * dy
                        t = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / den)) if den else 0
                        return ((q[0] - a[0] - t * dx) ** 2 + (q[1] - a[1] - t * dy) ** 2) ** .5
                    self.assertLess(min(distance(a, b) for a, b in zip(p['points'], p['points'][1:])), 1e-5)
                for v in range(5):
                    with wave.open(str(ROOT / 'studio' / f'sample{i}-{mode}-{v}.wav')) as w:
                        self.assertEqual(w.getframerate(), 22050)
                        self.assertGreaterEqual(w.getnframes() / w.getframerate(), m['duration'])
                        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(float) / 32768
                        self.assertLessEqual(float(np.max(np.abs(pcm))), .701)

    def test_types_become_distinct_tracks(self):
        # Every kept unit maps to exactly one of the five tracks, and all
        # five tracks are exercised across the six samples.
        voices = set()
        for i in SAMPLES:
            for u in _units(i):
                voices.add(sg._voice_for(u))
        self.assertEqual(voices, {0, 1, 2, 3, 4})

    def test_lead_contour_uses_multiple_points(self):
        units = _units(5)
        soul = sg.compose_units(units, 'soul')
        # A principal contour can contain both curved and diagonal segments.
        lead = [n for n in soul['notes'] if n['voice'] == 0]
        self.assertGreater(len({n['pitch'] for n in lead}), 2)
        self.assertGreater(len({tuple(n['source_point']) for n in lead}), 4)

    def test_progressive_layers(self):
        units = _units(5)
        m = sg.compose_units(units, 'progressive')
        for phase in m['phases']:
            ns = [n for n in m['notes'] if phase['start'] <= n['start'] < phase['end']]
            self.assertTrue(ns)
            allowed = {sg.ROLE_TO_VOICE[r] for r in phase['roles']}
            self.assertTrue(all(n['voice'] in allowed for n in ns))

    def test_soul_phrase_provenance_and_reprise(self):
        units = _units(5)
        m = sg.compose_units(units, 'soul')
        self.assertGreater(m['duration'], 60)
        groups = {g['id']: g for g in m['groups']}
        phrases = {p['id']: p for p in m['phrases']}
        self.assertEqual({u['id'] for u in units}, {s for g in groups.values() for s in g['sources']})
        for n in m['notes']:
            p = phrases[n['phrase']]
            self.assertIn(n['source'], groups[n['group']]['sources'])
            self.assertEqual(p['group'], n['group'])
            self.assertGreaterEqual(n['start'], p['start'] - 1e-6)
            self.assertLessEqual(n['start'] + n['duration'], p['end'] + 1e-6)
            self.assertEqual(n['pitch'], sg.PENTA[n['calculation']['final_index']])
        original = [p['motif'] for p in m['phrases'] if p['section']=='A' and p['voice']==0]
        reprise = [p['motif'] for p in m['phrases'] if p['section']=='A′' and p['voice']==0]
        self.assertEqual(original, reprise)
        self.assertIn('逆行', {p['transform'] for p in m['phrases']})
        self.assertIn('展开', {p['transform'] for p in m['phrases']})

    def test_soul_retriggers_do_not_cut_off_later_notes(self):
        for i in SAMPLES:
            m = sg.compose_units(_units(i), 'soul')
            previous = {}
            for n in m['notes']:
                key = (n['voice'], n['pitch'])
                if key in previous:
                    self.assertLessEqual(previous[key]['start'] + previous[key]['duration'], n['start'])
                previous[key] = n

    def test_blueprint_counts_match_render_budget(self):
        import compose_blueprint as bp_music
        import render_soundfont as soundfont
        bp = json.loads((ROOT / 'sample5-blueprint.json').read_text(encoding='utf-8'))
        built = json.loads((ROOT / 'studio' / 'sample5.json').read_text(encoding='utf-8'))
        candidates = bp_music.compose_blueprint(bp, 'H_mixed', total_seconds=13.0)
        kept = [n for v in range(5)
                for n in soundfont._thin_voice(
                    [n for n in candidates if n['voice'] == v], 40)]
        self.assertEqual(built['blueprint']['candidate_notes'], len(candidates))
        self.assertEqual(built['blueprint']['notes'], len(kept))
        ids = {n['id'] for n in kept}
        self.assertTrue(all(n['audible'] == (n['id'] in ids) for n in built['art']))
        self.assertTrue((ROOT / 'studio' / 'sample5-blueprint.mid').exists())

    def test_competition_cut_keeps_provenance_and_final_cadence(self):
        from soul_composition import make_demo_cut
        for i in SAMPLES:
            full=sg.compose_units(_units(i),'soul')
            demo=make_demo_cut(full)
            built=json.loads((ROOT/'studio'/f'sample{i}.json').read_text(encoding='utf-8'))['soul_demo']
            self.assertEqual(demo,built)
            self.assertTrue(40<=demo['duration']<=55)
            self.assertEqual(demo['bars'],18)
            by={n['id']:n for n in full['notes']}
            for n in demo['notes']:
                self.assertEqual(n['source'],by[n['id']]['source'])
                self.assertEqual(n['pitch'],by[n['id']]['pitch'])
                self.assertEqual(n['source_time'],by[n['id']]['start'])
                self.assertLessEqual(n['start']+n['duration'],demo['duration']+1e-6)
            melody=[n for n in demo['notes'] if n['voice']==0]
            self.assertEqual(melody[-1]['pitch']%12,0)
            self.assertEqual([p['id'] for p in demo['phases']],['A','B','C','A′'])
            self.assertLessEqual(sg._overlap_peak(demo['notes']),sg.MAX_CONCURRENT)
            for v in range(5):
                with wave.open(str(ROOT/'studio'/f'sample{i}-soul-demo-{v}.wav')) as w:
                    self.assertGreaterEqual(w.getnframes()/w.getframerate(),demo['duration'])

    def test_bass_motion_and_unique_harmony(self):
        from soul_composition import _voice_lead
        tones=_voice_lead(sg.PENTA,{0,4,7},48,59,[52,52],2)
        self.assertEqual(len(set(tones)),2)
        for i in SAMPLES:
            m=sg.compose_units(_units(i),'soul')
            bass=[n for n in m['notes'] if n['voice']==2]
            self.assertGreaterEqual(len({n['pitch'] for n in bass}),4)
            def count(section):return sum(n['section']==section for n in m['notes'])
            self.assertGreater(count('C'),count('A'))

    def test_trace_does_not_jump_to_a_crossing_structure(self):
        from soul_composition import _stitch_curve
        def unit(id,points,length):
            return dict(id=id,points=points,length=length,type='curve',layer='subject')
        trace=_stitch_curve([
            unit('start',[[0,.1],[.1,.1]],20),
            unit('crossing',[[.105,.1],[.105,.2]],18),
            unit('continuation',[[.11,.1],[.21,.1]],16)])
        ids={v['id'] for v in trace}
        self.assertIn('continuation',ids)
        self.assertNotIn('crossing',ids)


if __name__ == '__main__':
    unittest.main()
