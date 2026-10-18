from pathlib import Path
import sys,json,shutil
ROOT=Path(__file__).parent;sys.path.insert(0,str(ROOT/'vendor'))
import cv2,numpy as np
from PIL import Image
from color_dna import analyze
from progressive_arrangement import arrange
import blueprint,studio_grammar as sg,render_soundfont as rsf
from build_progressive_arrangement import mix_stems,write
OUT=ROOT/'dist/color-blind';OUT.mkdir(exist_ok=True)
def build():
 sf=rsf.find_soundfont();pool=rsf._SoundFontPool.get(sf,rate=22050,gain=1.2);rows=[]
 p=json.loads((ROOT/'dist/studio/sample5.json').read_text(encoding='utf8'));paths=(ROOT/'assets/source-reference/intake-inventory.txt').read_text(encoding='utf8').splitlines()
 for key,name,path,method in [('autumn','冷暖共存的秋景',ROOT/'assets/color0721/image1.jpeg','既有亭子几何，受控比较色彩表达'),('landscape','低饱和度山水',ROOT.parent/'intake/runtime/15ead2511f07465ca82688410ff21727/original.png','此上传作品已有的几何'),('modern','冷色现代结构',Path(paths[0]),'同一原图的 Canny 边缘几何')]:
  image=Image.open(path).convert('RGB');image.thumbnail((800,800));image.save(OUT/f'{key}.jpg');color=analyze(path,'original image for blind listening')
  if key=='autumn':units,_=sg.classify_units(p['contours'],p['width'],p['height']);soul=p['soul']
  elif key=='landscape':
   q=json.loads((path.parent/'workspace/studio/sample5.json').read_text(encoding='utf8'));units,_=sg.classify_units(q['contours'],q['width'],q['height']);soul=q['soul']
  else:
   edges=cv2.Canny(cv2.GaussianBlur(cv2.cvtColor(np.array(image),cv2.COLOR_RGB2GRAY),(5,5),0),60,140);bp=blueprint.build(cv2.ximgproc.thinning(edges));units,_=sg.classify_units(bp['paths'],bp['source_width'],bp['source_height']);soul=sg.compose_units(units,'soul')
  audios={}
  for strength in ['off','auto']:
   m=arrange(soul,'nature',units,color,strength);prefix=key+'-'+strength
   for v in range(5):rsf.render_wav([n for n in m['notes'] if n['voice']==v],OUT/f'{prefix}-{v}.wav',sf_path=sf,total_seconds=37,rate=22050,pool=pool,normalize=False)
   audios[strength]=mix_stems(prefix,m,OUT)[0]
  target=min(.1,*[.9*np.sqrt(np.mean(a*a))/max(.001,np.abs(a).max()) for a in audios.values()])
  for strength,a in audios.items():write(OUT/f'{key}-{strength}-matched.wav',a*target/max(1e-8,np.sqrt(np.mean(a*a))),22050)
  rows.append(dict(id=key,name=name,image=f'color-blind/{key}.jpg',geometry=method,color=color,audio={k:f'color-blind/{key}-{k}-matched.wav' for k in audios}));print(key,'blind pair ready',flush=True)
 pool.close();(OUT/'manifest.json').write_text(json.dumps(rows,ensure_ascii=False),encoding='utf8')
if __name__=='__main__':build()
