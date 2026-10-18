"""Refresh only Progressive music for existing upload workspaces, without cloud calls."""
from pathlib import Path
import sys,json,os,shutil,hashlib
ROOT=Path(__file__).parent;sys.path.insert(0,str(ROOT/'vendor'))
from color_dna import analyze
from progressive_arrangement import arrange,PRESETS
import studio_grammar as sg,render_soundfont as rsf
from build_progressive_arrangement import mix_stems
from build_studio import export_midi

def refresh(folder,pool,sf):
 assets=folder/'workspace/studio';path=assets/'sample5.json';p=json.loads(path.read_text(encoding='utf8'));units,_=sg.classify_units(p['contours'],p['width'],p['height']);color=analyze(folder/'original.png','uploaded original photograph')
 stage=assets/'color-v11-stage';stage.mkdir(exist_ok=True);versions={}
 for preset in PRESETS:
  versions[preset]={}
  for strength in (['off','soft','mid','auto','vivid'] if color['available'] else ['auto']):
   m=arrange(p['soul'],preset,units,color,strength);prefix='sample5-progressive'+('' if preset=='nature' else '-'+preset)+('' if strength=='auto' else '-color-'+strength)
   old=p.get('progressive_colors',{}).get(preset,{}).get(strength,{})
   signature=lambda music:([(n['voice'],n['pitch'],n['start'],n['duration'],n['velocity'],n['program']) for n in music.get('notes',[])],music.get('mix_gains'),music.get('spatial_pan'))
   reuse=signature(old)==signature(m) and all((assets/f'{prefix}-{v}.wav').exists() for v in range(5))
   for v in range(5):
    if reuse:shutil.copyfile(assets/f'{prefix}-{v}.wav',stage/f'{prefix}-{v}.wav')
    else:rsf.render_wav([n for n in m['notes'] if n['voice']==v],stage/f'{prefix}-{v}.wav',sf_path=sf,total_seconds=37,rate=22050,pool=pool,normalize=False)
   mix_stems(prefix,m,stage);export_midi(m['notes'],stage/f'{prefix}.mid',120,m['spatial_pan']);versions[preset][strength]=m
 p.update(color_dna=color,progressive_colors=versions,progressive_presets={k:v['auto'] for k,v in versions.items()},progressive=versions['nature']['auto'])
 p['progressive_engine_hashes']={n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in ['color_dna.py','progressive_arrangement.py','progressive_features.py']}
 pending=stage/'sample5.json';pending.write_text(json.dumps(p,ensure_ascii=False,separators=(',',':')),encoding='utf8')
 for file in stage.iterdir():
  if file.name!='sample5.json':os.replace(file,assets/file.name)
 os.replace(pending,path);stage.rmdir()
 print('UPDATED',folder.name,'color',color['available'],flush=True)
def main():
 sf=rsf.find_soundfont();pool=rsf._SoundFontPool.get(sf,rate=22050,gain=1.2)
 folders=[f for f in (ROOT.parent/'intake/runtime').iterdir() if (f/'workspace/studio/sample5.json').exists() and (f/'original.png').exists()]
 folders.sort(key=lambda f:(f.name!='8fb4b11d43464c19aa5785ec31211ddb',f.name))
 for f in folders:refresh(f,pool,sf)
 pool.close()
if __name__=='__main__':main()
