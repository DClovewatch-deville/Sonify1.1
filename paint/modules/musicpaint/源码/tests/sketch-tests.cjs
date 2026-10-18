'use strict';
const assert = require('node:assert/strict');
const sketch = require('../sketch.js');
const vision = require('../vision.js');
const make = (width, height, pixel) => ({ width, height, data: Uint8ClampedArray.from(Array.from({length:width*height}, (_, i) => pixel(i % width, Math.floor(i / width))).flat()) });
const white = make(48, 32, () => [255,255,255,255]);
for (const style of ['pencil','outline']) {
  assert.equal(sketch.render(white,{style}).meanInk, 0, 'white input must stay white');
  const transparent = make(48,32, () => [0,0,0,0]);
  assert.equal(sketch.render(transparent,{style}).meanInk, 0, 'transparent pixels must composite on white');
}
const photo=make(160,120,(x,y)=>{
 const object=(x-80)**2+(y-60)**2<35**2;
 return object ? [25+x*.6, 60+y*.5, 100, 255] : [232,238,244,255];
});
const inputCopy=photo.data.slice();
const pencil=sketch.render(photo),outline=sketch.render(photo,{style:'outline'});
assert.deepEqual(photo.data,inputCopy,'input must not be mutated');
assert.deepEqual(sketch.render(photo),pencil,'same input and options must be deterministic');
assert(pencil.meanInk>outline.meanInk,'pencil retains shading absent from outline');
assert.notDeepEqual(pencil.data,outline.data,'styles must produce different pixels');
assert(pencil.meanInk>2&&pencil.meanInk<180);
assert(sketch.render(photo,{strength:1}).meanInk<sketch.render(photo,{strength:5}).meanInk,'strength must control darkness');
for(let i=0;i<pencil.data.length;i+=4){assert.equal(pencil.data[i],pencil.data[i+1]);assert.equal(pencil.data[i],pencil.data[i+2]);assert.equal(pencil.data[i+3],255);}
const tall=sketch.render(make(1,2050,()=>[100,80,60,255]));assert.equal(tall.width,1);assert.equal(tall.height,1024);
const large=sketch.render(make(2048,1024,()=>[245,245,245,255]));assert.equal(large.width,1024);assert.equal(large.height,512);
assert.throws(()=>sketch.render({width:2,height:2,data:[]}),/无效/);
assert.throws(()=>sketch.render({width:1.5,height:2,data:new Uint8Array(12)}),/无效/);
const paths=vision.extract(pencil,{mode:'photo',detail:4,maxPaths:32}).paths;
assert(paths.length>0&&paths.length<=32,'sketch must feed the existing music contour path');
console.log(JSON.stringify({status:'passed',checks:12,pencilMeanInk:pencil.meanInk,outlineMeanInk:outline.meanInk,sketchToMusicPaths:paths.length},null,2));
