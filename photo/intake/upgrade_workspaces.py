"""Refresh old runtime workspaces locally; never call image providers."""
import json
import subprocess
import sys
from pathlib import Path
from check_workspace import check

root=Path(__file__).parent/'runtime'
results=[]
for path in root.glob('*/job.json'):
    job=json.loads(path.read_text(encoding='utf-8'))
    folder=path.parent
    payload=folder/'workspace/studio/sample5.json'
    if job.get('music_status')!='completed' or not payload.exists():
        continue
    try:
        data=json.loads(payload.read_text(encoding='utf-8'))
        if not data.get('progressive_colors') or not data.get('color_dna') or data['color_dna'].get('version')!='color-dna-1.0' or not (folder/'engine-version.json').exists() or json.loads((folder/'engine-version.json').read_text(encoding='utf-8'))!=data.get('engine_hashes'):
            subprocess.run([sys.executable, str(Path(__file__).parent/'bridge.py'), str(folder)], check=True, timeout=300, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        results.append(check(folder))
        print(folder.name, 'OK', flush=True)
    except Exception as error:
        results.append(dict(job=folder.name,error=str(error)))
        print(folder.name,'FAILED',str(error),flush=True)
(root.parent/'compatibility-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
