'use strict';
const $=s=>document.querySelector(s); let chosen=null, busy=false, objectURL=null, activeId=null;
async function api(url,options) { const r=await fetch(url,options); const d=await r.json(); if(!r.ok)throw new Error(d.error||'连接失败，请确认仍连接现场 Wi-Fi。'); return d; }
function error(message) { $('#phone-error').hidden=false; $('#phone-error').textContent=message; }
$('#phone-file').addEventListener('change',e=>{
  if(busy)return; const file=e.target.files[0]; if(!file)return;
  if(file.size>30*1024*1024) { error('图片超过 30 MB，请选择较小的照片。'); return; }
  chosen=file; activeId=null; if(objectURL)URL.revokeObjectURL(objectURL); objectURL=URL.createObjectURL(file);
  $('#phone-preview').src=objectURL; $('#phone-preview').hidden=false; $('#phone-name').textContent=file.name;
  $('#send').disabled=false; $('#phone-error').hidden=true;
});
async function prepare(file) {
  const image=new Image(); const url=URL.createObjectURL(file);
  try {
    await new Promise((resolve,reject)=>{image.onload=resolve; image.onerror=()=>reject(new Error('无法读取该照片，请换成 JPG 或 PNG 格式后上传。')); image.src=url;});
    const ratio=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio)); canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    const context=canvas.getContext('2d'); context.fillStyle='#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.9).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
async function follow(job) {
  $('#receipt').hidden=false; $('#ticket').textContent=job.id.slice(0,6).toUpperCase();
  for(;;) {
    $('#fallback-local').hidden=!(job.provider==='seedream'&&job.status==='failed'&&job.artistic_status==='failed'&&!job.artistic);
    $('#phone-state').textContent=job.error || job.music_error || (job.music_status==='completed' ? '作品已生成，请到主屏幕体验。' : job.stage);
    if(['completed','failed'].includes(job.status)) { $('#another').hidden=false; return; }
    await new Promise(resolve=>setTimeout(resolve,1500)); job=await api('/api/jobs/'+job.id);
  }
}
$('#send').addEventListener('click',async()=>{
  if((!chosen&&!activeId)||busy)return; busy=true; $('#send').disabled=true; $('#phone-file').disabled=true; $('#phone-error').hidden=true;
  try {
    if(activeId) { await follow(await api('/api/jobs/'+activeId)); return; }
    $('#send').textContent='正在准备并上传…';
    const image=await prepare(chosen); const job=await api('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image})});
    activeId=job.id; localStorage.setItem('sonify-phone-job',job.id); $('#send').textContent='已上传'; await follow(job);
  } catch(e) {error(e.message);$('#send').textContent=activeId?'恢复任务连接':'重新上传';$('#send').disabled=false;}
  finally {busy=false;$('#phone-file').disabled=false;}
});
$('#another').addEventListener('click',()=>{
  chosen=null;activeId=null;localStorage.removeItem('sonify-phone-job');$('#receipt').hidden=true;$('#fallback-local').hidden=true;$('#another').hidden=true;$('#phone-preview').hidden=true;$('#phone-name').textContent='';$('#phone-file').value='';$('#send').disabled=true;$('#send').textContent='上传并生成作品 ↗';
});
(async()=>{
  const id=localStorage.getItem('sonify-phone-job');if(!id||!/^[a-f0-9]{32}$/.test(id))return;
  busy=true;$('#phone-file').disabled=true;
  try{const job=await api('/api/jobs/'+id);activeId=id;await follow(job);}catch(e){error('上次任务暂时无法恢复。请重新扫描二维码，或选择图片重新上传。');if(activeId){$('#send').textContent='恢复任务连接';$('#send').disabled=false;}}
  finally{busy=false;$('#phone-file').disabled=false;}
})();

$('#fallback-local').onclick=async()=>{if(busy||!activeId)return;busy=true;const b=$('#fallback-local');b.disabled=true;try{const job=await api('/api/jobs/'+activeId+'/fallback-local',{method:'POST'});activeId=job.id;localStorage.setItem('sonify-phone-job',job.id);await follow(job);}catch(e){error(e.message);}finally{busy=false;b.disabled=false;}};
