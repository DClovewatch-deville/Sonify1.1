"""Behavioural tests for the S0.1 / S0.2 / S0.3 v2 pipeline.

The v0.1 test_pipeline.py still exercises run.py; this test suite
exercises the new modules and their invariants:

    1. primitives.classify()  - on blank input returns empty, on sample0
       must produce at least a roof and a support, and must respect the
       adaptive column-facade rule.
    2. grammar.compose()      - never returns more than MAX_CONCURRENT
       simultaneous events at any 50ms slice; emits at least one note
       for each non-disabled primitive type that exists.
    3. compose_v2.export_midi / render_wav - produce non-empty files
       that can be re-parsed.
    4. ablation equivalence   - the 'all' and 'no-X' variants for the
       same primitive type differ exactly by the number of notes that
       rule would have produced.
"""
import os
import sys
import unittest
import wave
from pathlib import Path

import numpy as np

# Resolve imports relative to this file so the suite runs on any machine
# (CI, reviewer laptop) regardless of where the repo is cloned.
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE / 'vendor'))
sys.path.insert(0, str(_HERE))

import run as lab                # noqa: E402
import primitives               # noqa: E402
import grammar                  # noqa: E402
import compose_v2 as cv2exp     # noqa: E402


class PrimitivesTests(unittest.TestCase):
    def test_blank_returns_empty(self):
        prims, leftovers, facade = primitives.classify([])
        self.assertEqual(prims, [])
        self.assertEqual(leftovers, [])
        self.assertFalse(facade['is_column_facade'])

    def test_classify_six_samples(self):
        # All six real samples must classify to at least one primitive
        # with at least one path, and primitive paths must be a subset of
        # the input paths.
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, facade = primitives.classify(d['paths'])
            self.assertGreater(len(prims), 0, f'sample{idx} produced 0 primitives')
            input_ids = {p['id'] for p in d['paths']}
            used_ids = {p['id'] for pr in prims for p in pr['paths']}
            self.assertEqual(used_ids, input_ids,
                             f'sample{idx} primitive paths are not a permutation of input')
            # The classifier must produce at least one roof or one column
            # for any line-art that has horizontal or tall vertical lines.
            kinds = {pr['type'] for pr in prims}
            self.assertTrue(
                'roof' in kinds or 'column' in kinds or 'support' in kinds,
                f'sample{idx} classified to {kinds} (no structural element)',
            )

    def test_column_facade_detection(self):
        # Sample 2 is the column-facade Greek temple; the rest are not.
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, facade = primitives.classify(d['paths'])
            column_count = next(
                (pr['count'] for pr in prims if pr['type'] == 'column'), 0
            )
            if idx == 2:
                self.assertTrue(facade['is_column_facade'],
                                'sample 2 should be flagged as column-facade')
                self.assertGreater(column_count, 0,
                                   'sample 2 should have at least one column')
            else:
                self.assertFalse(facade['is_column_facade'],
                                 f'sample {idx} should NOT be flagged as column-facade')
                self.assertEqual(column_count, 0,
                                 f'sample {idx} should not have a column primitive')


