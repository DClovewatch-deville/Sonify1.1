"""Fetch audio data only; retain licenses and exact download hashes."""
from pathlib import Path
import urllib.request
import re
import json
import hashlib

ROOT=Path(__file__).resolve().parent/'scroll-work/samples'
ROOT.mkdir(parents=True,exist_ok=True)
def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'SonifyScroll/2.0'}),timeout=60).read()

base='https://raw.githubusercontent.com/sparklecatta-lang/XSXB-Band-Samples/'
commit=json.loads(fetch('https://api.github.com/repos/sparklecatta-lang/XSXB-Band-Samples/commits/main'))['sha']
raw=base+commit+'/'
metadata=json.loads(fetch(raw+'instrument.json'))
guzheng=next(i for i in metadata['instruments'] if i['id']=='guzheng')
records=[]
for sample in guzheng['samples']:
    if sample.get('rr',sample.get('roundRobin',1))!=1:continue
    if not 45<=sample['midi']<=81:continue
    # One sample per original pitch, retain its own tuning metadata.
    if any(r['instrument']=='guzheng' and r['midi']==sample['midi'] for r in records):continue
    path=sample.get('file',sample.get('path'))
    if not path:raise ValueError(str(sample))
    url=raw+path
    file=ROOT/Path(path).name
    if not file.exists():file.write_bytes(fetch(url))
    records.append(dict(instrument='guzheng',midi=sample['midi'],file=file.name,
        tuning=sample.get('tuneCents',sample.get('tune',sample.get('tuning',0))),
        metadata=sample,url=url,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
        author='Pufermufin; sample cuts by sparklecatta-lang',license='CC0-1.0',
        source='https://freesound.org/people/Pufermufin/sounds/396868/',
        changes='CC0 recording sliced by upstream library; resampled and enveloped by Sonify'))
    print('Guzheng',sample['midi'],flush=True)

# Public CC0 preview audio. Do not use a prerecorded musical loop as the score.
page='https://freesound.org/people/Hypnotriod/sounds/384954/'
html=fetch(page).decode('utf8')
(ROOT/'dizi-source.html').write_text(html,encoding='utf8')
if not ('creativecommons.org/publicdomain/zero' in html or 'Creative Commons 0' in html):
    raise ValueError('Dizi license not verified')
urls=re.findall(r'https://[^\s"<>]+(?:hq\.mp3|hq\.ogg)',html)
if not urls:raise ValueError('Dizi preview not found')
url=next((u for u in urls if u.endswith('hq.mp3')),urls[0])
file=ROOT/'dizi-79.mp3'
if not file.exists():file.write_bytes(fetch(url))
records.append(dict(instrument='dizi',midi=79,file=file.name,tuning=0,url=url,
    sha256=hashlib.sha256(file.read_bytes()).hexdigest(),author='Hypnotriod',license='CC0-1.0',
    source=page,changes='CC0 public preview of one sampled note; pitch shifted and enveloped by Sonify'))
(ROOT/'sources.json').write_text(json.dumps(dict(repository_commit=commit,samples=records),ensure_ascii=False,indent=2),encoding='utf8')
print('Ready samples',len(records),flush=True)
