from pathlib import Path
import sys,json
ROOT=Path(__file__).parent
sys.path.insert(0,str(ROOT/'vendor'))
from color_dna import analyze
from progressive_arrangement import arrange
import studio_grammar as sg,render_soundfont as rsf
from build_progressive_arrangement import mix_stems
OUT=ROOT/'dist'/'color-checks';OUT.mkdir(exist_ok=True)
def build():
 paths=(ROOT/'assets/source-reference/intake-inventory.txt').read_text(encoding='utf8').splitlines()
 base=json.loads((ROOT/'dist/studio/sample5.json').read_text(encoding='utf8'));units,_=sg.classify_units(base['contours'],base['width'],base['height'])
 sf=rsf.find_soundfont();pool=rsf._SoundFontPool.get(sf,rate=22050,gain=1.2);report=[]
 cases=[('autumn',paths[7]),('blue',paths[5]),('green',paths[14]),('gray',ROOT/'dist/sample5.jpg'),('gold',paths[9])]
 for key,path in cases:
  color=analyze(path,'user source image' if key!='gray' else 'black-white lineart control');row=dict(case=key,source=str(path),dna=color,variants={})
  for strength in ['off','auto']:
   m=arrange(base['soul'],'nature',units,color,strength);prefix=f'{key}-{strength}'
   for v in range(5):rsf.render_wav([n for n in m['notes'] if n['voice']==v],OUT/f'{prefix}-{v}.wav',sf_path=sf,total_seconds=37,rate=22050,pool=pool,normalize=False)
   mix_stems(prefix,m,OUT);(OUT/f'{prefix}.json').write_text(json.dumps(m,ensure_ascii=False),encoding='utf8');row['variants'][strength]=dict(audio=f'color-checks/{prefix}-mix.wav',expression=m['arrangement_params']['color_expression'])
  report.append(row);print(key,color,flush=True)
 pool.close();(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
if __name__=='__main__':build()
