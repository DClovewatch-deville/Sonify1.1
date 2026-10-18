"""Auditable image identity from several real structural paths, without random pitch seeds."""
from copy import deepcopy
import math

def extract(source,units,dna,preset):
 parents={}
 for n in source:parents.setdefault(n['source'],n)
 candidates=[u for u in (units or []) if u['id'] in parents and len(u.get('points',[]))>1]
 if not candidates:return None
 def centre(u):return [sum(p[k] for p in u['points'])/len(u['points']) for k in (0,1)]
 def score(u):return u['length']*(.6+u.get('centrality',.5))*(1.4-.5*u.get('straight',1))*(1.2 if parents[u['id']]['voice']==0 else 1)
 ranked=sorted(candidates,key=lambda u:(-score(u),u['id']));chosen=[ranked[0]]
 for u in ranked[1:]:
  if all(math.dist(centre(u),centre(v))>.13 for v in chosen):chosen.append(u)
  if len(chosen)>=3:break
 count=dna['theme_count'];pcs=[0,2,4,7,9] if preset=='nature' else [0,2,4,5,7,9,11]
 ladder=[n for n in range(60,87) if (n-dna['key_pc'])%12 in pcs]
 # A phrase travels the dominant path, visits a contrasting structure, then returns.
 sequence=[chosen[0]]*max(2,count//2)+[chosen[min(1,len(chosen)-1)]]*(count-max(2,count//2)-1)+[chosen[-1]]
 out=[];seen={}
 for i,u in enumerate(sequence):
  points=u['points'];points=points if points[0][0]<=points[-1][0] else list(reversed(points));dist=[0.]
  for a,b in zip(points,points[1:]):dist.append(dist[-1]+math.dist(a,b))
  index=seen.get(u['id'],0);seen[u['id']]=index+1;total=sequence.count(u);fraction=index/max(1,total-1)
  j=min(range(len(points)),key=lambda j:abs(dist[j]-dist[-1]*fraction));p=points[j]
  # Absolute placement is retained: do not stretch every descending roof to the same octave.
  degree=round((len(ladder)-1)*.48+(.5-p[1])*8+(p[0]-.5)*1.5)
  n=deepcopy(parents[u['id']]);n.update(source_point=list(p),pitch=ladder[max(0,min(len(ladder)-1,degree))])
  step=math.dist(p,out[-1]['source_point']) if out else .1
  n['calculation']=dict(n.get('calculation',{}),identity_version='spatial-paths-2',contour_point=j,contour_degree=degree,rhythm_weight=round(.35+min(1.4,step*4),4),mapping='absolute structural vertex height + lateral balance -> identity scale degree')
  out.append(n)
 return out
