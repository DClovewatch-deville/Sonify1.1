/* Independent Fourier series per stroke; open strokes use a reflected return path. */
const MultiFourier={
 build(paths){const cap=paths.filter(p=>p.length>1).length===1?2048:512;return paths.filter(p=>p.length>1).map(p=>{
  let length=0;for(let i=1;i<p.length;i++)length+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
  if(length<1e-7)return null;
  const closed=Math.hypot(p[0].x-p.at(-1).x,p[0].y-p.at(-1).y)<1e-5;
  const n=Math.min(cap,Math.max(32,2**Math.ceil(Math.log2(Math.max(p.length*2,length*160)))));
  const source=closed?p:p.concat(p.slice(1,-1).reverse());
  const sampled=Fourier.resample(source,n),coeff=Fourier.transform(sampled);
  return {source:p,closed,n,length,coeff,used:[],curve:[],center:p.reduce((s,q)=>({x:s.x+q.x/p.length,y:s.y+q.y/p.length}),{x:0,y:0})};
 }).filter(Boolean);},
 update(units,quality){for(const u of units){const dc=u.coeff.find(c=>c.freq===0),other=u.coeff.filter(c=>c.freq!==0);const take=Math.max(2,Math.round((u.n-1)*quality/1024));u.used=[dc,...other.slice(0,take)].filter(Boolean);const steps=Math.max(64,u.n);u.curve=Array.from({length:steps+1},(_,i)=>Fourier.endpoint(u.used,i/steps*(u.closed?1:.5)));}return units;},
 voices(units){if(!units.length)return [];let xmin=Infinity,xmax=-Infinity;for(const u of units){xmin=Math.min(xmin,u.center.x);xmax=Math.max(xmax,u.center.x);}const groups=Array.from({length:4},()=>[]);for(const u of units){const k=Math.min(3,Math.floor((u.center.x-xmin)/Math.max(1e-8,xmax-xmin)*4));u.group=k;groups[k].push(u);}return groups.filter(g=>g.length).map(g=>g.sort((a,b)=>b.length-a.length).flatMap(u=>u.curve));}
};
if(typeof module!=='undefined')module.exports=MultiFourier;
if(typeof document!=='undefined'){
 let units=[];const baseRebuild=rebuild,baseRecurve=recurve,basePaint=paint;
 const enabled=()=>$('multiMode').value==='multi';
 window.getFourierUnits=()=>enabled()?units:[];
 window.getFourierVoices=()=>enabled()?MultiFourier.voices(units):[];
 rebuild=function(reset=true){units=MultiFourier.build(strokes);baseRebuild(reset);};
 recurve=function(){baseRecurve();if(!enabled()){$('multiInfo').textContent='单组模式：所有笔画共享 1024 个采样点。';return;}MultiFourier.update(units,+$('count').value);const total=units.reduce((s,u)=>s+u.used.length,0);$('countValue').textContent=Math.round(+$('count').value/1024*100)+'%';$('multiInfo').textContent=units.length+' 组独立绘图 · 共 '+total+' 个系数 · '+MultiFourier.voices(units).length+' 个音乐声部';};
 paint=function(){if(window.imageProcessing)return;if(!enabled()||!units.length){basePaint();return;}const v=frame(output,ro),colors=['#327b65','#487d9e','#b18a42','#8b689a'];
  for(let i=0;i<units.length;i++){const u=units[i],c=colors[u.group||0];if($('original').checked)line(ro,u.source,'#b2c2b6',1/v.s);if($('whole').checked)line(ro,u.curve,'#94ada0',1.1/v.s);line(ro,u.curve.slice(0,Math.floor(time*(u.curve.length-1))+1),c,1.8/v.s);}
  // A few representative circle chains keep the canvas readable and frame cost bounded.
  const shown=units.slice().sort((a,b)=>b.length-a.length).slice(0,4);
  for(let i=0;i<shown.length;i++){const u=shown[i],t=time*(u.closed?1:.5);let used=u.used;used=performanceOrbitChain(used);let p={x:0,y:0};for(const c of used){const a=c.freq*t*2*Math.PI+c.phase,q={x:p.x+c.amp*Math.cos(a),y:p.y+c.amp*Math.sin(a)};if($('circles').checked&&c.amp*v.s>1){if(c.freq!==0){ro.beginPath();ro.arc(p.x,p.y,c.amp,0,2*Math.PI);ro.setLineDash(c.orbitGuide?[3/v.s,4/v.s]:[]);ro.strokeStyle=colors[u.group||0]+'80';ro.lineWidth=(c.orbitMain?1.6:1.15)/v.s;ro.stroke();ro.setLineDash([]);}line(ro,[p,q],colors[u.group||0]+'a0',1.15/v.s);}p=q;}ro.beginPath();ro.arc(p.x,p.y,3.6/v.s,0,Math.PI*2);ro.fillStyle=colors[u.group||0];ro.fill();}
 };
 $('multiMode').onchange=()=>{recurve();time=0;paint();};
 // The first build precedes this extension; rebuild once to initialize its independent units.
 if(strokes.length>8)$('count').value=1024;
 rebuild(false);
}
