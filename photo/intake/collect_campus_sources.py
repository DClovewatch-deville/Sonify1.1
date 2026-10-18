"""Public source indexes only; does not publish photographs into the exhibition."""
from html.parser import HTMLParser
from urllib.request import Request,urlopen
from urllib.parse import urljoin
from pathlib import Path
import json,re,csv,concurrent.futures

OUT=Path(__file__).parent/'campus-source-research';OUT.mkdir(exist_ok=True)
class Page(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.images=[];self.active=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='a':self.active=[a.get('href',''),'']
        if tag=='img':self.images.append(a)
    def handle_data(self,data):
        if self.active:self.active[1]+=data
    def handle_endtag(self,tag):
        if tag=='a' and self.active:self.links.append(self.active);self.active=None
def fetch(url):
    with urlopen(Request(url,headers={'User-Agent':'Sonify-source-research/1.0'}),timeout=25) as r:
        text=r.read().decode('utf-8','replace');status=r.status
    p=Page();p.feed(text);return p,status

def main():
    records=[];log=[]
    cached={r['url']:r for r in json.loads((OUT/'official-works.json').read_text(encoding='utf-8'))['records']} if (OUT/'official-works.json').exists() else {}
    indexes=[('图书馆摄影展','https://library.shanghaitech.edu.cn/_t115/smcxwsssyzpz/list'+s+'.htm') for s in ['','2','3']]
    indexes += [('官网美丽校园','https://www.shanghaitech.edu.cn/mlxy/list'+s+'.htm') for s in ['','2']]
    for category,url in indexes:
        try:
            p,status=fetch(url);log.append(dict(url=url,status=status))
            for href,title in p.links:
                title=' '.join(title.split())
                if category=='图书馆摄影展':accept=bool(re.match(r'^\d+[.\s]+\S',title))
                else:accept=bool(re.search(r'/\d{4}/\d{4}/c1679a\d+/page\.',href))
                if not accept:continue
                link=urljoin(url,href)
                if any(r['url']==link for r in records):continue
                if category=='官网美丽校园':title=title.split('）')[0]+'）' if '）' in title else title
                topic=next((label for label,words in [('四季自然',['雪','秋','枫','春','生机']),('建筑地标',['塔','长廊','窗','餐厅','航拍','风景','校园']),('校园人文',['学习','期末','军训','毕业','活动','新生']),('日历设计',['日历'])] if any(w in title for w in words)),'艺术/人文待逐图分类')
                records.append(dict(category=category,title=title,topic=topic,classification_basis='题名初筛，非视觉识别',url=link,index_url=url,campus_status='需逐图确认；上科大官方发布不等于拍摄于校园',rights='未见开放许可；发布或转化展示前确认',status='目录核验'))
        except Exception as e:log.append(dict(url=url,error=str(e)))
    def inspect(r):
        if r['url'] in cached and cached[r['url']].get('http_status')==200:
            for key in ['http_status','image_urls','status']:r[key]=cached[r['url']][key]
            return r
        try:
            p,status=fetch(r['url']);r['http_status']=status
            r['image_urls']=list(dict.fromkeys(urljoin(r['url'],i.get('src','')) for i in p.images if '/_upload/article/' in i.get('src','')))
            r['status']='详情页可访问' if r['image_urls'] else '详情页可访问，未提取到正文图片'
        except Exception as e:r['error']=str(e)
        return r
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:records=list(pool.map(inspect,records))
    (OUT/'official-works.json').write_text(json.dumps(dict(checked='2026-10-17',records=records,index_checks=log),ensure_ascii=False,indent=2),encoding='utf-8')
    with (OUT/'official-works.csv').open('w',encoding='utf-8-sig',newline='') as f:
        fields=['category','title','topic','classification_basis','url','status','campus_status','rights','image_urls'];w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore');w.writeheader()
        for r in records:w.writerow(dict(r,image_urls='\n'.join(r.get('image_urls',[]))))
    lines=['# 上科大官方作品逐条索引','核验日期：2026-10-17。以下是作品/图集条目，不是可直接再发布的授权图片。', '']
    for cat,_ in indexes:
        if '## '+cat in lines:continue
        lines+=['## '+cat,'']
        for r in records:
            if r['category']==cat:lines.append('- ['+r['title']+']('+r['url']+') — '+r['status']+'；正文图片链接 '+str(len(r.get('image_urls',[])))+' 个')
        lines+=['']
    (OUT/'作品索引.md').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps(dict(total=len(records),categories={c:sum(r['category']==c for r in records) for c,_ in indexes},reachable=sum(r.get('http_status')==200 for r in records),images=sum(len(r.get('image_urls',[])) for r in records),index_checks=log),ensure_ascii=True))
if __name__=='__main__':main()
