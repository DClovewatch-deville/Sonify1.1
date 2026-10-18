const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(__dirname+'/ui/soul_interaction.js','utf8');
const hit=code.slice(code.indexOf('function hitSource('),code.indexOf('function wireSource('));
const context={W:900,H:1050,data:{width:100,height:100},sourceGroup:()=>null,fit:{ox:0,oy:0,w:900,h:900},mappingRestore:null,time:()=>6,
 idToPoints:new Map([['roof',[[.2,.2],[.8,.2]]]]),soulMusic:()=>({phases:[{id:'A',start:0,end:5},{id:'B',start:5,end:10}],notes:[{source:'roof',section:'A',voice:0},{source:'roof',section:'B',voice:0}]})};
vm.createContext(context);vm.runInContext(hit,context);
const el={id:'mini-source',width:420,height:560,getBoundingClientRect:()=>({left:0,top:0,width:420,height:560})};
assert.equal(context.hitSource(el,{clientX:210,clientY:162.4}).index,1,'select phrase from current section');
assert.equal(context.hitSource(el,{clientX:210,clientY:400}),null,'blank area must not pick distant path');
const zoomed={...el,getBoundingClientRect:()=>({left:-100,top:-50,width:840,height:1120})};
assert.equal(context.hitSource(zoomed,{clientX:320,clientY:274.8}).index,1,'zoom and pan preserve hit testing');
context.mappingRestore={offset:1};assert.equal(context.hitSource(el,{clientX:210,clientY:162.4}).index,0,'preview preserves original chapter context');
context.idToPoints.set('window',[[.2,.7],[.8,.7]]);
const original=context.soulMusic;
context.soulMusic=()=>({...original(),groups:[{id:'unused',voice:0,sources:['window']}]});
const related=context.hitSource(el,{clientX:210,clientY:358.4});
assert.equal(related.region.id,'unused','unused group lines are clickable');
assert.equal(related.related,true,'related voice is distinguished from direct provenance');
console.log('6 source interaction checks passed');

const evidenceCode=code.slice(code.indexOf('function mappingEvidence('),code.indexOf('function buildListeningChoices('));
vm.runInContext(evidenceCode,context);
const piece={notes:[{voice:0,phrase:'a',source:'roof',start:2,duration:1},{voice:0,phrase:'a',source:'roof',start:3,duration:.5},{voice:1,phrase:'a',source:'column',start:2,duration:.5}]};
const region={sources:['roof','unused']};
assert.equal(context.mappingEvidence(piece,0,region,'roof').related,false,'direct path is direct');
assert.equal(context.mappingEvidence(piece,0,region,'unused').related,true,'unused line in SAME group must be labelled related');
assert.equal(context.mappingEvidence(piece,0,{sources:['other']},null).related,true,'separate group is associated');
const evidence=context.mappingEvidence(piece,0,region,'roof');assert.equal(evidence.notes.length,2,'only selected voice and phrase');assert.equal(evidence.start,2);assert.equal(evidence.end,3.5);
console.log('6 evidence checks passed: direct vs associated, same-region unused path, actual phrase and time');
