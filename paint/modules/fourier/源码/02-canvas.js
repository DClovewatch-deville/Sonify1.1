// An equal split of the dominant Fourier vector makes the visible main circle
// orbit its original anchor by exactly its own radius, without changing the sum.
function performanceOrbitChain(coefficients){
 const dc=coefficients.filter(c=>c.freq===0),moving=coefficients.filter(c=>c.freq!==0).slice().sort((a,b)=>b.amp-a.amp);
 if(!moving.length||moving[0].amp<1e-12)return coefficients;
 const lead=moving.shift(),radius=lead.amp/2,result=[...dc,{...lead,amp:radius,orbitGuide:true},{...lead,amp:radius,orbitMain:true}];
 for(const c of moving){const pieces=Math.max(1,Math.ceil(c.amp/radius));for(let i=0;i<pieces;i++)result.push({...c,amp:c.amp/pieces});}
 return result;
}

const $=id=>document.getElementById(id), input=$('draw'),output=$('result'),di=input.getContext('2d'),ro=output.getContext('2d');
let strokes=[],redo=[],coeff=[],samples=[],curve=[],time=0,playing=true,active=null,last=0,full=false;
const N=1024;let count=256;
function status(s){$('status').textContent=s;}
function save(){try{localStorage.setItem('fourier-drawing-v1',JSON.stringify(strokes));}catch{}}
function size(c){let b=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);if(c.width!==Math.round(b.width*d)||c.height!==Math.round(b.height*d)){c.width=Math.round(b.width*d);c.height=Math.round(b.height*d);}return{w:b.width,h:b.height,d,s:Math.min(b.width,b.height)*.4};}
function point(e){let b=input.getBoundingClientRect(),s=Math.min(b.width,b.height)*.4;return{x:(e.clientX-b.left-b.width/2)/s,y:(e.clientY-b.top-b.height/2)/s};}
function frame(c,ctx){let v=size(c);ctx.setTransform(v.d,0,0,v.d,0,0);ctx.clearRect(0,0,v.w,v.h);ctx.fillStyle='#f5f7f0';ctx.fillRect(0,0,v.w,v.h);ctx.fillStyle='#dbe3d9';for(let x=v.w/2%24;x<v.w;x+=24)for(let y=v.h/2%24;y<v.h;y+=24){ctx.beginPath();ctx.arc(x,y,.65,0,7);ctx.fill();}ctx.translate(v.w/2,v.h/2);ctx.scale(v.s,v.s);return v;}
function line(ctx,p,color,width,close=false){if(!p.length)return;ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);if(close)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}
function drawInput(){let v=frame(input,di);for(const s of strokes)line(di,s,'#327b65',2/v.s);if(active)line(di,active,'#b47c36',2/v.s);$('empty').style.display=strokes.length||active?'none':'flex';$('strokeCount').textContent=strokes.length+' 笔';$('undo').disabled=!strokes.length;$('redo').disabled=!redo.length;}
function rebuild(reset=true){samples=Fourier.resample(strokes.flat(),N);coeff=samples.length?Fourier.transform(samples):[];recurve();if(reset){time=0;full=false;}save();drawInput();$('play').disabled=!coeff.length;$('export').disabled=!coeff.length;}
function recurve(){count=+$('count').value;$('countValue').innerHTML=count+' <small>/ 1024</small>';let used=coeff.slice(0,count);curve=coeff.length?Array.from({length:1025},(_,i)=>Fourier.endpoint(used,i/1024)):[];}
function paint(){let v=frame(output,ro);if(!coeff.length){ro.setTransform(v.d,0,0,v.d,0,0);ro.fillStyle='#91a8b5';ro.textAlign='center';ro.font='14px sans-serif';ro.fillText('在你的画布画一笔，圆圈就会开始旋转',v.w/2,v.h/2);return;}
 if($('original').checked)line(ro,samples,'#b2c2b6',1.2/v.s,true);
 if($('whole').checked)line(ro,curve,'#658e82',1/v.s);
 line(ro,curve.slice(0,Math.floor(time*1024)+1),'#327b65',2.2/v.s);
 // Reordering vector addition preserves the drawing while letting the largest
 // circle ride on the smaller rotating vectors instead of a fixed origin.
 let used=coeff.slice(0,count),largest=used.find(c=>c.freq!==0);
 used=performanceOrbitChain(used);largest=used.find(c=>c.orbitMain);
 let p={x:0,y:0};for(const c of used){let a=c.freq*time*2*Math.PI+c.phase,q={x:p.x+c.amp*Math.cos(a),y:p.y+c.amp*Math.sin(a)};if($('circles').checked){if(c.freq!==0){ro.beginPath();ro.arc(p.x,p.y,c.amp,0,2*Math.PI);ro.setLineDash(c.orbitGuide?[3/v.s,4/v.s]:[]);ro.strokeStyle=c===largest?'#386c58b3':'#52786b80';ro.lineWidth=(c===largest?1.8:1.15)/v.s;ro.stroke();ro.setLineDash([]);if(c===largest){ro.beginPath();ro.arc(p.x,p.y,c.amp,a-.23,a+.23);ro.strokeStyle='#b47c36';ro.lineWidth=3/v.s;ro.stroke();ro.beginPath();ro.arc(q.x,q.y,3/v.s,0,2*Math.PI);ro.fillStyle='#b47c36';ro.fill();}}line(ro,[p,q],'#568775bb',1.1/v.s);}p=q;}
 ro.beginPath();ro.arc(p.x,p.y,4/v.s,0,7);ro.fillStyle='#b47c36';ro.shadowColor='#b47c36';ro.shadowBlur=10;ro.fill();ro.shadowBlur=0;
}
function animate(now){let dt=last?Math.min((now-last)/1000,.05):0;last=now;if(playing&&coeff.length&&!active){time+=dt/(window.drawingSeconds?.()||53.3);if(time>=1){if($('loop').checked){time%=1;full=true;}else{time=1;setPlaying(false);status('已完成一轮。点击重新播放可再看一次。');}}}paint();requestAnimationFrame(animate);}
function setPlaying(v){playing=v;$('play').textContent=v?'Ⅱ 暂停':'▶ 继续';}
input.addEventListener('pointerdown',e=>{if(e.button!==0)return;input.setPointerCapture(e.pointerId);active=[point(e)];drawInput();});
input.addEventListener('pointermove',e=>{if(!active)return;let p=point(e),q=active.at(-1);if(Math.hypot(p.x-q.x,p.y-q.y)>.004){active.push(p);drawInput();}});
function finish(){if(!active)return;if(active.length>1){strokes.push(active);redo=[];}active=null;rebuild();setPlaying(true);status('已更新图案。拖动周转圆数量，观察还原精度。');}
input.addEventListener('pointerup',finish);input.addEventListener('pointercancel',()=>{active=null;drawInput();});
$('undo').onclick=()=>{if(strokes.length)redo.push(strokes.pop());rebuild();status('已撤销一笔。');};$('redo').onclick=()=>{if(redo.length)strokes.push(redo.pop());rebuild();status('已重做一笔。');};
$('clear').onclick=()=>{redo=strokes.slice().reverse();strokes=[];rebuild();status('画布已清空，点击重做可恢复。');};
$('play').onclick=()=>{if(time>=1)time=0;setPlaying(!playing);};$('restart').onclick=()=>{time=0;setPlaying(true);};$('count').oninput=()=>{recurve();paint();};$('speed').oninput=()=>{$('speedValue').innerHTML=(+$('speed').value).toFixed(1)+'<small> ×</small>';};
window.addEventListener('keydown',e=>{if(['INPUT','SELECT','BUTTON'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();$('play').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}});
function preset(name){let pts=[];if(name==='cat')pts=[[-.85,.6],[-.85,-.85],[-.4,-.45],[.35,-.45],[.85,-.85],[.85,.55],[.55,.85],[-.5,.85]].map(([x,y])=>({x,y}));else if(name==='square')pts=[[-.8,-.8],[.8,-.8],[.8,.8],[-.8,.8]].map(([x,y])=>({x,y}));else if(name==='star')pts=Array.from({length:10},(_,i)=>{let a=i*Math.PI/5-Math.PI/2,r=i%2?.43:.98;return{x:r*Math.cos(a),y:r*Math.sin(a)};});else for(let i=0;i<600;i++){let a=2*Math.PI*i/600;if(name==='heart')pts.push({x:Math.pow(Math.sin(a),3),y:-(13*Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))/17});else if(name==='flower'){let r=.66+.28*Math.cos(5*a);pts.push({x:r*Math.sin(a),y:-r*Math.cos(a)});}else pts.push({x:Math.cos(a)/(1+Math.sin(a)**2),y:1.6*Math.sin(a)*Math.cos(a)/(1+Math.sin(a)**2)});}
 strokes=[pts];redo=[];rebuild();setPlaying(true);status('示例已载入。想画自己的图案，可先点击清空。');}
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
$('export').onclick=()=>{paint();output.toBlob(blob=>{if(!blob){status('图片生成失败，请重试。');return;}let url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Sonify paint with Fourier-'+count+'个圆.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status('已保存当前动画画面。勾选完整重建轮廓可导出完整图案。');});};
new ResizeObserver(()=>{drawInput();paint();}).observe(document.querySelector('.workspace'));
try{let s=JSON.parse(localStorage.getItem('fourier-drawing-v1'));if(Array.isArray(s)&&s.length<1000&&s.every(a=>Array.isArray(a)&&a.length<100000&&a.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))))strokes=s;}catch{}
if(strokes.length){rebuild();status('已恢复上次的图案。');}else preset('flower');requestAnimationFrame(animate);
