/* Complex Fourier decomposition of an arc-length sampled closed path. */
(function(root){
function resample(points,n=512){
 const p=points.filter((v,i)=>!i||Math.hypot(v.x-points[i-1].x,v.y-points[i-1].y)>1e-8);
 if(p.length<2)return [];
 const d=[0]; for(let i=1;i<=p.length;i++){let a=p[i-1],b=p[i%p.length];d.push(d[i-1]+Math.hypot(b.x-a.x,b.y-a.y));}
 if(d.at(-1)<1e-8)return [];let j=1;
 return Array.from({length:n},(_,i)=>{let t=i*d.at(-1)/n;while(j<p.length&&d[j]<t)j++;let a=p[j-1],b=p[j%p.length],f=(t-d[j-1])/(d[j]-d[j-1]||1);return{x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};});
}
function slowTransform(p){const n=p.length,c=[];for(let k=0;k<n;k++){let re=0,im=0;for(let j=0;j<n;j++){let a=2*Math.PI*k*j/n;re+=p[j].x*Math.cos(a)+p[j].y*Math.sin(a);im+=p[j].y*Math.cos(a)-p[j].x*Math.sin(a);}re/=n;im/=n;c.push({freq:k>n/2?k-n:k,re,im,amp:Math.hypot(re,im),phase:Math.atan2(im,re)});}return c.sort((a,b)=>b.amp-a.amp);}
function transform(p){const n=p.length;if(!n||(n&(n-1)))return slowTransform(p);const re=Float64Array.from(p,q=>q.x),im=Float64Array.from(p,q=>q.y);for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}for(let len=2;len<=n;len*=2){const angle=-2*Math.PI/len,cr=Math.cos(angle),ci=Math.sin(angle);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const u=i+j,v=u+len/2,vr=re[v]*wr-im[v]*wi,vi=re[v]*wi+im[v]*wr;re[v]=re[u]-vr;im[v]=im[u]-vi;re[u]+=vr;im[u]+=vi;const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;}}}return Array.from({length:n},(_,k)=>{const x=re[k]/n,y=im[k]/n;return{freq:k>n/2?k-n:k,re:x,im:y,amp:Math.hypot(x,y),phase:Math.atan2(y,x)};}).sort((a,b)=>b.amp-a.amp);}
function endpoint(c,t){let x=0,y=0;for(const v of c){let a=v.freq*t*2*Math.PI+v.phase;x+=v.amp*Math.cos(a);y+=v.amp*Math.sin(a);}return{x,y};}
const api={resample,transform,endpoint};if(typeof module!=='undefined')module.exports=api;else root.Fourier=api;
})(globalThis);
