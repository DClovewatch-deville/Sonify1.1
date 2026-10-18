import json,unittest,wave
from pathlib import Path
import numpy as np
ROOT=Path(__file__).parent
class LivingColorTests(unittest.TestCase):
 def test_fixed_geometry_four_real_audio_states(self):
  path=ROOT.parent/'intake/runtime/8fb4b11d43464c19aa5785ec31211ddb/workspace/studio/sample5.json'
  p=json.loads(path.read_text(encoding='utf8'));living=p['living_color'];self.assertEqual(len(living['states']),4)
  self.assertEqual(living['version'],'four-seasons-1.1')
  for style in ['nature','chamber','piano','strings']:
   states=[s['music'][style] for s in living['states']]
   source=lambda m:[(n['source'],n['source_point']) for n in m['theme']]
   self.assertTrue(all(source(m)==source(states[0]) for m in states))
   self.assertGreater(len({m['arrangement_params']['color_expression']['mode'] for m in states}),1)
   signatures={tuple((n['voice'],n['pitch'],n['start'],n['duration'],n['velocity'],n['program']) for n in m['notes']) for m in states}
   self.assertEqual(len(signatures),4,'Four states must not be identical music with different labels')
   self.assertGreater(len(states[1]['notes']),len(states[0]['notes']))
   self.assertLess(len(states[3]['notes']),len(states[2]['notes']))
   base=living['identity'][style]
   self.assertEqual(source(states[0]),source(base))
   for m in states:
    self.assertEqual(m['preset'],style)
    count=peak=0
    for _,d in sorted([(n['start'],1) for n in m['notes']]+[(round(n['start']+n['duration'],6),-1) for n in m['notes']]):count+=d;peak=max(peak,count)
    self.assertLessEqual(peak,6)
    with wave.open(str(path.parents[1]/m['audio']),'rb') as f:
     self.assertEqual(f.getnframes(),36*f.getframerate());a=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768
    self.assertLess(np.max(np.abs(a)),.86);self.assertAlmostEqual(float(np.sqrt(np.mean(a*a))),m['living_rms'],places=3);self.assertGreater(m['living_rms'],.04)
   self.assertLess(max(m['living_rms'] for m in states)-min(m['living_rms'] for m in states),.0001)
 def test_different_images_have_different_geometry_identity(self):
  import studio_grammar as sg
  from progressive_arrangement import arrange
  rows=[]
  for path in [ROOT/'dist/studio/sample5.json',ROOT.parent/'intake/runtime/8fb4b11d43464c19aa5785ec31211ddb/workspace/studio/sample5.json',ROOT.parent/'intake/runtime/15ead2511f07465ca82688410ff21727/workspace/studio/sample5.json']:
   p=json.loads(path.read_text(encoding='utf8'));units,_=sg.classify_units(p['contours'],p['width'],p['height']);m=arrange(p['soul'],'nature',units,p.get('color_dna'),'off',identity_mode=True)
   theme=m['theme'];intervals=[b['pitch']-a['pitch'] for a,b in zip(theme,theme[1:])];rows.append(intervals)
   paths={u['id']:u['points'] for u in units}
   for n in theme:self.assertIn(n['source_point'],paths[n['source']])
  self.assertEqual(len(set(tuple(row) for row in rows)),3,'Identity must differ by relative intervals, not only transposition')
 def test_solo_compensation_has_signal_and_headroom(self):
  assets=ROOT.parent/'intake/runtime/8fb4b11d43464c19aa5785ec31211ddb/workspace/studio';p=json.loads((assets/'sample5.json').read_text(encoding='utf8'));m=p['progressive']
  for role in ['warm','cool','dark']:
   ns=[n for n in m['notes'] if (n['voice']==2 if role=='dark' else n['arrangement_role']=='color_'+role+'_response')];self.assertTrue(ns)
   n=ns[0];start=max(0,n['start']-.15)
   with wave.open(str(assets/f"sample5-progressive-{n['voice']}.wav"),'rb') as f:
    rate=f.getframerate();a=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768;a=a.reshape(-1,f.getnchannels())[int(start*rate):int((start+5.2)*rate)]
   rms=np.sqrt(np.mean(a*a));peak=np.max(np.abs(a));gain=min(80,.12/max(.00001,rms),.85/max(.00001,peak))
   self.assertGreater(rms*gain,.05);self.assertLessEqual(peak*gain,.850001)
if __name__=='__main__':unittest.main()
