// Trace both outside and inside glyph boundaries; only outlines are displayed.
function traceGlyphMask(data,w,h){
 const edges=[],starts=new Map(),solid=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&data[(y*w+x)*4+3]>127;
 function edge(x,y,u,v){const i=edges.length;edges.push({x,y,u,v,used:false});const key=y*(w+1)+x;if(!starts.has(key))starts.set(key,[]);starts.get(key).push(i);}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(solid(x,y)){
  if(!solid(x,y-1))edge(x,y,x+1,y);
  if(!solid(x+1,y))edge(x+1,y,x+1,y+1);
  if(!solid(x,y+1))edge(x+1,y+1,x,y+1);
  if(!solid(x-1,y))edge(x,y+1,x,y);
 }
 const contours=[];
 for(const start of edges){if(start.used)continue;let e=start,loop=[],guard=0;
  while(e&&!e.used&&guard++<=edges.length){e.used=true;loop.push({x:e.x,y:e.y});if(e.u===start.x&&e.v===start.y)break;const candidates=(starts.get(e.v*(w+1)+e.u)||[]).map(i=>edges[i]).filter(v=>!v.used);
   // Prefer a right turn at diagonally touching pixels to keep separate loops.
   const dx=e.u-e.x,dy=e.v-e.y;candidates.sort((a,b)=>{const score=v=>{const cross=dx*(v.v-v.y)-dy*(v.u-v.x),dot=dx*(v.u-v.x)+dy*(v.v-v.y);return cross>0?0:dot>0?1:cross<0?2:3;};return score(a)-score(b);});e=candidates[0];
  }
  if(loop.length<8)continue;let area=0;for(let i=0;i<loop.length;i++){let a=loop[i],b=loop[(i+1)%loop.length];area+=a.x*b.y-a.y*b.x;}if(Math.abs(area)<12)continue;
  // Remove collinear raster edges while preserving corners and counters.
  loop=loop.filter((b,i,a)=>{const p=a[(i+a.length-1)%a.length],n=a[(i+1)%a.length];return(b.x-p.x)*(n.y-b.y)!==(b.y-p.y)*(n.x-b.x);});
  function simplify(a){if(a.length<=2)return a;const p=a[0],q=a.at(-1),dx=q.x-p.x,dy=q.y-p.y,den=dx*dx+dy*dy;let best=.75*.75,k=-1;for(let i=1;i<a.length-1;i++){const v=a[i],t=den?Math.max(0,Math.min(1,((v.x-p.x)*dx+(v.y-p.y)*dy)/den)):0,d=(v.x-p.x-t*dx)**2+(v.y-p.y-t*dy)**2;if(d>best){best=d;k=i;}}return k<0?[p,q]:simplify(a.slice(0,k+1)).slice(0,-1).concat(simplify(a.slice(k)));}
  if(loop.length>=3){const mid=Math.floor(loop.length/2);loop=simplify(loop.slice(0,mid+1)).slice(0,-1).concat(simplify(loop.slice(mid).concat([loop[0]])));contours.push(loop);}
 }
 return contours;
}
if(typeof module!=='undefined')module.exports={traceGlyphMask};
if(typeof document!=='undefined'){
let textMode=false,gaps=[];
const fingerprint=()=>{let h=2166136261;for(const c of JSON.stringify(strokes))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
try{const meta=JSON.parse(localStorage.getItem('fourier-text-v11'));if(meta&&meta.hash===fingerprint()&&Array.isArray(meta.gaps)){textMode=true;gaps=meta.gaps;$('textInput').value=meta.value;textMessage('已恢复上次的空心文字。');}}catch{}
function textMessage(s){$('textInfo').textContent=s;}
function makeText(listen){
 const value=$('textInput').value.trim();const chars=Array.from(value.replace(/\s/g,''));
 if(!chars.length){textMessage('请输入文字后再生成，当前画布已保留。');$('textInput').focus();return;}
 if(Array.from(value.replace(/\n/g,'')).length>24){textMessage('请将文字缩短到 24 个字符以内，让空心字保持清晰。');return;}
 const bitmap=document.createElement('canvas');bitmap.width=720;bitmap.height=480;const pen=bitmap.getContext('2d',{willReadFrequently:true});
 const font='800 100px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';pen.font=font;
 const lines=[];for(const paragraph of value.split('\n')){let line='';for(const c of Array.from(paragraph)){if(line&&pen.measureText(line+c).width>640){lines.push(line);line=c;}else line+=c;}lines.push(line);}
 if(lines.length>4){textMessage('最多显示四行，请减少换行或缩短文字。');return;}
 const fontSize=Math.min(100,360/(lines.length*1.3));pen.font=font.replace('100px',fontSize+'px');pen.textAlign='center';pen.textBaseline='middle';pen.fillStyle='#fff';lines.forEach((line,i)=>pen.fillText(line,360,240+(i-(lines.length-1)/2)*fontSize*1.3));
 let contours=traceGlyphMask(pen.getImageData(0,0,720,480).data,720,480);if(!contours.length){textMessage('未找到可绘制轮廓，请尝试中文、英文或数字。');return;}
 let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const c of contours)for(const p of c){xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);}
 // Fit to the narrower of both canvases, centered on the actual ink bounds.
 const boxes=[input,output].map(c=>c.getBoundingClientRect()).filter(b=>b.width>0&&b.height>0);const maxWidth=boxes.length?Math.min(2.05,Math.min(...boxes.map(b=>b.width/(Math.min(b.width,b.height)*.4)))*.8):2.05;
 const factor=Math.min(maxWidth/(xmax-xmin),1.85/(ymax-ymin)),cx=(xmin+xmax)/2,cy=(ymin+ymax)/2;
 contours=contours.map(c=>c.map(p=>({x:(p.x-cx)*factor,y:(p.y-cy)*factor})));
 // Nearest-endpoint traversal reduces silent connectors between contours.
 const ordered=[];let cursor={x:-maxWidth/2,y:-.9};while(contours.length){let best=0,bestPoint=0,d=Infinity;for(let i=0;i<contours.length;i++)for(let j=0;j<contours[i].length-1;j++){const p=contours[i][j],dist=(p.x-cursor.x)**2+(p.y-cursor.y)**2;if(dist<d){d=dist;best=i;bestPoint=j;}}let c=contours.splice(best,1)[0];c.pop();c=c.slice(bestPoint).concat(c.slice(0,bestPoint));c.push({...c[0]});ordered.push(c);cursor=c.at(-1);}
 textMode=true;strokes=ordered;redo=[];gaps=[];let length=0;
 for(let i=0;i<strokes.length;i++){const c=strokes[i];for(let j=1;j<c.length;j++)length+=Math.hypot(c[j].x-c[j-1].x,c[j].y-c[j-1].y);const a=c.at(-1),b=strokes[(i+1)%strokes.length][0],next=length+Math.hypot(a.x-b.x,a.y-b.y);if(next>length)gaps.push([length,next]);length=next;}
 gaps=gaps.map(([a,b])=>[a/length,b/length]);$('count').value=1024;rebuild();setPlaying(true);try{localStorage.setItem('fourier-text-v11',JSON.stringify({value,gaps,hash:fingerprint()}));}catch{}
 textMessage('已生成空心文字「'+value.replace(/\n/g,' / ')+'」 · '+strokes.length+' 条轮廓 · 已自动居中');status('文字轮廓已生成。转移笔尖时不画连接线；可调节圆数量观察重建效果。');
 if(listen&&!$('musicPlay').textContent.includes('暂停音乐'))$('musicPlay').click();
}
window.addEventListener('sketchpaths',()=>{textMode=true;gaps=[];let length=0;for(let i=0;i<strokes.length;i++){const c=strokes[i];for(let j=1;j<c.length;j++)length+=Math.hypot(c[j].x-c[j-1].x,c[j].y-c[j-1].y);const a=c.at(-1),b=strokes[(i+1)%strokes.length][0],end=length+Math.hypot(a.x-b.x,a.y-b.y);if(end>length)gaps.push([length,end]);length=end;}gaps=gaps.map(([a,b])=>[a/length,b/length]);try{localStorage.setItem('fourier-text-v11',JSON.stringify({value:$('textInput').value,gaps,hash:fingerprint()}));}catch{} });
const baseLine=line;line=function(ctx,p,color,width,close=false){
 if(textMode&&ctx===ro&&p.length>3&&['#3b515e','#658e82','#abf0d0'].includes(color)){
  const total=color==='#3b515e'?samples.length:curve.length-1;let chunk=[];for(let i=0;i<p.length;i++){if(gaps.some(([a,b])=>i/total>=a&&i/total<=b)){if(chunk.length>1)baseLine(ctx,chunk,color,width);chunk=[];}else chunk.push(p[i]);}if(chunk.length>1)baseLine(ctx,chunk,color,width);return;
 }baseLine(ctx,p,color,width,close);
};
$('textGenerate').onclick=()=>makeText(false);$('textListen').onclick=()=>makeText(true);
$('textInput').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();makeText(true);}e.stopPropagation();});
input.addEventListener('pointerdown',()=>{textMode=false;});
for(const id of ['undo','redo','clear'])$(id).addEventListener('click',()=>{textMode=false;});
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{textMode=false;}));
}