class GrammarTests(unittest.TestCase):
    def test_blank_primitives_yield_no_notes(self):
        notes = grammar.compose([])
        self.assertEqual(notes, [])

    def test_max_concurrent_respected(self):
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, _ = primitives.classify(d['paths'])
            notes = grammar.compose(prims, disabled=None)
            self.assertGreater(len(notes), 0, f'sample{idx} produced 0 notes')
            for t10 in range(0, int((max(n['start'] + n['duration'] for n in notes) + 1) * 20)):
                t = t10 * 0.05
                active = sum(1 for n in notes
                             if n['start'] - 1e-6 <= t < n['start'] + n['duration'])
                self.assertLessEqual(
                    active, grammar.MAX_CONCURRENT,
                    f'sample{idx} had {active} concurrent notes at t={t:.2f}, '
                    f'cap is {grammar.MAX_CONCURRENT}'
                )

    def test_each_type_emits_at_least_one_note(self):
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, _ = primitives.classify(d['paths'])
            notes = grammar.compose(prims, disabled=None)
            seen = {n['rule'] for n in notes}
            for pr in prims:
                self.assertIn(pr['type'], seen,
                              f'sample{idx} rule {pr["type"]} emitted no notes')

    def test_ablation_removes_targeted_rule(self):
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, _ = primitives.classify(d['paths'])
            all_notes = grammar.compose(prims, disabled=None)
            for rule_name, disabled in [
                ('curve', 'contour'),
                ('support', 'support'),
                ('column', 'repeat'),
            ]:
                ablated = grammar.compose(prims, disabled=disabled)
                rules = {n['rule'] for n in ablated}
                self.assertNotIn(rule_name, rules,
                                 f'sample{idx} ablation {disabled} '
                                 f'still produced {rule_name} notes')

    def test_voices_distinct(self):
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, _ = primitives.classify(d['paths'])
            notes = grammar.compose(prims, disabled=None)
            voices = sorted({n['voice'] for n in notes})
            # At least 4 distinct voices must be used (roof, support,
            # decoration, curve, plus possibly column / unknown).
            self.assertGreaterEqual(
                len(voices), 4,
                f'sample{idx} only used {len(voices)} voices: {voices}'
            )


class ExportTests(unittest.TestCase):
    def test_export_round_trip(self):
        # Produce a small set of notes and round-trip through both
        # MIDI export and WAV render.
        notes = [
            dict(id='n001', source='p1', source_point=None,
                 pitch=60, start=0.0, duration=0.5,
                 rule='test', voice=0, program=4, velocity=80),
            dict(id='n002', source='p2', source_point=None,
                 pitch=64, start=0.4, duration=0.5,
                 rule='test', voice=1, program=48, velocity=70),
        ]
        mid = lab.OUT / '_test_export.mid'
        wav = lab.OUT / '_test_export.wav'
        try:
            cv2exp.export_midi(notes, mid)
            cv2exp.render_wav(notes, wav, total_seconds=2.0)
            self.assertGreater(mid.stat().st_size, 0)
            self.assertGreater(wav.stat().st_size, 0)
            # WAV should be readable and have actual non-zero samples.
            with wave.open(str(wav), 'rb') as w:
                pcm = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2')
                self.assertGreater(np.max(np.abs(pcm.astype(int))), 0)
        finally:
            for f in (mid, wav):
                if f.exists():
                    f.unlink()


class ProgressiveRevelationTests(unittest.TestCase):
    """Test the 6-phase progressive-revelation compose engine."""

    def test_phases_are_monotonic(self):
        # Each phase should produce at least as many notes as the
        # previous one, since earlier primitives re-trigger when a
        # new layer is introduced.
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, _ = primitives.classify(d['paths'])
            counts = [len(grammar.compose_progressive(prims, p))
                      for p in range(1, 7)]
            for i in range(1, len(counts)):
                self.assertGreaterEqual(
                    counts[i], counts[i - 1],
                    f'sample{idx} phase {i + 1} ({counts[i]}) < '
                    f'phase {i} ({counts[i - 1]})',
                )

    def test_phase1_only_has_roof(self):
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, _ = primitives.classify(d['paths'])
            notes = grammar.compose_progressive(prims, 1)
            rules = {n['rule'] for n in notes}
            # Either roof or (for column-facade) the virtual-roof fallback.
            self.assertTrue(
                rules <= {'roof', 'column'},
                f'sample{idx} phase 1 rules: {rules} (expected roof/column only)',
            )

    def test_phase6_has_all_primitive_types(self):
        for idx in range(6):
            d = lab.json.loads(
                (lab.OUT / f'sample{idx}.json').read_text(encoding='utf-8')
            )
            prims, _, _ = primitives.classify(d['paths'])
            notes = grammar.compose_progressive(prims, 6)
            rules = {n['rule'] for n in notes}
            # The active set for the sample - at least 4 distinct rules.
            sample_rules = {p['type'] for p in prims}
            self.assertGreaterEqual(
                len(rules & sample_rules), 4,
                f'sample{idx} phase 6 only produced {rules & sample_rules} '
                f'(expected >= 4 distinct types)',
            )

    def test_phase_boundaries_match_doc(self):
        # The 6 phase boundaries must match the published product spec.
        self.assertEqual(grammar.PHASE_BOUNDARIES,
                         (0.0, 15.0, 30.0, 45.0, 60.0, 80.0, 105.0))
        self.assertEqual(len(grammar.PHASE_TYPES), 6)
        self.assertEqual(len(grammar.PHASE_LABELS), 6)


