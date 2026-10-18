
const Music30={
 complexity(paths){const f=this.features(paths),n=paths.filter(p=>p.length>1).length;return .2+f.density*2+Math.log2(n+1)*.35+(1-f.smoothness)*.4;},
 flowerReference(){if(!this.referenceScore){const p=Array.from({length:600},(_,i)=>{const a=2*Math.PI*i/600,r=.66+.28*Math.cos(5*a);return{x:r*Math.sin(a),y:-r*Math.cos(a)};});this.referenceScore=this.complexity([p]);}return this.referenceScore;},
 timing(paths,options={}){const score=options.complexity??this.complexity(paths),ratio=Math.max(.65,Math.min(6,Math.pow(score/this.flowerReference(),1.4))),speed=Math.max(.5,Math.min(2,+options.speed||1)),barSize=options.style==='waltz'?6:8,styleFactor={lyrical:1,oriental:1.06,strings:1.1,chamber:.96,minimal:1.1,waltz:1,pulse:.9,jazz:.96,woodland:.92}[options.style]||1,target=12*ratio*styleFactor,autoBars=Math.max(4,Math.min(32,4*Math.round(target/12))),bars=+options.bars||autoBars,seconds=target*(bars/autoBars)/speed,bpm=bars*barSize*30/seconds;return{bars,barSize,bpm,seconds,movements:bars/4,complexity:score};},
 features(paths){let length=0,turn=0,turns=0,x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of paths)for(let i=0;i<p.length;i++){const q=p[i];x0=Math.min(x0,q.x);x1=Math.max(x1,q.x);y0=Math.min(y0,q.y);y1=Math.max(y1,q.y);if(i)length+=Math.hypot(q.x-p[i-1].x,q.y-p[i-1].y);if(i>0&&i<p.length-1){const a=p[i-1],b=p[i+1],ux=q.x-a.x,uy=q.y-a.y,vx=b.x-q.x,vy=b.y-q.y,den=Math.hypot(ux,uy)*Math.hypot(vx,vy);if(den>1e-9){turn+=Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/den)));turns++;}}}const area=Math.max(.4,(x1-x0)*(y1-y0));return{density:Math.max(0,Math.min(1,Math.log1p(length/area)/4)),smoothness:Math.max(0,Math.min(1,1-(turn/Math.max(1,turns))/(Math.PI*.45)))};},
 arrange(paths,options={}){const valid=paths.filter(p=>p.length>1);if(!valid.length)return{events:[],steps:32,features:{density:0,smoothness:1}};const features=this.features(valid),style=options.style||'lyrical',minor=options.mode==='natural-minor'||(!options.mode||options.mode==='auto')&&options.mood==='cool',bars=options.bars||16,barSize=style==='waltz'?6:8,steps=bars*barSize,root=Number.isFinite(+options.tonic)?+options.tonic:60,tonic=minor?[root,root+3,root+7]:[root,root+4,root+7],progression=[tonic,minor?[root-7,root-4,root]:[root-7,root-3,root],[root-5,root-1,root+2],tonic],degrees=options.mode==='pentatonic'?[0,2,4,7,9]:minor?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11],scale=Array.from({length:25},(_,i)=>root+i).filter(n=>degrees.includes((n-root)%12));
 const ranked=valid.map(p=>{let len=0;for(let i=1;i<p.length;i++)len+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const q of p){minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);}return{p,score:len+Math.hypot(maxX-minX,maxY-minY)*2};}).sort((a,b)=>b.score-a.score);
 const lead=ranked.slice(0,Math.max(1,Math.ceil(ranked.length*.2))).map(x=>x.p),detail=ranked.slice(lead.length).map(x=>x.p);const sample=(list,t)=>{const total=list.reduce((n,p)=>n+p.length,0);let k=Math.min(total-1,Math.floor(t*total));for(const p of list){if(k<p.length)return p[k];k-=p.length;}return list[0][0];};let lo=Infinity,hi=-Infinity;for(const p of lead)for(const q of p){lo=Math.min(lo,q.y);hi=Math.max(hi,q.y);}let prev=root+12;const density=Math.max(.15,Math.min(.98,features.density*(style==='minimal'?.45:style==='pulse'?1.1:.85)+(style==='pulse'?.2:.1)));const events=[];
 for(let i=0;i<steps;i++){const chord=progression[Math.floor(i/barSize)%4],p=sample(lead,((i%(barSize*4))/(barSize*4)+Math.floor(i/(barSize*4))*.06)%1),strong=i%2===0,target=60+(1-(p.y-lo)/Math.max(.1,hi-lo))*16,pool=(i%barSize===0?scale.filter(n=>chord.some(c=>c%12===n%12)):scale),midi=pool.reduce((a,b)=>Math.abs(a-target)+Math.abs(a-prev)*.4<=Math.abs(b-target)+Math.abs(b-prev)*.4?a:b),rest=i%barSize!==0&&((i*7%17)/17>density+(strong?.18:0)-(i<barSize*2?.12:0)-(i>steps-barSize*2?.08:0));prev=rest?prev:midi;const extra=[];if(detail.length&&i%2===0){const d=sample(detail,i/steps),j=Math.abs(Math.floor((d.x+d.y)*7))%3;extra.push({midi:chord[j]+(style==='pulse'?12:0),level:.035,hold:.6+features.smoothness*.6,instrument:'pluck'});}events.push({midi,rest,chord,bar:Math.floor(i/barSize),section:i<steps/4?'引入':i<steps*.75?'展开':'回归',level:(strong?.14:.10)*(i<barSize*2?.8:i>steps-barSize*2?.85:1),hold:style==='strings'?1.8:features.smoothness>.65?1.25:.6+features.smoothness*.6,extra,accent:i%barSize===0});}
 // Four related rhythmic phrases: sparse opening, answer, flowing development, breathing return.
 const patterns=style==='waltz'?[[0,2,4],[0,3,4],[0,1,3,5],[0,2]]:style==='oriental'||style==='minimal'?[[0,3,6],[0,4],[0,2,5,6],[0,3]]:style==='jazz'?[[0,3,5],[0,2,5,7],[0,1,3,6],[0,3,6]]:[[0,2,5],[0,3,4,6],[0,1,3,5,6],[0,2,4]];
 for(let b=0;b<bars;b++){
  const contrast=b>=bars/2&&b<bars*.75,pattern=contrast?(barSize===6?[[0,1,4],[0,3],[0,2,3,5],[0,1,4]][b%4]:[[0,1,4,6],[0,3,6],[0,2,3,6],[0,1,5]][b%4]):patterns[b%4],start=b*barSize;
  const onsets=pattern.filter(p=>p<barSize && (features.density>.35 || p%2===0 || p===pattern[1]));
  for(let p=0;p<barSize;p++){
   const e=events[start+p];e.rest=!onsets.includes(p)||(options.noteDensity<50&&p!==0&&p!==onsets[1]);
   e.offset=p%2?(style==='jazz'?.28:style==='pulse'?.14:.05):0;
   e.level*=1+.12*Math.sin((b%4)/3*Math.PI)-(p===onsets.at(-1)?.12:0);
   e.extra=(b%2===1 && p===barSize-3)?e.extra:[];
   if(!e.rest){const next=onsets.find(n=>n>p)??barSize; e.hold=Math.max(.55,(next-p)*(features.smoothness>.6?.93:.72));}
   if(b%4===3&&p>=barSize-2){e.rest=true;e.extra=[];}
  }
 }
 // Reserve the final beat for a tonic cadence; no new embellishments afterward.
 const end=steps-2;events[end]={...events[end],midi:root+12,chord:tonic,rest:false,level:.13,hold:1.8,offset:0,extra:[],cadence:true};events[end+1]={...events[end+1],rest:true,extra:[]};this.connectPhrases(events,scale,barSize,minor);
 const phraseSteps=barSize*4;
 for(let i=0;i<events.length;i++){const e=events[i];if(e.rest||e.cadence)continue;const boundary=(Math.floor(i/phraseSteps)+1)*phraseSteps;if(boundary<steps&&i+e.hold>boundary-2)e.hold=Math.max(.3,boundary-2-i);}
 return{events,steps,features,barSize,bars,leadCount:lead.length,detailCount:detail.length};
 },
 // Revoice chords and connect the melody across bar lines, with one breath per phrase.
 connectPhrases(events,scale,barSize,minor){
  let previous=minor?69:72,lastVoicing=null;
  for(let i=0;i<events.length;i++){
   const e=events[i];e.bassRoot=e.chord[0];
   if(i%barSize===0||e.cadence){const original=e.chord;let best=original,bestCost=Infinity;
    for(let inv=0;inv<3;inv++)for(const shift of [-12,0,12]){const v=original.slice(inv).concat(original.slice(0,inv).map(n=>n+12)).map(n=>n+shift);if(v[0]<48||v[2]>76)continue;const cost=lastVoicing?v.reduce((sum,n,j)=>sum+Math.abs(n-lastVoicing[j]),0):v.reduce((sum,n)=>sum+Math.abs(n-60),0);if(cost<bestCost){bestCost=cost;best=v;}}
    lastVoicing=best;
   }e.chord=lastVoicing||e.chord;
   if(e.rest)continue;
   if(!e.cadence){const target=e.midi*.45+previous*.55,near=scale.filter(n=>Math.abs(n-previous)<=4),pool=near.length?near:scale;
    e.midi=pool.reduce((a,b)=>{const score=n=>Math.abs(n-target)+Math.abs(n-previous)*.35+(e.accent&&!e.chord.some(c=>c%12===n%12)?2:0);return score(a)<=score(b)?a:b;});
   }previous=e.midi;
  }
  const sounding=events.map((e,i)=>!e.rest?i:-1).filter(i=>i>=0),cadence=events.findIndex(e=>e.cadence);
  // Approach the final tonic stepwise, including when the image ends on a high contour.
  let target=events[cadence].midi;
  for(let k=sounding.indexOf(cadence)-1;k>=0;k--){const e=events[sounding[k]];if(Math.abs(e.midi-target)<=4)break;const candidates=scale.filter(n=>Math.abs(n-target)<=4);e.midi=candidates.reduce((a,b)=>Math.abs(a-e.midi)<=Math.abs(b-e.midi)?a:b);target=e.midi;}
  sounding.forEach((i,k)=>{const e=events[i],next=sounding[k+1];if(next===undefined||e.cadence)return;const distance=next-i+(events[next].offset||0)-(e.offset||0),phraseEnd=Math.floor(i/(barSize*4))!==Math.floor(next/(barSize*4));e.hold=Math.max(.5,distance-(phraseEnd?.32:.04));e.level*=.94+.06*Math.sin((i%(barSize*4))/(barSize*4)*Math.PI);});
 },
 note(ctx,destination,midi,at,duration,level,instrument='piano',track){InstrumentBank.play(ctx,destination,midi,at,duration,level,instrument,track);},
 event(ctx,destination,s,i,at,track){const e=s.events[i],step=30/s.bpm;if(!e)return;const ensemble={jazz:{lead:'epiano',chord:'vibes',bass:'bass',accent:'clarinet'},woodland:{lead:'marimba',chord:'guitar',bass:'bass',accent:'flute'},oriental:{lead:'shakuhachi',chord:'koto',bass:'cello',accent:'flute'},strings:{lead:'violin',chord:'violin',bass:'cello',accent:'harp'},chamber:{lead:'flute',chord:'piano',bass:'cello',accent:'harp'},lyrical:{lead:'piano',chord:'guitar',bass:'cello',accent:'flute'},minimal:{lead:'harp',chord:'piano',bass:'cello',accent:'flute'},waltz:{lead:'violin',chord:'piano',bass:'cello',accent:'harp'},pulse:{lead:'guitar',chord:'piano',bass:'cello',accent:'koto'}}[s.style]||{lead:'piano',chord:'guitar',bass:'cello',accent:'flute'},lead=s.instrument==='auto'?ensemble.lead:s.instrument;
 let role='melody';const note=(n,d,l,instr=lead,offset=0,noteRole=role)=>{n=Math.max(36,Math.min(84,Math.round(n)));if(!ctx){track.record?.({midi:n,at:at+offset,duration:d,level:l,instrument:instr,role:noteRole,bar:e.bar});track.add(instr+':'+n);return;}this.note(ctx,destination,n,at+offset,d,l,instr,track);};
 if(!e.rest)note(e.midi,step*e.hold,e.level*(.8+(s.rhythmic??50)/250),lead,step*(e.offset||0));
 role='harmony';const oriental=s.style==='oriental',root=e.bassRoot??e.chord[0],chord=oriental?[root,root+7,root+12]:e.chord;
 if(e.accent||e.cadence){note(root-12,step*(e.cadence?2.1:s.barSize*.92),.06,ensemble.bass,0,'bass');if(s.richness!=='simple'&&s.style!=='minimal')chord.forEach((n,j)=>note(n,step*(e.cadence?2.1:s.barSize*.96),s.style==='strings'?.022:.027,ensemble.chord,j*(oriental?step*.24:.035)));}
 if(i<s.steps-2){
 if(s.richness!=='simple' && !e.accent && i%s.barSize===(e.bar%2?5:3)) note(chord[(e.bar+1)%3],step*1.7,.03,ensemble.chord,step*.12);
 if(s.style==='jazz'&&i%s.barSize===4)note(chord[2]-12,step*1.6,.05,ensemble.bass,0,'bass');
 if(s.style==='woodland'&&i%s.barSize===6)note(chord[1]+12,step*1.3,.035,'vibes');
if(s.style==='strings'&&i%4===2)note(chord[1]+12,step*1.4,.035,'harp');if(oriental&&i%4===2)note(chord[(i/2)%3|0],step*1.5,.06,'koto');if(s.style==='waltz'&&i%2===0&&!e.accent)chord.forEach(n=>note(n,step*.75,.03,'piano'));if(s.style==='pulse'&&i%2===0)note(root-12,step*.55,.07,'guitar',0,'bass');
 role='detail';for(const x of e.extra)if(i%s.barSize!==0)note(oriental?chord[(i/2)%3|0]:x.midi,step*x.hold,.035,ensemble.accent);
 // A restrained answering instrument makes even a single drawn stroke an ensemble.
 if(!e.extra.length&&i%s.barSize===s.barSize-3&&!e.rest&&s.style!=='minimal')note(chord[2]+12,step*1.4,.025,ensemble.accent);
 }
 },
 graph(ctx,volume,destination,expression={}){const gain=ctx.createGain(),limiter=ctx.createDynamicsCompressor(),filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=2500+(expression.brightness??65)*100;gain.gain.value=volume;limiter.threshold.value=-12;limiter.ratio.value=6;gain.connect(filter);filter.connect(limiter);const room=ctx.createConvolver(),wet=ctx.createGain(),impulse=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*1.25),ctx.sampleRate);let seed=1234567;for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*Math.pow(1-i/data.length,3);}}room.buffer=impulse;wet.gain.value=(expression.spatial??50)/400;gain.connect(room);room.connect(wet);wet.connect(limiter);limiter.connect(destination||ctx.destination);gain.expression=(s)=>{filter.frequency.setTargetAtTime(2500+(s.brightness??65)*100,ctx.currentTime,.03);wet.gain.setTargetAtTime((s.spatial??50)/400,ctx.currentTime,.03);};return gain;},
 async render(s){const AC=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!AC)throw Error('浏览器不支持离线音频');const duration=s.steps*30/s.bpm+2,ctx=new AC(2,Math.ceil(duration*44100),44100),gain=this.graph(ctx,s.volume,undefined,s);await InstrumentBank.prepare(ctx,s);s.events.forEach((_,i)=>this.event(ctx,gain,s,i,i*30/s.bpm));const rendered=await ctx.startRendering();let peak=0;for(const channel of [0,1]){const data=rendered.getChannelData(channel);for(let i=0;i<data.length;i+=8)peak=Math.max(peak,Math.abs(data[i]));}if(s.volume>0&&peak<.00001)throw Error('音频生成后无有效声音，请重新准备乐器');return rendered;}
};
if(typeof module!=='undefined')module.exports=Music30;
if(typeof document!=='undefined'){
let generation=0,preparing=false;let ctx,gain,timer,enabled=false,epoch=0,next=0,snapshot,voices=new Set();const baseAnimate=animate,basePlaying=setPlaying,baseRecurve=recurve;
let timingFeatures=null,timingCount=0,timingComplexity=0;
function refreshTiming(){window.dispatchEvent(new Event('scorechange'));timingFeatures=Music30.features(strokes);timingCount=strokes.filter(p=>p.length>1).length;timingComplexity=Music30.complexity(strokes);}
function currentTiming(){if(!timingFeatures)refreshTiming();const t=Music30.timing([],{complexity:timingComplexity,style:$('style').value,bars:$('songLength').value,speed:1}),bpm=Math.max(40,Math.min(168,+$('bpm').value||88));return{...t,bpm,seconds:t.bars*t.barSize*30/bpm};}
window.musicSnapshot=()=>{const units=window.getFourierUnits?.()||[],paths=units.length?units.map(u=>u.source):strokes;const options={bpm:currentTiming().bpm,volume:+$('volume').value/100*.7,richness:$('richness').value,mood:window.musicMood||'neutral',mode:$('musicMode')?.value||'auto',tonic: $('musicTonic')?.value && $('musicTonic').value!=='auto' ? +$('musicTonic').value : (window.musicMood==='cool' ? ($('musicMode')?.value==='major'?60:69) : $('musicMode')?.value==='natural-minor'?62:window.musicMood==='warm'?65:60),...(window.emotionSettings||{}),style:$('style').value,instrument:$('instrument').value,bars:currentTiming().bars};return{...options,...Music30.arrange(paths,options)};};window.renderMusicBuffer=s=>Music30.render(s);
for(let i=0;i<16;i++){$('beats').appendChild(Object.assign(document.createElement('span'),{style:'height:6px;flex:1;border-radius:3px;background:#d4ded7'}));}
function silence(){for(const o of voices)try{o.stop();}catch{}voices.clear();}
function schedule(){if(!enabled||preparing||!playing||ctx.state!=='running')return;const step=30/snapshot.bpm,cycle=snapshot.steps*step+2;while(true){const round=Math.floor(next/snapshot.steps),i=next%snapshot.steps,at=epoch+round*cycle+i*step;if((!$('loop').checked&&round>0)||at>ctx.currentTime+.12)break;if(at>=ctx.currentTime-.1)Music30.event(ctx,gain,snapshot,i,Math.max(ctx.currentTime,at),voices);next++;}}
async function restart(){if(!enabled)return;const token=++generation;preparing=true;silence();const nextSnapshot=window.musicSnapshot();$('musicInfo').textContent='正在准备采样乐器…';try{await InstrumentBank.prepare(ctx,nextSnapshot);if(token!==generation)return;snapshot={...nextSnapshot,bpm:currentTiming().bpm};gain.gain.value=snapshot.volume;gain.expression?.(snapshot);epoch=ctx.currentTime+.1;next=0;time=0;preparing=false;schedule();}catch(e){if(token!==generation)return;disable();$('musicInfo').textContent='乐器准备失败：'+e.message;}}
function disable(){generation++;preparing=false;enabled=false;clearInterval(timer);silence();$('speed').disabled=false;$('musicPlay').textContent='♫ 播放音乐';}
async function start(){if(!curve.length)return;try{if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();gain=Music30.graph(ctx,1);}await ctx.resume();enabled=true;basePlaying(true);$('musicPlay').textContent='Ⅱ 暂停音乐';$('speed').disabled=false;await restart();if(!enabled)return;clearInterval(timer);timer=setInterval(schedule,25);}catch(e){disable();$('musicInfo').textContent='播放失败：'+e.message;}}
setPlaying=function(v){basePlaying(v);if(enabled){$('musicPlay').textContent=v?'Ⅱ 暂停音乐':'♫ 继续音乐';if(v)ctx.resume().then(schedule);else ctx.suspend();}};
animate=function(now){if(preparing){last=now;paint();requestAnimationFrame(animate);return;}if(!enabled){baseAnimate(now);return;}last=now;if(playing&&ctx.state==='running'){const draw=snapshot.steps*30/snapshot.bpm,cycle=draw+2,pos=Math.max(0,ctx.currentTime-epoch),phase=$('loop').checked?pos%cycle:pos;time=Math.min(1,phase/draw);$('musicInfo').textContent=phase>=draw?'绘图完成 · 尾音渐弱':(snapshot.events[Math.min(snapshot.steps-1,Math.floor(phase/(30/snapshot.bpm)))]?.section||'')+' · 第 '+(Math.min(snapshot.bars,Math.floor(phase/(30/snapshot.bpm)/snapshot.barSize)+1))+' / '+snapshot.bars+' 小节 · 第 '+(Math.min(Math.ceil(snapshot.bars/4),Math.floor(time*snapshot.bars/4)+1))+' 乐章';$('beats').childNodes.forEach((e,i)=>e.style.background=i===Math.min(15,Math.floor(time*16))?'#b47c36':'#d4ded7');if(!$('loop').checked&&phase>=cycle){setPlaying(false);$('musicInfo').textContent='本段完成 · 已回到主和弦。点击播放可重新演奏。';}}paint();requestAnimationFrame(animate);};
recurve=function(){baseRecurve();refreshTiming();durationInfo();if(enabled){if(curve.length)restart();else disable();}};
$('musicPlay').onclick=()=>{if(!enabled||time>=1)start();else setPlaying(!playing);};$('restart').onclick=()=>{time=0;if(enabled)start();else setPlaying(true);};$('play').onclick=()=>{if(enabled&&time>=1)start();else setPlaying(!playing);};
$('bpm').oninput=()=>{$('bpmValue').textContent=$('bpm').value;restart();};for(const id of ['richness','style','instrument','songLength'])$(id).onchange=restart;$('volume').oninput=()=>{if(gain)gain.gain.setTargetAtTime(+$('volume').value/100*.7,ctx.currentTime,.03);};window.addEventListener('tonechange',restart);window.addEventListener('fourier-silent-edit',disable);input.addEventListener('pointerdown',()=>{if(enabled)setPlaying(false);});document.addEventListener('visibilitychange',()=>{if(document.hidden&&enabled)setPlaying(false);});window.addEventListener('pagehide',()=>ctx?.suspend());
// Seeking uses the same note schedule as live playback and exports.
window.seekMusic=async fraction=>{
 if(!curve.length||window.imageProcessing)return;fraction=Math.max(0,Math.min(.999999,Number(fraction)||0));
 const token=++generation;preparing=true;silence();
 try{if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();gain=Music30.graph(ctx,1);}await ctx.resume();if(token!==generation)return;
 const targetSnapshot=window.musicSnapshot();await InstrumentBank.prepare(ctx,targetSnapshot);if(token!==generation)return;
 snapshot={...targetSnapshot,bpm:currentTiming().bpm};gain.gain.value=snapshot.volume;gain.expression?.(snapshot);const step=30/snapshot.bpm,target=fraction*snapshot.steps*step,when=ctx.currentTime+.04;
 epoch=when-target;next=Math.min(snapshot.steps,Math.floor(target/step)+1);time=fraction;enabled=true;preparing=false;basePlaying(true);$('musicPlay').textContent='Ⅱ 暂停音乐';
 const collector={add(){},record(n){const end=n.at+n.duration;if(end<=target)return;Music30.note(ctx,gain,n.midi,when+Math.max(0,n.at-target),end-Math.max(target,n.at),n.level,n.instrument,voices);}};
 for(let i=0;i<next;i++)Music30.event(null,null,snapshot,i,i*step,collector);
 clearInterval(timer);timer=setInterval(schedule,25);schedule();paint();
 }catch(e){if(token!==generation)return;disable();$('musicInfo').textContent='跳转失败：'+e.message;}
};
window.drawingSeconds=()=>currentTiming().seconds;
function durationInfo(){const seconds=window.drawingSeconds();$('durationInfo').textContent=($('songLength').value==='auto'?'自动安排 · ':'')+currentTiming().movements+' 乐章 · '+currentTiming().bars+' 小节 · 预计 '+Math.round(seconds)+' 秒 + 2 秒尾音';}
$('speed').oninput=()=>{
 $('speedValue').innerHTML=(+$('speed').value).toFixed(2)+'<small> ×</small>';durationInfo();window.dispatchEvent(new Event('scorechange'));
 if(!enabled||preparing||!snapshot)return;
 const now=ctx.currentTime,oldStep=30/snapshot.bpm,oldDraw=snapshot.steps*oldStep,oldCycle=oldDraw+2,elapsed=Math.max(0,now-epoch),phase=$('loop').checked?elapsed%oldCycle:Math.min(elapsed,oldCycle),position=Math.min(snapshot.steps,phase/oldStep);
 silence();snapshot={...snapshot,bpm:currentTiming().bpm};const step=30/snapshot.bpm,draw=snapshot.steps*step;
 epoch=now-(phase>=oldDraw?draw+(phase-oldDraw):position*step);next=Math.min(snapshot.steps,Math.ceil(position));schedule();
};
for(const id of ['songLength','style','bpm'])$(id).addEventListener(id==='bpm'?'input':'change',durationInfo);window.addEventListener('tonechange',durationInfo);durationInfo();
}

