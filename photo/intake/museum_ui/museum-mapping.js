/* Optional photography mapping. No Scroll globals, paths or player are used. */
(() => {
 'use strict';
 const reader=document.getElementById('reader'),audio=document.getElementById('player'),mat=reader.querySelector('.photo-mat'),image=document.getElementById('page-image');
 const canvas=document.createElement('canvas');canvas.className='museum-mapping-overlay';canvas.setAttribute('aria-hidden','true');canvas.hidden=true;mat.append(canvas);
 const context=canvas.getContext('2d');
 const overview=document.createElement('canvas');
 const toggle=document.createElement('button');toggle.className='room-link';toggle.id='mapping-toggle';toggle.textContent='看见声音来源';toggle.setAttribute('aria-pressed','false');reader.querySelector('.room-actions').insertBefore(toggle,document.getElementById('info-button'));
 const caption=document.createElement('div');caption.className='museum-mapping-caption';caption.hidden=true;
 const live=document.createElement('span'),explore=document.createElement('a');explore.textContent='到 Photo 探究 ↗';explore.className='museum-photo-link';caption.append(live,explore);mat.after(caption);
 const deeper=document.createElement('p');deeper.className='museum-deeper';const deeperLink=document.createElement('a');deeperLink.textContent='带着这张照片，到 Photo 实验室探究 ↗';deeper.append(deeperLink);document.getElementById('colophon').append(deeper);
 let enabled=false,data=null,paths=new Map(),track=null,work=null,revision=0,frame=0,lastTime=-1;
 const cache=new Map(),colors=['#f4d28a','#94ddcf','#b6d598','#d8bbe7','#f3b19a'];
 function clear(){context.clearRect(0,0,canvas.width,canvas.height);canvas.dataset.activeSources='0';}
 function fit(){const r=mat.getBoundingClientRect(),scale=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(r.width*scale);canvas.height=Math.round(r.height*scale);context.setTransform(scale,0,0,scale,0,0);
  overview.width=canvas.width;overview.height=canvas.height;const c=overview.getContext('2d');c.setTransform(scale,0,0,scale,0,0);
  if(data&&image.naturalWidth){const s=Math.min(r.width/image.naturalWidth,r.height/image.naturalHeight),w=image.naturalWidth*s,h=image.naturalHeight*s,ox=(r.width-w)/2,oy=(r.height-h)/2;c.strokeStyle='#c9dec4';c.lineWidth=.65;c.globalAlpha=.18;
   for(const p of data.context_paths||data.paths){c.beginPath();p.points.forEach((q,i)=>i?c.lineTo(ox+q[0]*w,oy+q[1]*h):c.moveTo(ox+q[0]*w,oy+q[1]*h));c.stroke();}}
  lastTime=-1;paint();}
 function updateLinks(){
  if(!work?.lab_url){explore.hidden=deeperLink.hidden=true;return;}
  const url=new URL(work.lab_url,location.origin);url.searchParams.set('mode',track.mode==='portrait'?'progressive':track.mode);if(track.mode==='progressive'||track.mode==='portrait')url.searchParams.set('preset',track.mode==='portrait'?'portrait':track.style);url.searchParams.set('time',String(Math.round(audio.currentTime*100)/100));explore.href=deeperLink.href=url.pathname+url.search;
  explore.hidden=deeperLink.hidden=false;
 }
 function paint(){
  if(!enabled||!reader.open||!data||!image.complete||!image.naturalWidth){clear();return;}
  const t=audio.currentTime;if(t===lastTime&&!audio.ended)return;lastTime=t;clear();
  const width=mat.clientWidth,height=mat.clientHeight,scale=Math.min(width/image.naturalWidth,height/image.naturalHeight),w=image.naturalWidth*scale,h=image.naturalHeight*scale,ox=(width-w)/2,oy=(height-h)/2;
  context.drawImage(overview,0,0,width,height);
  const notes=audio.ended?[]:data.notes.filter(n=>t>=n.start&&t<n.start+n.duration).sort((a,b)=>a.voice-b.voice);
  // Quiet colored context is the actual surrounding phrase; bright strokes alone
  // represent notes sounding now. Never invent additional sounding sources.
  const phrase=audio.ended?[]:data.notes.filter(n=>n.start<t+2.5&&n.start+n.duration>t-2.5);
  const contextual=new Set();
  for(const n of phrase){const pts=paths.get(n.source);if(!pts||contextual.has(n.source))continue;contextual.add(n.source);
   context.beginPath();pts.forEach((p,i)=>{const x=ox+p[0]*w,y=oy+p[1]*h;i?context.lineTo(x,y):context.moveTo(x,y);});
   context.globalAlpha=.55;context.strokeStyle=colors[n.voice]||colors[0];context.lineWidth=2.5;context.lineJoin='round';context.stroke();context.globalAlpha=1;
  }
  const seen=new Set();let count=0;
  for(const note of notes){
   const points=paths.get(note.source);if(!points?.length)continue;
   const color=colors[note.voice]||colors[0];
   if(!seen.has(note.source)&&seen.size<90){
    seen.add(note.source);context.beginPath();points.forEach((p,i)=>{const x=ox+p[0]*w,y=oy+p[1]*h;i?context.lineTo(x,y):context.moveTo(x,y);});
    context.lineJoin=context.lineCap='round';context.strokeStyle='#17362ddd';context.lineWidth=6;context.stroke();context.shadowBlur=12;context.shadowColor=color;context.strokeStyle=color;context.lineWidth=3;context.stroke();context.shadowBlur=0;
   }
   const p=note.source_point;if(p&&p.every(Number.isFinite)){
    const x=ox+p[0]*w,y=oy+p[1]*h,halo=context.createRadialGradient(x,y,0,x,y,16);halo.addColorStop(0,color+'88');halo.addColorStop(1,color+'00');context.fillStyle=halo;context.fillRect(x-16,y-16,32,32);
    context.beginPath();context.arc(x,y,3.8,0,Math.PI*2);context.fillStyle=color;context.fill();context.strokeStyle='#18352b';context.lineWidth=1;context.stroke();
   }
   count++;
  }
  canvas.dataset.activeSources=String(seen.size);canvas.dataset.audioTime=t.toFixed(3);
  live.textContent=audio.ended?'这一页已奏毕':(audio.paused?'已暂停 · ':'')+'底线：图像结构 · 淡彩：乐句 · 亮线：当前音符';
  updateLinks();
 }
 function loop(){frame=0;if(!enabled||!reader.open)return;paint();frame=requestAnimationFrame(loop);}
 function run(){cancelAnimationFrame(frame);frame=0;canvas.hidden=caption.hidden=!enabled;toggle.setAttribute('aria-pressed',String(enabled));if(enabled){lastTime=-1;fit();loop();}else clear();}
 async function setTrack(event){
  const request=++revision;({work,track}=event.detail);data=null;paths.clear();clear();updateLinks();
  toggle.disabled=!track.mapping;toggle.title=track.mapping?'高亮实际音符的来源轮廓与采样点':'该版本尚未提供来源映射';
  if(!track.mapping){enabled=false;run();return;}
  live.textContent='正在读取这页的来源…';
  try{
   if(!cache.has(track.mapping))cache.set(track.mapping,fetch(track.mapping).then(r=>{if(!r.ok)throw Error();return r.json();}));
   const mapping=await cache.get(track.mapping);if(request!==revision)return;
   if(mapping.schema_version!=='sonify.museum.mapping.v1')throw Error();
   data=mapping;paths=new Map(data.paths.map(p=>[p.id,p.points]));lastTime=-1;if(enabled)fit();
   if(cache.size>8)cache.delete(cache.keys().next().value);
  }catch(_){if(request!==revision)return;cache.delete(track.mapping);toggle.title='来源暂时未能载入，可到 Photo 查看';live.textContent='来源暂时未能载入';}
 }
 toggle.onclick=()=>{enabled=!enabled;run();};
 for(const link of [explore,deeperLink])link.addEventListener('click',()=>{updateLinks();audio.pause();});
 window.addEventListener('sonify-museum-track',setTrack);
 image.addEventListener('load',fit);new ResizeObserver(fit).observe(mat);
 for(const event of ['seeked','pause','ended','loadedmetadata'])audio.addEventListener(event,()=>{lastTime=-1;paint();});
 new MutationObserver(()=>{if(!reader.open){enabled=false;++revision;run();}}).observe(reader,{attributes:true,attributeFilter:['open']});
 window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
})();
