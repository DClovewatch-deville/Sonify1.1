'use strict';
/* Read the same provenance and PCM as the player. No invented demonstration notes. */
async function loadAudio(file) {
  if (!audioCache.has(file)) {
    const task = fetch(file + '?v=' + REVISION).then(r => {
      if (!r.ok) throw new Error('音轨不可用');
      return r.arrayBuffer();
    }).then(bytes => ac.decodeAudioData(bytes));
    audioCache.set(file, task);
    task.catch(() => audioCache.delete(file));
  }
  return audioCache.get(file);
}

const sourceLayers = new WeakMap();
function miniGeometry(c, width, height, ids, color, progress=1, context=true,clear=true,lw=2.6,blur=5,alpha=.95) {
  if(clear){c.clearRect(0,0,width,height);c.fillStyle='#f4f1e6';c.fillRect(0,0,width,height);}
  const scale=Math.min((width-28)/data.width,(height-24)/data.height);
  const dw=data.width*scale,dh=data.height*scale,ox=(width-dw)/2,oy=(height-dh)/2;
  const paint=(points,ink,weight,a,fraction=1)=>{
    if(!points || !points.length)return;
    c.strokeStyle=ink;c.lineWidth=weight;c.globalAlpha=a;c.lineJoin='round';c.lineCap='round';c.beginPath();
    traceFraction(points,fraction).forEach((p,i)=>{
      const x=ox+p[0]*dw,y=oy+p[1]*dh;if(i)c.lineTo(x,y);else c.moveTo(x,y);
    });c.stroke();
    if(fraction>0&&fraction<1&&blur>0){
      const p=traceFraction(points,fraction).at(-1);
      c.fillStyle=ink;c.beginPath();c.arc(ox+p[0]*dw,oy+p[1]*dh,3.5,0,Math.PI*2);c.fill();
    }
  };
  if(context){
    let layers=sourceLayers.get(data);if(!layers){layers=new Map();sourceLayers.set(data,layers);}
    const key=width+'x'+height;
    if(!layers.has(key)){
      const layer=document.createElement('canvas');layer.width=width;layer.height=height;
      miniGeometry(layer.getContext('2d'),width,height,[],color,1,false);
      const target=c;c=layer.getContext('2d');for(const p of data.contours)paint(p.points,'#51675d',.9,.4);c=target;
      layers.set(key,layer);
    }
    c.drawImage(layers.get(key),0,0);
  }
  c.shadowColor=color;c.shadowBlur=blur;
  ids.forEach((id,i)=>{const part=Math.max(0,Math.min(1,progress*ids.length-i));if(part>0)paint(idToPoints.get(id),color,lw,alpha,part);});
  c.shadowBlur=0;c.globalAlpha=1;
}

