 'use strict';
let mappingSelection=null,mappingHover=null,mappingRestore=null,auditionNode=null,auditionToken=0;
let sourceZoom=1;
const listeningDialog=document.createElement('dialog');listeningDialog.id='listening-dialog';listeningDialog.setAttribute('aria-label','我想听这里 自选结构');
listeningDialog.innerHTML='<header><div><small>SOUL SYMPHONY / YOUR LISTENING</small><h2>我想听这里</h2><p>框选结构并改派角色，再播放「系统默认」与「用户修改」比较。</p></div><button id="listening-close">关闭 · Esc</button></header><div class="listening-layout"><div id="listening-source"></div><div id="listening-result"><div id="listening-empty"><small>从你关注的地方开始</small><h3>点图中的线条或编号声部</h3><p>我们会标出来源区域、实际路径，并播放对应的真实乐句。</p></div><div id="listening-detail"></div><p class="listening-help">乐句在作品中的位置</p><div id="listening-score"></div></div></div>';
document.body.append(listeningDialog);
const listeningHomes=new Map();
function moveListeningElement(selector,destination){const el=$(selector),home=document.createComment('listening return');el.before(home);listeningHomes.set(el,home);$(destination).append(el);}
function closeListening(resume=false){
 if(typeof roleDrawMode!=='undefined'){roleDrawMode=false;roleInputMode='';syncRoleInputMode();}
 if(!listeningDialog.open)return;
 if(mappingSelection)leaveMapping(resume);
 listeningDialog.close();
 for(const [el,home] of listeningHomes){home.after(el);home.remove();}listeningHomes.clear();
 document.body.classList.remove('listening-focus','color-proof-open');
 fitSourceView();draw();$('#choose-listening').focus({preventScroll:true});
}
$('#listening-close').onclick=()=>closeListening(!!mappingRestore?.playing);
listeningDialog.addEventListener('cancel',e=>{e.preventDefault();closeListening(!!mappingRestore?.playing);});

