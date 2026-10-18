"""A right-to-left, vertex-derived score. No Photo phrase or chord templates.

Every audible event has a real path vertex. Pitch is an explicit function of
that vertex's height and tangent; onset is its horizontal reading position.
"""
import math
from copy import deepcopy
import hashlib
import json

DURATION=48.
READ_START=1.2
READ_SPAN=45.
PENTA=[p for p in range(43,87) if p%12 in (2,4,6,9,11)]  # D gong pentatonic

def _anchor_score(geometry, mode='soul'):
    if mode not in ('blueprint','soul'):raise ValueError(mode)
    paths=geometry['paths']
    candidates=[]
    for path in paths:
        points=path['points']
        if len(points)<3:continue
        length=sum(math.dist(a,b) for a,b in zip(points,points[1:]))
        if length<.012:continue
        candidates.append(dict(path=path,length=length,centre=[sum(p[k] for p in points)/len(points) for k in (0,1)]))
    notes=[];used=set()
    def emit(item,j,voice,section):
        path=item['path'];pts=path['points'];point=pts[j];x,y=point
        stamp=(path['id'],j,voice)
        if stamp in used:return
        used.add(stamp)
        a,b=pts[max(0,j-1)],pts[min(len(pts)-1,j+1)]
        # Aspect-correct angle from actual picture coordinates.
        dx=(b[0]-a[0])*geometry['width'];dy=(b[1]-a[1])*geometry['height']
        angle=math.degrees(math.atan2(-dy,abs(dx)+1e-8))
        degree=round((1-y)*8)+11 if voice==1 else round((1-y)*12)+2
        tangent_step=(1 if angle>22 else -1 if angle<-22 else 0) if mode=='soul' else 0
        register=0
        index=max(0,min(len(PENTA)-1,degree+tangent_step+register))
        start=READ_START+(1-x)*READ_SPAN
        # Geometry length controls sustain; tangent and turns control articulation.
        length=item['length'];turns=len(pts)
        duration=max(.20,min(1.35,.25+length*6+(0.24 if voice else 0)))
        if mode=='blueprint':duration=min(.50,duration)
        duration=min(duration,DURATION-.8-start)
        if duration<=.08:return
        instrument='dizi' if voice==1 else 'guzheng'
        notes.append(dict(id=f'{mode}-n{len(notes):04d}',source=path['id'],source_point=list(point),
            vertex_index=j,start=round(start,6),duration=round(duration,6),voice=voice,
            pitch=PENTA[index],velocity=round(64+min(23,length*170)) if not voice else 58,
            instrument=instrument,program=107 if not voice else 73,section=section,
            note_role='geometry_anchor',
            calculation=dict(mapping='right-to-left vertex scan',x=x,y=y,
                onset_formula='1.2 + (1 - x) * 45 seconds',height_degree=degree,
                tangent_degrees=round(angle,4),tangent_step=tangent_step,register_step=register,
                scale_index=index,scale='D gong: D E F# A B',path_length=round(length,6),
                duration_formula='clamp(0.25 + length*6 + breath_voice*0.24, 0.20, 1.35)',
                arrangement='direct vertex sonification' if mode=='blueprint' else 'height + tangent phrase; no shared chord progression')))
    # 24 spatial windows, each finding its own local structures. No semantic
    # labels are inferred; bridges and boats are not hard-coded melody seeds.
    for window in range(24):
        right=1-window/24;left=right-1/24
        for slot in range(3):
            target=right-(slot+.5)/72
            ranked=[]
            for item in candidates:
                pts=item['path']['points']
                j=min(range(len(pts)),key=lambda j:abs(pts[j][0]-target))
                x,y=pts[j]
                if not left<=x<=right or abs(x-target)>.014:continue
                if not .08<y<.94:continue
                score=item['length']*(.6+.4*(1-abs(y-.5)))/(1+abs(x-target)*100)
                ranked.append((score,item,j))
            ranked.sort(key=lambda v:(-v[0],v[1]['path']['id']))
            if not ranked:continue
            # Use contrasting y layers and preserve local path identity.
            score,main,j=ranked[0]
            emit(main,j,0,window)
            if mode=='soul' and slot==1:
                other=next(((p,k) for _,p,k in ranked[1:] if abs(p['path']['points'][k][1]-main['path']['points'][j][1])>.18),None)
                if other:emit(*other,1,window)
    notes.sort(key=lambda n:(n['start'],n['voice'],n['source']))
    # Prevent same-voice overlap without inventing timing unrelated to x.
    for voice in (0,1):
        line=[n for n in notes if n['voice']==voice]
        for n,next_note in zip(line,line[1:]):n['duration']=round(max(.06,min(n['duration'],next_note['start']-n['start']-.025)),6)
    notes=[n for n in notes if n['duration']>=.10]
    fingerprint=hashlib.sha256(json.dumps([(n['source_point'],n['pitch'],n['start'],n['duration']) for n in notes],sort_keys=True).encode()).hexdigest()
    return dict(schema_version='sonify.scroll.score.v2',mode=mode,version='scroll-spatial-2',
        notes=notes,duration=DURATION,tempo=80,key_pc=2,scale_pcs=[2,4,6,9,11],
        reading=dict(start=READ_START,span=READ_SPAN,direction='right-to-left',camera='scan-centre'),
        fingerprint=fingerprint,source_method='spatially selected real vertices across 24 contiguous windows',
        image_identity='absolute vertex heights, horizontal spacing, contour tangents, path lengths',
        voice_catalog=[dict(voice=0,instrument='古筝',role='轮廓点拨弦'),dict(voice=1,instrument='笛子',role='对比轮廓呼应')],
        spatial_pan=[-.18,.22,0,0,0],shared_photo_arrangement=False)

