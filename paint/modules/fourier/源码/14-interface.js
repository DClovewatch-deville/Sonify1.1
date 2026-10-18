
// Keep existing controls and event handlers while presenting a simple first visit.
{
const details=document.createElement('details');details.className='panel';details.style.cssText='padding:18px;margin:20px 0';details.innerHTML='<summary style="cursor:pointer;color:var(--mint);font-size:16px">进阶调整 · 精度、细节与圆数量</summary><p class="minor" style="margin:10px 0">默认参数适合首次体验。修改线稿精度或细节会重新转换；圆数量影响重建程度。</p>';
const grid=document.createElement('div');grid.className='ai-actions';details.appendChild(grid);document.querySelector('.workspace').after(details);
for(const id of ['aiQuality','aiDetail','aiSmooth','aiTier','richness','gifSize','songLength']){const label=$(id).closest('label');if(label)grid.appendChild(label);}
grid.appendChild($('aiLoad'));details.appendChild(document.querySelector('.settings'));
const multi=$('multiMode').closest('section');details.appendChild(multi);
const manual=$('aiPositive').closest('details');details.appendChild(manual);
const hint=document.querySelector('.ai-panel .ai-actions + p.ai-hint');if(hint)details.appendChild(hint);
document.querySelector('h1').textContent='让图片被圆画出，被音乐演奏。';
document.querySelector('.intro p').textContent='上传图片 → 播放作品 → 保存分享。照片、音乐与视频均在本机处理。';
$('exportInfo').textContent='视频含音乐，按一轮演奏实时录制，请保持页面前台。GIF 无声，WAV 为独立音乐。采样音色全部内置，首次播放需准备音符。';
}

// Put the Fourier performance first; photo processing remains one click away.
{
 const workspace=document.querySelector('.workspace'), intro=document.querySelector('.intro'), music=$('musicPlay').closest('section'), outputPanel=output.closest('.panel');
 intro.after(workspace);workspace.after(music);
 workspace.classList.add('performance');outputPanel.classList.add('fourier-stage');workspace.prepend(outputPanel);
 document.querySelector('h1').textContent='看圆旋转，听线条成曲。';
 document.querySelector('.intro p').textContent='每一条线，由旋转的圆重新绘出。跟随图案自然展开，快慢由你决定。';
 $('bpm').closest('label').hidden=false;
 const controls=document.createElement('div');controls.className='toolbar';controls.innerHTML='<button class="primary" id="stagePlay">▶ 演奏这幅画</button><button id="stageFocus" aria-pressed="false">专注看圆</button><button id="stageUpload">上传自己的照片 ↓</button><span id="stageProgress" class="minor"></span>';outputPanel.prepend(controls);
 const speedBox=$('speed').closest('div');speedBox.style.cssText='padding:12px 18px;border-top:1px solid var(--line)';speedBox.querySelector('.toggle')&&document.querySelector('.settings').appendChild(speedBox.querySelector('.toggle'));controls.after(speedBox);speedBox.appendChild($('durationInfo'));
 $('stagePlay').onclick=()=>$('musicPlay').click();
 $('stageFocus').onclick=()=>{const on=workspace.classList.toggle('focused');$('stageFocus').textContent=on?'退出专注':'专注看圆';$('stageFocus').setAttribute('aria-pressed',String(on));window.dispatchEvent(new Event('resize'));};
 $('stageUpload').onclick=()=>document.querySelector('.ai-panel').scrollIntoView({behavior:'smooth',block:'start'});
 $('songLength').addEventListener('change',()=>{$('stagePlay').textContent='▶ 演奏这幅画 · '+Math.round(window.drawingSeconds())+' 秒';});
 const style=document.createElement('style');style.textContent='.performance{grid-template-columns:minmax(0,2fr) minmax(220px,1fr);margin:20px 0}.performance .fourier-stage{border-color:#568e7c}.performance .canvaswrap{height:440px}.performance.focused{grid-template-columns:1fr}.performance.focused>.panel:not(.fourier-stage){display:none}.performance.focused .canvaswrap{height:min(72vh,700px)}.performance .panelhead{padding:10px 16px}@media(max-width:850px){.performance{grid-template-columns:1fr}.performance .canvaswrap{height:350px}}';document.head.appendChild(style);
 setInterval(()=>{$('stagePlay').textContent=$('musicPlay').textContent.includes('暂停')?'Ⅱ 暂停演奏':'▶ 演奏这幅画 · '+Math.round(window.drawingSeconds())+' 秒';$('stageProgress').textContent='重绘 '+Math.round(Math.max(0,Math.min(1,time))*100)+'% · '+(window.getFourierUnits?.().length||1)+' 组傅里叶链';},200);
 window.dispatchEvent(new Event('resize'));
}