function drawSourceCompanion(t) {
  const m=soulMusic(), sound=m.notes.filter(n=>active[n.voice]!==false&&t>=n.start&&t<n.start+n.duration);
  const chosen=mappingSelection ? mappingSelection.notes : !playing&&selectedStructure ? (notePinned&&m.notes[selected]?[m.notes[selected]]:m.notes.filter(n=>n.structure===selectedStructure)) : sound;
  const first=chosen.find(n=>n.voice===0)||chosen[0];
  const ids=[...new Set(chosen.map(n=>n.source))];
  const pc=$('#mini-source');
  miniGeometry(pc.getContext('2d'),pc.width,pc.height,[], '#49675d',1,showLines);
  if(soulFocus)for(const s of m.structures)miniGeometry(pc.getContext('2d'),pc.width,pc.height,s.geometry_ids,s.color,1,false,false,1.35,0,.38);
  // Preserve region-scale context in idle, playback, hover and note audition.
  const regionNotes=chosen.length?chosen:playing?m.notes.filter(n=>active[n.voice]!==false&&t>=n.start&&t<n.start+n.duration+.8):m.notes;
  const seenRegions=new Set();
  const roles=new Set(regionNotes.map(n=>n.structure));
  for(const role of roles){const s=m.structures.find(s=>s.id===role);if(s)miniGeometry(pc.getContext('2d'),pc.width,pc.height,s.geometry_ids,s.color,1,false,false,1.4,0,.5);}
  for(const n of regionNotes){
    const g=sourceGroup(n);if(!g||seenRegions.has(g.id))continue;seenRegions.add(g.id);
    miniGeometry(pc.getContext('2d'),pc.width,pc.height,g.sources,colorOf(n.voice),1,false,false,1.55,0,chosen.length?.7:.4);
  }
  for(const g of mappingRegions()){
    miniGeometry(pc.getContext('2d'),pc.width,pc.height,g.sources,colorOf(g.voice),1,false,false,2,0,.85);
  }
  // The precise sampled path is stronger than its whole region.
  if(first)for(let v=0;v<5;v++)miniGeometry(pc.getContext('2d'),pc.width,pc.height,[...new Set(chosen.filter(n=>n.voice===v).map(n=>n.source))],colorOf(v),1,false,false,2.7,3,.9);
  const hero=heroPhraseAt(t);
  if(hero){
    const progress=matchMedia('(prefers-reduced-motion:reduce)').matches?1:Math.max(.015,Math.min(1,(t-hero.start)/Math.max(.1,hero.end-hero.start)));
    miniGeometry(pc.getContext('2d'),pc.width,pc.height,hero.sources,colorOf(hero.voice),progress,false,false,4.8,10,1);
    drawHeroLink(hero,t);
  }else drawHeroLink(null,t);
  if(mappingHover)miniGeometry(pc.getContext('2d'),pc.width,pc.height,[mappingHover.source],colorOf(mappingHover.voice),1,false,false,4,8,1);
  const anchor=mappingSelection?.notes[0]||mappingHover;
  if(anchor&&!soulFocus){
    const points=idToPoints.get(anchor.source)||[];
    if(points.length){
      const q=points[Math.floor(points.length/2)],scale=Math.min((pc.width-28)/data.width,(pc.height-24)/data.height);
      const x=(pc.width-data.width*scale)/2+q[0]*data.width*scale,y=(pc.height-data.height*scale)/2+q[1]*data.height*scale,c=pc.getContext('2d');
      c.strokeStyle=colorOf(anchor.voice);c.lineWidth=2;c.beginPath();c.arc(x,y,10,0,Math.PI*2);c.stroke();
      c.fillStyle='#173a32';c.font='12px Segoe UI';const label='实际音符来源';const lx=Math.max(4,Math.min(pc.width-90,x-40)),ly=Math.max(18,y-16);c.fillRect(lx-3,ly-13,88,19);c.fillStyle='#fff0bf';c.fillText(label,lx,ly);
    }
  }
  $('#live-mapping').replaceChildren();
  for(let v=0;v<5;v++){
    const ns=chosen.filter(n=>n.voice===v);if(!ns.length)continue;
    const role=(m.structures.find(s=>s.id===ns[0].structure)||{}).label||'';
    const line=document.createElement('span');line.className='live-voice';line.style.setProperty('--c',colorOf(v));
    line.textContent=`${role} → ${nameOf(v)} · ${[...new Set(ns.map(n=>n.pitch))].join(' / ')}`;
    $('#live-mapping').append(line);
  }
  if(!chosen.length)$('#live-mapping').textContent='乐句留白 · 等待下一次进入';
  $('#follow-playback').hidden=!selectedStructure;
  document.querySelectorAll('.struct').forEach(b=>{
    b.classList.toggle('is-sounding',sound.some(n=>n.structure===b.dataset.struct));
    b.setAttribute('aria-pressed',String(selectedStructure===b.dataset.struct));
  });
  document.querySelectorAll('.ensemble-row').forEach(row=>row.classList.toggle('sounding',sound.some(n=>n.voice===+row.dataset.row)));
}