def interval_signature(score):
    line=[n for n in score['notes'] if n['voice']==0]
    return [b['pitch']-a['pitch'] for a,b in zip(line,line[1:])]


def compose(geometry, mode='soul'):
    """Keep Photo's dense arc sampling, then schedule five traceable layers.

    Candidate geometry is retained in full. Audible selection uses explicit
    per-voice time budgets, so dense visual coverage is not mislabeled as
    thousands of simultaneous sounds.
    """
    if not geometry.get('samples'):
        return _anchor_score(geometry,mode)
    path_info={}
    for p in geometry['paths']:
        length=sum(math.dist(a,b) for a,b in zip(p['points'],p['points'][1:]))
        path_info[p['id']]=(p,length)
    buckets={}
    for sample in geometry['samples']:
        x,y=sample['point'];a=abs(sample['angle'])%math.pi
        vertical=math.pi/3<a<math.pi*2/3
        diagonal=not vertical and math.pi/6<a<math.pi*5/6
        voice=1 if vertical else 4 if diagonal else 0 if y<.28 else 2 if y>.72 else 3
        interval=(.16 if voice==1 else .045) if mode=='blueprint' else (.40 if voice==1 else .16)
        t=READ_START+(1-x)*READ_SPAN
        if not .02<x<.98 or not .025<y<.975:continue
        buckets.setdefault((int(t/interval),voice),[]).append(sample)
    used_paths={};notes=[]
    for (bucket,voice),candidates in sorted(buckets.items(),key=lambda p:(min(READ_START+(1-s['point'][0])*READ_SPAN for s in p[1]),p[0][1])):
        interval=(.16 if voice==1 else .045) if mode=='blueprint' else (.40 if voice==1 else .16)
        def rank(s):
            length=path_info[s['path']][1]
            return math.sqrt(length+.001)/(1+used_paths.get(s['path'],0)*1.7)
        s=max(candidates,key=lambda s:(rank(s),s['id']))
        pid=s['path'];used_paths[pid]=used_paths.get(pid,0)+1
        x,y=s['point'];angle=math.degrees(s['angle']);length=path_info[pid][1]
        degree=round((1-y)*8)+11 if voice==1 else round((1-y)*12)+2
        step=(1 if math.sin(s['angle'])<-.37 else -1 if math.sin(s['angle'])>.37 else 0) if mode=='soul' else 0
        index=max(0,min(len(PENTA)-1,degree+step))
        # Collapse near-simultaneous equal-pitch samples into one actual event.
        # Every retained contributor has the same mapped pitch; its geometry
        # affects the event's velocity and sustain, not merely a decorative line.
        contributors=[];seen=set()
        for other in sorted(candidates,key=lambda q:(q['id']!=s['id'],-rank(q),q['id'])):
            ox,oy=other['point']
            od=round((1-oy)*8)+11 if voice==1 else round((1-oy)*12)+2
            os=(1 if math.sin(other['angle'])<-.37 else -1 if math.sin(other['angle'])>.37 else 0) if mode=='soul' else 0
            oi=max(0,min(len(PENTA)-1,od+os))
            if oi!=index or other['path'] in seen:continue
            seen.add(other['path'])
            contributors.append(dict(source=other['path'],source_sample=other['id'],source_point=list(other['point']),
                pitch=PENTA[oi],raw_start=round(READ_START+(1-ox)*READ_SPAN,6),
                onset_offset=round((READ_START+(1-ox)*READ_SPAN)-(READ_START+(1-x)*READ_SPAN),6)))
            if len(contributors)>=18:break
        mean_length=sum(path_info[q['source']][1] for q in contributors)/max(1,len(contributors))
        duration=(.12+min(.12,mean_length*2)) if mode=='blueprint' else (.28+min(.35,mean_length*4))
        if voice==1:duration=.28+min(.30,mean_length*5)
        t=READ_START+(1-x)*READ_SPAN
        notes.append(dict(id=f'{mode}-dense-{s["id"]}',source=pid,source_point=[x,y],
            source_sample=s['id'],start=round(t,6),duration=round(duration,6),voice=voice,
            pitch=PENTA[index],velocity=(47 if mode=='blueprint' else 36)+round(min(15,length*70))+min(9,round(math.log2(max(1,len(contributors)))*2)),
            instrument='dizi' if voice==1 else 'guzheng',program=73 if voice==1 else 107,
            mix_gain=(.52 if mode=='blueprint' else .33) if voice!=1 else .55,
            note_role='dense_spatial_texture',section=int((1-x)*24),
            contributing_sources=contributors,merge_window=interval,
            calculation=dict(mapping='Photo Blueprint dense skeleton arc sample',x=x,y=y,
                onset_formula='1.2 + (1 - x) * 45 seconds',height_degree=degree,
                tangent_degrees=round(angle,4),tangent_step=step,register_step=0,scale_index=index,
                scale='D gong: D E F# A B',path_length=round(length,6),
                merged_mean_path_length=round(mean_length,6),merged_sources=len(contributors),
                duration_formula='geometry length with mode-specific sustain budget',
                arrangement='five spatial layers; actual skeleton samples; no shared Photo phrase template')))
    if mode=='soul':
        anchors=_anchor_score(geometry,mode)['notes']
        # Anchor melody remains foreground; dense geometry forms a quieter weave.
        for n in anchors:n['mix_gain']=.95;n['note_role']='geometry_anchor'
        notes.extend(anchors)
    notes.sort(key=lambda n:(n['start'],n['voice'],n['id']))
    fingerprint=hashlib.sha256(json.dumps([(n['source_point'],n['pitch'],n['start'],n['duration']) for n in notes],sort_keys=True).encode()).hexdigest()
    ids={p for n in notes for p in ([n['source']]+[q['source'] for q in n.get('contributing_sources',[])])}
    total=sum(v[1] for v in path_info.values())
    mapped=sum(path_info[p][1] for p in ids)
    stats=dict(analysis_size=[geometry['width'],geometry['height']],extracted_paths=len(path_info),
        skeleton_samples=len(geometry['samples']),audible_notes=len(notes),audible_paths=len(ids),
        audible_path_length_share=round(mapped/max(total,.001),4),
        note_roles={role:sum(n['note_role']==role for n in notes) for role in ('geometry_anchor','dense_spatial_texture')},
        layers=[dict(voice=v,notes=sum(n['voice']==v for n in notes)) for v in range(5)])
    return dict(schema_version='sonify.scroll.score.v3',version='scroll-dense-spatial-3',mode=mode,
        notes=notes,duration=DURATION,tempo=80,key_pc=2,scale_pcs=[2,4,6,9,11],
        reading=dict(start=READ_START,span=READ_SPAN,direction='right-to-left',camera='scan-centre'),
        fingerprint=fingerprint,source_method='Photo dense skeleton arc sampling across the full crop',
        image_identity='real dense sample coordinates, geometric direction, length and spatial layers',
        voice_catalog=[dict(voice=0,instrument='古筝',role='上层墨线'),dict(voice=1,instrument='笛子',role='竖向线条'),
            dict(voice=2,instrument='古筝',role='下层墨线'),dict(voice=3,instrument='古筝',role='平缓线条'),dict(voice=4,instrument='古筝',role='转折线条')],
        spatial_pan=[-.22,.18,-.34,.32,.04],shared_photo_arrangement=False,coverage=stats)
