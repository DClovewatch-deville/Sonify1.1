import unittest,sys
from pathlib import Path
sys.path[:0]=[str(Path(__file__).resolve().parent),str(Path(__file__).resolve().parent.parent/'experiment/vendor'),str(Path(__file__).resolve().parent.parent/'experiment')]
from role_remix import validate,validate_regions
import studio_grammar as grammar
from soul_composition import compose,make_demo_cut
class RoleRemixTests(unittest.TestCase):
 def test_invalid_inputs(self):
  p={'contours':[{'id':'a'}]}
  for assignments in ({},{'missing':0},{'a':True},{'a':5}):
   with self.assertRaises(ValueError):validate(p,assignments)
 def test_explicit_role_overrides_background_shape(self):
  u={'layer':'background','type':'h_line','user_voice':0}
  self.assertEqual(grammar._voice_for(u),0)
  del u['user_voice'];self.assertEqual(grammar._voice_for(u),4)
 def test_new_melody_really_uses_reassigned_geometry(self):
  paths=[{'id':'roof','points':[[.2,.2],[.4,.1],[.6,.3],[.8,.2]]},{'id':'support','points':[[.1,.7],[.9,.7]]}]
  units,_=grammar.classify_units(paths,800,600)
  for u in units:u['user_voice']=0 if u['id']=='support' else 1
  music=make_demo_cut(compose(units,grammar))
  self.assertEqual({n['source'] for n in music['notes'] if n['voice']==0},{'support'})
  self.assertEqual({n['source'] for n in music['notes'] if n['voice']==1},{'roof'})
  self.assertTrue(all(n['program']==grammar.VOICE_CATALOG[n['voice']]['program'] for n in music['notes']))
 def test_two_melodies_and_two_bass_regions_all_enter_music(self):
  paths=[{'id':'a','points':[[.1,.2],[.2,.1],[.3,.25]]},{'id':'b','points':[[.4,.2],[.5,.1],[.6,.3]]},{'id':'c','points':[[.1,.7],[.3,.7]]},{'id':'d','points':[[.4,.7],[.6,.7]]}]
  units,_=grammar.classify_units(paths,800,600)
  for i,u in enumerate(units):u.update(user_voice=0 if u['id'] in ('a','b') else 2,user_region=u['id'],user_region_number=i+1)
  music=make_demo_cut(compose(units,grammar))
  self.assertEqual({n['source'] for n in music['notes'] if n['voice']==0},{'a','b'})
  self.assertEqual({n['source'] for n in music['notes'] if n['voice']==2},{'c','d'})
  self.assertEqual(len(music['groups']),4)
 def test_conflicting_region_rejected(self):
  with self.assertRaises(ValueError):validate_regions({'a':0},[{'id':'r1','voice':0,'sources':['a']},{'id':'r2','voice':0,'sources':['a']}])
if __name__=='__main__':unittest.main()
