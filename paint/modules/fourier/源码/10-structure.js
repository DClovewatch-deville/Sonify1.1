// Local image processing. This deliberately does not claim semantic recognition.
function extractStructure({rgba,w,h,mode,detail,subject,structural=false,grayInput=null,colorEdges=false}){
let repairedGaps=0;const gray=grayInput||new Float32Array(w*h),smooth=new Float32Array(w*h),mask=new Uint8Array(w*h);if(!grayInput)for(let i=0;i<w*h;i++){let a=rgba[i*4+3]/255;gray[i]=(.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])*a+255*(1-a);}
for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let i=y*w+x;smooth[i]=(gray[i]*4+(gray[i-1]+gray[i+1]+gray[i-w]+gray[i+w])*2+gray[i-w-1]+gray[i-w+1]+gray[i+w-1]+gray[i+w+1])/16;}
// Opponent colours retain equal-luminance boundaries. Smooth before differentiating
// to avoid turning colour sensor noise into extra strokes.
let chromaA,chromaB;
if(colorEdges&&mode!=='line'){
 const a=new Float32Array(w*h),b=new Float32Array(w*h);chromaA=new Float32Array(w*h);chromaB=new Float32Array(w*h);
 for(let i=0;i<w*h;i++){const alpha=rgba[4*i+3]/255,r=rgba[4*i],g=rgba[4*i+1],bl=rgba[4*i+2];a[i]=(r-g)*alpha;b[i]=(bl-(r+g)/2)*alpha;}
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;chromaA[i]=(a[i]*4+(a[i-1]+a[i+1]+a[i-w]+a[i+w])*2+a[i-w-1]+a[i-w+1]+a[i+w-1]+a[i+w+1])/16;chromaB[i]=(b[i]*4+(b[i-1]+b[i+1]+b[i-w]+b[i+w])*2+b[i-w-1]+b[i-w+1]+b[i+w-1]+b[i+w+1])/16;}
}
if(mode==='line'){
const threshold=95+detail*24;for(let i=0;i<w*h;i++)mask[i]=gray[i]<threshold?1:0;
// Zhang-Suen thinning turns thick ink into a single centerline.
for(let iter=0;iter<40;iter++){let removed=0;for(let pass=0;pass<2;pass++){const del=[];for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let i=y*w+x;if(!mask[i])continue;const n=[mask[i-w],mask[i-w+1],mask[i+1],mask[i+w+1],mask[i+w],mask[i+w-1],mask[i-1],mask[i-w-1]];let sum=n.reduce((a,b)=>a+b,0),changes=0;for(let j=0;j<8;j++)if(!n[j]&&n[(j+1)%8])changes++;if(sum<2||sum>6||changes!==1)continue;if(pass===0?(n[0]*n[2]*n[4]||n[2]*n[4]*n[6]):(n[0]*n[2]*n[6]||n[0]*n[4]*n[6]))continue;del.push(i);}for(const i of del)mask[i]=0;removed+=del.length;}if(!removed)break;}
}else{
const mag=new Float32Array(w*h),dir=new Uint8Array(w*h);let peak=0;for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){let i=y*w+x,gx=-smooth[i-w-1]+smooth[i-w+1]-2*smooth[i-1]+2*smooth[i+1]-smooth[i+w-1]+smooth[i+w+1],gy=-smooth[i-w-1]-2*smooth[i-w]-smooth[i-w+1]+smooth[i+w-1]+2*smooth[i+w]+smooth[i+w+1];if(chromaA){const ax=(chromaA[i+1]-chromaA[i-1])*1.25,ay=(chromaA[i+w]-chromaA[i-w])*1.25,bx=(chromaB[i+1]-chromaB[i-1])*1.25,by=(chromaB[i+w]-chromaB[i-w])*1.25;if(ax*ax+ay*ay>gx*gx+gy*gy){gx=ax;gy=ay;}if(bx*bx+by*by>gx*gx+gy*gy){gx=bx;gy=by;}}mag[i]=subject&&!subject[i]?0:Math.hypot(gx,gy);peak=Math.max(peak,mag[i]);dir[i]=Math.round((Math.atan2(gy,gx)*180/Math.PI+180)%180/45)%4;}
// Local histograms retain faint structures without letting one bright edge set the threshold for the whole image.
const tile=64,cols=Math.ceil(w/tile),rows=Math.ceil(h/tile),hist=new Uint32Array(cols*rows*256),totals=new Uint32Array(cols*rows),thresholds=new Float32Array(cols*rows);
for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;if(mag[i]<=4)continue;const k=Math.floor(y/tile)*cols+Math.floor(x/tile),bin=Math.min(255,Math.floor(mag[i]/4));hist[k*256+bin]++;totals[k]++;}
for(let k=0;k<totals.length;k++){const target=totals[k]*(.88-detail*.045);let sum=0,b=0;for(;b<255;b++){sum+=hist[k*256+b];if(sum>=target)break;}thresholds[k]=Math.max(8,Math.min(110,b*4)*(.95-detail*.045));}
const x0=new Uint16Array(w),x1=new Uint16Array(w),xf=new Float32Array(w),y0=new Uint16Array(h),y1=new Uint16Array(h),yf=new Float32Array(h);
for(let x=0;x<w;x++){const q=Math.max(0,Math.min(cols-1,x/tile-.5));x0[x]=Math.floor(q);x1[x]=Math.min(cols-1,x0[x]+1);xf[x]=q-x0[x];}for(let y=0;y<h;y++){const q=Math.max(0,Math.min(rows-1,y/tile-.5));y0[y]=Math.floor(q)*cols;y1[y]=Math.min(rows-1,Math.floor(q)+1)*cols;yf[y]=q-Math.floor(q);}
const weak=new Uint8Array(w*h),queue=[];

