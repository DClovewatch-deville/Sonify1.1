"""Controlled colour treatments, fixed geometry. Not real weather/photo evidence."""
from pathlib import Path
import sys,json
ROOT=Path(__file__).parent;sys.path.insert(0,str(ROOT/'vendor'))
import numpy as np
from PIL import Image,ImageEnhance
from color_dna import analyze
from progressive_arrangement import arrange
import studio_grammar as sg,render_soundfont as rsf
from build_progressive_arrangement import mix_stems,write
from build_color_contrast_review import features

def build():
 out=ROOT/'dist/color-weather';out.mkdir(exist_ok=True)
 p=json.loads((ROOT/'dist/studio/sample5.json').read_text(encoding='utf8'));units,_=sg.classify_units(p['contours'],p['width'],p['height'])
 original=Image.open(ROOT/'assets/color0721/image1.jpeg').convert('RGB')
 sunny=ImageEnhance.Brightness(ImageEnhance.Color(original).enhance(1.12)).enhance(1.08)
 cloudy=ImageEnhance.Brightness(ImageEnhance.Color(original).enhance(.14)).enhance(.72)
 cloudy=Image.blend(cloudy,Image.new('RGB',cloudy.size,(55,85,135)),.35)
 variants={};audio={};sf=rsf.find_soundfont();pool=rsf._SoundFontPool.get(sf,rate=22050,gain=1.2)
 for key,img in [('sunny',sunny),('cloudy',cloudy)]:
  img.save(out/f'{key}.jpg',quality=94);c=analyze(img,'controlled colour treatment of 0721 image, not real weather')
  m=arrange(p['soul'],'nature',units,c,'auto');variants[key]=m
  for v in range(5):rsf.render_wav([n for n in m['notes'] if n['voice']==v],out/f'{key}-{v}.wav',sf_path=sf,total_seconds=37,rate=22050,pool=pool,normalize=False)
  audio[key]=mix_stems(key,m,out)[0]
 pool.close();target=min(.1,*[.9*np.sqrt(np.mean(a*a))/max(.001,np.abs(a).max()) for a in audio.values()]);report={}
 for key,m in variants.items():
  a=audio[key];a*=target/max(1e-9,np.sqrt(np.mean(a*a)));write(out/f'{key}-matched.wav',a,22050)
  ex=m['arrangement_params']['color_expression'];report[key]=dict(color=m['color_dna'],expression=ex,key_pc=m['key_pc'],theme=m['theme'],programs=[v['program'] for v in m['voice_catalog']],stats=features(a,22050))
  (out/f'{key}.json').write_text(json.dumps(m,ensure_ascii=False),encoding='utf8')
 report['geometry_fixed']=variants['sunny']['theme'][0]['source']==variants['cloudy']['theme'][0]['source'] and [n['source_point'] for n in variants['sunny']['theme']]==[n['source_point'] for n in variants['cloudy']['theme']]
 (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 print('weather contrast:',[(k,v['expression']['profile'],v['key_pc']) for k,v in report.items() if isinstance(v,dict)],flush=True)
if __name__=='__main__':build()