function listeningChoices(m){
 return [0,1,2,3,4].map(voice=>m.notes.find(n=>n.voice===voice)).filter(Boolean).map((n,i)=>({number:i+1,index:m.notes.indexOf(n),note:n}));
}
function listeningMarkers(m,f,width,height){
 const used=[];
 return listeningChoices(m).flatMap(choice=>{
  const pts=idToPoints.get(choice.note.source)||[];if(!pts.length)return [];
  const q=pts[Math.floor(pts.length/2)],anchor=[f.ox+q[0]*f.w,f.oy+q[1]*f.h];let [x,y]=anchor;
  while(used.some(p=>Math.hypot(p[0]-x,p[1]-y)<23))y-=25;
  y=Math.max(14,Math.min(height-14,y));x=Math.max(14,Math.min(width-14,x));used.push([x,y]);
  return [{...choice,x,y,anchor}];
 });
}
function mappingEvidence(m,index,region,clickedPath){
 const n=m.notes[index],notes=m.notes.filter(x=>x.phrase===n.phrase&&x.voice===n.voice);
 const sources=[...new Set(notes.map(x=>x.source))];
 const related=clickedPath?!sources.includes(clickedPath):!!region&&!sources.some(id=>region.sources.includes(id));
 return {notes,sources,related,start:Math.min(...notes.map(x=>x.start)),end:Math.max(...notes.map(x=>x.start+x.duration))};
}
function buildListeningChoices(){
 if(!data||mode!=='soul')return;
 const root=$('#listening-choices');root.replaceChildren();
 for(const choice of listeningChoices(soulMusic())){
  const b=document.createElement('button');b.type='button';b.dataset.listenIndex=choice.index;b.style.setProperty('--choice-color',colorOf(choice.note.voice));
  b.textContent=`${choice.number} · ${nameOf(choice.note.voice)}`;b.setAttribute('aria-pressed','false');root.append(b);
 }
 $('#mapping-proof').hidden=true;
 $('#mapping-feedback').textContent='点击图中结构，或选一个编号声部，试听已有乐句。淡彩是区域，亮线是乐句的实际来源。';
}
function updateMappingProof(n,evidence,region,clickedPath){
 $('#mapping-proof').hidden=false;$('#listening-empty').hidden=true;
 $('#proof-relation').textContent=evidence.related?'同声部关联试听':'实际来源试听';
 $('#proof-relation').dataset.relation=evidence.related?'related':'direct';
 $('#proof-region').textContent=region?`${region.label||'所选区域'} · ${region.sources.length} 条结构线`:'音符对应的来源区域';
 $('#proof-path').textContent=`${evidence.sources.length} 条亮线 · ${evidence.sources.join('、')}`;
 $('#proof-explanation').textContent=evidence.related?'你点击的线尚未直接用于这段音乐。现在试听同声部的已有乐句；发光路径标出了它真正的来源。':'你选择的实际来源已高亮。区域内其余线条提供空间上下文，并非每条线都发声。';
 $('#proof-phrase').textContent=`${nameOf(n.voice)} · ${n.section} 段 · ${evidence.notes.length} 音 · ${evidence.start.toFixed(1)}–${evidence.end.toFixed(1)} 秒`;
 const pitches=$('#proof-notes');pitches.replaceChildren();
 evidence.notes.forEach(note=>{const chip=document.createElement('span');chip.textContent=String(note.pitch);chip.title=`MIDI ${note.pitch} · ${note.duration.toFixed(2)} 秒`;pitches.append(chip);});
 document.querySelectorAll('[data-listen-index]').forEach(b=>b.setAttribute('aria-pressed',String(soulMusic().notes[Number(b.dataset.listenIndex)]?.voice===n.voice)));
}
function updateProofPlayback(t){
 if(!mappingSelection)return;
 [...$('#proof-notes').children].forEach((chip,i)=>{const n=mappingSelection.notes[i];chip.classList.toggle('is-current',t>=n.start&&t<n.start+n.duration);});
}
function exploreListening(){
 if(typeof initRoleEditor==='function')initRoleEditor();
 if(mode!=='soul'||sampleLoading)return;
 if(mappingSelection)leaveMapping(false);
 halt();sourceZoom=1;showLines=true;selectedStructure=null;notePinned=false;
 $('#lines').setAttribute('aria-pressed','true');$('#lines').textContent='几何连线 ✓';
 buildStatic();fitSourceView();draw();
 $('#soul-timeline').classList.add('is-exploring');
 if(!listeningDialog.open){moveListeningElement('.source-companion','#listening-source');moveListeningElement('#listening-evidence','#listening-detail');moveListeningElement('#piano','#listening-score');listeningDialog.showModal();document.body.classList.add('listening-focus','color-proof-open');}
 $('#listening-empty').hidden=false;fitSourceView();draw();
 $('#mapping-feedback').textContent='你想先听哪里？点图中的结构，或选编号声部。这里探索的是当前作品的真实乐句。';

 $('#listening-choices button')?.focus({preventScroll:true});
}
$('#choose-listening').onclick=exploreListening;
$('#choose-listening-inline').onclick=exploreListening;
$('#listening-choices').onclick=e=>{const b=e.target.closest('[data-listen-index]');if(!b)return;const index=Number(b.dataset.listenIndex),n=soulMusic().notes[index];auditionMapping(index,sourceGroup(n),n.source);};
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
 if(listeningDialog.open){const width=680,height=Math.round(680*data.height/data.width+28);if(el.width!==width||el.height!==height){el.width=width;el.height=height;}el.style.width=Math.min(v.clientWidth,innerHeight*.53*width/height)+'px';el.style.maxWidth='100%';el.style.height='auto';return;}
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
async function auditionMapping(index,region=null,clickedPath=null){
  if(mode!=='soul'||sampleLoading)return;
  const m=soulMusic(),n=m.notes[index];if(!n)return;
  if(!mappingRestore)mappingRestore={offset:time(),playing,active:active.slice(),soloVoice,beforeSolo:beforeSolo&&beforeSolo.slice()};
  cancelAudition();halt();const request=auditionToken;
  const evidence=mappingEvidence(m,index,region,clickedPath),notes=evidence.notes;
  if(!notes.length)return;
  const relation=evidence.related?' · 同声部关联试听':' · 实际来源试听';
  const start=Math.min(...notes.map(x=>x.start)),end=Math.max(...notes.map(x=>x.start+x.duration));
  mappingSelection={index,notes,start,end,region:region||sourceGroup(n),clickedPath,related:evidence.related};mappingHover=null;revealSource(n);
  updateMappingProof(n,evidence,mappingSelection.region,clickedPath);
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
    $('#mapping-feedback').dataset.audioStart=start.toFixed(3);$('#mapping-feedback').dataset.audioDuration=span.toFixed(3);
    const tick=()=>{if(request!==auditionToken||!auditionNode)return;offset=Math.min(end,start+ac.currentTime-began);updateProofPlayback(offset);draw();requestAnimationFrame(tick);};tick();
    src.onended=()=>{if(request!==auditionToken)return;auditionNode=null;updateProofPlayback(Infinity);$('#mapping-feedback').textContent=mappingLabel(n,notes)+relation+' · 试听结束，可选另一处比较或继续作品';};
  }catch(e){if(request===auditionToken)$('#mapping-feedback').textContent='试听失败：'+e.message;}
}
function leaveMapping(resume=false){
  cancelAudition();const saved=mappingRestore;mappingRestore=null;mappingSelection=null;mappingHover=null;
  selectedStructure=null;notePinned=false;
  $('#mapping-proof').hidden=true;
  document.querySelectorAll('[data-listen-index]').forEach(b=>b.setAttribute('aria-pressed','false'));
  if(saved){offset=saved.offset;active=saved.active;soloVoice=saved.soloVoice;beforeSolo=saved.beforeSolo;buildSoulPanel();voiceControls();}
  $('#mapping-return').hidden=true;$('#mapping-replay').hidden=true;
  $('#mapping-feedback').textContent='靠近结构查看提示，点击试听；放大后可拖动。';
  draw();if(resume)play();
}
$('#mapping-replay').onclick=()=>mappingSelection&&auditionMapping(mappingSelection.index,mappingSelection.region,mappingSelection.clickedPath);
$('#mapping-return').onclick=()=>listeningDialog.open?closeListening(true):leaveMapping(true);
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
  if(small&&typeof playing!=='undefined'&&!playing&&typeof mappingSelection!=='undefined'&&!mappingSelection){
    for(const marker of listeningMarkers(m,f,cw,ch))if(Math.hypot(x-marker.x,y-marker.y)<13*cw/rect.width)return {note:marker.note,index:marker.index,region:sourceGroup(marker.note),clickedPath:marker.note.source,related:false};
  }
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
      const d=Math.hypot(x-ax-t*dx,y-ay-t*dy);if(d<best){best=d;pick={...candidate,clickedPath:id,related:candidate.note.source!==id};}
    }
  }return pick;
}
function wireSource(el){let drag=null,moved=false;
  el.addEventListener('pointerdown',e=>{if(mode!=='soul'||typeof roleDrawMode!=='undefined'&&(roleDrawMode||roleInputMode==='system'))return;moved=false;drag={x:e.clientX,y:e.clientY,left:el.parentElement.scrollLeft,top:el.parentElement.scrollTop};el.setPointerCapture(e.pointerId);});
  el.addEventListener('pointermove',e=>{if(mode!=='soul'||!data||typeof roleDrawMode!=='undefined'&&(roleDrawMode||roleInputMode==='system'))return;
    if(drag&&sourceZoom>1&&el.id==='mini-source'){
      if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)moved=true;
      if(moved){el.parentElement.scrollLeft=drag.left-(e.clientX-drag.x);el.parentElement.scrollTop=drag.top-(e.clientY-drag.y);return;}
    }
    const hit=hitSource(el,e);mappingHover=hit?{...hit.note,region:hit.region}:null;el.style.cursor=hit?'pointer':sourceZoom>1?'grab':'default';
    if(!mappingSelection)$('#mapping-feedback').textContent=hit?mappingLabel(hit.note,soulMusic().notes.filter(n=>n.phrase===hit.note.phrase&&n.voice===hit.note.voice))+(hit.related?' · 同声部关联区域，点击试听':' · 来源区域，点击试听'):'这里是留白，请点击图像结构区域。';draw();
  });
  el.addEventListener('pointerup',e=>{drag=null;if(mode!=='soul'||moved||typeof roleDrawMode!=='undefined'&&(roleDrawMode||roleInputMode==='system'))return;const hit=hitSource(el,e);if(hit)auditionMapping(hit.index,hit.region,hit.clickedPath);else $('#mapping-feedback').textContent='这里是留白。可以点彩色结构，或用编号声部直接试听。';});
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
