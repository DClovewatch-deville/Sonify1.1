// Rank complete objects higher than tiny parts or masks covering the entire frame.
function rankSubject(mask,w,h,quality){let area=0,border=0,rim=0,sx=0,sy=0;for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){const edge=x<8||y<8||x>w-9||y>h-9;if(edge)rim++;if(mask[y*w+x]){area++;sx+=x/w;sy+=y/h;if(edge)border++;}}const fraction=area/(Math.ceil(w/4)*Math.ceil(h/4));if(fraction<.001||fraction>.9)return -10;const center=area?Math.hypot(sx/area-.5,sy/area-.5):1;return quality+.5*Math.sqrt(fraction)-.8*center-2.2*border/Math.max(1,rim)-Math.max(0,fraction-.65)*3;}
function maskOverlap(a,b){let intersection=0,union=0;for(let i=0;i<a.length;i+=16){if(a[i]||b[i])union++;if(a[i]&&b[i])intersection++;}return intersection/Math.max(1,union);}

function assembleSubject(candidates,w,h){
 const seed=candidates[0],merged=seed.mask.slice(),step=4,W=Math.ceil(w/step),H=Math.ceil(h/step),size=W*H;
 const down=m=>{const a=new Uint8Array(size);for(let y=0;y<H;y++)for(let x=0;x<W;x++)a[y*W+x]=m[Math.min(h-1,y*step)*w+Math.min(w-1,x*step)];return a;};
 const list=candidates.map(c=>({...c,small:down(c.mask)}));let added=0;
 for(let pass=0;pass<3;pass++){
  const small=down(merged),distance=new Int16Array(size).fill(30000),queue=[];let area=0;for(let i=0;i<size;i++)if(small[i]){distance[i]=0;queue.push(i);area++;}
  const radius=Math.ceil(Math.min(W,H)*.018);for(let q=0;q<queue.length;q++){const i=queue[q];if(distance[i]>=radius)continue;const x=i%W,y=Math.floor(i/W);for(const j of [x?i-1:-1,x<W-1?i+1:-1,y?i-W:-1,y<H-1?i+W:-1])if(j>=0&&distance[j]>distance[i]+1){distance[j]=distance[i]+1;queue.push(j);}}
  let changes=0;for(const c of list){if(c.quality<.72||c.score<.55)continue;let n=0,inside=0,near=0,rim=0,left=0,right=0,top=0,bottom=0;for(let i=0;i<size;i++)if(c.small[i]){n++;if(small[i])inside++;if(distance[i]<=radius)near++;const x=i%W,y=Math.floor(i/W);if(x<2||y<2||x>W-3||y>H-3)rim++;if(x<2)left++;if(x>W-3)right++;if(y<2)top++;if(y>H-3)bottom++;}
   const extra=n-inside;if((left&&right)||(top&&bottom))continue;if(extra<10||n>size*.52||extra>area*.85||rim>Math.max(W,H)*.2)continue;
   if((inside>n*.1&&inside>area*.015)||(near-inside>=Math.max(2,Math.sqrt(n)*.1)&&near>n*.015)){
    for(let i=0;i<merged.length;i++)if(c.mask[i])merged[i]=1;changes++;added++;
   }
  }if(!changes)break;
 }
 // Keep the dominant connected object; segmentation sometimes returns detached background specks.
 const seen=new Uint8Array(w*h);let largest=[];for(let start=0;start<merged.length;start++){if(!merged[start]||seen[start])continue;const q=[start];seen[start]=1;for(let k=0;k<q.length;k++){const i=q[k],x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;const j=i+dy*w+dx;if(merged[j]&&!seen[j]){seen[j]=1;q.push(j);}}}if(q.length>largest.length)largest=q;}merged.fill(0);for(const i of largest)merged[i]=1;
 const result=[{...seed,mask:merged,score:seed.score+.01}];
 for(const c of candidates)if(result.every(r=>maskOverlap(c.mask,r.mask)<.85)){result.push(c);if(result.length===3)break;}
 return result;
}
function makeIllustration({rgba,w,h,mask,detail=3}){
 if(!detail)return [];
 const n=w*h,gray=new Float32Array(n);for(let i=0;i<n;i++)gray[i]=(.2126*rgba[4*i]+.7152*rgba[4*i+1]+.0722*rgba[4*i+2])*rgba[4*i+3]/255+255*(1-rgba[4*i+3]/255);
 function blur(input,r){const tmp=new Float32Array(n),out=new Float32Array(n);for(let y=0;y<h;y++){let sum=0;for(let x=-r;x<=r;x++)sum+=input[y*w+Math.max(0,Math.min(w-1,x))];for(let x=0;x<w;x++){tmp[y*w+x]=sum/(2*r+1);sum+=input[y*w+Math.min(w-1,x+r+1)]-input[y*w+Math.max(0,x-r)];}}for(let x=0;x<w;x++){let sum=0;for(let y=-r;y<=r;y++)sum+=tmp[Math.max(0,Math.min(h-1,y))*w+x];for(let y=0;y<h;y++){out[y*w+x]=sum/(2*r+1);sum+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x];}}return out;}
 const fine=blur(gray,1),coarse=blur(blur(gray,3),3),inside=new Uint8Array(n),fineInside=new Uint8Array(n);
 for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++){const i=y*w+x;inside[i]=mask[i]&&mask[i-2]&&mask[i+2]&&mask[i-2*w]&&mask[i+2*w]?1:0;}
 for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;fineInside[i]=mask[i]&&mask[i-1]&&mask[i+1]&&mask[i-w]&&mask[i+w]?1:0;}
 function edges(g,structural,d){return extractStructure({rgba,w,h,grayInput:g,colorEdges:!structural,mode:'photo',detail:d,subject:structural?inside:fineInside,structural}).paths;}
 const base=edges(coarse,true,4);
 // A 256-bin histogram replaces sorting hundreds of thousands of samples.
 const histogram=new Uint32Array(256);let valueCount=0;for(let i=0;i<n;i+=3)if(inside[i]){histogram[Math.max(0,Math.min(255,Math.round(coarse[i])))]++;valueCount++;}
 let threshold=0,total=0;for(;threshold<255;threshold++){total+=histogram[threshold];if(total>=valueCount*.23)break;}const bin=new Uint8Array(n),seen=new Uint8Array(n),regions=[];
 for(let i=0;i<n;i++)bin[i]=inside[i]&&coarse[i]<threshold?1:0;
 for(let start=0;start<n;start++){if(!bin[start]||seen[start])continue;const q=[start];seen[start]=1;let touches=0;for(let k=0;k<q.length;k++){const i=q[k],x=i%w,y=Math.floor(i/w);if(!inside[i-1]||!inside[i+1]||!inside[i-w]||!inside[i+w])touches++;for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&bin[j]&&!seen[j]){seen[j]=1;q.push(j);}}
  if(q.length<18||q.length>valueCount*3*.35||touches>Math.sqrt(q.length)*.2)continue;regions.push(q);
 }
 regions.sort((a,b)=>b.length-a.length);const boundary=new Uint8ClampedArray(n*4);for(const region of regions.slice(0,16))for(const i of region)boundary[i*4+3]=255;
 const closed=traceGlyphMask(boundary,w,h);
 const occupied=new Uint8Array(n);function mark(paths,r){for(const p of paths)for(let j=1;j<p.length;j++){const a=p[j-1],b=p[j],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y));for(let t=0;t<=steps;t++){const x=Math.round(a.x+(b.x-a.x)*t/Math.max(1,steps)),y=Math.round(a.y+(b.y-a.y)*t/Math.max(1,steps));for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)occupied[(y+dy)*w+x+dx]=1;}}}
 // Measure overlap along segments, rather than only simplified vertices.
 const keep=p=>{let overlap=0,count=0;for(let j=1;j<p.length;j++){const a=p[j-1],b=p[j],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));for(let t=0;t<=steps;t++){const x=Math.round(a.x+(b.x-a.x)*t/steps),y=Math.round(a.y+(b.y-a.y)*t/steps);if(x>=0&&x<w&&y>=0&&y<h){count++;overlap+=occupied[y*w+x];}}}return count&&overlap/count<.72;};
 mark(closed,3);const structure=base.filter(keep);mark(structure,2);
 const texture=[],budget=detail===1?80:detail===3?160:260;
 for(const p of edges(fine,false,Math.max(2,detail))){if(!keep(p))continue;texture.push(p);mark([p],1);if(texture.length>=budget)break;}

 return closed.concat(structure,texture);
}

if(typeof module!=='undefined')module.exports={makeIllustration,rankSubject,maskOverlap,assembleSubject};