for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x,d=[1,w+1,w,w-1][dir[i]],high=(thresholds[y0[y]+x0[x]]*(1-xf[x])+thresholds[y0[y]+x1[x]]*xf[x])*(1-yf[y])+(thresholds[y1[y]+x0[x]]*(1-xf[x])+thresholds[y1[y]+x1[x]]*xf[x])*yf[y],low=high*.32;if(mag[i]<low||mag[i]<mag[i-d]||mag[i]<=mag[i+d])continue;weak[i]=1;if(mag[i]>=high){mask[i]=1;queue.push(i);}}
for(let q=0;q<queue.length;q++){const i=queue[q];for(const d of [-w-1,-w,-w+1,-1,1,w-1,w,w+1]){const j=i+d;if(j>=0&&j<mask.length&&weak[j]&&!mask[j]){mask[j]=1;queue.push(j);}}}
}
// Repair only short, supported gaps whose endpoint directions face each other.
// The bridge never crosses a subject mask or an existing third branch.
if(mode!=='line'){
 const ends=[],endAt=new Map();
 function adjacent(i){const out=[],x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if((!dx&&!dy)||x+dx<1||y+dy<1||x+dx>=w-1||y+dy>=h-1)continue;const j=i+dy*w+dx;if(mask[j]&&!(dx&&dy&&(mask[i+dx]||mask[i+dy*w])))out.push(j);}return out;}
 for(let y=3;y<h-3;y++)for(let xx=3;xx<w-3;xx++){const i=y*w+xx;if(!mask[i])continue;const ns=adjacent(i);if(ns.length!==1)continue;let prev=i,p=ns[0];for(let t=0;t<3;t++){const next=adjacent(p).filter(j=>j!==prev);if(next.length!==1)break;prev=p;p=next[0];}const vx=xx-p%w,vy=y-Math.floor(p/w),len=Math.hypot(vx,vy);if(len){const ep={i,x:xx,y,vx:vx/len,vy:vy/len,used:false};ends.push(ep);endAt.set(i,ep);}}
 for(const a of ends){if(a.used)continue;let best=null,dist=Infinity;for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.hypot(dx,dy);if(d<1.5||d>4.2||d>=dist)continue;const b=endAt.get((a.y+dy)*w+a.x+dx);if(!b||b.used||a.vx*dx/d+a.vy*dy/d<.78||b.vx*dx/d+b.vy*dy/d>-.78)continue;let ok=true;const steps=Math.ceil(d);for(let k=1;k<steps;k++){const px=Math.round(a.x+dx*k/steps),py=Math.round(a.y+dy*k/steps),j=py*w+px;if((subject&&!subject[j])||mask[j]){ok=false;break;}const contrast=Math.max(Math.abs(gray[j-1]-gray[j+1]),Math.abs(gray[j-w]-gray[j+w]));if(contrast<1.5){ok=false;break;}}if(ok){best=b;dist=d;}}if(best){repairedGaps++;const steps=Math.ceil(dist);for(let k=1;k<steps;k++)mask[Math.round(a.y+(best.y-a.y)*k/steps)*w+Math.round(a.x+(best.x-a.x)*k/steps)]=1;a.used=best.used=true;}}
}
// Border pixels are excluded: cropping is not an object boundary.
for(let x=0;x<w;x++){mask[x]=0;mask[(h-1)*w+x]=0;}for(let y=0;y<h;y++){mask[y*w]=0;mask[y*w+w-1]=0;}
function neighbors(i){const x=i%w,y=Math.floor(i/w),out=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;const j=i+dy*w+dx;if(!mask[j])continue;if(dx&&dy&&(mask[i+dx]||mask[i+dy*w]))continue;out.push(j);}return out;}
const adj=new Map();for(let i=0;i<mask.length;i++)if(mask[i])adj.set(i,neighbors(i));const seen=new Set(),paths=[];const key=(a,b)=>Math.min(a,b)*mask.length+Math.max(a,b);
function trace(start,next){const p=[start];let prev=start,current=next;seen.add(key(prev,current));for(let guard=0;guard<mask.length;guard++){p.push(current);const ns=adj.get(current)||[];if(current===start||ns.length!==2)break;const n=ns[0]===prev?ns[1]:ns[0];if(seen.has(key(current,n)))break;seen.add(key(current,n));prev=current;current=n;}if(p.length>=(structural?4:Math.max(5,12-detail)))paths.push(p.map(i=>({x:i%w,y:Math.floor(i/w)})));}
for(const [i,ns] of adj)if(ns.length!==2)for(const n of ns)if(!seen.has(key(i,n)))trace(i,n);for(const [i,ns] of adj)for(const n of ns)if(!seen.has(key(i,n)))trace(i,n);
// Bound simplification error in preview pixels, preserving prominent corners.
function simplify(a){if(a.length<3)return a;const first=a[0],last=a.at(-1),dx=last.x-first.x,dy=last.y-first.y,den=dx*dx+dy*dy;let best=(.85-detail*.1)**2,index=-1;for(let i=1;i<a.length-1;i++){let p=a[i],t=den?Math.max(0,Math.min(1,((p.x-first.x)*dx+(p.y-first.y)*dy)/den)):0,d=(p.x-first.x-t*dx)**2+(p.y-first.y-t*dy)**2;if(d>best){best=d;index=i;}}return index<0?[first,last]:simplify(a.slice(0,index+1)).slice(0,-1).concat(simplify(a.slice(index)));}
paths.sort((a,b)=>b.length-a.length);const limit=structural?420:180+detail*50;
// Spatial quotas preserve short features instead of letting one textured region fill the budget.
if(mode!=='line'){const bins=new Map();const ranked=[];for(const p of paths){const mid=p[Math.floor(p.length/2)],key=Math.floor(mid.x/w*8)+8*Math.floor(mid.y/h*8),n=bins.get(key)||0;bins.set(key,n+1);ranked.push({p,score:p.length/(1+n*.7)});}ranked.sort((a,b)=>b.score-a.score);paths.splice(0,paths.length,...ranked.map(v=>v.p));}return{paths:paths.slice(0,limit).map(simplify),candidates:paths.length,repairedGaps,limit,w,h};
}
if(typeof module!=='undefined')module.exports={extractStructure};
