 'use strict';
let roleDrawMode=false,roleSelection=[],roleBox=null,roleDrag=null,roleAssignments={},roleJobKey='',roleRequest=0,roleBusy=false;
let roleTrackTimes=[0,0],roleTrackVersion='';
let roleDrafts=[],roleInputMode='',roleRegionSequence=0,roleSystemGroup=null;
let roleRemovedIds=new Set(),roleBranch='box',roleBranchDrafts={box:[],system:[]};
function roleSavedRegions(){return [];}
function switchRoleBranch(branch){if(roleBusy)return;if(mappingSelection)leaveMapping(false);halt();roleBranchDrafts[roleBranch]=roleDrafts;roleBranch=branch;roleDrafts=roleBranchDrafts[branch];roleDrawMode=branch==='box';roleInputMode=branch;roleSystemGroup=null;roleBox=null;roleDrag=null;syncRoleInputMode();renderRoleRegions();$('#role-status').textContent=branch==='box'?'自由框选：从无颜色线稿开始，先选角色再拖框；新框覆盖旧框。':'系统角色：点击系统原分区，再选择角色；不能框选，范围保持固定。';draw();}
const roleTracks=document.createElement('section');roleTracks.id='role-tracks';roleTracks.setAttribute('aria-label','系统默认与用户修改两条音轨');
roleTracks.innerHTML='<h3>播放两条音轨，听见你的修改</h3><div class="role-track" id="role-track-default"><div class="role-track-heading"><strong>01 系统默认</strong><span id="role-track-default-state">自动推荐的角色分配</span></div><div class="role-track-transport"><button id="role-play-default">▶ 播放系统默认</button><output id="role-time-default">0:00 / 0:47</output></div><input id="role-seek-default" type="range" min="0" max="47" step="0.1" value="0" aria-label="系统默认音轨进度"></div><div class="role-track" id="role-track-user"><div class="role-track-heading"><strong>02 用户修改</strong><span id="role-track-user-state">尚未生成</span></div><div class="role-track-transport"><button id="role-play-user" disabled>▶ 播放用户修改</button><output id="role-time-user">等待重新编曲</output></div><input id="role-seek-user" type="range" min="0" max="47" step="0.1" value="0" disabled aria-label="用户修改音轨进度"><p id="role-track-difference">框选并重新编曲后，这里就会出现你的新音乐。</p></div><p class="role-track-note" id="role-track-feedback" role="status">保留系统默认和最新一条用户修改，点击各自播放按钮比较。</p>';
$('#listening-result').prepend(roleTracks);
const rolePanel=document.createElement('section');rolePanel.id='role-editor';
rolePanel.innerHTML='<h3>修改结构的音乐角色</h3><p>两种独立创作方式：自由框选 / 修改系统角色</p><div class="role-tools"><button id="role-draw" aria-pressed="false">① 自由框选</button><button id="role-from-click" aria-pressed="false">② 修改系统角色</button></div><label><span id="role-target-label">下一框的角色</span> <select id="role-target"><option value="0">主体 · 主旋律（黄色）</option><option value="1">节奏回应（青色）</option><option value="2">低音支撑（绿色）</option><option value="3">和声铺陈（紫色）</option><option value="4">环境织体（陶色）</option></select></label><p id="role-selection" role="status">尚未选择路径</p><div id="role-region-list" aria-label="本次累积的独立选区"></div><button id="role-clear-regions" hidden>清空当前分支</button><button id="role-apply" disabled>应用角色并重新编曲</button><div class="role-tools" hidden><button id="role-default">恢复系统推荐</button><button id="role-user" disabled>切回我的版本</button></div><p id="role-status" role="status">选区按现有几何路径改派，以选区代表路径发展乐句，生成约47秒的新Soul作品。</p>';
roleTracks.after(rolePanel);
function initRoleEditor(){
 const key=data?.intake_job||'';
 if(key!==roleJobKey){
  roleRemovedIds.clear();roleBranch='box';roleBranchDrafts={box:[],system:[]};roleJobKey=key;roleTrackTimes=[0,0];roleTrackVersion='';roleAssignments={};roleSelection=[];roleDrafts=[];roleInputMode='';roleBox=null;roleDrawMode=false;roleRequest++;roleBusy=false;
  try{const saved=JSON.parse(localStorage.getItem('sonify-role-'+key)||'null'),ticket=roleRequest;
   if(key&&saved?.token)roleApi(`/api/jobs/${key}/soul-roles/${saved.token}`).then(result=>{if(ticket!==roleRequest||key!==roleJobKey||result.status!=='completed')return;soulUserVersion=result;roleAssignments=result.assignments;if(saved.active)activateRoleVersion(true);else initRoleEditor();}).catch(()=>{});
  }catch{}
 }

 $('#role-apply').disabled=!key||!roleSelection.length||roleBusy;
 $('#role-user').disabled=!soulUserVersion;
 $('#role-default').setAttribute('aria-pressed',String(!soulUseUser));$('#role-user').setAttribute('aria-pressed',String(soulUseUser));
 syncRoleInputMode();renderRoleRegions();
 updateRoleTracks();
 $('#role-status').textContent=!key?'请从上传作品入口使用角色改派。':soulUseUser?'正在查看我的角色编排；颜色、音符和声音来自新作品。':'当前为系统推荐；框选后可生成自己的角色编排。';
}
function mergeRoleRegions(existing,additions){
 let result=existing.map(r=>({...r,sources:[...r.sources]}));
 for(const region of additions){
  const ids=new Set(region.sources);
  result=result.map(r=>r.id===region.id?r:{...r,sources:r.sources.filter(id=>!ids.has(id))}).filter(r=>r.sources.length);
  result=result.filter(r=>r.id!==region.id);
  if(region.sources.length)result.push({...region,sources:[...new Set(region.sources)]});
 }
 return result;
}
function defaultRoleGroupAt(q,groups,paths){
 let best=null,distance=Infinity;
 for(const group of groups)for(const id of group.sources){const ps=paths.get(id)||[];for(let i=1;i<ps.length;i++){
 const a=ps[i-1],b=ps[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dy);if(d<distance){distance=d;best=group;}
 }}return distance<.025?best:null;
}
function selectSystemRoleGroup(group){
 roleSystemGroup=null;
 if(!group){$('#role-status').textContent='请点击系统彩色结构，留白不属于分区。';return;}
 try{mergeRoleRegions(mergeRoleRegions(roleSavedRegions(),roleDrafts),[{id:'sys-'+group.id,voice:group.voice,sources:group.sources}]);}
 catch(e){$('#role-status').textContent=e.message;return;}
 roleSystemGroup=group;$('#role-target').value=(roleDrafts.find(r=>r.id==='sys-'+group.id)?.voice??group.voice);
 $('#role-status').textContent=`已选系统固定分区，${group.sources.length} 条路径。请选择新角色，范围不会改变。`;draw();
}
function syncRoleInputMode(){
 $('#role-target-label').textContent=roleBranch==='box'?'下一框的角色（先选再框）':'所选系统分区的新角色';
 $('#role-draw').setAttribute('aria-pressed',String(roleDrawMode));
 $('#role-from-click').setAttribute('aria-pressed',String(roleInputMode==='system'));
}
function renderRoleRegions(){
 const list=$('#role-region-list');list.replaceChildren();
 roleDrafts.forEach((region,i)=>{
  const row=document.createElement('div');row.className='role-region-row';row.style.setProperty('--region-color',colorOf(region.voice));
  const label=document.createElement('span');label.textContent=`区域 ${i+1} · ${['主旋律','节奏回应','低音支撑','和声铺陈','环境织体'][region.voice]} · ${region.sources.length} 条路径`;
  const remove=document.createElement('button');remove.type='button';remove.textContent='移除';remove.dataset.removeRegion=region.id;row.append(label,remove);list.append(row);
 });
 for(const [i,region] of (roleSavedRegions()).entries()){
  const row=document.createElement('div');row.className='role-region-row';row.style.setProperty('--region-color',colorOf(region.voice));
  const label=document.createElement('span');label.textContent=`区域 ${i+1} · ${['主旋律','节奏回应','低音支撑','和声铺陈','环境织体'][region.voice]} · ${region.sources.length} 条路径`;
  const state=document.createElement('button');state.textContent='移除已保存区域';state.dataset.removeRegion=region.id;row.append(label,state);list.append(row);
 }
 const count=new Set(roleDrafts.flatMap(r=>r.sources)).size;
 $('#role-selection').textContent=roleDrafts.length?`已保留 ${roleDrafts.length} 个独立选区，共 ${count} 条路径；可继续框选。`:roleSavedRegions().length?`已保存 ${roleSavedRegions().length} 个区域；可移除或清空后重选。`:'尚未选择路径；支持连续框选多个区域。';
 $('#role-clear-regions').hidden=!roleDrafts.length&&!roleSavedRegions().length;
 $('#role-apply').disabled=!roleDrafts.length||roleBusy||!roleJobKey;
}
function roleSelect(ids){
 roleSelection=[...new Set(ids)].filter(id=>idToPoints.has(id));
 if(!roleSelection.length){$('#role-status').textContent='框内没有结构线，请拖框选择线稿中的结构。';draw();return;}
 const voice=Number($('#role-target').value);
 const same=roleDrafts.find(r=>r.voice===voice&&r.sources.length===roleSelection.length&&r.sources.every(id=>roleSelection.includes(id)));
 if(!same)try{const added={id:'r'+Date.now().toString(36)+'-'+(++roleRegionSequence),voice,sources:roleSelection.slice(),box:roleBox?.slice()};mergeRoleRegions(mergeRoleRegions(roleSavedRegions(),roleDrafts),[added]);roleDrafts=mergeRoleRegions(roleDrafts,[added]);}catch(e){$('#role-status').textContent=e.message;}
 roleBox=null;
 renderRoleRegions();draw();
}
$('#role-region-list').onclick=e=>{const id=e.target.closest('[data-remove-region]')?.dataset.removeRegion;if(!id)return;roleRemovedIds.add(id);roleDrafts=roleDrafts.filter(r=>r.id!==id);roleSelection=roleDrafts.at(-1)?.sources.slice()||[];roleBox=null;renderRoleRegions();draw();};
$('#role-clear-regions').onclick=()=>{for(const r of soulUserVersion?.regions||[])roleRemovedIds.add(r.id);roleDrafts=[];roleSelection=[];roleBox=null;roleSystemGroup=null;roleInputMode=roleBranch;roleDrawMode=roleBranch==='box';roleBranchDrafts[roleBranch]=roleDrafts;syncRoleInputMode();renderRoleRegions();$('#role-status').textContent='当前分支已清空，另一分支保持不变。请继续选择角色和结构。';draw();};
function rolePoint(e){
 const c=$('#mini-source'),r=c.getBoundingClientRect(),scale=Math.min((c.width-28)/data.width,(c.height-24)/data.height),w=data.width*scale,h=data.height*scale;
 return [Math.max(0,Math.min(1,((e.clientX-r.left)*c.width/r.width-(c.width-w)/2)/w)),Math.max(0,Math.min(1,((e.clientY-r.top)*c.height/r.height-(c.height-h)/2)/h))];
}
function pathsInRoleBox(contours,box){return contours.filter(p=>p.points.some(q=>q[0]>=box[0]&&q[0]<=box[2]&&q[1]>=box[1]&&q[1]<=box[3])).map(p=>p.id);}
function drawRoleSelection(c){
 if(!listeningDialog.open||!['box','system'].includes(roleInputMode))return;

 if(!roleDrafts.length&&!roleSavedRegions().length&&!roleBox&&roleInputMode!=='system')return;
 const g=c.getContext('2d'),scale=Math.min((c.width-28)/data.width,(c.height-24)/data.height),w=data.width*scale,h=data.height*scale,ox=(c.width-w)/2,oy=(c.height-h)/2;
 const color=colorOf(Number($('#role-target').value));
 if(roleInputMode==='system')for(const r of (data.soul_demo||data.soul).groups)miniGeometry(g,c.width,c.height,r.sources,colorOf(r.voice),1,false,false,2,0,.7);
 if(roleSystemGroup&&roleInputMode==='system')miniGeometry(g,c.width,c.height,roleSystemGroup.sources,color,1,false,false,3.5,0,1);
 for(const region of [...roleSavedRegions(),...roleDrafts])miniGeometry(g,c.width,c.height,region.sources,colorOf(region.voice),1,false,false,2.6,0,.95);
 for(const [i,region] of roleDrafts.entries()){if(!region.box)continue;const b=region.box;g.save();g.strokeStyle=colorOf(region.voice);g.lineWidth=1.4;g.setLineDash([5,4]);g.strokeRect(ox+b[0]*w,oy+b[1]*h,(b[2]-b[0])*w,(b[3]-b[1])*h);g.fillStyle='#14392f';g.fillRect(ox+b[0]*w,oy+b[1]*h,24,20);g.fillStyle=colorOf(region.voice);g.font='bold 13px Segoe UI';g.fillText(String(i+1),ox+b[0]*w+7,oy+b[1]*h+15);g.restore();}
 if(roleBox&&roleDrag){g.save();g.strokeStyle=color;g.fillStyle=color+'20';g.lineWidth=2;g.setLineDash([7,5]);g.fillRect(ox+roleBox[0]*w,oy+roleBox[1]*h,(roleBox[2]-roleBox[0])*w,(roleBox[3]-roleBox[1])*h);g.strokeRect(ox+roleBox[0]*w,oy+roleBox[1]*h,(roleBox[2]-roleBox[0])*w,(roleBox[3]-roleBox[1])*h);g.restore();}
}
$('#role-draw').onclick=()=>switchRoleBranch('box');
$('#role-from-click').onclick=()=>switchRoleBranch('system');
$('#role-target').onchange=()=>{
 if(roleInputMode==='system'){
  if(!roleSystemGroup){$('#role-status').textContent='请先点击系统默认分区。';return;}
  const r={id:'sys-'+roleSystemGroup.id,voice:Number($('#role-target').value),sources:[...roleSystemGroup.sources]};
  try{mergeRoleRegions(mergeRoleRegions(roleSavedRegions(),roleDrafts),[r]);roleDrafts=mergeRoleRegions(roleDrafts,[r]);renderRoleRegions();$('#role-status').textContent='系统分区角色已更新，范围不变。请重新编曲试听。';}catch(e){$('#role-status').textContent=e.message;}
 }else $('#role-status').textContent='新颜色用于下一次框选；拖框后立即上色，新框会覆盖旧框的重叠部分。';draw();
};
const roleCanvas=$('#mini-source');
roleCanvas.addEventListener('pointerdown',e=>{if(roleInputMode==='system'&&!roleBusy){selectSystemRoleGroup(defaultRoleGroupAt(rolePoint(e),(data.soul_demo||data.soul).groups,idToPoints));e.preventDefault();return;}if(!roleDrawMode||roleBusy)return;roleDrag=rolePoint(e);roleBox=[...roleDrag,...roleDrag];roleCanvas.setPointerCapture(e.pointerId);roleCanvas.style.touchAction='none';e.preventDefault();});
roleCanvas.addEventListener('pointermove',e=>{if(!roleDrawMode||!roleDrag)return;const q=rolePoint(e);roleBox=[Math.min(roleDrag[0],q[0]),Math.min(roleDrag[1],q[1]),Math.max(roleDrag[0],q[0]),Math.max(roleDrag[1],q[1])];draw();});
roleCanvas.addEventListener('pointerup',e=>{
 if(!roleDrawMode||!roleDrag)return;const q=rolePoint(e),distance=Math.hypot(q[0]-roleDrag[0],q[1]-roleDrag[1]);
 if(distance<.015){roleBox=null;$('#role-status').textContent='自由框选模式请按住拖出矩形，不采用系统分区。';}
 else roleSelect(pathsInRoleBox(data.contours,roleBox));roleDrag=null;draw();
});
roleCanvas.addEventListener('pointercancel',()=>{roleDrag=null;});
async function roleApi(url,options){const r=await fetch(url,options),j=await r.json();if(!r.ok)throw Error(j.error||'改编请求失败');return j;}
function activateRoleVersion(useUser,clearDrafts=false){
 if(mappingSelection)leaveMapping(false);halt(true);soulUseUser=useUser;
 if(soulUserVersion)try{localStorage.setItem('sonify-role-'+roleJobKey,JSON.stringify({token:soulUserVersion.token,active:useUser}));}catch{}roleDrawMode=false;roleInputMode='';roleSelection=[];if(clearDrafts){roleBranchDrafts[roleBranch]=roleDrafts;}roleBox=null;active=active.map(()=>true);soloVoice=null;beforeSolo=null;heroCache=null;audioCache.clear();configure();fitSourceView();renderRoleRegions();$('#listening-empty').hidden=false;draw();
}
$('#role-default').onclick=()=>{if(roleBusy)return;activateRoleVersion(false);$('#role-status').textContent='已恢复系统推荐。你的改编仍可随时切回。';};
$('#role-user').onclick=()=>{if(soulUserVersion&&!roleBusy)activateRoleVersion(true);};
$('#role-apply').onclick=async()=>{
 if(roleBusy||!roleDrafts.length||!roleJobKey)return;
 let regions;try{regions=mergeRoleRegions(roleSavedRegions(),roleDrafts);}catch(e){$('#role-status').textContent=e.message;return;}
 const assignments={};for(const r of regions)for(const id of r.sources)assignments[id]=r.voice;
 const ticket=++roleRequest,key=roleJobKey;roleBusy=true;$('#role-apply').disabled=true;$('#role-status').textContent='正在用你的角色分配重新编曲和渲染乐器，请稍候…';
 if(mappingSelection)leaveMapping(false);halt();
 try{
  const task=await roleApi(`/api/jobs/${key}/soul-roles`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignments,regions:regions.map(({id,voice,sources})=>({id,voice,sources}))})});
  let result;const began=Date.now();
  while(ticket===roleRequest){
   result=await roleApi(`/api/jobs/${key}/soul-roles/${task.token}`);
   if(result.status==='failed')throw Error(result.error||'本地改编失败');if(result.status==='completed')break;
   if(Date.now()-began>300000)throw Error('渲染时间较长，稍后再试。');
   $('#role-status').textContent=result.status==='queued'?'等待本地渲染队列…':'正在生成新音符与五条真实音轨…';await new Promise(r=>setTimeout(r,900));
  }
  if(ticket!==roleRequest||key!==roleJobKey)return;
  soulUserVersion=result;roleRemovedIds.clear();roleAssignments=result.assignments;roleTrackTimes[1]=0;roleBusy=false;activateRoleVersion(true,true);
  $('#role-status').textContent='新音乐已就绪。点击上方「播放用户修改」，再播放「系统默认」比较。';
  $('#role-track-feedback').textContent='重新编曲完成：用户修改音轨已就绪，点击播放即可听见。';updateRoleTracks();$('#role-play-user').focus({preventScroll:true});
 }catch(e){if(ticket===roleRequest)$('#role-status').textContent=e.message;}
 finally{if(ticket===roleRequest){roleBusy=false;$('#role-apply').disabled=!roleDrafts.length;}}
};

