/* Transport regressions: no future or stale source lines after seek/mode changes. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const player=fs.readFileSync(__dirname+'/scroll_player.js','utf8');
const body=player.slice(player.indexOf('function sourcesOf('),player.indexOf('function renderMapping('));
const events=[];
const ctx={clearRect(){events.length=0},beginPath(){},moveTo(){},lineTo(){},stroke(){events.push(this.strokeStyle)}};
const canvas={width:100,height:50,dataset:{},getContext(){return ctx}};
const paths=new Map(['a','b','c'].map(id=>[id,{points:[[.2,.3],[.4,.5]]}]));
const notes=[{id:'n1',start:1,duration:.4,voice:0,source:'a',source_point:[.2,.3]},
 {id:'n2',start:2,duration:.4,voice:1,source:'b',source_point:[.4,.5],contributing_sources:[{source:'b'},{source:'c'}]},
 {id:'n3',start:3,duration:.4,voice:0,source:'a',source_point:[.2,.3]}];
const harness=new Function('canvas','paths','notes',`
 const score={fingerprint:'test',notes},manifest=null,$=()=>canvas,trailColors=['gold','cyan'];
 let trailMode='',trailTime=-1,trailCursor=0,displaySources=new Map(),paintedPaths=new Set(),displayMode='lines';
 ${body}
 return {draw:updateTrail, sources:()=>[...displaySources.entries()],mode(value){displayMode=value;trailMode=''}};
`)(canvas,paths,notes);
harness.draw(.5);assert.equal(events.length,0);
harness.draw(1.2);assert.deepEqual(harness.sources().map(([id])=>id),['a']);
harness.draw(2.2);assert.equal(events.length,3);assert.equal(harness.sources().length,3);
assert.ok(harness.sources().every(([,r])=>r.n.start<=2.2));
harness.draw(3.2);assert.equal(events.length,3);assert.equal(harness.sources()[0][1].n.id,'n3');
harness.draw(1.2);assert.equal(events.length,1);assert.equal(harness.sources().length,1);
harness.mode('instant');harness.draw(2.2);assert.deepEqual(harness.sources().map(([id])=>id),['b','c']);
harness.draw(2.6);assert.equal(events.length,0);
harness.mode('soft');harness.draw(2.6);assert.equal(harness.sources().length,2);
harness.draw(5);assert.equal(events.length,0);
console.log('Scroll display: accumulation, backward seek, note provenance, instant and fading modes passed');
// The readable score marks one actual note head per rendered audio event,
// while retaining context contours and the full source associations.
const scoreCanvas={width:100,height:50,dataset:{},getContext:()=>({clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},ellipse(){},fill(){}})};
const caption={textContent:''},edition={value:'blueprint'};
const drawScore=player.slice(player.indexOf('function drawSpatialScore('),player.indexOf('function renderScoreHead('));
new Function('score','paths','$','sourcesOf',drawScore+';drawSpatialScore();')(
 {notes},paths,id=>id==='spatial-score'?scoreCanvas:id==='edition'?edition:caption,
 n=>n.contributing_sources||[{source:n.source,source_point:n.source_point}]);
assert.equal(scoreCanvas.dataset.points,'3');assert.equal(scoreCanvas.dataset.notes,'3');
assert.match(caption.textContent,/淡墨为轮廓底图/);
console.log('Readable score: one primary note head per audio note, contour context retained: passed');