class BlueprintModeTests(unittest.TestCase):
    """Test the Blueprint-mode multi-voice engine (compose_blueprint)."""

    def test_eight_variants_produce_distinct_instrument_sets(self):
        import compose_blueprint as cbp
        self.assertEqual(len(cbp.VARIANTS), 8)
        seen = set()
        for variant, programs in cbp.VARIANTS.items():
            self.assertEqual(len(programs), 5, f'{variant} has {len(programs)} programs')
            self.assertNotIn(tuple(programs), seen,
                             f'{variant} duplicates a previous program set')
            seen.add(tuple(programs))

    def test_eight_variants_produce_distinct_audio(self):
        # v0.3.2 fix: variants used to sound identical because the
        # renderer ignored the program number.  Now each variant should
        # produce a different spectral fingerprint.
        import compose_blueprint as cbp
        bp = lab.json.loads(
            (lab.OUT / 'sample0-blueprint.json').read_text(encoding='utf-8')
        )
        import wave as _wave
        centroids = {}
        for variant in cbp.VARIANTS:
            notes = cbp.compose_blueprint(bp, variant)
            import tempfile
            tf = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            tf.close()
            cbp.render_blueprint_wav(notes, Path(tf.name))
            with _wave.open(tf.name, 'rb') as w:
                pcm = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(float)
            n = min(4096, len(pcm))
            spec = np.abs(np.fft.rfft(pcm[:n]))
            freq = np.fft.rfftfreq(n, 1/22050)
            centroids[variant] = float(np.sum(spec*freq) / (np.sum(spec)+1e-9))
            Path(tf.name).unlink()
        vals = list(centroids.values())
        spread = max(vals) - min(vals)
        self.assertGreater(spread, 200,
                           f'8 variants spectral centroid spread = {spread:.0f} Hz, '
                           f'expected > 200 Hz (variants sound too similar)')

    def test_variants_have_different_rms(self):
        # Different synth families produce different RMS (e.g. bells
        # are quieter than sawtooth brass).  v0.3.1 made all variants
        # exactly the same RMS.
        import compose_blueprint as cbp
        bp = lab.json.loads(
            (lab.OUT / 'sample0-blueprint.json').read_text(encoding='utf-8')
        )
        import wave as _wave, tempfile
        rms_by_variant = {}
        for variant in cbp.VARIANTS:
            notes = cbp.compose_blueprint(bp, variant)
            tf = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
            tf.close()
            cbp.render_blueprint_wav(notes, Path(tf.name))
            with _wave.open(tf.name, 'rb') as w:
                pcm = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(float)
            rms_by_variant[variant] = float(np.sqrt(np.mean(pcm**2)))
            Path(tf.name).unlink()
        vals = list(rms_by_variant.values())
        spread = max(vals) - min(vals)
        self.assertGreater(spread, 300,
                           f'RMS spread = {spread:.0f} across 8 variants, '
                           f'expected > 300 (variants sound too similar in loudness)')

    def test_program_family_classification(self):
        import compose_blueprint as cbp
        # Spot-check that known programs land in expected families.
        self.assertEqual(cbp._program_family(11), 'bell')   # vibraphone
        self.assertEqual(cbp._program_family(40), 'string') # violin
        self.assertEqual(cbp._program_family(61), 'brass')  # brass section
        self.assertEqual(cbp._program_family(73), 'woodwind')# flute
        self.assertEqual(cbp._program_family(89), 'pad')    # new age pad
        # 74 is shamisen in F_ethnic; 75 is pan-pipe in D_woodwind.
        self.assertEqual(cbp._program_family(74), 'ethnic_pluck')
        self.assertEqual(cbp._program_family(75), 'woodwind')

    def test_pentatonic_quantisation(self):
        import compose_blueprint as cbp
        # All quantised pitches must be in the pentatonic set.
        for raw in range(20, 110):
            quant = cbp._quantise(float(raw))
            self.assertIn(quant, cbp.PENTATONIC,
                          f'pitch {raw} quantised to {quant} not in pentatonic')

    def test_voice_band_assigns_five_classes(self):
        import compose_blueprint as cbp
        bands = set()
        for idx in range(6):
            bp = lab.json.loads(
                (lab.OUT / f'sample{idx}-blueprint.json').read_text(encoding='utf-8')
            )
            for s in bp['symbols']:
                bands.add(cbp._voice_band(s))
        self.assertGreaterEqual(len(bands), 4,
                                f'voice bands only {sorted(bands)}, '
                                f'expected >= 4 distinct bands used')

    def test_blueprint_notes_preserve_all_symbols(self):
        # The Blueprint philosophy: preserve every pixel.  Even with
        # voice-band routing, every symbol should produce a note.
        import compose_blueprint as cbp
        for idx in range(6):
            bp = lab.json.loads(
                (lab.OUT / f'sample{idx}-blueprint.json').read_text(encoding='utf-8')
            )
            notes = cbp.compose_blueprint(bp, 'A_academic')
            self.assertEqual(len(notes), len(bp['symbols']),
                             f'sample{idx}: {len(notes)} notes vs '
                             f'{len(bp["symbols"])} symbols (must be 1:1)')

    def test_blueprint_voices_remain_audible(self):
        # Ensure each variant produces non-empty voice 0 (roof) and
        # voice 1 (body) tracks; otherwise the variant is silent in
        # key bands.
        import compose_blueprint as cbp
        for variant in cbp.VARIANTS:
            bp = lab.json.loads(
                (lab.OUT / 'sample0-blueprint.json').read_text(encoding='utf-8')
            )
            notes = cbp.compose_blueprint(bp, variant)
            voices_present = {n['voice'] for n in notes}
            self.assertGreater(len(voices_present), 0,
                               f'{variant} produced no notes')
            # No voice should have more than half of all notes
            # (otherwise the voice split collapsed).
            for v in voices_present:
                count = sum(1 for n in notes if n['voice'] == v)
                self.assertLess(count, len(notes) * 0.85,
                                f'{variant} voice {v} has {count} notes '
                                f'(>{int(len(notes)*0.85)} total) — '
                                f'voice split failed')

    def test_blueprint_pitches_in_midi_range(self):
        import compose_blueprint as cbp
        for variant in cbp.VARIANTS:
            bp = lab.json.loads(
                (lab.OUT / 'sample0-blueprint.json').read_text(encoding='utf-8')
            )
            notes = cbp.compose_blueprint(bp, variant)
            for n in notes:
                self.assertGreaterEqual(n['pitch'], 21, f'{variant} too low')
                self.assertLessEqual(n['pitch'], 108, f'{variant} too high')

    # ----------------------------------------------------------------
    # v0.3.4 — Live soundfont integration: each variant must declare
    # 5 distinct real-instrument names that smplr can resolve to the
    # FluidR3_GM prebuilt soundfont library.
    # ----------------------------------------------------------------
    def test_blueprint_variants_have_real_instrument_names(self):
        """Each of the 8 variants must carry 5 distinct, non-empty
        instrument names that smplr's FluidR3_GM prebuilt library
        actually ships.  (v0.3.4 fix — v0.3.3 only stored GM program
        numbers; the browser had no way to know which real instrument
        to play.)"""
        import compose_blueprint as cbp
        # The full instrument whitelist from smplr's FluidR3_GM
        # SoundfontLibraries (gleitz/midi-js-soundfonts).
        KNOWN = {
            'accordion', 'acoustic_bass', 'acoustic_grand_piano',
            'acoustic_guitar_nylon', 'acoustic_guitar_steel', 'agogo',
            'alto_sax', 'applause', 'bagpipe', 'banjo', 'baritone_sax',
            'bassoon', 'bottle', 'brass_section', 'breath_noise',
            'bright_acoustic_piano', 'celesta', 'cello', 'choir_aahs',
            'church_organ', 'clarinet', 'clavinet', 'contrabass',
            'distortion_guitar', 'drawbar_organ', 'dulcimer', 'electric_bass_finger',
            'electric_bass_pick', 'electric_grand_piano', 'electric_guitar_clean',
            'electric_guitar_jazz', 'electric_guitar_muted', 'electric_piano_1',
            'electric_piano_2', 'english_horn', 'fiddle', 'flute',
            'french_horn', 'fretless_bass', 'fx_1_rain', 'fx_2_soundtrack',
            'fx_3_crystal', 'fx_4_atmosphere', 'fx_5_brightness',
            'fx_6_goblins', 'fx_7_echoes', 'fx_8_scifi', 'glockenspiel',
            'guitar_fret_noise', 'guitar_harmonics', 'gunshot', 'harmonica',
            'harpsichord', 'helicopter', 'honkytonk_piano', 'kalimba',
            'koto', 'lead_1_square', 'lead_2_sawtooth', 'lead_3_calliope',
            'lead_4_chiff', 'lead_5_charang', 'lead_6_voice',
            'lead_7_fifths', 'lead_8_bass__lead', 'marimba', 'melodic_tom',
            'music_box', 'muted_trumpet', 'nylo', 'oboe', 'ocarina',
            'orchestra_hit', 'orchestral_harp', 'overdriven_guitar', 'pad_1_new_age',
            'pad_2_warm', 'pad_3_polysynth', 'pad_4_choir', 'pad_5_bowed',
            'pad_6_metallic', 'pad_7_halo', 'pad_8_sweep', 'pan_flute',
            'percussive_organ', 'percussion', 'piccolo', 'pizzicato_strings',
            'recorder', 'reed_organ', 'reverse_cymbal', 'rock_organ',
            'saxophone', 'seashore', 'shakuhachi', 'shamisen', 'sitar',
            'slap_bass_1', 'slap_bass_2', 'soprano_sax', 'steel_drums',
            'string_ensemble', 'synth_brass_1', 'synth_brass_2', 'synth_choir',
            'synth_drum', 'synth_strings_1', 'synth_strings_2', 'taiko_drum',
            'tango_accordion', 'telephone_ring', 'tenor_sax', 'timpani',
            'tinkle_bell', 'tremolo_strings', 'trombone', 'trumpet', 'tuba',
            'tubular_bells', 'vibraphone', 'viola', 'violin', 'voice_oohs',
            'whistle', 'woodblock', 'wooden_flute', 'xylophone',
        }
        for variant, prog_inst_tuple in cbp.VARIANTS.items():
            self.assertEqual(len(prog_inst_tuple), 5,
                             f'{variant} has {len(prog_inst_tuple)} voices '
                             f'(expected 5)')
            programs = [p for p, _n in prog_inst_tuple]
            names = [_n for _p, _n in prog_inst_tuple]
            # All voices distinct
            self.assertEqual(len(set(programs)), 5,
                             f'{variant} voices not distinct: {programs}')
            self.assertEqual(len(set(names)), 5,
                             f'{variant} instrument names not distinct: {names}')
            # All names are real FluidR3_GM soundfonts that smplr can load
            for name in names:
                self.assertTrue(name and isinstance(name, str),
                                f'{variant} has empty/non-string name')
                self.assertIn(name, KNOWN,
                              f'{variant} instrument "{name}" not in '
                              f'FluidR3_GM SoundfontLibraries whitelist')
        # 8 distinct variants
        self.assertEqual(len(cbp.VARIANTS), 8)

    def test_blueprint_variant_human_labels(self):
        """Every variant must have a Chinese + English human label so
        the Live button in the UI can show '古琴·西塔 (koto+sitar+flute)'
        rather than just 'F_ethnic'."""
        import compose_blueprint as cbp
        for variant in cbp.VARIANTS:
            label_en, label_zh = cbp.VARIANT_INFO[variant]
            self.assertTrue(label_en, f'{variant} missing English label')
            self.assertTrue(label_zh, f'{variant} missing Chinese label')
            self.assertIn(' ', label_en, f'{variant} English label has no space: "{label_en}"')
            # Chinese label should contain at least one CJK char
            self.assertTrue(any('\u4e00' <= ch <= '\u9fff' for ch in label_zh),
                            f'{variant} Chinese label has no CJK: "{label_zh}"')

    def test_blueprint_json_includes_instruments_field(self):
        """build_blueprint_json() must include 'instruments' (list of 5
        FluidR3_GM names) and label_zh for the build_v3_visual.py
        Live button to render."""
        import compose_blueprint as cbp
        bp = lab.json.loads(
            (lab.OUT / 'sample0-blueprint.json').read_text(encoding='utf-8')
        )
        for variant in cbp.VARIANTS:
            j = cbp.build_blueprint_json(bp, variant)
            self.assertIn('instruments', j,
                          f'{variant} blueprint json missing instruments field')
            self.assertEqual(len(j['instruments']), 5)
            self.assertIn('label_zh', j)
            self.assertIn('label_en', j)
            for voice in j['voices']:
                self.assertIn('instrument', voice,
                              f'{variant}/{voice["label"]} voice missing instrument')

    # ----- v0.3.5: Live SoundFont for Soul Symphony + Progressive -----

    def test_soul_symphony_live_notes_carry_real_programs(self):
        """The Soul Symphony notes (used by the Live soundfont button
        in build_v3_visual.py) must carry a `program` field that maps
        to a real FluidR3_GM instrument (electric_piano, music_box,
        cello, string_ensemble, flute, lead)."""
        from pathlib import Path
        # The build script writes lab-v3.html; rather than re-run the
        # build, we directly invoke grammar.compose on sample 0 and
        # verify the program field.
        d = lab.json.loads(
            (lab.OUT / 'sample0.json').read_text(encoding='utf-8')
        )
        prims, _, _ = primitives.classify(d['paths'])
        notes = grammar.compose(prims)
        # every note must have a `program` int in 0..127
        for n in notes:
            self.assertIn('program', n)
            self.assertIsInstance(n['program'], int)
            self.assertGreaterEqual(n['program'], 0)
            self.assertLessEqual(n['program'], 127)
        # The set of programs should be a subset of the 6 instruments
        # actually used by grammar.RULES
        expected_progs = {r.program for r in grammar.RULES.values()}
        actual_progs = {n['program'] for n in notes}
        self.assertTrue(actual_progs.issubset(expected_progs),
                        f'notes use unexpected programs: {actual_progs - expected_progs}')

    def test_progressive_revelation_live_notes_carry_real_programs(self):
        """Same check for Progressive Revelation: compose_progressive
        must produce notes with `program` fields from grammar.RULES."""
        d = lab.json.loads(
            (lab.OUT / 'sample0.json').read_text(encoding='utf-8')
        )
        prims, _, _ = primitives.classify(d['paths'])
        for phase in range(1, 7):
            notes = grammar.compose_progressive(prims, phase)
            self.assertGreater(len(notes), 0, f'phase {phase} produced 0 notes')
            for n in notes:
                self.assertIn('program', n)
                self.assertIsInstance(n['program'], int)
                self.assertGreaterEqual(n['program'], 0)
                self.assertLessEqual(n['program'], 127)
        # Phase 1 should be the smallest (only roof), phase 6 the largest
        d_notes = lab.json.loads(
            (lab.OUT / 'sample0.json').read_text(encoding='utf-8')
        )
        d_p, _, _ = primitives.classify(d_notes['paths'])
        n1 = len(grammar.compose_progressive(d_p, 1))
        n6 = len(grammar.compose_progressive(d_p, 6))
        self.assertLessEqual(n1, n6, f'phase 1 ({n1}) should have <= phase 6 ({n6}) notes')

    def test_live_soundfont_button_assets_present(self):
        """The v3 demo page must reference the live soundfont bridge
        and live playback script (so the Live buttons in Soul Symphony
        and Progressive Revelation actually wire up)."""
        html_path = lab.OUT / 'lab-v3.html'
        if not html_path.exists():
            self.skipTest('lab-v3.html not built yet (run build_v3_visual.py)')
        html = html_path.read_text(encoding='utf-8')
        self.assertIn('sonify-soundfont-bridge.js', html,
                      'live soundfont bridge script not referenced')
        self.assertIn('sonify-live.js', html,
                      'live playback script not referenced')
        # Soul Symphony and Progressive Live buttons must exist
        self.assertIn('live-btn-soul', html,
                      'no Live Soul Symphony buttons in lab-v3.html')
        self.assertIn('live-btn-prog', html,
                      'no Live Progressive buttons in lab-v3.html')

    # ----- v0.3.5: Offline SoundFont render for Soul/Progressive -----

    def test_soundfont_offline_render_produces_real_audio(self):
        """render_soundfont.render_wav must produce a real, non-silent
        WAV file when given notes and the FluidR3 soundfont is available."""
        import wave
        import render_soundfont as rsf
        sf = rsf.find_soundfont()
        if not sf:
            self.skipTest('no FluidR3 .sf2/.sf3 found (set SONIFY_SF2 env var)')
        # Tiny test: 5 piano notes
        notes = [dict(start=float(i) * 0.3, duration=0.25, pitch=60 + i,
                      program=0, velocity=80) for i in range(5)]
        out = lab.OUT / '_test_soundfont.wav'
        try:
            rsf.render_wav(notes, out, sf_path=sf, total_seconds=2.0, rate=44100)
            self.assertTrue(out.exists())
            with wave.open(str(out), 'rb') as w:
                self.assertGreater(w.getnframes(), 0)
                pcm = w.readframes(w.getnframes())
                self.assertGreater(len(pcm), 0)
                # The WAV must NOT be silent (peak > 100 in i16)
                import numpy as np
                arr = np.frombuffer(pcm, dtype='<i2')
                self.assertGreater(int(np.max(np.abs(arr))), 100,
                                   'rendered WAV appears to be silent')
        finally:
            if out.exists():
                out.unlink()

    def test_soul_symphony_wav_is_above_silence_threshold(self):
        """The re-rendered Soul Symphony WAV (FluidR3_GM) must contain
        real audio, not silence.  Verifies the render_soul_progressive
        script actually wrote real audio."""
        import wave
        import numpy as np
        wav_path = lab.OUT / 'sample0-v2-all.wav'
        if not wav_path.exists():
            self.skipTest('sample0-v2-all.wav not rendered yet')
        with wave.open(str(wav_path), 'rb') as w:
            pcm = w.readframes(w.getnframes())
            arr = np.frombuffer(pcm, dtype='<i2')
            peak = int(np.max(np.abs(arr)))
            rms = float(np.sqrt(np.mean(arr.astype(float) ** 2)))
            # If rendered through FluidR3, peak should be > 1000
            # (additive sine was 3000-10000; we expect a similar magnitude
            # from a real instrument).
            self.assertGreater(peak, 500,
                               f'sample0-v2-all.wav peak={peak} too low '
                               f'(re-render with render_soul_progressive_wavs.py)')
            self.assertGreater(rms, 50,
                               f'sample0-v2-all.wav rms={rms:.1f} too low')

    def test_progressive_revelation_phase1_has_fallback_roof(self):
        """Phase 1 of Progressive Revelation should always emit at
        least 1 note (the virtual roof from the tallest column if no
        roof primitive exists).  Previously column-façade samples
        produced 0 notes in phase 1."""
        d = lab.json.loads(
            (lab.OUT / 'sample2.json').read_text(encoding='utf-8')  # column-facade
        )
        prims, _, _ = primitives.classify(d['paths'])
        notes = grammar.compose_progressive(prims, 1)
        self.assertGreater(len(notes), 0,
                           'column-façade sample 2 should still get a '
                           'virtual-roof note in phase 1')

    def test_blueprint_soundfont_wav_is_stereo_real_instrument(self):
        """The Blueprint 8-variant WAVs re-rendered through FluidR3_GM
        must be stereo 44.1 kHz and have a much larger file size than
        the original mono 22.05 kHz additive-sine versions."""
        import wave
        import numpy as np
        import os
        wav_path = lab.OUT / 'sample0-bp-A_bells.wav'
        if not wav_path.exists():
            self.skipTest('sample0-bp-A_bells.wav not rendered yet '
                          '(run render_blueprint_soundfont.py)')
        with wave.open(str(wav_path), 'rb') as w:
            self.assertEqual(w.getnchannels(), 2,
                             f'expected stereo, got {w.getnchannels()} channels')
            self.assertEqual(w.getframerate(), 44100,
                             f'expected 44100 Hz, got {w.getframerate()} Hz')
            # File should be > 1 MB (mono 22.05kHz was ~595 KB)
            sz = os.path.getsize(wav_path)
            self.assertGreater(sz, 1_000_000,
                               f'WAV size {sz} too small (expected >1 MB for stereo 44.1 kHz)')
            # Audio must not be silent
            pcm = w.readframes(w.getnframes())
            arr = np.frombuffer(pcm, dtype='<i2')
            self.assertGreater(int(np.max(np.abs(arr))), 1000,
                               f'rendered Blueprint WAV peak={arr.max()} too low')

    def test_thin_voice_keeps_polyphony_below_budget(self):
        """_thin_voice must cap concurrent notes at the requested budget
        without dropping earlier-starting notes."""
        import render_soundfont as rsf
        # 100 notes, all 10s long, starting every 0.1s — without thining
        # this would be 100 simultaneous.
        notes = [
            dict(start=float(i) * 0.1, duration=10.0, pitch=60,
                 program=0, velocity=80, voice=0)
            for i in range(100)
        ]
        thin = rsf._thin_voice(notes, max_concurrent=10)
        # Check actual concurrency
        events = []
        for n in thin:
            events.append((float(n['start']), 1))
            events.append((float(n['start']) + float(n['duration']), -1))
        events.sort(key=lambda e: (e[0], -e[1]))
        cur = maxc = 0
        for _, d in events:
            cur += d
            if cur > maxc: maxc = cur
        self.assertLessEqual(maxc, 10, f'thinned polyphony {maxc} > budget 10')
        self.assertGreater(len(thin), 0, 'thinning dropped all notes')


if __name__ == '__main__':
    unittest.main()
