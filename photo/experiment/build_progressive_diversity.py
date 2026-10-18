"""Four real-image listening fixtures; additional photos use explicitly labelled Canny edges."""
from pathlib import Path
import sys,json,shutil
ROOT=Path(__file__).parent
sys.path.insert(0,str(ROOT/'vendor'))
import cv2,numpy as np
from PIL import Image
import blueprint,studio_grammar as sg,render_soundfont as rsf
from progressive_arrangement import arrange,PRESETS
from build_progressive_arrangement import mix_stems
from build_studio import export_midi
OUT=ROOT/'dist'/'progressive-diversity';OUT.mkdir(exist_ok=True)
def build():
 sf=rsf.find_soundfont();pool=rsf._SoundFontPool.get(sf,rate=22050,gain=1.2);rows=[]
 for sid,name in [(5,'传统建筑'),(3,'西式教堂')]:
  p=json.loads((ROOT/'dist'/'studio'/f'sample{sid}.json').read_text(encoding='utf8'))
  shutil.copyfile(ROOT/'dist'/f'sample{sid}.jpg',OUT/f'{sid}.jpg')
  rows.append(dict(name=name,image=f'progressive-diversity/{sid}.jpg',method='已有艺术线稿',styles={k:dict(audio=f'studio/sample{sid}-progressive'+('' if k=='nature' else '-'+k)+'-mix.wav',theme=[n['pitch'] for n in m['theme']],dna=m['arrangement_params']) for k,m in p['progressive_presets'].items()}))
 paths=(ROOT/'assets/source-reference/intake-inventory.txt').read_text(encoding='utf8').splitlines()
 for index,key,name in [(0,'modern','现代抽象结构'),(14,'landscape','山水自然景物')]:
  image=Image.open(paths[index]).convert('RGB');image.thumbnail((800,800));image.save(OUT/f'{key}.jpg')
  a=np.array(image);gray=cv2.cvtColor(a,cv2.COLOR_RGB2GRAY);edges=cv2.Canny(cv2.GaussianBlur(gray,(5,5),0),60,140);sk=cv2.ximgproc.thinning(edges)
  bp=blueprint.build(sk);units,_=sg.classify_units(bp['paths'],bp['source_width'],bp['source_height']);soul=sg.compose_units(units,'soul');styles={}
  from color_dna import analyze
  color=analyze(image,'user source image')
  for preset in PRESETS:
   m=arrange(soul,preset,units=units,color_dna=color);prefix=f'{key}-{preset}'
   for v in range(5):rsf.render_wav([n for n in m['notes'] if n['voice']==v],OUT/f'{prefix}-{v}.wav',sf_path=sf,total_seconds=37,rate=22050,pool=pool,normalize=False)
   mix_stems(prefix,m,OUT);export_midi(m['notes'],OUT/f'{prefix}.mid',120,m['spatial_pan']);(OUT/f'{prefix}.json').write_text(json.dumps(m,ensure_ascii=False),encoding='utf8');styles[preset]=dict(audio=f'progressive-diversity/{prefix}-mix.wav',theme=[n['pitch'] for n in m['theme']],dna=m['arrangement_params'])
  rows.append(dict(name=name,image=f'progressive-diversity/{key}.jpg',method='原图经 Canny 边缘提取，仅作跨图像测试；非 AI 艺术线稿',styles=styles));print(key,'paths',len(units),flush=True)
 pool.close();(OUT/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf8')
if __name__=='__main__':build()
