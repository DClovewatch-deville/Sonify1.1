'use strict';
// Four real renders share geometry and time. Images interpolate; tonal states do not.
const seasonOpen=document.createElement('button');seasonOpen.id='season-open';seasonOpen.textContent='四时共鸣 · Living Composition ↗';$('#color-proof-open').after(seasonOpen);
const seasonDialog=document.createElement('dialog');seasonDialog.id='season-dialog';seasonDialog.innerHTML=`<header><div><small>LIVING COMPOSITION / SEASONAL RESONANCE</small><h2>四时共鸣，让同一幅景，拥有流动的声音。</h2></div><button id="season-close">关闭 · Esc</button></header><p>保留原图主体与同一份几何动机。四季沿同一几何主题演绎，光、空气与粒子共同流动。氛围特效不是物体重绘，可按场景关闭或调整。</p><div class="season-options"><label><input id="season-fx" type="checkbox" checked> 动态氛围</label><label>适用场景 <select id="season-scene"><option value="ambient">四季艺术装饰（推荐）</option><option value="nature">自然户外 · 花瓣与落叶</option><option value="building">建筑户外 · 光照与雪雾</option><option value="indoor">室内 / 人像 · 柔光</option></select></label></div><div class="season-layout"><div><canvas id="season-image" width="1200" height="760" aria-label="同一图片的连续四时调色"></canvas><div class="season-labels"><span>春 · 0:00</span><span>夏 · 0:08</span><span>秋 · 0:16</span><span>冬 · 0:24</span><span>完成 · 0:36</span></div><input id="season-position" type="range" min="0" max="100" step="0.1" value="0" aria-label="四时共鸣色彩旅程"></div><aside><small>当前视觉 → SONIC GRAMMAR</small><h3 id="season-title"></h3><div id="season-facts"></div><p id="season-rule"></p><div id="season-midi"></div><button id="season-identity-play">听图像主题 · 无季节</button><audio id="season-identity-audio" controls hidden></audio><p id="season-status" role="status">准备四种真实音乐状态…</p></aside></div><div class="season-transport"><button id="season-journey" disabled>▶ 让四时流转 · 36 秒</button><button id="season-play" disabled>单听当前季节（从头）</button><button id="season-restart">从春开始</button><span id="season-clock">0:00 / 0:36</span></div><p class="season-note">滑条是 36 秒旅程时间轴：拖动即定位画面与音乐；暂停时拖动仅定位，再按播放继续。花瓣、日轮、枫叶与霜雪为艺术装饰。音乐采用四个真实编曲，在 8 / 16 / 24 秒切换。调式不会被当作连续数值插值。音乐风格沿用进入时的选择；连续版本保持共享 120 BPM，以密度、时值和装饰改变季节呼吸。</p>`;document.body.append(seasonDialog);
let seasonContext,seasonTone,seasonWarmth,seasonBuffers=[],seasonImages=[],seasonSource,seasonGain,seasonOffset=0,seasonStarted=0,seasonPlaying=false,seasonAuto=false,seasonApplied=0,seasonPending=null,seasonPendingAt=0,seasonTicket=0,seasonRAF=0,seasonPayload=null,seasonStyle='nature';
const seasonCache=new Map();
let seasonVisualRAF=0,seasonPhotoRect=null,seasonSpace,seasonReverb,seasonIdentityBlob=null;
const fxFract=x=>x-Math.floor(x);
function seasonGlyph(g,effect,size,seed,t){
 g.lineWidth=Math.max(1,size*.06);g.lineJoin='round';
 if(effect==='petal'){
  g.fillStyle=['#f7d6e1','#fff2e6','#eab3cd'][Math.floor(seed*3)%3];g.strokeStyle='#b66f9466';
  for(let j=0;j<5;j++){g.save();g.rotate(j*Math.PI*2/5);g.beginPath();g.ellipse(0,-size*.42,size*.26,size*.44,0,0,Math.PI*2);g.fill();g.stroke();g.restore();}
  g.fillStyle='#dfb35c';g.beginPath();g.arc(0,0,size*.16,0,Math.PI*2);g.fill();
 }else if(effect==='leaf'){
  const points=[[0,-1],[.18,-.38],[.55,-.72],[.47,-.12],[.95,-.22],[.58,.24],[.66,.48],[.12,.43],[0,.98],[-.09,.44],[-.63,.49],[-.5,.16],[-.91,-.13],[-.35,-.15],[-.5,-.65],[-.12,-.35]];
  g.fillStyle=['#d56b35','#e6a544','#a6402a'][Math.floor(seed*3)%3];g.strokeStyle='#73371d9c';g.beginPath();points.forEach((p,j)=>j?g.lineTo(p[0]*size,p[1]*size):g.moveTo(p[0]*size,p[1]*size));g.closePath();g.fill();g.stroke();
  g.strokeStyle='#f7d392a8';g.beginPath();g.moveTo(0,size*.72);g.lineTo(0,-size*.7);g.moveTo(0,size*.22);g.lineTo(-size*.45,-size*.1);g.moveTo(0,size*.1);g.lineTo(size*.48,-size*.16);g.stroke();
 }else if(effect==='snow'){
  g.strokeStyle='#f1fbff';g.shadowColor='#bde3f0';g.shadowBlur=3;
  for(let j=0;j<6;j++){g.save();g.rotate(j*Math.PI/3);g.beginPath();g.moveTo(0,0);g.lineTo(0,-size);g.moveTo(-size*.23,-size*.45);g.lineTo(0,-size*.65);g.lineTo(size*.23,-size*.45);g.stroke();g.restore();}g.shadowBlur=0;
 }
}
function seasonCornerArt(g,r,effect,t){
 if(effect==='beam'){
  g.save();g.translate(r.x+r.w*.88,r.y+r.h*.13);g.rotate(t*.035);g.strokeStyle='#ffe6a0';g.fillStyle='#fff0b7d9';g.lineWidth=2;
  for(let i=0;i<12;i++){g.rotate(Math.PI/6);g.beginPath();g.moveTo(0,26);g.lineTo(0,37+3*Math.sin(t*.6));g.stroke();}
  g.beginPath();g.arc(0,0,19,0,Math.PI*2);g.fill();g.restore();
 }else if(effect==='petal'||effect==='leaf'){
  for(const side of [0,1]){g.save();g.translate(r.x+(side?r.w:0),r.y+r.h);g.scale(side?-1:1,1);g.strokeStyle=effect==='petal'?'#a8c88ce0':'#d0a05ad9';g.lineWidth=2.3;
   g.beginPath();g.moveTo(0,-12);g.bezierCurveTo(42,-30,48,-115,105,-165);g.stroke();
   for(let j=0;j<5;j++){const a=j/5;g.save();g.translate(15+a*75,-28-a*114);g.rotate(-.35+Math.sin(t*.35+j)*.06);g.fillStyle=effect==='petal'?'#b6d79c':'#d5a05c';g.beginPath();g.ellipse(12,-5,18,6,-.65,0,Math.PI*2);g.fill();g.restore();}
   g.save();g.translate(102,-160);seasonGlyph(g,effect,effect==='petal'?15:21,.35,t);g.restore();g.restore();}
 }else if(effect==='snow'){
  for(const [x,y,angle] of [[r.x,r.y,Math.PI/2],[r.x+r.w,r.y,Math.PI],[r.x,r.y+r.h,0],[r.x+r.w,r.y+r.h,-Math.PI/2]]){
   g.save();g.translate(x,y);g.rotate(angle);g.strokeStyle='#e4f4ffd0';g.lineWidth=1.6;
   for(let j=0;j<4;j++){g.save();g.rotate(.12+j*.23);g.beginPath();g.moveTo(0,0);g.lineTo(90+j*9,-8);for(let k=1;k<5;k++){g.moveTo(k*18,-7);g.lineTo(k*18+10,-19);g.moveTo(k*18,-7);g.lineTo(k*18+12,3);}g.stroke();g.restore();}g.restore();
  }
 }
}
function paintSeasonAtmosphere(g,weights){
 if(!$('#season-fx').checked||!seasonPhotoRect)return;
 const r=seasonPhotoRect,t=matchMedia('(prefers-reduced-motion:reduce)').matches?0:performance.now()/1000,scene=$('#season-scene').value;
 g.save();g.beginPath();g.rect(r.x,r.y,r.w,r.h);g.clip();
 seasonPayload.states.forEach((state,index)=>{
  const opacity=weights[index]||0;if(opacity<.005)return;const rule=state.rule||{},effect=rule.effect||['petal','beam','leaf','snow'][index];
  g.globalAlpha=opacity*.82;seasonCornerArt(g,r,effect,t);g.globalAlpha=opacity;
  if(effect==='beam'){
   const light=g.createRadialGradient(r.x+r.w*.78,r.y+r.h*.04,0,r.x+r.w*.75,r.y,r.w*.8);light.addColorStop(0,'#ffe9a95c');light.addColorStop(1,'#fff0bf00');g.fillStyle=light;g.fillRect(r.x,r.y,r.w,r.h);
   g.save();g.translate(r.x+r.w*.8,r.y-r.h*.1);g.rotate(-.18+Math.sin(t*.15)*.025);g.fillStyle='#fff2cb12';for(let j=0;j<3;j++){g.beginPath();g.moveTo(j*32,0);g.lineTo(-180+j*180,r.h*1.3);g.lineTo(-90+j*180,r.h*1.3);g.closePath();g.fill();}g.restore();
  }
  if(effect==='snow'){
   const mist=g.createLinearGradient(0,r.y,0,r.y+r.h);mist.addColorStop(0,'#d9eff51a');mist.addColorStop(.6,'#d9eff500');mist.addColorStop(1,'#c5def03a');g.fillStyle=mist;g.fillRect(r.x,r.y,r.w,r.h);
  }
  const count=scene==='indoor'?12:Math.round((rule.particles||20)*(scene==='nature'?1.35:1));
  for(let i=0;i<count;i++){
   const seed=fxFract(Math.sin(i*127.1+index*31.7)*43758.54),speed=(rule.speed||.6)*(.6+seed)*.035;
   const upward=effect==='petal',phase=fxFract(seed*2+t*speed);let localX=fxFract(seed*7+.07*Math.sin(t*.5+i)+t*.009);
   if(scene==='indoor')localX=localX<.5?localX*.38:.81+(localX-.5)*.38;
   const x=r.x+localX*r.w,y=r.y+(upward?1-phase:phase)*r.h;
   g.save();g.translate(x,y);g.rotate(t*(.2+seed)+i);g.globalAlpha=opacity*(.25+.45*seed);
   g.fillStyle=rule.light||'#e9dbad';
   if(effect!=='beam'){g.globalAlpha=opacity*(.58+.35*seed);seasonGlyph(g,effect,(effect==='leaf'?15:effect==='petal'?10:7)+seed*(effect==='leaf'?13:8),seed,t);}
   else{g.beginPath();g.arc(0,0,1.2+seed*1.7,0,Math.PI*2);g.fill();}
   g.restore();
  }
  if(effect==='leaf'||effect==='snow'){
   const edge=g.createRadialGradient(r.x+r.w/2,r.y+r.h/2,r.w*.22,r.x+r.w/2,r.y+r.h/2,r.w*.7);edge.addColorStop(0,'#0c211600');edge.addColorStop(1,effect==='snow'?'#d8edf02b':'#57320f29');g.fillStyle=edge;g.fillRect(r.x,r.y,r.w,r.h);
  }
 });g.restore();
}
function seasonVisualTick(){if(!seasonDialog.open)return;if(seasonImages.length)drawSeason(seasonAutoPosition(Number($('#season-position').value)*.36));seasonVisualRAF=requestAnimationFrame(seasonVisualTick);}
function seasonMusic(i){return seasonPayload.states[i].music[seasonStyle];}
function seasonAutoPosition(t){
 return [8,16,24].reduce((sum,boundary)=>sum+Math.max(0,Math.min(1,(t-boundary+1)/2)),0)/3*100;
}
function stopSeasons(){if(seasonPlaying&&seasonAuto)seasonOffset=Math.min(36,seasonContext.currentTime-seasonStarted);seasonPlaying=false;seasonAuto=false;cancelAnimationFrame(seasonRAF);if(seasonSpace)seasonSpace.gain.setValueAtTime(0,seasonContext.currentTime);$('#season-identity-audio').pause();if(seasonSource){try{seasonSource.stop();}catch{}}seasonSource=null;$('#season-play').textContent='单听当前季节（从头）';$('#season-journey').textContent='▶ 继续四时流转';}
function drawSeason(value){
 if(!seasonPayload||!seasonImages.length)return;
 const x=Math.max(0,Math.min(3,value/100*3)),left=Math.floor(x),right=Math.min(3,left+1),u=x-left,fraction=u*u*(3-2*u);
 const canvas=$('#season-image'),g=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 g.fillStyle='#081715';g.fillRect(0,0,w,h);
 const paint=(img,alpha)=>{const scale=Math.min((w-20)/img.naturalWidth,(h-20)/img.naturalHeight),iw=scale*img.naturalWidth,ih=scale*img.naturalHeight;seasonPhotoRect={x:(w-iw)/2,y:(h-ih)/2,w:iw,h:ih};g.globalAlpha=alpha;g.drawImage(img,(w-iw)/2,(h-ih)/2,iw,ih);};
 paint(seasonImages[left],1);if(left!==right)paint(seasonImages[right],fraction);g.globalAlpha=1;
 const weights=[0,0,0,0];weights[left]+=1-fraction;weights[right]+=fraction;paintSeasonAtmosphere(g,weights);
 const wanted=Math.round(x),state=seasonPayload.states[wanted],m=seasonMusic(wanted),c=state.color,e=m.arrangement_params.color_expression;
 $('#season-title').textContent=state.label+' · '+colorPitchNames[m.key_pc]+(e.mode==='minor'?' 小调':' 大调');
 $('#season-facts').textContent=`明度 L* ${c.lab.L_mean.toFixed(1)} · 饱和度 ${Math.round(c.saturation*100)}% · 冷暖 ${c.warmth.toFixed(2)} → ${e.profile_label}`;
 const tone=i=>750+seasonPayload.states[i].color.saturation**2*18000,warm=i=>seasonPayload.states[i].color.warmth*3;
 const cutoff=tone(left)*(1-fraction)+tone(right)*fraction,warmDb=warm(left)*(1-fraction)+warm(right)*fraction;
 if(seasonTone){seasonTone.frequency.setTargetAtTime(cutoff,seasonContext.currentTime,.08);seasonWarmth.gain.setTargetAtTime(warmDb,seasonContext.currentTime,.08);}
 if(seasonSpace){const space=weights.reduce((total,weight,i)=>total+weight*(seasonPayload.states[i].rule?.space||.2),0);seasonSpace.gain.setTargetAtTime(seasonPlaying?space*.14:0,seasonContext.currentTime,.1);}
 $('#season-rule').textContent=`${m.preset_name} · ${state.rule?.character||e.profile_label} · ${m.voice_catalog[0].instrument}主奏。密度 ×${state.rule?.density||1}；光泽 ${Math.round(cutoff)} Hz；冷暖润色 ${warmDb>0?'+':''}${warmDb.toFixed(1)} dB。`;
 $('#season-midi').textContent='同一几何采样的主题 MIDI：'+m.theme.map(n=>n.pitch).join(' · ');
 if(seasonPlaying&&seasonAuto&&wanted!==seasonApplied&&seasonPending!==wanted){seasonPending=wanted;seasonPendingAt=wanted*8;}
 if(seasonPlaying&&seasonAuto&&wanted===seasonApplied)seasonPending=null;
 return wanted;
}
function playSeasonNode(index,time,first=false){
 const now=seasonContext.currentTime,delay=first?0:.08;
 if(seasonSource){seasonGain.gain.cancelScheduledValues(now);seasonGain.gain.setValueAtTime(seasonGain.gain.value,now);seasonGain.gain.linearRampToValueAtTime(0,now+.075);try{seasonSource.stop(now+.08);}catch{}}
 const source=seasonContext.createBufferSource(),gain=seasonContext.createGain();source.buffer=seasonBuffers[index];source.connect(gain);gain.connect(seasonTone);source.onended=()=>{source.disconnect();gain.disconnect();};gain.gain.setValueAtTime(0,now+delay);gain.gain.linearRampToValueAtTime(.75,now+delay+.12);const offset=Math.min(35.99,time+delay);source.start(now+delay,offset);$('#season-clock').dataset.audioOffset=offset.toFixed(3);seasonSource=source;seasonGain=gain;seasonApplied=index;
}
function seasonTick(){
 if(!seasonPlaying||!seasonDialog.open)return;
 const t=Math.min(36,seasonContext.currentTime-seasonStarted);
 if(seasonAuto)$('#season-position').value=t/36*100;
 drawSeason(seasonAutoPosition(Number($('#season-position').value)*.36));
 if(seasonPending!==null&&t>=seasonPendingAt){const target=seasonPending;seasonPending=null;playSeasonNode(target,t);}
 const m=seasonMusic(seasonApplied),e=m.arrangement_params.color_expression;
 $('#season-status').textContent=seasonPending!==null?`画面正在过渡；音乐将在 ${seasonPendingAt.toFixed(0)} 秒的小节边界换境。当前：${colorPitchNames[m.key_pc]}${e.mode==='minor'?'小调':'大调'}`:`正在听见：${seasonPayload.states[seasonApplied].label} · ${colorPitchNames[m.key_pc]}${e.mode==='minor'?'小调':'大调'} · 同一几何继续演奏`;
 $('#season-clock').textContent=fmt(t)+' / 0:36';
 if(t>=36){stopSeasons();$('#season-status').textContent='四时流转完成。拖动季色，再听同一几何的另一种表达。';return;}
 seasonRAF=requestAnimationFrame(seasonTick);
}
async function startSeasons(auto){
 const offset=auto?(seasonOffset>=36?0:seasonOffset):0;
 stopSeasons();await seasonContext.resume();seasonAuto=auto;
 const index=drawSeason(seasonAutoPosition(Number($('#season-position').value)*.36));
 seasonPending=null;seasonStarted=seasonContext.currentTime-offset;seasonPlaying=true;
 playSeasonNode(auto?Math.min(3,Math.floor(offset/8)):index,offset,true);
 $('#season-journey').textContent='Ⅱ 暂停旅程';$('#season-play').textContent=auto?'单听当前季节（从头）':'停止单听';seasonTick();
}
function seekSeason(value){
 const time=Math.max(0,Math.min(36,Number(value)*.36));
 seasonOffset=time;seasonPending=null;
 drawSeason(seasonAutoPosition(time));
 $('#season-clock').textContent=fmt(time)+' / 0:36';
 if(seasonPlaying){seasonAuto=true;seasonStarted=seasonContext.currentTime-time;playSeasonNode(Math.min(3,Math.floor(time/8)),time,true);}
 else $('#season-status').textContent='已定位到 '+fmt(time)+'，按继续四时流转播放此处。';
}
seasonOpen.onclick=async()=>{
 if(!data.living_color?.states?.length){$('#status').textContent='此作品的四时音乐尚未准备，请稍后刷新。';return;}
 halt();if(colorProof.open)colorProof.close();stopSeasons();seasonPayload=data.living_color;seasonStyle=progressivePreset;seasonImages=[];seasonBuffers=[];const ticket=++seasonTicket;
 document.body.classList.add('color-proof-open');seasonDialog.showModal();$('#season-journey').disabled=$('#season-play').disabled=true;$('#season-position').value=0;seasonOffset=0;$('#season-status').textContent='准备四种真实音乐状态…';
 try{
  seasonContext=seasonContext||new (window.AudioContext||window.webkitAudioContext)();await seasonContext.resume();
  if(!seasonTone){
   seasonTone=seasonContext.createBiquadFilter();seasonTone.type='lowpass';seasonTone.Q.value=.5;seasonWarmth=seasonContext.createBiquadFilter();seasonWarmth.type='lowshelf';seasonWarmth.frequency.value=400;seasonTone.connect(seasonWarmth);seasonWarmth.connect(seasonContext.destination);
   seasonReverb=seasonContext.createConvolver();seasonSpace=seasonContext.createGain();seasonSpace.gain.value=0;const rate=seasonContext.sampleRate,impulse=seasonContext.createBuffer(2,rate*2.5,rate);
   for(let ch=0;ch<2;ch++){const a=impulse.getChannelData(ch);for(let i=0;i<a.length;i++)a[i]=(fxFract(Math.sin(i*12.9898+ch*78.233)*43758.5453)*2-1)*Math.exp(-i/rate*3.2)*.2;}
   seasonReverb.buffer=impulse;seasonWarmth.connect(seasonReverb);seasonReverb.connect(seasonSpace);seasonSpace.connect(seasonContext.destination);
  }
  const results=await Promise.all(seasonPayload.states.map(async state=>{
   const img=new Image();const loaded=new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});img.src=state.image;
   const file=state.music[seasonStyle].audio;
   if(!seasonCache.has(file)){const pending=fetch(file+'?v='+REVISION).then(r=>{if(!r.ok)throw Error('audio unavailable');return r.arrayBuffer();}).then(b=>seasonContext.decodeAudioData(b));seasonCache.set(file,pending);pending.catch(()=>seasonCache.delete(file));}
   const audio=await seasonCache.get(file);await loaded;return {img,audio};
  }));
  if(ticket!==seasonTicket)return;while(seasonCache.size>8)seasonCache.delete(seasonCache.keys().next().value);seasonImages=results.map(r=>r.img);seasonBuffers=results.map(r=>r.audio);drawSeason(0);cancelAnimationFrame(seasonVisualRAF);seasonVisualRAF=requestAnimationFrame(seasonVisualTick);$('#season-journey').disabled=$('#season-play').disabled=false;$('#season-identity-play').disabled=!seasonPayload.identity?.[seasonStyle];$('#season-status').textContent='拖动时间轴定位音乐，或播放完整四时旅程。';
 }catch{if(ticket===seasonTicket)$('#season-status').textContent='四时资源加载失败，请关闭后重试。';}
};
$('#season-position').oninput=e=>seekSeason(e.target.value);
$('#season-journey').onclick=()=>seasonPlaying&&seasonAuto?stopSeasons():startSeasons(true);
$('#season-play').onclick=()=>seasonPlaying&&!seasonAuto?stopSeasons():startSeasons(false);
$('#season-restart').onclick=()=>{stopSeasons();seasonOffset=0;$('#season-position').value=0;startSeasons(true);};
$('#season-close').onclick=()=>seasonDialog.close();seasonDialog.onclose=()=>{seasonTicket++;stopSeasons();cancelAnimationFrame(seasonVisualRAF);if(seasonIdentityBlob){URL.revokeObjectURL(seasonIdentityBlob);seasonIdentityBlob=null;}document.body.classList.remove('color-proof-open');};
$('#season-identity-play').onclick=async()=>{
 const identity=seasonPayload.identity?.[seasonStyle];if(!identity)return;stopSeasons();const ticket=seasonTicket;
 try{const r=await fetch(identity.audio+'?v='+REVISION);if(!r.ok)throw Error('identity unavailable');const blob=await r.blob();if(ticket!==seasonTicket)return;if(seasonIdentityBlob)URL.revokeObjectURL(seasonIdentityBlob);seasonIdentityBlob=URL.createObjectURL(blob);const a=$('#season-identity-audio');a.hidden=false;a.src=seasonIdentityBlob;a.play();$('#season-status').textContent='仅图像身份主题 · 真实几何顶点的旋律；相对音程 '+identity.relative_intervals.join(' / ');}catch{$('#season-status').textContent='主题音频加载失败，请重试。';}
};
