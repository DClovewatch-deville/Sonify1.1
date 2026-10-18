"""Add the six verified campus exhibition photographs with their own music."""
from pathlib import Path
import json,shutil
from build_museum import ROOT,OUT,Image,renderer,studio
from build_museum_v2 import render_album,hashes
from build_museum_extensions import read_json,write_json,local,express,mix_portrait,compact_mapping,export_lab,STYLE_NAMES

ITEMS=[('15','campus-sunset','徐斯寒','夕照风雨长廊','夕光穿过云层，长廊在校园之间延伸。','strings'),
 ('16','campus-maple','徐斯寒','枫叶与景观塔','红叶围起一扇窗，熟悉的塔在秋色深处。','nature'),
 ('18','campus-promenade','薛孝廉','风雨长廊','黑白之间，屋顶与地面的线条交汇成光的秩序。','piano'),
 ('21','campus-bluehour','叶育明','华灯初上遇上风雨长廊','蓝色的暮光里，一条温暖的长廊慢慢亮起。','chamber'),
 ('23','campus-stars','张能源','星空下的校园','星轨划过夜空，校园静静留在时间之下。','strings'),
 ('24','campus-dining','周浚辉','夕阳下的餐厅','光越过百叶，在桌面留下温暖的节奏。','piano')]

def main():
    research=ROOT/'campus-source-research';sources=read_json(research/'preview-dimensions.json')
    manifest=read_json(OUT/'albums-v2.json');extensions=read_json(OUT/'museum-extensions.json')
    sf=renderer.find_soundfont();pool=renderer._SoundFontPool.get(sf,rate=22050,gain=1.2)
    generated=[]
    try:
        for number,slug,author,title,story,style in ITEMS:
            record=next(r for r in sources if r['title'].startswith(number+' '));folder=OUT/slug;folder.mkdir(exist_ok=True)
            image=Image.open(research/'review-previews'/f'{number}.jpg').convert('RGB');image.thumbnail((1920,1920));image.save(folder/'photo.jpg',quality=94)
            source=dict(page=record['url'],image=record['image_urls'][0],author=author,attribution=author,license='版权归原作者；未见开放许可声明',license_url=record['url'],changes='学校图书馆摄影展公开图片缩小为最长边1920像素；保留原构图及原有文字。',checked_at='2026-10-18',original_dimensions=[record['width'],record['height']])
            write_json(folder/'source.json',source)
            album=dict(id=slug,object_id=slug,title=title,category='校园摄影精选',tags=['校园','摄影展'],place='上海科技大学 · '+('风雨长廊' if '长廊' in title else '景观塔' if '塔' in title else '校园餐厅' if '餐厅' in title else '校园'),location_basis='学校图书馆正式摄影展题名与原作内容',story=story,source=source,image='/museum/'+slug+'/photo.jpg')
            album=render_album(album,sf,pool,hashes());geo=read_json(local(album['evidence']['geometry']));music_by_prefix={};mappings={}
            extra_dir=folder/'portrait-launch-v1';extra_dir.mkdir(exist_ok=True);url='/museum/'+slug+'/'+extra_dir.name+'/'
            for track in album['tracks']:
                if track['mode']=='blueprint':continue
                prefix=track['mode']+('-'+track['style'] if track.get('style') else '')
                music=read_json(local(track['audio']).with_name(prefix+'.json'));music_by_prefix[prefix]=music
                write_json(extra_dir/(prefix+'-mapping.json'),compact_mapping(music,geo,track['mode']));mappings[prefix]=url+prefix+'-mapping.json'
            portrait=express(music_by_prefix['progressive-'+style])
            for voice in range(5):renderer.render_wav([n for n in portrait['notes'] if n['voice']==voice],extra_dir/f'portrait-{voice}.wav',sf_path=sf,total_seconds=portrait['duration']+1,rate=22050,pool=pool,normalize=False)
            mix_portrait(extra_dir,portrait);write_json(extra_dir/'portrait.json',portrait);studio.export_midi(portrait['notes'],extra_dir/'portrait.mid',portrait['tempo'],portrait['spatial_pan'])
            write_json(extra_dir/'portrait-mapping.json',compact_mapping(portrait,geo,'portrait'));mappings['portrait']=url+'portrait-mapping.json'
            lab_url=export_lab(album,geo,music_by_prefix,portrait,extra_dir,ROOT.parent/'experiment/ui');mappings['blueprint']=url+'blueprint-mapping.json'
            track=dict(mode='portrait',style=None,label='本页肖像 · '+STYLE_NAMES[style],audio=url+'portrait-mix.wav',midi=url+'portrait.mid',duration=portrait['duration'],notes=len(portrait['notes']),color_used=True,mapping=mappings['portrait'])
            extensions['works'][slug]=dict(track=track,mappings=mappings,lab_url=lab_url,expression=portrait['museum_expression'],curator_style=style,image_sha256=album['evidence']['image_sha256'])
            generated.append(album);print('READY',slug,flush=True)
    finally:pool.close()
    ids={a['id'] for a in generated};manifest['albums']=[a for a in manifest['albums'] if a['id'] not in ids]+generated
    for name,data in [('museum-extensions.json',extensions),('albums-v2.json',manifest)]:
        temp=OUT/(name+'.tmp');write_json(temp,data);temp.replace(OUT/name)
    print('PUBLISHED six campus photographs with 42 matching editions',flush=True)

if __name__=='__main__':main()
