import json,unittest,wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).parent/'dist';ASSETS=ROOT/'studio'
class ProgressiveArrangementTests(unittest.TestCase):
 def test_sources_theme_cadence_and_polyphony(self):
  for i in range(6):
   p=json.loads((ASSETS/f'sample{i}.json').read_text(encoding='utf8'));parents={n['id']:n for n in p['soul']['notes']};paths={r['id']:r['points'] for r in p['contours']}
   for style,m in p['progressive_presets'].items():
    with self.subTest(sample=i,style=style):
     self.assertEqual(m['duration'],36);self.assertEqual(len(m['emotions']),5)
     for n in m['notes']:
      parent=parents[n['parent_note_id']];self.assertEqual(n['source'],parent['source']);self.assertTrue(all(0<=q<=1 for q in n['source_point']))
      if n['arrangement_role'] in ('original_theme','theme_reprise','theme_development'):
       self.assertIn(n['source_point'],paths[n['source']])
      self.assertGreater(n['duration'],0);self.assertLessEqual(n['start']+n['duration'],35.800001)
     reprise=[n for n in m['notes'] if n['voice']==0 and 24<=n['start']<28]
     self.assertEqual([n['pitch'] for n in reprise],[n['pitch'] for n in m['theme']])
     self.assertEqual([n for n in m['notes'] if n['voice']==0][-1]['pitch']%12,m['key_pc'])
     count=peak=0
     for t,d in sorted([(n['start'],1) for n in m['notes']]+[(round(n['start']+n['duration'],6),-1) for n in m['notes']]):count+=d;peak=max(peak,count)
     self.assertLessEqual(peak,6)
 def test_audio_curve_continuity_and_peak(self):
  for preset in ['','-chamber','-piano','-strings']:
   with wave.open(str(ASSETS/f'sample5-progressive{preset}-mix.wav'),'rb') as f:
    rate=f.getframerate();a=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768;a=a.reshape(-1,2)
   self.assertEqual(len(a),rate*36);self.assertLess(np.max(np.abs(a)),.95)
   mono=a.mean(1);rms=lambda start,end:float(np.sqrt(np.mean(mono[int(start*rate):int(end*rate)]**2)))
   self.assertGreater(rms(24,32),rms(0,6)*1.5)
   for start in np.arange(.5,35,.5):self.assertGreater(rms(start,start+.25),.0005)
   self.assertLess(np.max(np.abs(a[-int(rate*.05):])),.03)
 def test_cross_image_and_style_diversity(self):
  rows=json.loads((ROOT/'progressive-diversity/manifest.json').read_text(encoding='utf8'))
  self.assertEqual(len(rows),4)
  self.assertEqual(len({tuple(r['styles']['nature']['theme']) for r in rows}),4)
  for row in rows:
   self.assertEqual(set(row['styles']),{'nature','chamber','piano','strings'})
   self.assertGreater(len({tuple(s['dna']['pulse']) for s in row['styles'].values()}),2)
   for s in row['styles'].values():
    with wave.open(str(ROOT/s['audio']),'rb') as f:self.assertEqual(f.getnframes(),36*f.getframerate())
 def test_deterministic_generation(self):
  import studio_grammar as sg
  from progressive_arrangement import arrange
  p=json.loads((ASSETS/'sample5.json').read_text(encoding='utf8'));units,_=sg.classify_units(p['contours'],p['width'],p['height'])
  for style,m in p['progressive_presets'].items():
   self.assertEqual(arrange(p['soul'],style,units,m['features'].get('color')),{k:v for k,v in m.items() if k!='mix_master_gain'})
 def test_comparison_files_same_duration_and_rms(self):
  arrays=[]
  for name in ['before','after']:
   with wave.open(str(ROOT/'progressive-review'/f'sample5-{name}-listen.wav'),'rb') as f:
    arrays.append(np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768)
  self.assertEqual(len(arrays[0]),len(arrays[1]));self.assertAlmostEqual(float(np.sqrt(np.mean(arrays[0]**2))),float(np.sqrt(np.mean(arrays[1]**2))),places=3)
if __name__=='__main__':unittest.main()
