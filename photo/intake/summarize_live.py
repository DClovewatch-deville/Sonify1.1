"""Preserve first-attempt failures and link verified recovered live outputs."""
import hashlib,html,json
from pathlib import Path

p=Path(__file__).resolve().parent/'batch_results'/'seedream-live-verification'
runtime=p.parent.parent/'runtime'
first=json.loads((p/'live-1.json').read_text(encoding='utf-8'))
batch=json.loads((p/'live-5.json').read_text(encoding='utf-8'))
retry=json.loads((p/'retry-failed.json').read_text(encoding='utf-8'))
last=json.loads((p/'final-retry.json').read_text(encoding='utf-8'))
fixed={j['prior_id']:j for j in retry['jobs'] if j['status']=='completed'}
for old in batch['jobs']:
    if old['status']=='failed' and old['id'] not in fixed:fixed[old['id']]=last['job']
final=[];cards=[]
for i,old in enumerate(batch['jobs'],1):
    job=fixed.get(old['id'],old);folder=runtime/job['id']
    payload=json.loads((folder/'workspace/studio/sample5.json').read_text(encoding='utf-8'))
    ids={x['id'] for x in payload['contours']}
    assert all(n['source'] in ids for mode in ('soul','soul_demo','progressive') for n in payload[mode]['notes'])
    assert payload['source_hash']==hashlib.sha256((folder/'structural.png').read_bytes()).hexdigest()
    for mode in ('soul','soul-demo','progressive'):
        for voice in range(5):assert (folder/f'workspace/studio/sample5-{mode}-{voice}.wav').stat().st_size>44
    final.append(dict(filename=old['filename'],initial_status=old['status'],initial_error_code=old.get('error_code'),
        final_job_id=job['id'],final_status=job['status'],music_status=job['music_status'],api_metrics=job['api_metrics'],source_ids_valid=True))
    cards.append(f'<article><h2>{i:02d} · {html.escape(old["filename"])}</h2><div><img src="/media/{job["id"]}/original.png"><img src="/media/{job["id"]}/artistic.png"></div><p>云端生成 {job["api_metrics"]["elapsed_seconds"]} 秒 · 首轮 {old["status"]}</p><a href="/works/{job["id"]}/studio.html">打开完整作品 ↗</a></article>')
summary=dict(model=first['model'],single_cloud_seconds=first['jobs'][0]['api_metrics']['elapsed_seconds'],
    single_end_to_end_seconds=first['total_seconds'],first_batch_success_count=3,
    first_batch_total_seconds=batch['total_seconds'],eventual_success_count=5,initial_failures_preserved=True,jobs=final)
(p/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(p/'index.html').write_text('''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seedream Flash · 真实API测试</title><style>body{background:#f6f5ef;color:#294337;font:14px/1.8 sans-serif;margin:24px}article{background:white;border-radius:12px;padding:20px;margin:20px 0}h2{font-size:15px}article div{display:flex;gap:20px}img{width:45%;height:320px;object-fit:contain}a{color:#456c50}</style><h1>Seedream Flash · 真实API测试</h1><p>单张云生成13.224秒，完整链路21.734秒。首轮五张并行3/5成功，总计34.392秒；失败项定向重试后5/5均完成音乐。不能将重试后的结果称为首轮全成功或稳定并发。</p><p><a href="summary.json">完整汇总</a> · <a href="live-5.json">首轮原始结果</a></p>'''+''.join(cards),encoding='utf-8')
print('Live API gallery saved; provenance and required audio verified for five outputs.')
