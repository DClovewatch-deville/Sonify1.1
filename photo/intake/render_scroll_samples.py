"""Offline sampler for licensed Guzheng and Dizi note recordings.

This renders generated MIDI events, never a prerecorded musical phrase.
"""
from pathlib import Path
import sys
import json
import hashlib
import math
import wave
import numpy as np

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scroll-work/vendor'))
import soundfile as sf

RATE=24000
SAMPLE_ROOT=ROOT/'scroll-work/samples'

def render(music, output):
    sources=json.loads((SAMPLE_ROOT/'sources.json').read_text(encoding='utf8'))
    bank={}
    for item in sources['samples']:
        file=SAMPLE_ROOT/item['file']
        if hashlib.sha256(file.read_bytes()).hexdigest()!=item['sha256']:raise ValueError('Sample hash mismatch')
        signal,rate=sf.read(file,dtype='float32',always_2d=True)
        signal=signal.mean(axis=1)
        # Remove recording lead-in, not the attack. All subsequent processing
        # is recorded in the sample reference attached to each event.
        onset=np.flatnonzero(np.abs(signal)>max(.002,float(np.max(np.abs(signal)))*.035))
        if len(onset):signal=signal[max(0,onset[0]-round(rate*.004)):]
        peak=float(np.max(np.abs(signal)))
        signal=signal/max(peak,.001)
        bank.setdefault(item['instrument'],[]).append((item,signal,rate))
    out=np.zeros((round(music['duration']*RATE),2),np.float32)
    resampled={}
    for n in music['notes']:
        item,signal,rate=min(bank[n['instrument']],key=lambda s:abs(s[0]['midi']-n['pitch']))
        ratio=2**((n['pitch']-item['midi']+item['tuning']/100)/12)
        dense=n.get('note_role')=='dense_spatial_texture'
        release=(.12 if dense else .26) if n['instrument']=='guzheng' else .14
        n['release']=release
        sounding=n['duration']+release
        key=(item['file'],n['pitch'])
        if key not in resampled:
            positions=np.arange(round(2.6*RATE))*rate/RATE*ratio
            resampled[key]=np.interp(positions,np.arange(len(signal)),signal,left=0,right=0).astype(np.float32)
        sample=resampled[key][:round(sounding*RATE)].copy()
        attack=min(len(sample),round((.006 if n['instrument']=='guzheng' else .045)*RATE))
        sample[:attack]*=np.linspace(0,1,attack)
        fade=min(len(sample),round(release*RATE));sample[-fade:]*=np.linspace(1,0,fade)**1.6
        # Breath dynamics are event envelopes on the actual Dizi recording.
        if n['instrument']=='dizi':sample*=np.sin(np.linspace(.22,math.pi-.12,len(sample)))**.5
        gain=(n['velocity']/100)**1.4*(.50 if n['instrument']=='guzheng' else .28)*n.get('mix_gain',1)
        start=round(n['start']*RATE);count=min(len(sample),len(out)-start)
        angle=(music['spatial_pan'][n['voice']]+1)*math.pi/4
        out[start:start+count,0]+=sample[:count]*gain*math.cos(angle)
        out[start:start+count,1]+=sample[:count]*gain*math.sin(angle)
        n['sample']=dict(instrument=item['instrument'],file=item['file'],sha256=item['sha256'],
            original_midi=item['midi'],target_midi=n['pitch'],tuning_cents=item['tuning'],
            source=item['source'],author=item['author'],license=item['license'],
            processing='note onset trim, pitch resampling, velocity and release envelope; original CC0 preview-derived sample')
    # Short room reflections use this score's audio, not independent musical content.
    dry=out.copy()
    for delay,gain in ((.071,.08),(.113,.05),(.181,.025)):
        k=round(delay*RATE);out[k:]+=dry[:-k,::-1]*gain
    master=.79/max(.001,float(np.max(np.abs(out))))
    out*=min(6,master)
    fade=round(.9*RATE);out[-fade:]*=np.linspace(1,0,fade)[:,None]
    with wave.open(str(output),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE)
        f.writeframes((np.clip(out,-.98,.98)*32767).astype('<i2').tobytes())
    return dict(sample_sources=sources,peak=float(np.max(np.abs(out))),rms=float(np.sqrt(np.mean(out**2))),
        render='recorded Guzheng and Dizi note samples; offline resampling, no GM audio',rate=RATE)
