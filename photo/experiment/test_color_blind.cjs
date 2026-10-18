const fs=require('fs'),vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/ui/color-blind-test.js','utf8');const chunk=src.slice(src.indexOf('function summarize('),src.indexOf("$('#export').onclick"));const ctx={};vm.createContext(ctx);vm.runInContext(chunk,ctx);
const rows=['autumn','landscape','modern'].map((c,i)=>({participant:'SYNTHETIC_UNIT_TEST',case:c,mapping:{A:i%2?'auto':'off',B:i%2?'off':'auto'},choice:i===2?'A':i%2?'A':'B',ratings:{A:{match:i%2?4:3,pleasant:4},B:{match:i%2?3:4,pleasant:4}}}));
let result=ctx.summarize(rows);assert.equal(result.complete_listeners,1);assert.equal(result.listeners_preferring_auto_in_majority,1);assert.equal(result.match_delta,1);assert.equal(result.pleasant_delta,0);
result=ctx.summarize(rows.slice(0,2));assert.equal(result.complete_listeners,0);assert.equal(result.trials,2);assert.equal(ctx.summarize([]).match_delta,null);console.log('7 blinded-result aggregation checks passed; no human records created');