function guideItems() {
  const m=soulMusic();
  return ['spine','pattern','support'].map(id=>{
    const structure=m.structures.find(s=>s.id===id);
    if(!structure)return null;
    const voice=structure.voice;
    const first=m.notes.find(n=>n.structure===id&&n.voice===voice);
    if(!first)return null;
    const notes=m.notes.filter(n=>n.phrase===first.phrase&&n.voice===voice);
    const phrase=m.phrases.find(p=>p.id===first.phrase);
    const regions=(structure.geometry_ids&&structure.geometry_ids.length)
      ? structure.geometry_ids : [...new Set(notes.map(n=>n.source))];
    return {structure,voice,notes,phrase,start:Math.min(...notes.map(n=>n.start)),
      end:Math.max(...notes.map(n=>n.start+n.duration)),sources:regions,
      trace:[...new Set(notes.map(n=>n.source))]};
  }).filter(Boolean);
}
let guideEpoch=0,guideNodes=[],guideResult=null,guideReturnFocus=null;
function stopGuideAudio(){guideNodes.forEach(n=>{try{n.stop();}catch(e){}});guideNodes=[];}
function closeBirthGuide(){
  guideEpoch++;stopGuideAudio();demo=null;
  const dialog=$('#birth-guide');if(dialog&&dialog.open)dialog.close();
  if($('#born'))$('#born').textContent='▶ 观看音乐如何诞生（约 12 秒）';
  if(guideReturnFocus&&guideReturnFocus.isConnected)guideReturnFocus.focus();
  guideReturnFocus=null;
}
async function startBirthGuide(initialStep=0){
  if(typeof initialStep!=='number')initialStep=0;
  if(mode!=='soul'||!data)return;
  closeBirthGuide();halt();selectedStructure=null;
  guideReturnFocus=document.activeElement;
  const items=guideItems();if(!items.length)return;
  const epoch=++guideEpoch;
  $('#birth-guide').showModal();$('#birth-replay').hidden=true;$('#birth-listen').hidden=true;
  $('#birth-caption').textContent='正在准备三个真实乐句，声音和图形使用同一份作品数据。';
  $('#birth-audio-state').textContent='读取本地乐器片段…';
  $('#birth-progress').value=0;
  $('#birth-steps').innerHTML=items.map((it,i)=>`<button data-guide-step="${i}" disabled>${i+1} · ${it.structure.label}</button>`).join('');
  // The first frame is meaningful even while PCM is loading.
  demo={items,index:0,started:performance.now(),waiting:true,audio:[],epoch};
  try{
    ac=ac||new (window.AudioContext||window.webkitAudioContext)();await ac.resume();
    const audio=await Promise.all(items.map(it=>loadAudio(`studio/${data.id}-${soulAudioPrefix()}-${it.voice}.wav`)));
    if(epoch!==guideEpoch)return;
    demo.audio=audio;demo.waiting=false;demo.started=performance.now()-initialStep*3900;demo.lastIndex=-1;
    $('#birth-steps').querySelectorAll('button').forEach(b=>b.disabled=false);
    $('#birth-audio-state').textContent='试听原作品的独立声部 · 与演示音符同步';
  }catch(e){
    if(epoch!==guideEpoch)return;
    demo.waiting=false;demo.started=performance.now()-initialStep*3900;demo.lastIndex=-1;
    $('#birth-steps').querySelectorAll('button').forEach(b=>b.disabled=false);
    $('#birth-audio-state').textContent='音轨读取失败，可继续观看图形：'+e.message;
  }
}
function renderBirthGuide(){
 for(const id of ['birth-source','birth-motif','birth-score']){const c=$('#'+id),r=c.getBoundingClientRect(),ratio=Math.min(1.5,1400/Math.max(1,r.width),devicePixelRatio||1);if(r.width>0&&r.height>0){const w=Math.round(r.width*ratio),h=Math.round(r.height*ratio);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}}}

  if(!demo)return;
  const stepSeconds=3.9,elapsed=demo.waiting?0:(performance.now()-demo.started)/1000;
  const index=Math.min(demo.items.length-1,Math.floor(elapsed/stepSeconds));
  const local=elapsed-index*stepSeconds,item=demo.items[index],color=colorOf(item.voice);
  $('#birth-guide').dataset.stage=String(index+1);
  $('#birth-guide').dataset.phase=local<.35?'source':local<1.1?'mapping':'audition';
  if(index!==demo.lastIndex&&!demo.waiting){
    stopGuideAudio();demo.lastIndex=index;
    if(demo.audio[index]){
      const n=ac.createBufferSource(),g=ac.createGain();n.buffer=demo.audio[index];
      g.gain.value=.42;n.connect(g).connect(ac.destination);
      const length=Math.min(item.end-item.start,2.65);
      const when=ac.currentTime+1.1;
      n.start(when,item.start,length);g.gain.setValueAtTime(.42,when+Math.max(0,length-.06));
      g.gain.linearRampToValueAtTime(0,when+length);guideNodes.push(n);
    }
  }
  const u=Math.min(1,Math.max(0,(local-.35)/.8));
  const soundingTime=item.start+Math.max(0,local-1.1);
  $('#birth-steps').querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  const rule={spine:'轮廓采样，经音阶与和声约束形成主题',pattern:'重复结构提供节律，和弦音形成回应',support:'支撑结构提供锚点，根音与连接音形成低音'}[item.structure.id];
  $('#birth-caption').textContent=`${item.structure.label} → ${nameOf(item.voice)}：${local<1.1?rule:'跟随亮起的采样点，听见这组音符。'}`;
  const src=$('#birth-source');const sprog=Math.min(1,local/.8);
  miniGeometry(src.getContext('2d'),src.width,src.height,item.sources,color,sprog,true,true,1.6,0,.62);     // hero region as visible context
  miniGeometry(src.getContext('2d'),src.width,src.height,item.trace||item.sources,color,sprog,false,false,3.2,7,1); // the traced path, bright
  const sourceContext=src.getContext('2d');
  const pointScale=Math.min((src.width-28)/data.width,(src.height-24)/data.height);
  item.notes.forEach((note,i)=>{
    if(local<.3+i*.12)return;
    const p=note.source_point;if(!p)return;
    const x=(src.width-data.width*pointScale)/2+p[0]*data.width*pointScale;
    const y=(src.height-data.height*pointScale)/2+p[1]*data.height*pointScale;
    const on=local>=1.1&&soundingTime>=note.start&&soundingTime<note.start+note.duration;
    sourceContext.fillStyle=on?'#fff8d9':color;sourceContext.beginPath();sourceContext.arc(x,y,on?2.8:1.5,0,Math.PI*2);sourceContext.fill();
  });
  // Move the camera into the real path so a small fragment is still legible.
  const pathPoints=(item.trace||item.sources).flatMap(id=>idToPoints.get(id)||[]);
  if(pathPoints.length&&local>.25){
    const context=src.getContext('2d');
    const xs=pathPoints.map(p=>p[0]),ys=pathPoints.map(p=>p[1]);
    const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
    const fitScale=Math.min((src.width-28)/data.width,(src.height-24)/data.height);
    const px=(src.width-data.width*fitScale)/2+cx*data.width*fitScale;
    const py=(src.height-data.height*fitScale)/2+cy*data.height*fitScale;
    const extentX=(Math.max(...xs)-Math.min(...xs))*data.width*fitScale;
    const extentY=(Math.max(...ys)-Math.min(...ys))*data.height*fitScale;
    const targetZoom=Math.max(1,Math.min(4.5,src.width/Math.max(40,extentX*1.4),src.height/Math.max(35,extentY*1.4)));
    const z=1+Math.min(1,(local-.25)/.7)*(targetZoom-1);
    const sw=src.width/z,sh=src.height/z;
    const sx=Math.max(0,Math.min(src.width-sw,px-sw/2)),sy=Math.max(0,Math.min(src.height-sh,py-sh/2));
    context.drawImage(src,sx,sy,sw,sh,0,0,src.width,src.height);
  }
  $('#birth-source-label').textContent=`${item.structure.label} 区域 ${item.sources.length} 条结构线 · 追踪 ${(item.trace||[]).length} 条来源路径`;
  const mc=$('#birth-motif'),c=mc.getContext('2d'),w=mc.width,h=mc.height;
  c.clearRect(0,0,w,h);c.fillStyle='#102725';c.fillRect(0,0,w,h);
  const ps=item.notes.map(n=>n.pitch),lo=Math.min(...ps)-2,hi=Math.max(...ps)+2;
  const Y=p=>h-45-(p-lo)/(hi-lo)*(h-90);
  c.strokeStyle='#ffffff15';for(let j=0;j<5;j++){c.beginPath();c.moveTo(30,60+j*42);c.lineTo(w-30,60+j*42);c.stroke();}
  const pts=item.notes.map((n,i)=>{
    const p=n.source_point||[.5,.5];
    const x=35+i/Math.max(1,item.notes.length-1)*(w-70);
    return [x, (h*.2+p[1]*h*.6)*(1-u)+Y(n.pitch)*u,n];
  });
  const reveal=Math.min(pts.length,Math.max(0,(local-.35)/.7)*pts.length);
  c.strokeStyle=color;c.lineWidth=2;c.beginPath();pts.slice(0,Math.ceil(reveal)).forEach((q,i)=>i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]));c.stroke();
  for(const [i,[x,y,n]] of pts.entries()){
    c.globalAlpha=Math.max(0,Math.min(1,reveal-i));
    const on=local>=1.1&&soundingTime>=n.start&&soundingTime<n.start+n.duration;
    c.fillStyle=on?'#fff8d9':color;c.beginPath();c.ellipse(x,y,on?12:6+u*3,on?9:6,0,0,Math.PI*2);c.fill();
    c.fillStyle='#e9e4d7';c.font='18px Segoe UI';if(u>.8)c.fillText(String(n.pitch),x-11,y-18);
  }
  c.globalAlpha=1;
  $('#birth-motif-label').textContent=u<.8?'轮廓采样 → 音阶量化 → 音区与和声处理':'实际 MIDI：'+ps.join(' · ');
  const sc=$('#birth-score'),s=sc.getContext('2d');s.clearRect(0,0,sc.width,sc.height);s.fillStyle='#102725';s.fillRect(0,0,sc.width,sc.height);
  const span=Math.max(2.61,item.end-item.start);
  s.strokeStyle='#ffffff15';for(let j=0;j<5;j++){s.beginPath();s.moveTo(25,60+j*42);s.lineTo(sc.width-25,60+j*42);s.stroke();}
  item.notes.forEach((n,i)=>{
    const finalX=25+(n.start-item.start)/span*(sc.width-50),y=Y(n.pitch);
    const fly=Math.min(1,Math.max(0,(local-.6-i*.05)/.6));
    const x=-60+(finalX+60)*fly;
    const on=local>=1.1&&soundingTime>=n.start&&soundingTime<n.start+n.duration;
    s.globalAlpha=fly;s.fillStyle=color;s.shadowColor=color;s.shadowBlur=on?18:0;
    s.fillRect(x,y-6,Math.max(8,n.duration/span*(sc.width-50)),12);
  });s.globalAlpha=1;s.shadowBlur=0;
  if(local>=1.1){const x=25+Math.min(1,(local-1.1)/span)*(sc.width-50);s.strokeStyle='#fff0b4';s.beginPath();s.moveTo(x,25);s.lineTo(x,sc.height-25);s.stroke();}
  $('#birth-score-label').textContent=`${item.phrase.section} 乐章 · ${nameOf(item.voice)} · ${item.notes.length} 个真实音符`;
  $('#birth-progress').value=Math.min(1,elapsed/(stepSeconds*demo.items.length));
  if(elapsed>=stepSeconds*demo.items.length){
    guideResult=item;stopGuideAudio();demo=null;
    $('#birth-caption').textContent='同一条来源链：几何结构 → 音乐动机 → 完整作品。';
    $('#birth-replay').hidden=false;$('#birth-listen').hidden=false;
    $('#birth-audio-state').textContent='演示完成 · 可重播或进入作品';
    if($('#birth-auto').checked) enterSoulPerformance();
  }
}

