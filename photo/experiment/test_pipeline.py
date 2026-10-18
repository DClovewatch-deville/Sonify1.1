"""Behavioral tests: provenance, input sensitivity, ablation, silence, reproducibility.

Environment variables:
    SKIP_BINARY_ASSERTIONS=1  — skip WAV / PNG / SVG binary checks.
        Used by CI where only the JSON side of the artifacts is committed.
        The compositional + structural assertions still run; only the
        pixel-perfect / waveform-magnitude / svg-tag checks are bypassed.
"""
import os, unittest, json, wave
import run as lab
import numpy as np
import blueprint

SKIP_BINARY = os.environ.get('SKIP_BINARY_ASSERTIONS') == '1'

class PipelineTests(unittest.TestCase):
    def test_blank_is_empty(self):
        _,_,paths,groups,_=lab.extract(np.full((240,240),255,np.uint8))
        self.assertEqual(paths,[]); self.assertEqual(lab.compose(paths,groups),[])

    def test_curve_direction_changes_pitch(self):
        up=dict(id='up',kind='curve',points=[[.1,.8],[.9,.2]])
        down=dict(id='down',kind='curve',points=[[.1,.2],[.9,.8]])
        a=lab.compose([up],[]);b=lab.compose([down],[])
        self.assertLess(a[0]['pitch'],a[-1]['pitch'])
        self.assertGreater(b[0]['pitch'],b[-1]['pitch'])
        self.assertTrue(all(n['source_point'] is not None for n in a))

    def test_actual_artifacts(self):
        seen=set()
        for file in lab.OUT.glob('sample*.json'):
            if '-blueprint' in file.stem: continue
            r=json.loads(file.read_text(encoding='utf-8'));ids={p['id'] for p in r['paths']}
            a=r['variants']['all'];self.assertTrue(a)
            self.assertTrue(all(n['source'] in ids for n in a))
            self.assertEqual(a,lab.compose(r['paths'],r['groups']))
            for rule in ['contour','support','repeat']:
                b=r['variants']['no-'+rule]
                self.assertFalse(any(n['rule']==rule for n in b))
                expected=[{k:v for k,v in n.items() if k!='id'} for n in a if n['rule']!=rule]
                self.assertEqual(expected,[{k:v for k,v in n.items() if k!='id'} for n in b])
            if not SKIP_BINARY:
                with wave.open(str(file.with_name(r['id']+'-all.wav')),'rb') as w:
                    pcm=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2')
                    self.assertGreater(np.max(np.abs(pcm.astype(int))),0)
                    self.assertLess(np.max(np.abs(pcm.astype(int))),32767)
                    self.assertEqual(w.getnframes()/w.getframerate(),14)
            seen.add(tuple((n['pitch'],n['start'],n['duration']) for n in a))
        self.assertEqual(len(seen),6,'All six sample scores must differ')

    def test_blueprint_provenance(self):
        files=list(lab.OUT.glob('sample*-blueprint.json'))
        self.assertEqual(len(files),6)
        for file in files:
            bp=json.loads(file.read_text(encoding='utf-8'))
            ids={p['id'] for p in bp['paths']}
            self.assertGreater(len(bp['symbols']),1000)
            for n in bp['symbols']:
                self.assertIn(n['path'],ids)
                self.assertAlmostEqual(n['start'],n['x']*12,places=3)
                self.assertEqual(n['pitch'],round(84-48*n['y']))
            if not SKIP_BINARY:
                skel=255-np.array(lab.Image.open(lab.OUT/(bp['id']+'-skeleton.png')).convert('L'))
                x=round(n['x']*bp['source_width']);y=round(n['y']*bp['source_height'])
                self.assertGreater(skel[y,x],0,'Every symbol must originate on the extracted skeleton')
                svg=file.with_suffix('.svg').read_text(encoding='utf-8')
                self.assertNotIn('<image',svg)
                self.assertEqual(svg.count('<ellipse'),len(bp['symbols']))
        self.assertEqual(blueprint.build(np.zeros((40,40),np.uint8))['symbols'],[])

if __name__=='__main__':unittest.main()