if(data&&mode==='soul')initRoleEditor();

function changedRoleVoices(original,modified){
 const names=['主旋律','节奏回应','低音支撑','和声铺陈','环境织体'];
 const signature=(piece,v)=>JSON.stringify(piece.notes.filter(n=>n.voice===v).map(n=>[n.pitch,n.start,n.duration,n.program,n.velocity]));
 return names.filter((_,v)=>signature(original,v)!==signature(modified,v));
}
function updateRoleTracks(){
 if(!data||mode!=='soul')return;
 const original=data.soul_demo||data.soul,modified=soulUserVersion?.music;
 if(soulUserVersion?.token!==roleTrackVersion){roleTrackVersion=soulUserVersion?.token;roleTrackTimes[1]=0;}
 const current=soulUseUser?1:0;
 if(playing||loading)roleTrackTimes[current]=time();
 for(const [i,label,m] of [[0,'default',original],[1,'user',modified]]){
  const isCurrent=current===i,btn=$('#role-play-'+label),slider=$('#role-seek-'+label),ready=!!m;
  btn.disabled=!ready||(i===1&&roleBusy);
  btn.textContent=isCurrent&&loading?'正在加载…':isCurrent&&playing?'Ⅱ 暂停'+(i?'用户修改':'系统默认'):'▶ 播放'+(i?'用户修改':'系统默认');
  slider.disabled=!ready;slider.max=m?.duration||47;slider.value=roleTrackTimes[i];
  $('#role-time-'+label).textContent=ready?fmt(roleTrackTimes[i])+' / '+fmt(m.duration):'等待重新编曲';
  $('#role-track-'+label).classList.toggle('is-active',isCurrent&&ready);
  $('#role-track-'+label).classList.toggle('is-playing',isCurrent&&playing);
  $('#role-track-'+label+'-state').textContent=isCurrent&&playing?'正在播放':i?(roleBusy?'正在生成新音乐…':ready?'新音乐已就绪':'尚未生成'):'自动推荐的角色分配';
 }
 if(modified&&$('#role-track-difference').dataset.version!==soulUserVersion.token){$('#role-track-difference').dataset.version=soulUserVersion.token;const changed=changedRoleVoices(original,modified);$('#role-track-difference').textContent=changed.length?'音乐已改变：'+changed.join('、')+'。':'本次改派未改变代表乐句，可调整选区再试。';}
}
async function playRoleTrack(useUser){
 if(useUser&&!soulUserVersion)return;
 const current=soulUseUser?1:0,target=useUser?1:0;
 roleTrackTimes[current]=mappingRestore?.offset??time();
 if(current===target&&(playing||loading)){halt();$('#role-track-feedback').textContent='已暂停'+(useUser?'用户修改':'系统默认')+'，再次点击可继续。';updateRoleTracks();draw();return;}
 if(mappingSelection)leaveMapping(false);
 soulEdition='demo';activateRoleVersion(useUser);offset=Math.min(roleTrackTimes[target],duration());
 $('#role-track-feedback').textContent='正在播放'+(useUser?'用户修改':'系统默认')+'；图像颜色与乐谱同步跟随这条音轨。';
 const playback=play();updateRoleTracks();await playback;updateRoleTracks();if(!playing)$('#role-track-feedback').textContent=$('#status').textContent;
}
$('#role-play-default').onclick=()=>playRoleTrack(false);
$('#role-play-user').onclick=()=>playRoleTrack(true);
for(const [i,label] of [[0,'default'],[1,'user']])$('#role-seek-'+label).oninput=e=>{
 roleTrackTimes[i]=Number(e.target.value);
 if((soulUseUser?1:0)===i){if(mappingSelection)leaveMapping(false);seek(roleTrackTimes[i]);}
 updateRoleTracks();
};

// Persistent role colours are a background layer; active phrase glow is drawn above it.
const roleOverviewCache=new WeakMap();
function paintRoleOverview(c){
 if(!listeningDialog.open||roleInputMode==='box'||roleInputMode==='system')return;
 let cache=roleOverviewCache.get(data);if(!cache){cache=new Map();roleOverviewCache.set(data,cache);}
 const key=c.width+'x'+c.height+'-'+(soulUseUser?soulUserVersion?.token:'default');
 if(!cache.has(key)){
  const layer=document.createElement('canvas');layer.width=c.width;layer.height=c.height;
  for(let voice=0;voice<5;voice++){
   const ids=data.units.filter(u=>(soulUseUser&&Object.hasOwn(roleAssignments,u.id)&&!roleRemovedIds.size?roleAssignments[u.id]:u.voice)===voice).map(u=>u.id);
   miniGeometry(layer.getContext('2d'),layer.width,layer.height,ids,colorOf(voice),1,false,false,1.5,0,.6);
  }
  while(cache.size>5)cache.delete(cache.keys().next().value);cache.set(key,layer);
 }
 c.getContext('2d').drawImage(cache.get(key),0,0);
}
