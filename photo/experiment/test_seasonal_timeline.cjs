const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/ui/living_color.js','utf8');
const match=source.match(/function seasonAutoPosition\(t\)\{[\s\S]*?\n\}/);assert(match);
const position=vm.runInNewContext('('+match[0]+')');
for(const [time,value] of [[0,0],[7,0],[8,100/6],[9,100/3],[15,100/3],[16,50],[17,200/3],[23,200/3],[24,500/6],[25,100],[36,100]])assert(Math.abs(position(time)-value)<1e-8,`timeline ${time}`);

const extract=name=>source.match(new RegExp('function '+name+'\\([^]*?\\n\\}'))[0];
const nodes={};const $=id=>nodes[id]||(nodes[id]={value:0,textContent:'',dataset:{}});
const calls=[];const sandbox={$,Math,Number,seasonOffset:0,seasonPending:2,seasonPlaying:false,seasonAuto:false,seasonStarted:0,seasonContext:{currentTime:100},drawSeason:v=>calls.push(['draw',v]),playSeasonNode:(i,t,f)=>calls.push(['audio',i,t,f]),fmt:t=>String(t)};
vm.createContext(sandbox);vm.runInContext(match[0]+';'+extract('seekSeason'),sandbox);
vm.runInContext('seekSeason(50)',sandbox);
assert.equal(sandbox.seasonOffset,18);assert.equal(sandbox.seasonPending,null);assert.equal(calls.filter(c=>c[0]==='audio').length,0);
sandbox.seasonPlaying=true;
vm.runInContext('seekSeason(75)',sandbox);assert.equal(sandbox.seasonStarted,73);assert.equal(sandbox.seasonAuto,true);assert.deepEqual(calls.at(-1),['audio',3,27,true]);
vm.runInContext('seekSeason(10)',sandbox);assert.equal(sandbox.seasonStarted,96.4);assert.equal(calls.at(-1)[1],0);assert(Math.abs(calls.at(-1)[2]-3.6)<1e-9);
console.log('Season timeline verified: visual transitions, paused positioning, playing seek forward/back with real audio offsets');
