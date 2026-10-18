const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/ui/progressive_revelation.js','utf8');const c={};vm.createContext(c);vm.runInContext(code.slice(code.indexOf('function makeRevealPlan'),code.indexOf('let revealPlan')),c);
for(let i=0;i<6;i++){
 const data=JSON.parse(fs.readFileSync(`${__dirname}/dist/studio/sample${i}.json`,'utf8'));
 const p=c.makeRevealPlan(data),ids=p.entries.map(r=>r.id);
 assert.equal(new Set(ids).size,ids.length,'no duplicate geometry');
 assert.equal(ids.length,data.contours.filter(r=>r.points.length>1).length,'complete final source coverage');
 assert.ok(p.entries.every(r=>r.start>=0&&r.end>r.start&&r.end<=p.boundary[4]),'completion before final ensemble');
 assert.ok(p.entries.every(r=>r.points===data.contours.find(x=>x.id===r.id).points),'only real source vertices');
 assert.ok(p.entries.filter(r=>r.end<=.4).length===0,'opening remains empty');
 assert.ok(p.entries.filter(r=>r.end<=5).length<ids.length*.3,'first contour stage does not expose whole image');
 assert.equal(new Set(p.entries.map(r=>r.revealStage)).size,4,'four nonempty reveal stages');
 assert.deepEqual(Array.from(p.boundary),[0,6,18,24,30],'existing voice-entry boundaries reused');
 console.log(`sample${i}: ${ids.length} paths, 4 stages, complete at ${p.boundary[4]}s`);
}
const abstract=JSON.parse(fs.readFileSync(`${__dirname}/dist/studio/sample3.json`,'utf8'));
abstract.units=abstract.units.map(u=>({...u,layer:'background'}));
const generic=c.makeRevealPlan(abstract);assert.ok(generic.entries.some(r=>r.revealStage===0),'no subject classification required');
abstract.width=abstract.height*3;const wide=c.makeRevealPlan(abstract);assert.equal(wide.scroll,true,'wide sources use right-to-left order');
const early=wide.entries.filter(r=>r.revealStage===0);assert.ok(early[0].x>.5,'wide reveal begins on right');
console.log('51 progressive plan checks passed');