{const s=document.createElement('style');s.textContent=':root{color-scheme:light}button.primary{color:white;background:#327b65}textarea{background:#fffefa!important;color:#254c4a!important}.canvaswrap,.ai-view{background:#f5f7f0!important}.ai-hint,.minor,footer,.canvasbadge{color:#627b78}.performance .fourier-stage{border-color:#afc8b8}select{color:#254c4a;background:#f3f5ee}';document.head.appendChild(s);document.querySelector('.intro p').textContent='花朵演示约 12 秒；图案越丰富，乐章越舒展。每一笔都能看见，也能听见。';}


// Compact musical controls share the existing playback and export parameters.
{
 const bpm=$('bpm');bpm.min=40;bpm.max=168;bpm.value=88;$('bpmValue').textContent='88';
 const group=document.createElement('details');group.className='panel';group.style.cssText='padding:16px;margin:16px 0';
 group.innerHTML=`<summary>音乐设置 · 调式、情感与速度</summary><div class="ai-actions" style="margin-top:16px">
 <label>精确速度 <input id="tempoExact" type="number" min="40" max="168" value="88" aria-label="精确速度 BPM" style="width:70px"></label>
 <select id="tempoPreset" aria-label="常用速度"><option value="">常用速度</option><option value="46">46 · Largo</option><option value="66">66 · Andante</option><option value="88">88 · Moderato</option><option value="108">108 · Allegretto</option><option value="132">132 · Allegro</option><option value="152">152 · Vivace</option></select>
 <label>调式 <select id="musicMode"><option value="auto">随图片冷暖</option><option value="major">大调</option><option value="natural-minor">小调</option><option value="pentatonic">五声音阶</option></select></label>
 <label>主音 <select id="musicTonic"><option value="auto">随冷暖推荐</option>${Array.from({length:12},(_,i)=>`<option value="${60+i}">${['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][i]}</option>`).join('')}</select></label>
 <label>情感起点 <select id="emotionPreset"><option value="calm">平和</option><option value="bright">明亮</option><option value="deep">沉静</option></select></label></div>
 <div class="ai-actions">${[['brightness','明亮度',65],['noteDensity','音符密度',60],['spatial','空间感',40],['rhythmic','律动强度',50]].map(([id,label,value])=>`<label>${label} <input id="${id}" type="range" min="0" max="100" value="${value}"></label>`).join('')}</div>`;
 $('musicPlay').closest('section').after(group);
 const snaps=[46,66,88,108,132,152];
 const setTempo=(value,snap)=>{let n=Math.max(40,Math.min(168,Math.round(+value||88)));if(snap){const v=snaps.find(v=>Math.abs(v-n)<=3);if(v)n=v;}bpm.value=n;$('tempoExact').value=n;$('bpmValue').textContent=n;window.dispatchEvent(new Event('tonechange'));window.dispatchEvent(new Event('scorechange'));};
 bpm.oninput=()=>setTempo(bpm.value,true);$('tempoExact').onchange=()=>setTempo($('tempoExact').value,false);$('tempoPreset').onchange=()=>{if($('tempoPreset').value)setTempo($('tempoPreset').value,false);};
 const apply=()=>{window.emotionSettings=Object.fromEntries(['brightness','noteDensity','spatial','rhythmic'].map(id=>[id,+$(id).value]));window.dispatchEvent(new Event('tonechange'));window.dispatchEvent(new Event('scorechange'));};
 for(const id of ['brightness','noteDensity','spatial','rhythmic','musicMode','musicTonic'])$(id).addEventListener('change',apply);
 $('emotionPreset').onchange=()=>{const values={calm:[60,45,55,40],bright:[85,75,25,70],deep:[35,50,60,45]}[$('emotionPreset').value];['brightness','noteDensity','spatial','rhythmic'].forEach((id,i)=>$(id).value=values[i]);apply();};
 const speed=$('speed');speed.hidden=true;speed.closest('div').querySelectorAll('.labelrow,.rangelabel').forEach(el=>el.hidden=true);
 document.querySelector('.intro p').textContent='画一笔，或导入照片。让主题展开，让旋律回家。';
 apply();
}