function drawMotifJourney(t){
  const m=soulMusic(),pc=$('#piano'),c=pc.getContext('2d'),w=pc.width,h=pc.height;
  c.fillStyle='#102725';c.fillRect(0,0,w,h);
  const cell=w/m.phases.length,bar=240/m.tempo;
  const lo=Math.min(...m.notes.map(n=>n.pitch))-2,hi=Math.max(...m.notes.map(n=>n.pitch))+2;
  m.phases.forEach((phase,i)=>{
    const start=i===3?phase.end-2*bar:phase.start;
    const ns=m.notes.filter(n=>n.start>=start-1e-5&&n.start<start+2*bar-1e-5);
    const first=ns.find(n=>n.voice===0);if(!first)return;
    const x=i*cell+12,cw=cell-24,on=t>=phase.start&&t<phase.end;
    c.fillStyle=on?'#28463d':'#172f2c';c.fillRect(x,24,cw,h-54);
    c.fillStyle=on?'#e0b357':'#c7d5cc';c.font=(cw<170?'16':'20')+'px Segoe UI';c.fillText(cw<170?phase.id+' · '+['主题','对答','高潮','回归'][i]:phase.label,x+10,60);
    const ids=[...new Set(ns.filter(n=>n.voice===0).map(n=>n.source))];
    const path=ids.flatMap(id=>idToPoints.get(id)||[]);
    if(path.length){
      const xs=path.map(p=>p[0]),ys=path.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys);
      const dx=Math.max(.02,Math.max(...xs)-minX),dy=Math.max(.02,Math.max(...ys)-minY);
      for(const id of ids){c.strokeStyle=colorOf(0);c.lineWidth=2;c.beginPath();(idToPoints.get(id)||[]).forEach((p,j)=>{const px=x+20+(p[0]-minX)/dx*(cw-40),py=90+(p[1]-minY)/dy*65;j?c.lineTo(px,py):c.moveTo(px,py);});c.stroke();}
    }
    c.fillStyle='#9fb8ad';c.font=(cw<170?'13':'16')+'px Segoe UI';c.fillText(cw<170?'几何 ↓ 编排':'同一几何 DNA ↓ 实际编排',x+12,190);
    c.fillStyle='#ffffff08';c.fillRect(x+12,212,cw-24,133);
    ns.forEach(n=>{const nx=x+16+(n.start-start)/(2*bar)*(cw-32),ny=337-(n.pitch-lo)/(hi-lo)*118;
      c.fillStyle=colorOf(n.voice);c.fillRect(nx,ny,Math.max(3,n.duration/(2*bar)*(cw-32)),4);});
    c.fillStyle='#e8dfc4';c.font='17px Segoe UI';
    c.fillText((cw<170?['主题','对答','展开','终止']:['主题陈述','主旋律与回应交替','五声部展开','主题与终止和弦'])[i],x+12,380);
    c.fillStyle='#9fb8ad';c.font='15px Segoe UI';c.fillText(`${ns.length} 个音符 · ${new Set(ns.map(n=>n.voice)).size} 个声部`,x+12,411);
  });
  c.fillStyle='#9fb8ad';c.font='15px Segoe UI';c.fillText('每张卡展示本乐章两个小节的真实音高、时值与配器；点击可聆听。',15,h-10);
  const phase=m.phases.find(p=>t>=p.start&&t<p.end)||m.phases.at(-1);$('#section-now').textContent=phase.label;
}
$('#birth-close').onclick=closeBirthGuide;
$('#birth-guide').addEventListener('cancel',e=>{e.preventDefault();closeBirthGuide();});
$('#birth-replay').onclick=startBirthGuide;
function enterSoulPerformance(){
  closeBirthGuide();
  active=active.map(()=>true);soloVoice=null;beforeSolo=null;buildSoulPanel();voiceControls();
  offset=0;selectedStructure=null;soulView='piano';
  document.querySelectorAll('.viewtabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view==='piano')));
  $('#soul-timeline').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
  play();
}
$('#birth-listen').onclick=enterSoulPerformance;
$('#follow-playback').onclick=()=>{selectedStructure=null;notePinned=false;buildSoulPanel();draw();};
$('#birth-steps').onclick=e=>{
  const b=e.target.closest('[data-guide-step]');if(!b)return;
  if(!demo){startBirthGuide(Number(b.dataset.guideStep));return;}
  if(demo.waiting)return;
  demo.started=performance.now()-Number(b.dataset.guideStep)*3900;demo.lastIndex=-1;renderBirthGuide();
};
$('#soul-edition').onclick=e=>{
  const b=e.target.closest('[data-edition]');if(!b)return;
  closeBirthGuide();halt(true);soulEdition=b.dataset.edition;configure();
};
$('#spatial').onclick=()=>{
  spatialEnabled=!spatialEnabled;$('#spatial').setAttribute('aria-pressed',String(spatialEnabled));
  $('#spatial').textContent='空间声场 '+(spatialEnabled?'✓':'○');
  panners.forEach((p,i)=>p.pan.setTargetAtTime(spatialEnabled?[-.12,.32,-.08,-.3,.42][i]:0,ac.currentTime,.08));
};
window.addEventListener('resize',()=>{if(data&&!sampleLoading)draw();});
