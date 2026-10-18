 'use strict';
// Length-based tracing keeps curves smooth and does not invent geometry.
function traceFraction(points,fraction){
 if(!points.length||fraction<=0)return [];
 if(fraction>=1)return points;
 const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
 let remaining=lengths.reduce((a,b)=>a+b,0)*fraction;const result=[points[0]];
 for(let i=0;i<lengths.length;i++){
  if(remaining>=lengths[i]){result.push(points[i+1]);remaining-=lengths[i];}
  else{const a=points[i],b=points[i+1],f=remaining/(lengths[i]||1);result.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);break;}
 }return result;
}
let soulFocus=false,heroCache=null;
function heroPhraseAt(t){
 if(!data||mode!=='soul')return null;
 const m=soulMusic();
 if(mappingSelection){const ns=mappingSelection.notes;return {notes:ns,start:mappingSelection.start,end:mappingSelection.end,voice:ns[0].voice,sources:[...new Set(ns.map(n=>n.source))]};}
 if(!playing)return null;
 // Choose one real phrase per bar, rotating the explanation across musical roles.
 const bar=240/m.tempo,slot=Math.floor(t/bar),key=data.id+'-'+soulEdition+'-'+slot;
 if(heroCache?.key===key)return heroCache.value;
 const voiceOrder=[[0,2,4,1,3],[1,0,2,3,4],[2,3,0,1,4],[3,0,1,2,4],[4,0,2,1,3]][slot%5];
 const start=slot*bar,end=Math.min(m.duration,start+bar);
 let n;
 for(const v of voiceOrder){if(active[v]===false)continue;n=m.notes.find(n=>n.voice===v&&n.start<end&&n.start+n.duration>start);if(n)break;}
 if(!n){heroCache={key,value:null};return null;}
 const ns=m.notes.filter(x=>x.phrase===n.phrase&&x.voice===n.voice);
 const value={notes:ns,start:Math.min(...ns.map(n=>n.start)),end:Math.max(...ns.map(n=>n.start+n.duration)),voice:n.voice,sources:[...new Set(ns.map(n=>n.source))]};
 heroCache={key,value};return value;
}
const heroSVG=document.createElementNS('http://www.w3.org/2000/svg','svg');
heroSVG.id='hero-link';heroSVG.setAttribute('aria-hidden','true');document.querySelector('.arrangement-grid').append(heroSVG);
function drawHeroLink(hero,t){
 const label=$('#hero-cause');
 if(soulFocus){heroSVG.replaceChildren();return;}
 if(!hero){heroSVG.replaceChildren();label.textContent=playing?'乐句留白 · 让结构与声音呼吸':'点击结构或音符，观看来源线如何成为乐句';return;}
 const n=hero.notes.find(n=>t>=n.start&&t<n.start+n.duration)||hero.notes[0],voice=hero.voice;
 const rule=voice===0?'轮廓采样 → 音阶与和声约束':voice===1?'重复结构 → 节律与和弦音':voice===2?'支撑结构 → 和弦根音与连接音':voice===3?'支撑结构 → 和声配置':'背景纹理 → 稀疏音型';
 label.textContent=`${rule} → ${nameOf(voice)} · ${hero.notes.length} 个音符`;
 label.style.setProperty('--hero-color',colorOf(voice));
 const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
 const age=t-hero.start;
 if(reduced||age<0||age>1.5||soulView!=='piano'){heroSVG.replaceChildren();return;}
 const grid=document.querySelector('.arrangement-grid').getBoundingClientRect(),sr=$('#mini-source').getBoundingClientRect(),pr=$('#piano').getBoundingClientRect();
 const viewport=$('#source-viewport').getBoundingClientRect();
 const point=n.source_point||[.5,.5],pc=$('#mini-source'),scale=Math.min((pc.width-28)/data.width,(pc.height-24)/data.height);
 const x1=sr.left-grid.left+((pc.width-data.width*scale)/2+point[0]*data.width*scale)*sr.width/pc.width;
 const y1=sr.top-grid.top+((pc.height-data.height*scale)/2+point[1]*data.height*scale)*sr.height/pc.height;
 if(y1<viewport.top-grid.top||y1>viewport.bottom-grid.top||x1<viewport.left-grid.left||x1>viewport.right-grid.left){heroSVG.replaceChildren();return;}
 const notes=soulMusic().notes,lo=Math.min(...notes.map(n=>n.pitch))-1,hi=Math.max(...notes.map(n=>n.pitch))+1;
 const pw=$('#piano').width,ph=$('#piano').height;
 const x2=pr.left-grid.left+(54+n.start/soulMusic().duration*(pw-62))*pr.width/pw;
 const y2=pr.top-grid.top+(ph-18-(n.pitch-lo)/(hi-lo)*(ph-34))*pr.height/ph;
 heroSVG.setAttribute('viewBox',`0 0 ${grid.width} ${grid.height}`);
 heroSVG.innerHTML=`<defs><marker id="hero-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="none" stroke="${colorOf(voice)}"/></marker></defs><path d="M${x1},${y1} C${x1+45},${y1} ${x2-45},${y2} ${x2},${y2}" fill="none" stroke="${colorOf(voice)}" stroke-width="2" stroke-dasharray="5 6" marker-end="url(#hero-arrow)"/>`;
}
const exhibit=document.createElement('dialog');
exhibit.id='geometry-exhibit';exhibit.setAttribute('aria-label','Soul Symphony 几何结构沉浸展演');
exhibit.innerHTML='<div class="exhibit-heading"><span>SONIFY / SOUL SYMPHONY</span><button id="exhibit-close" aria-label="关闭几何展演">×</button></div><div id="exhibit-art"></div><div id="exhibit-player"></div>';
document.body.append(exhibit);
const exhibitSource=document.querySelector('.source-companion'),exhibitTransport=document.querySelector('.transport');
const sourceHome=document.createComment('source home'),playerHome=document.createComment('player home');
exhibitSource.before(sourceHome);exhibitTransport.before(playerHome);
function setSoulFocus(on){
 const next=on&&mode==='soul';
 if(next===soulFocus)return;
 soulFocus=next;document.body.classList.toggle('soul-focus',soulFocus);
 if(soulFocus){
   sourceZoom=1;$('#source-viewport').scrollLeft=0;$('#source-viewport').scrollTop=0;
   exhibitSource.before(sourceHome);exhibitTransport.before(playerHome);
   $('#exhibit-art').append(exhibitSource);$('#exhibit-player').append(exhibitTransport);
   exhibit.showModal();$('#exhibit-close').focus();
 }else{
   if(exhibit.open)exhibit.close();sourceHome.after(exhibitSource);if(mode==='soul')playerHome.after(exhibitTransport);else marker.after(exhibitTransport);
   $('#focus-toggle').focus();
 }
 $('#focus-toggle').setAttribute('aria-pressed',String(soulFocus));$('#focus-toggle').textContent=soulFocus?'退出沉浸 · Esc':'沉浸演示';
 requestAnimationFrame(()=>{fitSourceView();if(data)draw();});
}
$('#exhibit-close').onclick=()=>setSoulFocus(false);
exhibit.addEventListener('cancel',e=>{e.preventDefault();setSoulFocus(false);});
exhibit.addEventListener('click',e=>{if(e.target===exhibit){const r=exhibit.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setSoulFocus(false);}});
$('#focus-toggle').onclick=()=>{const on=!soulFocus;setSoulFocus(on);if(on&&!playing){if(mappingSelection)leaveMapping(false);play();}};
$('#born').addEventListener('click',()=>{setSoulFocus(true);heroCache=null;},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#birth-guide').open&&soulFocus)setSoulFocus(false);});
new MutationObserver(()=>{heroCache=null;if(mode!=='soul')setSoulFocus(false);}).observe(document.body,{attributes:true,attributeFilter:['data-mode']});
$('#soul-voices').addEventListener('click',()=>{heroCache=null;});

$('#hero-start').onclick=()=>{if(mappingSelection)leaveMapping(false);setSoulFocus(true);heroCache=null;startBirthGuide();};
