"""Verify release files against SHA256SUMS.json after extraction."""
from pathlib import Path
import hashlib,json,sys
root=Path(__file__).resolve().parent
expected=json.loads((root/'SHA256SUMS.json').read_text(encoding='utf8'))
failures=[]
for name,digest in expected.items():
    p=root/name
    if not p.is_file():failures.append((name,'missing'));continue
    h=hashlib.sha256()
    with p.open('rb') as f:
        for part in iter(lambda:f.read(1024*1024),b''):h.update(part)
    if h.hexdigest()!=digest:failures.append((name,'changed'))
print('Verified',len(expected),'files. Failures:',len(failures))
for item in failures:print(*item)
sys.exit(bool(failures))
