"""Rebuild only Progressive assets; retain existing Soul/Blueprint artifacts."""
from pathlib import Path
import sys,json,shutil,wave,subprocess
ROOT=Path(__file__).parent
sys.path.insert(0,str(ROOT/'vendor'))
import numpy as np
import render_soundfont as rsf
from progressive_arrangement import arrange,PRESETS
import studio_grammar as grammar
from build_studio import export_midi
ASSETS=ROOT/'dist'/'studio'; REVIEW=ROOT/'dist'/'progressive-review';REVIEW.mkdir(exist_ok=True)

def read(path):
 with wave.open(str(path),'rb') as f:return np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').reshape(-1,f.getnchannels()).astype(np.float32)/32768,f.getframerate()
def write(path,a,rate):
 with wave.open(str(path),'wb') as f:f.setnchannels(a.shape[1]);f.setsampwidth(2);f.setframerate(rate);f.writeframes((np.clip(a,-.999,.999)*32767).astype('<i2').tobytes())
def mix_stems(prefix,music,assets=None):
 assets=assets or ASSETS
 mixed=None
 for v,(gain,pan) in enumerate(zip(music['mix_gains'],music['spatial_pan'])):
  a,rate=read(assets/f'{prefix}-{v}.wav')
  limit=round(music['duration']*rate)
  if len(a)>limit:
   a=a[:limit];fade=min(int(.7*rate),len(a));a[-fade:]*=np.linspace(1,0,fade)[:,None];write(assets/f'{prefix}-{v}.wav',a,rate)
  mono=a.mean(axis=1)
  if mixed is None:mixed=np.zeros((len(a),2),np.float32)
  angle=(pan+1)*np.pi/4;mixed[:,0]+=mono*gain*np.cos(angle);mixed[:,1]+=mono*gain*np.sin(angle)
 music['mix_master_gain']=float(min(48,.72/max(.001,np.max(np.abs(mixed)))))
 mixed*=music['mix_master_gain'];write(assets/f'{prefix}-mix.wav',mixed,rate)
 return mixed,rate

def build(sample_ids=range(6)):
 sf=rsf.find_soundfont();pool=rsf._SoundFontPool.get(sf,rate=22050,gain=1.2)
 for i in sample_ids:
  path=ASSETS/f'sample{i}.json';payload=json.loads(path.read_text(encoding='utf8'))
  full_units,_=grammar.classify_units(payload['contours'],payload['width'],payload['height'])
  old=REVIEW/f'sample{i}-before.json'
  if not old.exists():
   old.write_text(json.dumps(payload['progressive'],ensure_ascii=False),encoding='utf8')
   for v in range(5):shutil.copyfile(ASSETS/f'sample{i}-progressive-{v}.wav',REVIEW/f'sample{i}-before-{v}.wav')
  versions={}
  photo_map=json.loads((ROOT/'source_photo_manifest.json').read_text(encoding='utf8'))
  pair=photo_map.get(payload.get('source_hash'));color_dna=None
  if pair:
   from color_dna import analyze
   color_dna=analyze((ROOT/pair['path']).resolve(),'verified source photograph')
  color_versions={}
  for preset in PRESETS:
   color_versions[preset]={}
   for strength in (['off','soft','mid','auto','vivid'] if color_dna and color_dna['available'] else ['auto']):
    music=arrange(payload['soul'],preset,units=full_units,color_dna=color_dna,color_strength=strength)
    prefix=f'sample{i}-progressive'+('' if preset=='nature' else '-'+preset)+('' if strength=='auto' else '-color-'+strength)
    for v in range(5):
     stem=ASSETS/f'{prefix}-{v}.wav'
     rsf.render_wav([n for n in music['notes'] if n['voice']==v],stem,sf_path=sf,total_seconds=37,rate=22050,pool=pool,normalize=False)
    mixed,rate=mix_stems(prefix,music)
    export_midi(music['notes'],ASSETS/f'{prefix}.mid',120,music['spatial_pan']);color_versions[preset][strength]=music
   music=color_versions[preset]['auto'];versions[preset]=music
   # Reference comparison always uses the automatic version.
   prefix=f'sample{i}-progressive'+('' if preset=='nature' else '-'+preset)
   mixed,rate=read(ASSETS/f'{prefix}-mix.wav')
   if i==5 and preset=='nature':
    old_mix=None
    for v in range(5):
     a,_=read(REVIEW/f'sample5-before-{v}.wav');a=a[:36*rate]
     if a.shape[1]==1:a=np.repeat(a,2,axis=1)
     if old_mix is None:old_mix=np.zeros_like(a)
     old_mix+=a*.25
    # Same integrated RMS for human comparison, preserving each original time curve.
    target=min(.1,float(np.sqrt(np.mean(mixed*mixed))))
    for name,a in [('before',old_mix),('after',mixed)]:
     gain=min(target/max(.00001,float(np.sqrt(np.mean(a*a)))),.95/max(.001,float(np.max(np.abs(a)))))
     write(REVIEW/f'sample5-{name}-listen.wav',a*gain,rate)
  payload['progressive']=versions['nature'];payload['progressive_presets']=versions;payload['progressive_colors']=color_versions;payload['color_dna']=color_dna
  photo_map=json.loads((ROOT/'source_photo_manifest.json').read_text(encoding='utf8'))
  pair=photo_map.get(payload.get('source_hash'))
  if pair:
   photo=(ROOT/pair['path']).resolve();shutil.copyfile(photo,ASSETS/f'sample{i}-original.jpg')
   payload['original_photo']=dict(url=f'studio/sample{i}-original.jpg',relationship=pair['relationship'],alignment=pair['alignment'],reveal_start=33.,reveal_end=34.)
  else:
   # No verified colour original for this sample: produce a colourised fallback
   # from its own line-art so every sample still resolves into colour at the
   # final reveal. Clearly labelled as colourised, not a real photograph.
   try:
    from PIL import Image, ImageOps
    src=ROOT/'dist'/f'sample{i}.jpg'
    if src.exists():
     gray=ImageOps.autocontrast(Image.open(src).convert('L')).resize((900,int(900*Image.open(src).height/Image.open(src).width)))
     colored=ImageOps.colorize(gray,black=(30,44,40),mid=(201,161,88),white=(244,236,214)).convert('RGB')
     colored.save(ASSETS/f'sample{i}-original.jpg',quality=90)
     payload['original_photo']=dict(url=f'studio/sample{i}-original.jpg',relationship='colorized_from_lineart',alignment='derived_from_sketch',reveal_start=33.,reveal_end=34.)
    else:
     payload.pop('original_photo',None)
   except Exception:
    payload.pop('original_photo',None)
  path.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf8')
  print('sample',i,'progressive arranged',len(payload['progressive']['notes']),flush=True)
 shutil.copyfile(ROOT/'ui'/'progressive_review.html',ROOT/'dist'/'progressive-review.html')
 shutil.copyfile(ROOT/'ui'/'progressive-compare.html',ROOT/'dist'/'progressive-compare.html')
 node=shutil.which('node') or str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
 subprocess.run([node,str(ROOT/'export_progressive_plan.cjs'),str(ASSETS/'sample5.json'),str(REVIEW/'sample5-plan.json')],check=True)
 pool.close()
if __name__=='__main__':build()
