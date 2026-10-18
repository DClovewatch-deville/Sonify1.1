const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(__dirname+'/ui/role_editor.js','utf8');const c={};vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function changedRoleVoices('),s.indexOf('function updateRoleTracks(')),c);
const original={notes:[{voice:0,source:'a',pitch:72,start:0,duration:1,program:73,velocity:80}]};
assert.equal(c.changedRoleVoices(original,JSON.parse(JSON.stringify(original))).length,0);
const moved=JSON.parse(JSON.stringify(original));moved.notes[0].source='b';assert.equal(c.changedRoleVoices(original,moved).length,0,'source metadata alone is not audible difference');
const pitched=JSON.parse(JSON.stringify(original));pitched.notes[0].pitch=76;assert.equal(c.changedRoleVoices(original,pitched)[0],'主旋律');
const timbre=JSON.parse(JSON.stringify(original));timbre.notes[0].program=42;assert.equal(c.changedRoleVoices(original,timbre).length,1);
console.log('4 audible-change comparison checks passed');
