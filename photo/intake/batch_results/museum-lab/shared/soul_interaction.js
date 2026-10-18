 'use strict';
let mappingSelection=null,mappingHover=null,mappingRestore=null,auditionNode=null,auditionToken=0;
let sourceZoom=1;
// A region is the visual context; the bright path remains the actual note source.
function sourceGroup(n){return (soulMusic().groups||[]).find(g=>g.id===n.group);}
function mappingRegions(){
 const m=soulMusic();
 if(mappingSelection)return [mappingSelection.region, ...mappingSelection.notes.map(sourceGroup)].filter(Boolean);
 if(mappingHover)return [mappingHover.region,sourceGroup(mappingHover)].filter(Boolean);
 return [];
}
function fitSourceView(){
 const el=$('#mini-source'),v=$('#source-viewport');
 if(soulFocus){const ratio=Math.min(1.5,1600/Math.max(1,v.clientWidth),1600/Math.max(1,v.clientHeight),devicePixelRatio||1),w=Math.max(1,Math.round(v.clientWidth*ratio)),h=Math.max(1,Math.round(v.clientHeight*ratio));if(el.width!==w||el.height!==h){el.width=w;el.height=h;}el.style.width=v.clientWidth+'px';el.style.height=v.clientHeight+'px';return;}
 if(el.width!==420||el.height!==560){el.width=420;el.height=560;}el.style.height='auto';
 const base=Math.min(v.clientWidth, v.clientHeight*el.width/el.height);
 el.style.width=`${base*sourceZoom}px`;el.style.maxWidth='none';
 $('#zoom-value').textContent=sourceZoom===1?'适应':Math.round(sourceZoom*100)+'%';
}
function revealSource(n){
 fitSourceView();const el=$('#mini-source'),v=$('#source-viewport'),pts=idToPoints.get(n.source)||[];
 if(sourceZoom===1||!pts.length)return;
 const q=pts[Math.floor(pts.length/2)],scale=Math.min((el.width-28)/data.width,(el.height-24)/data.height);
 const w=data.width*scale,h=data.height*scale;
 const x=((el.width-w)/2+q[0]*w)*el.clientWidth/el.width,y=((el.height-h)/2+q[1]*h)*el.clientHeight/el.height;
 v.scrollLeft=Math.max(0,x-v.clientWidth/2);v.scrollTop=Math.max(0,y-v.clientHeight/2);
}
window.addEventListener('resize',()=>{if(mode==='soul')fitSourceView();});
function cancelAudition(){auditionToken++;if(auditionNode){auditionNode.onended=null;try{auditionNode.stop();}catch{}auditionNode=null;}}
function mappingLabel(n,notes){const role=(soulMusic().structures.find(s=>s.id===n.structure)||{}).label||n.type;return `${role} → ${nameOf(n.voice)} · ${notes.length} 个音符`;}
async function auditionMapping(index,region=null){
  if(mode!=='soul'||sampleLoading)return;
  const m=soulMusic(),n=m.notes[index];if(!n)return;
  if(!mappingRestore)mappingRestore={offset:time(),playing,active:active.slice(),soloVoice,beforeSolo:beforeSolo&&beforeSolo.slice()};
  cancelAudition();halt();const request=auditionToken;
  const notes=m.notes.filter(x=>x.phrase===n.phrase&&x.voice===n.voice);
  if(!notes.length)return;
  const relation=region&&region.id!==n.group?' · 区域按同声部关联试听':'';
  const start=Math.min(...notes.map(x=>x.start)),end=Math.max(...notes.map(x=>x.start+x.duration));
  mappingSelection={index,notes,start,end,region:region||sourceGroup(n)};mappingHover=null;revealSource(n);
  selected=index;selectedStructure=n.structure;notePinned=true;offset=start;
  $('#event').value=String(index);trace();draw();
  $('#mapping-replay').hidden=false;$('#mapping-return').hidden=false;
  $('#mapping-feedback').textContent=mappingLabel(n,notes)+relation+` · ${(end-start).toFixed(1)} 秒 · 正在准备试听…`;
  try{
    ac=ac||new(window.AudioContext||window.webkitAudioContext)();await ac.resume();
    const buffer=await loadAudio(`studio/${data.id}-${soulAudioPrefix()}-${n.voice}.wav`);
    if(request!==auditionToken)return;
    const src=ac.createBufferSource(),g=ac.createGain();src.buffer=buffer;
    g.gain.value=gainFor(n.voice);src.connect(g).connect(ac.destination);
    const span=Math.min(5.5,end-start+.18,buffer.duration-start);
    src.start(0,start,span);auditionNode=src;
    $('#mapping-feedback').textContent=mappingLabel(n,notes)+relation+` · 正在试听 ${span.toFixed(1)} 秒（${n.section} 段）`;
    const began=ac.currentTime;
    const tick=()=>{if(request!==auditionToken||!auditionNode)return;offset=Math.min(end,start+ac.currentTime-began);draw();requestAnimationFrame(tick);};tick();
    src.onended=()=>{if(request!==auditionToken)return;auditionNode=null;$('#mapping-feedback').textContent=mappingLabel(n,notes)+(region&&region.id!==n.group?' · 该区域按同声部关联试听；亮线为实际音符来源':' · 整块为来源区域，亮线为实际音符来源')+' · 试听结束';};
  }catch(e){if(request===auditionToken)$('#mapping-feedback').textContent='试听失败：'+e.message;}
}
function leaveMapping(resume=false){
  cancelAudition();const saved=mappingRestore;mappingRestore=null;mappingSelection=null;mappingHover=null;
  selectedStructure=null;notePinned=false;
  if(saved){offset=saved.offset;active=saved.active;soloVoice=saved.soloVoice;beforeSolo=saved.beforeSolo;buildSoulPanel();voiceControls();}
  $('#mapping-return').hidden=true;$('#mapping-replay').hidden=true;
  $('#mapping-feedback').textContent='靠近结构查看提示，点击试听；放大后可拖动。';
  draw();if(resume)play();
}
$('#mapping-replay').onclick=()=>mappingSelection&&auditionMapping(mappingSelection.index,mappingSelection.region);
$('#mapping-return').onclick=()=>leaveMapping(true);
$('#follow-playback').onclick=()=>leaveMapping(!!mappingRestore?.playing);
// Distance is measured against actual path segments, never against a distant sample.
function hitSource(el,event){
  const rect=el.getBoundingClientRect(),small=el.id==='mini-source';
  const cw=small?el.width:W,ch=small?el.height:H;
  const x=(event.clientX-rect.left)*cw/rect.width,y=(event.clientY-rect.top)*ch/rect.height;
  const scale=small?Math.min((cw-28)/data.width,(ch-24)/data.height):0;
  const f=small?{w:data.width*scale,h:data.height*scale,ox:(cw-data.width*scale)/2,oy:(ch-data.height*scale)/2}:fit;
  let best=9*cw/rect.width,pick=null;const m=soulMusic(),now=mappingRestore?.offset??time();
  const phase=m.phases.find(p=>now>=p.start&&now<p.end)||m.phases[0];
  const preferred=(notes)=>notes.find(n=>n.section===phase.id)||notes[0];
  const candidates=new Map();
  // Every extracted group is inspectable. Unused groups explicitly audition a related voice.
  for(const region of m.groups||[]){
    const own=m.notes.filter(n=>n.group===region.id);
    const n=preferred(own.length?own:m.notes.filter(n=>n.voice===region.voice));
    if(!n)continue;
    const candidate={note:n,index:m.notes.indexOf(n),region,related:!own.length};
    for(const id of region.sources)candidates.set(id,candidate);
  }
  // Direct note provenance takes precedence when a path is shared.
  m.notes.forEach((n,i)=>{const old=candidates.get(n.source);if(!old||old.note.source!==n.source||n.section===phase.id&&old.note.section!==phase.id)candidates.set(n.source,{note:n,index:i,region:sourceGroup(n),related:false});});
  for(const [id,candidate] of candidates){const pts=idToPoints.get(id)||[];
    for(let j=1;j<pts.length;j++){const a=pts[j-1],b=pts[j];const ax=f.ox+a[0]*f.w,ay=f.oy+a[1]*f.h,bx=f.ox+b[0]*f.w,by=f.oy+b[1]*f.h;
      const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
      const d=Math.hypot(x-ax-t*dx,y-ay-t*dy);if(d<best){best=d;pick=candidate;}
    }
  }return pick;
}
function wireSource(el){let drag=null,moved=false;
  el.addEventListener('pointerdown',e=>{if(mode!=='soul')return;moved=false;drag={x:e.clientX,y:e.clientY,left:el.parentElement.scrollLeft,top:el.parentElement.scrollTop};el.setPointerCapture(e.pointerId);});
  el.addEventListener('pointermove',e=>{if(mode!=='soul'||!data)return;
    if(drag&&sourceZoom>1&&el.id==='mini-source'){
      if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)moved=true;
      if(moved){el.parentElement.scrollLeft=drag.left-(e.clientX-drag.x);el.parentElement.scrollTop=drag.top-(e.clientY-drag.y);return;}
    }
    const hit=hitSource(el,e);mappingHover=hit?{...hit.note,region:hit.region}:null;el.style.cursor=hit?'pointer':sourceZoom>1?'grab':'default';
    if(!mappingSelection)$('#mapping-feedback').textContent=hit?mappingLabel(hit.note,soulMusic().notes.filter(n=>n.phrase===hit.note.phrase&&n.voice===hit.note.voice))+(hit.related?' · 同声部关联区域，点击试听':' · 来源区域，点击试听'):'这里是留白，请点击图像结构区域。';draw();
  });
  el.addEventListener('pointerup',e=>{drag=null;if(mode!=='soul'||moved)return;const hit=hitSource(el,e);if(hit)auditionMapping(hit.index,hit.region);else $('#mapping-feedback').textContent='这里是留白，请点击图像中的结构线。';});
  el.addEventListener('pointercancel',()=>{drag=null;});
  el.addEventListener('pointerleave',()=>{mappingHover=null;if(data)draw();});
}
wireSource(canvas);wireSource($('#mini-source'));
document.querySelector('.image-tools').onclick=e=>{const action=e.target.dataset.zoom;if(!action)return;
 sourceZoom=action==='fit'?1:Math.max(1,Math.min(3,sourceZoom+(action==='in'?.5:-.5)));
 const el=$('#mini-source');fitSourceView();
 if(sourceZoom===1){el.parentElement.scrollLeft=0;el.parentElement.scrollTop=0;}
};
// Keep listeners intact and cancel local previews before mode, edition or sample changes.
for(const selector of ['nav','#sample','#soul-edition','#born','#play','#stop','#chapters','#seek','#structure-list','#soul-voices']){
 $(selector).addEventListener(selector==='#sample'?'change':selector==='#seek'?'input':'click',()=>{if(mappingSelection)leaveMapping(false);},true);
}
// Move the existing controls rather than duplicating players or state.
const transport=document.querySelector('.transport'),timeline=$('#soul-timeline'),work=document.querySelector('.work');
const marker=document.createComment('original transport position');transport.before(marker);
const updateLayout=()=>{if(mode==='soul'){timeline.prepend(transport);$('#grammar-details').open=false;requestAnimationFrame(fitSourceView);}else marker.after(transport);};
new MutationObserver(updateLayout).observe(document.body,{attributes:true,attributeFilter:['data-mode']});updateLayout();
