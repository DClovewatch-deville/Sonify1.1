import unittest,json,wave
from pathlib import Path
import numpy as np
from PIL import Image
from color_dna import analyze,expression
ROOT=Path(__file__).parent/'dist'
class ColorTests(unittest.TestCase):
 def test_known_hues_and_grey_evidence(self):
  warm=analyze(Image.new('RGB',(32,32),(240,120,20)));cool=analyze(Image.new('RGB',(32,32),(20,90,240)));grey=analyze(Image.new('RGB',(32,32),(160,160,160)))
  self.assertGreater(warm['warmth'],.7);self.assertLess(cool['warmth'],-.7);self.assertFalse(grey['available']);self.assertEqual(expression(grey)['amount'],0)
  im=Image.new('RGB',(100,100),'white');im.paste((240,120,20),(0,0,40,100));mixed=analyze(im)
  self.assertAlmostEqual(warm['warmth'],mixed['warmth'],places=2)
 def test_lab_and_spatial_roles(self):
  white=analyze(Image.new('RGB',(40,40),'white'));self.assertAlmostEqual(white['lab']['L_mean'],100,places=2)
  grey=analyze(Image.new('RGB',(40,40),(128,128,128)));self.assertAlmostEqual(grey['lab']['chroma_mean'],0,places=2)
  im=Image.new('RGB',(40,40),(240,100,20));im.paste((20,70,240),(0,0,40,20));c=analyze(im)
  self.assertGreater(c['warm_share'],.1);self.assertGreater(c['cool_share'],.1);self.assertGreater(c['temperature_contrast'],.2);self.assertEqual(c['spatial_order'][0],'cool')
 def test_three_way_evidence(self):
  report=json.loads((ROOT/'color-contrast/report.json').read_text(encoding='utf8'));v=report['variants']
  self.assertFalse(v['enhanced']['lead_identity_preserved']);self.assertAlmostEqual(v['off']['rms'],v['enhanced']['rms'],places=5)
  off=json.loads((ROOT/'color-contrast/off.json').read_text(encoding='utf8'));on=json.loads((ROOT/'color-contrast/enhanced.json').read_text(encoding='utf8'))
  self.assertEqual([(n['source'],n['source_point']) for n in off['theme']],[(n['source'],n['source_point']) for n in on['theme']])
  self.assertGreater(v['enhanced']['chroma_l1_from_off'],v['old_auto']['chroma_l1_from_off']*2)
  self.assertGreater(v['enhanced']['onsets_per_second'],v['off']['onsets_per_second'])
  self.assertNotEqual(v['enhanced']['voices']['4']['median_pitch'],v['off']['voices']['4']['median_pitch'])
 def test_weather_control_changes_core_music(self):
  r=json.loads((ROOT/'color-weather/report.json').read_text(encoding='utf8'));self.assertTrue(r['geometry_fixed'])
  a=r['sunny'];b=r['cloudy'];self.assertEqual(a['expression']['mode'],'major');self.assertEqual(b['expression']['mode'],'minor')
  self.assertNotEqual(a['key_pc'],b['key_pc']);self.assertNotEqual(a['programs'],b['programs'])
  self.assertNotEqual([n['pitch'] for n in a['theme']],[n['pitch'] for n in b['theme']]);self.assertAlmostEqual(a['stats']['rms'],b['stats']['rms'],places=5)
  for item in (a,b):
   c=item['color']
   self.assertTrue(all(0<=x<=1 for q in c['regions'] for x in q['sample_point']))
 def test_four_image_ab_not_only_volume(self):
  report=json.loads((ROOT/'color-checks/report.json').read_text(encoding='utf8'))
  self.assertGreaterEqual(len(report),4)
  for r in report:
   off=json.loads((ROOT/'color-checks'/f"{r['case']}-off.json").read_text(encoding='utf8'));on=json.loads((ROOT/'color-checks'/f"{r['case']}-auto.json").read_text(encoding='utf8'))
   signature=lambda m:[(n['voice'],n['pitch'],n['start'],n['duration']) for n in m['notes']]
   if r['dna']['available']:self.assertNotEqual(signature(off),signature(on),r['case'])
   else:self.assertEqual(signature(off),signature(on))
   self.assertEqual([n['source_point'] for n in off['theme']],[n['source_point'] for n in on['theme']])
   self.assertEqual([n['source'] for n in off['theme']],[n['source'] for n in on['theme']])
   for mode in ['off','auto']:
    with wave.open(str(ROOT/'color-checks'/f"{r['case']}-{mode}-mix.wav"),'rb') as f:
     self.assertEqual(f.getnframes(),36*f.getframerate());a=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2')
     self.assertLess(np.max(np.abs(a.astype(float)))/32768,.95)
 def test_variants_styles_limits(self):
  p=json.loads((ROOT/'studio/sample5.json').read_text(encoding='utf8'))
  for style,versions in p['progressive_colors'].items():
   self.assertEqual(set(versions),{'off','soft','mid','auto','vivid'})
   for strength,m in versions.items():
    self.assertEqual(m['preset'],style);self.assertEqual(m['color_strength'],strength)
    count=peak=0
    for _,d in sorted([(n['start'],1) for n in m['notes']]+[(round(n['start']+n['duration'],6),-1) for n in m['notes']]):count+=d;peak=max(peak,count)
    self.assertLessEqual(peak,6);self.assertTrue(all(n['start']+n['duration']<=35.800001 for n in m['notes']))
if __name__=='__main__':unittest.main()
