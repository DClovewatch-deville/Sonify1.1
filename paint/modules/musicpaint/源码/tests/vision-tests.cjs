const assert=require('assert');const V=require('../vision.js');
function img(w,h){const data=new Uint8ClampedArray(w*h*4).fill(255);return{width:w,height:h,data};}
function mark(im,x,y){let i=(y*im.width+x)*4;im.data[i]=im.data[i+1]=im.data[i+2]=0;}
const blank=V.extract(img(80,60),{mode:'photo'});assert.equal(blank.paths.length,0);assert.equal(blank.stats.emptyReason,'empty-image');
const im=img(100,100);for(let x=15;x<85;x++){mark(im,x,15);mark(im,x,84);}for(let y=15;y<85;y++){mark(im,15,y);mark(im,84,y);}
const extracted=V.extract(im,{mode:'line',detail:5,maxPaths:3});assert(extracted.paths.length>0);assert(extracted.paths.length<=3);for(const s of extracted.paths)for(const p of s.points)assert(p.x>=.079999&&p.x<=.920001&&p.y>=.079999&&p.y<=.920001);
const fit=V.fitPaths([[{x:0,y:0},{x:200,y:100}]]);let a=fit[0].points[0],b=fit[0].points[1];assert(Math.abs((b.x-a.x)/(b.y-a.y)-2)<1e-9);
const f=V.fitPaths([[{x:0,y:0},{x:1,y:1}]],{width:200,height:100,normalized:true});a=f[0].points[0];b=f[0].points[1];assert(Math.abs((b.x-a.x)/(b.y-a.y)-2)<1e-9);
const line=[{x:.1,y:.8},{x:.9,y:.2}];const sampled=V.resample(line,9);assert.equal(sampled.length,9);assert.deepEqual(sampled[0],line[0]);assert(Math.hypot(sampled.at(-1).x-.9,sampled.at(-1).y-.2)<1e-10);
const spectrum=V.fourier(line,128);assert.equal(spectrum.closed,false);assert(Math.hypot(V.endpoint(spectrum.coeff,0).x-.1,V.endpoint(spectrum.coeff,0).y-.8)<1e-9);assert(Math.hypot(V.endpoint(spectrum.coeff,.5).x-.9,V.endpoint(spectrum.coeff,.5).y-.2)<1e-9);
const huge=img(600,300);for(let x=100;x<500;x++)for(let y=100;y<105;y++)mark(huge,x,y);const scaled=V.extract(huge,{mode:'line'});assert.equal(scaled.stats.width,384);assert.equal(scaled.stats.height,192);
assert.throws(()=>V.extract({width:5,height:5,data:new Uint8Array(5)}),/图片数据无效/);
const offset=img(200,100);for(let x=20;x<61;x++){mark(offset,x,20);mark(offset,x,60);}for(let y=20;y<=60;y++){mark(offset,20,y);mark(offset,60,y);}
const aligned=V.extract(offset,{mode:'line',detail:5,maxPaths:32}),all=aligned.paths.flatMap(p=>p.points);assert(all.length);const xs=all.map(p=>p.x),ys=all.map(p=>p.y);assert(Math.abs(Math.min(...xs)-(.5+(20-100)*.84/200))<.01);assert(Math.abs(Math.max(...xs)-(.5+(60-100)*.84/200))<.01);assert(Math.max(...xs)<.4,'left-side object must remain on left, not recentered');assert.equal(aligned.stats.coordinateFrame,'full-image');
console.log(JSON.stringify({passed:9,checks:['blank rejection','line extraction','path budget','normalized bounds','aspect ratio','endpoint-preserving resampling','open Fourier reflection','384px dimension cap','offset object aligned to full source image'],sample:extracted.stats},null,2));
