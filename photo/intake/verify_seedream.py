"""Check readiness or explicitly run a 1–5 image live Ark verification."""
from pathlib import Path
import argparse,json,time,sys
from server import Pipeline,ROOT
import seedream


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    parser=argparse.ArgumentParser()
    parser.add_argument('--execute',action='store_true',help='Actually call the metered API')
    parser.add_argument('--count',type=int,choices=range(1,6),default=1)
    parser.add_argument('--input-dir',type=Path,default=ROOT.parent/'上传测试图')
    args=parser.parse_args()
    out=ROOT/'batch_results'/'seedream-live-verification';out.mkdir(parents=True,exist_ok=True)
    report=dict(status='not_executed',model=Pipeline.load_config().get('ark_model') or seedream.DEFAULT_MODEL,
        key_configured=bool(seedream.key(ROOT)),requested_images=args.count,
        note='此报告不含API Key。手机软件效果不代表API表现。')
    if not report['key_configured']:
        report.update(status='blocked',blocker='missing_api_key',action='在本地ark.local.env配置ARK_API_KEY，确认方舟账号验证、模型权限和额度。')
    elif args.execute:
        pipeline=Pipeline(config=Pipeline.load_config());started=time.perf_counter();jobs=[]
        try:
            files=sorted(p for p in args.input_dir.iterdir() if p.suffix.lower() in ('.jpg','.jpeg','.png'))[:args.count]
            if len(files)!=args.count:raise ValueError('测试输入数量不足。')
            for file in files:
                job=pipeline.create(file.read_bytes(),'seedream');jobs.append(dict(filename=file.name,id=job['id']))
            pipeline.pool.shutdown(wait=True)
            results=[dict(filename=j['filename'],**pipeline.snapshot(j['id'])) for j in jobs]
            report.update(status='finished',total_seconds=round(time.perf_counter()-started,3),jobs=results,
                success_count=sum(j['status']=='completed' and j['music_status']=='completed' for j in results),
                failed_count=sum(j['status']!='completed' or j['music_status']!='completed' for j in results))
        finally:pipeline.pool.shutdown(wait=True)
    (out/f'live-{args.count}.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='jobs'},ensure_ascii=False))
    return 2 if report['status']=='blocked' else 1 if report.get('failed_count') else 0


if __name__=='__main__':raise SystemExit(main())
