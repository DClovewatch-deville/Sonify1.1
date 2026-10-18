'use strict';
const $ = s => document.querySelector(s);
let chosen = null, busy = false, previewURL = null, artisticAvailable = false, lineartBridge = null;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '服务暂时无法连接。');
  return result;
}
function choose(file) {
  if (busy || !file) return;
  $('#error').hidden = true;
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    $('#result').hidden = false; $('#error').hidden = false;
    $('#error').textContent = '请选择不超过 12 MB 的 JPG 或 PNG 图片。';
    return;
  }
  chosen = file;
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = URL.createObjectURL(file);
  $('#original').src = previewURL; $('#original').hidden = false; $('#empty').hidden = true;
  $('#filename').textContent = file.name; $('#generate').disabled = false;
  $('#result').hidden = true;
}
$('#file').addEventListener('change', e => choose(e.target.files[0]));
$('#provider').addEventListener('change',()=>{
  const v=$('#provider').value;
  $('#generate').textContent=(v==='supplied'?'本地提取并':'')+'开始生成';
  if(v==='supplied'||v==='local'){
    $('#artistic').checked=false;$('#artistic').disabled=true;
    $('#cloud-note').textContent='本地生成不调用云端服务';
  }else if(v==='seedream'){
    $('#artistic').checked=false;$('#artistic').disabled=true;
    $('#cloud-note').textContent='本次云端输出同时用于展示与结构解析，不额外请求';
  }else{
    $('#artistic').disabled=!artisticAvailable;
    $('#cloud-note').textContent=artisticAvailable?'云端服务已配置':'待开通云端服务';
  }
});
for (const event of ['dragover', 'dragleave', 'drop']) $('#drop').addEventListener(event, e => {
  e.preventDefault(); $('#drop').classList.toggle('drag', event === 'dragover');
  if (event === 'drop') choose(e.dataTransfer.files[0]);
});
function showImage(selector, wait, url) {
  if (url) { $(selector).src = url; $(selector).hidden = false; $(wait).hidden = true; }
}
function render(job) {
  $('#fallback-local').hidden=!(job.provider==='seedream'&&job.status==='failed'&&job.artistic_status==='failed'&&!job.artistic);$('#fallback-local').dataset.job=job.id;
  const providerLabel={'supplied':'本地精细线稿','local':job.fallback_from?'快速备用':'快速本地','seedream':'云端','comfy':'ComfyUI'}[job.provider]||job.provider;
  $('#status').textContent = providerLabel+' · '+job.stage;
  showImage('#structural', '#structure-wait', job.structural);
  showImage('#art', '#art-wait', job.artistic);
  $('#art-wait').textContent = ({disabled:'本次未启用艺术生成',queued:'等待艺术线稿',processing:'正在生成艺术线稿',failed:'艺术生成失败，结构处理可独立继续'})[job.artistic_status] || '';
  $('#error').hidden = !job.error && !job.artistic_error && !job.music_error;
  $('#error').textContent = [job.error, job.artistic_error, job.music_error].filter(Boolean).join(' ');
  for (const key of ['geometry', 'handoff', 'workspace']) {
    $('#' + key).hidden = !job[key]; if (job[key]) $('#' + key).href = key==='workspace'?'/experience?view=journey&job='+job.id:job[key];
  }
  if (job.stats) $('#summary').textContent = `已提取 ${job.stats.selected_paths} 条候选路径。` + (job.music_status === 'completed' ? '三个展示模式的音乐与映射数据已生成，可以打开作品。' : job.music_status === 'processing' ? '正在生成本次图片的音乐，请稍候。' : '几何数据与接入清单已保存。');
  $('#ready-title').textContent = job.music_status === 'completed' ? '你的图片，已成为作品' : job.status === 'completed' ? '结构数据已准备好' : '准备接入 MusicPhoto';
}
$('#generate').addEventListener('click', async () => {
  if (!chosen || busy) return;
  const provider=$('#provider').value;
  busy = true; $('#generate').disabled = true; $('#file').disabled = true; $('#provider').disabled = true;
  $('#result').hidden = false; $('#error').hidden = true;
  $('#status').textContent = provider==='supplied'?'正在打开本地线稿工具':'正在上传图片';
  for (const id of ['structural', 'art', 'geometry', 'handoff', 'workspace']) $('#' + id).hidden = true;
  $('#structure-wait').hidden = false; $('#art-wait').hidden = false;
  $('#summary').textContent = '图片结构准备完成后，可将数据交给三个展示模式。';
  try {
    if(provider==='supplied'){
      if(!lineartBridge)lineartBridge=new window.LineArtBridge();
      const reader=new FileReader();
      const dataURL=await new Promise((resolve,reject)=>{reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(chosen);});
      $('#status').textContent='正在提取线稿，可取消';
      const result=await lineartBridge.extract(dataURL);
      if(!result.success){
        if(result.canceled)$('#status').textContent='已取消线稿提取';
        else{$('#error').textContent='线稿提取失败';$('#error').hidden=false;$('#status').textContent='本地提取失败，可重试';}
        return;
      }
      $('#status').textContent='正在提交线稿与音乐生成';
      const image=result.original.split(',')[1],lineart=result.lineart.split(',')[1];
      let job=await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,lineart,provider:'supplied',method:result.method})});
      localStorage.setItem('sonify-intake-job',job.id);
      await follow(job);
    }else{
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(chosen);
      });
      let job = await api('/api/jobs', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,provider,artistic:(provider!=='supplied'&&provider!=='local'&&$('#artistic').checked)})});
      localStorage.setItem('sonify-intake-job', job.id);
      await follow(job);
    }
  } catch (error) { $('#error').textContent = error.message; $('#error').hidden = false; $('#status').textContent = '提交或连接失败，可重试'; }
  finally { busy = false; $('#generate').disabled = !chosen; $('#file').disabled = false; $('#provider').disabled = false; }
});
async function follow(job) {
  for (;;) {
    render(job);
    const structureDone = ['completed','failed'].includes(job.status);
    const artDone = ['completed','failed','disabled'].includes(job.artistic_status);
    if (structureDone && artDone) return;
    await pause(1000);
    job = await api('/api/jobs/' + job.id);
  }
}
async function init() {
  try {
    const health = await api('/api/health');
    const msg=[];
    if(health.providers.seedream)msg.push('云端线稿服务已配置');
    if(health.providers.comfy)msg.push('ComfyUI已配置');
    $('#engine').textContent=msg.length?msg.join(' · '):'服务检查完成，本地生成可用';
    $('#provider option[value="supplied"]').disabled=false;
    $('#provider option[value="local"]').disabled=false;
    $('#provider option[value="comfy"]').disabled=!health.providers.comfy;
    $('#provider option[value="seedream"]').disabled=!health.providers.seedream;
    $('#provider').value='supplied';
    if(health.providers.comfy)$('#provider option[value="comfy"]').textContent='AI结构提纯 · 专用工作台';
    artisticAvailable=!!health.providers.artistic;
    $('#artistic').checked=false;$('#artistic').disabled = true;
    $('#cloud-note').textContent = '本地生成不调用云端服务';
    const saved = localStorage.getItem('sonify-intake-job');
    if (saved && /^[a-f0-9]{32}$/.test(saved)) {
      const job = await api('/api/jobs/' + saved);
      $('#result').hidden = false; $('#original').src = job.original; $('#original').hidden = false; $('#empty').hidden = true;
      $('#filename').textContent = '已恢复的上传任务';
      busy = true; $('#file').disabled = true; $('#provider').disabled = true;
      try { await follow(job); } finally { busy = false; $('#file').disabled = false; $('#provider').disabled = false; }
    }
  } catch (error) { $('#engine').textContent = '无法连接本机服务，请重新启动 Python 程序'; }
}
init();

$('#fallback-local').onclick=async()=>{const b=$('#fallback-local');b.disabled=true;try{const job=await api('/api/jobs/'+b.dataset.job+'/fallback-local',{method:'POST'});localStorage.setItem('sonify-intake-job',job.id);await follow(job);}catch(e){$('#error').hidden=false;$('#error').textContent=e.message;}finally{b.disabled=false;}};
