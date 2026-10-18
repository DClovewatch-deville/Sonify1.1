/* V2.1: prompted object masks, then closed contour tracing. No image upload. */
function samWorkerMain(){
 let api,model,processor,tier,inputs,embeddings,files=[],cache;
 const send=(type,data={})=>postMessage({type,...data});
 async function init(d){self.SAM_WASM_BYTES=d.wasmBytes;if(!self.SAM_WASM_BYTES)throw Error('缺少内置运行组件');
  if(model&&tier===d.tier)return;
  if(model)await model.dispose();model=null;embeddings=null;inputs=null;
  send('progress',{text:'加载识别组件…'});
  api=self.SAM_API;if(!api)throw Error('内置识别库未初始化');
  self.fetch=()=>Promise.reject(Error('离线版禁止读取外部资源'));const {env}=api;env.allowLocalModels=false;env.useBrowserCache=false;env.useFSCache=false;env.useCustomCache=true;
  env.remoteHost=d.tier==='light'&&d.modelRoot?d.modelRoot:'https://huggingface.co/';env.remotePathTemplate=d.tier==='light'&&d.modelRoot?'{model}/':'{model}/resolve/{revision}/';
  env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
  env.backends.onnx.wasm.wasmPaths=d.wasm;
  try{cache=await caches.open('fourier-sam-v21')}catch{cache=null}
  env.customCache={async match(key){const name=String(key).split('/').pop();const f=files.find(f=>f.name===name);if(f)return new Response(f,{headers:{'content-length':String(f.size)}});try{return await cache?.match(key)}catch{return undefined}},async put(key,response){try{await cache?.put(key,response)}catch{}}};
  const opts={quantized:d.tier==='light',progress_callback:p=>{if(p.status==='progress')send('progress',{text:'下载 '+p.file,percent:p.progress,loaded:p.loaded,total:p.total});else if(p.status==='done')send('progress',{text:p.file+' 已就绪，正在初始化…'});}};
  processor=await api.AutoProcessor.from_pretrained('Xenova/slimsam-77-uniform');
  model=await api.SamModel.from_pretrained('Xenova/slimsam-77-uniform',opts);tier=d.tier;send('ready');
 }
 onmessage=async({data:d})=>{try{
  if(d.type==='files'){files=d.files;return;}
  if(d.type==='export'){
   const suffix=tier==='light'?'_quantized':'';
   const names=['config.json','preprocessor_config.json','onnx/vision_encoder'+suffix+'.onnx','onnx/prompt_encoder_mask_decoder'+suffix+'.onnx'];
   const root=api.env.remoteHost+api.env.remotePathTemplate.replace('{model}','Xenova/slimsam-77-uniform').replace('{revision}','main');const bundle=[];for(const name of names){const r=await api.env.customCache.match(root+name);if(!r)throw Error('缓存中缺少 '+name+'，请重新准备模型。');bundle.push({name:name.split('/').pop(),bytes:await r.arrayBuffer()});}send('bundle',{bundle,tier});return;
  }
  if(d.type==='init'){await init(d);return;}
  if(d.type==='encode'){
   send('progress',{text:'正在理解照片中的形状，请稍候…'});
   const image=new api.RawImage(new Uint8ClampedArray(d.rgba),d.width,d.height,4);
   inputs=await processor(image);embeddings=await model.get_image_embeddings(inputs);send('encoded');return;
  }
  if(d.type==='auto'){
   const locations=[];for(const y of [.18,.34,.5,.66,.82,.94])for(const x of [.18,.34,.5,.66,.82])locations.push({x,y});const candidates=[];
   const sizes=inputs.reshaped_input_sizes[0];let width=0,height=0;
   for(let index=0;index<locations.length;index++){
    send('progress',{text:'检查主体与相连部件 '+(index+1)+' / '+locations.length});
    const p=locations[index],out=await model({...embeddings,input_points:new api.Tensor('float32',[p.x*sizes[1],p.y*sizes[0]],[1,1,1,2]),input_labels:new api.Tensor('int64',[1n],[1,1,1])});
    const processed=await processor.post_process_masks(out.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes),t=processed[0][0];width=t.dims.at(-1);height=t.dims.at(-2);const size=width*height;
    for(let k=0;k<3;k++){const mask=Uint8Array.from(t.data.slice(k*size,(k+1)*size),x=>x?1:0),quality=Number(out.iou_scores.data[k]),score=rankSubject(mask,width,height,quality);if(score<0)continue;const existing=candidates.findIndex(c=>maskOverlap(c.mask,mask)>.82);if(existing>=0){if(candidates[existing].score>=score)continue;candidates.splice(existing,1);}candidates.push({mask,quality,score,point:{...p,label:1}});candidates.sort((a,b)=>b.score-a.score);candidates.length=Math.min(candidates.length,60);}
   }
   if(!candidates.length)throw Error('没有找到可靠主体，请在要保留的对象上点一下后重试');
   const assembled=assembleSubject(candidates,width,height);candidates.splice(0,candidates.length,...assembled);const data=new Uint8Array(width*height*candidates.length);candidates.forEach((c,i)=>data.set(c.mask,i*width*height));send('masks',{width,height,count:candidates.length,data,scores:candidates.map(c=>c.score),seeds:candidates.map(c=>c.point),automatic:true});return;
  }
  if(d.type==='details'){send('details',{paths:makeIllustration(d),job:d.job});return;}
  if(d.type==='decode'){

   const sizes=inputs.reshaped_input_sizes[0];
   const pts=d.points.flatMap(p=>[p.x*sizes[1],p.y*sizes[0]]);
   const labels=d.points.map(p=>BigInt(p.label));
   const outputs=await model({...embeddings,input_points:new api.Tensor('float32',pts,[1,1,d.points.length,2]),input_labels:new api.Tensor('int64',labels,[1,1,labels.length])});
   const masks=await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
   const t=masks[0][0],dims=t.dims,w=dims.at(-1),h=dims.at(-2),n=t.data.length/(w*h);
   const data=Uint8Array.from(t.data,x=>x?1:0);send('masks',{width:w,height:h,count:n,data,scores:Array.from(outputs.iou_scores.data)});return;
  }
 }catch(e){send('error',{text:String(e.message||e)});}};
}

if(typeof document!=='undefined')(()=>{
 let wholeWorker=null,wholeURL=null;let outlines=[],detailPaths=[],detailJob=0,detailTimer=null;
 const el=id=>document.getElementById(id),source=el('aiSource'),preview=el('aiPreview'),ctx=source.getContext('2d'),pc=preview.getContext('2d');
 let picture=null,points=[],mode=1,worker=null,ready=false,encoded=false,busy=false,masks=null,paths=[],localFiles=window.SAM_LOCAL_FILES||[],workerURL=null,jobTimer=null,view={x:0,y:0,w:0,h:0},maskCanvas=null,revision=0;
 const library=window.SAM_LIBRARY_URL||new URL('vendor/transformers.min.js',document.baseURI).href;
 const wasm=window.SAM_WASM_URL||new URL('vendor/',document.baseURI).href;
 const modelRoot=window.SAM_MODEL_ROOT!==undefined?window.SAM_MODEL_ROOT:new URL('models/',document.baseURI).href;
 function message(s){el('aiStatus').textContent=s;}
 function controls(){const whole=el('aiScope').value==='whole';source.closest('.ai-view').querySelector('header').innerHTML=whole?'<span>01 / 原图</span><span>整张图片参与转换</span>':'<span>01 / 原图与选区</span><span>绿色保留 · 红点排除</span>';el('aiDetail').querySelector('option[value="0"]').disabled=el('aiScope').value==='whole';el('aiTier').closest('label').hidden=el('aiScope').value==='whole';el('aiLoad').hidden=el('aiScope').value==='whole';el('aiScope').disabled=busy;el('aiQuality').disabled=busy;el('aiPositive').closest('details').hidden=el('aiScope').value==='whole';el('aiAuto').disabled=busy||!picture;el('aiFlower').disabled=busy;el('aiDetail').disabled=busy;el('aiSmooth').disabled=busy||el('aiScope').value==='whole';el('aiBundle').disabled=busy||!ready;el('aiCancel').disabled=!busy;el('aiLoad').disabled=busy;el('aiTier').disabled=busy;el('aiFile').disabled=busy;el('aiSample').disabled=busy;el('aiModelFiles').disabled=busy;el('aiRun').disabled=busy||!picture;el('aiUndo').disabled=busy||!points.length;el('aiReset').disabled=busy||!points.length;el('aiCandidate').disabled=busy||!masks;for(const id of ['aiApply','aiListen','aiSVG','aiPNG'])el(id).disabled=busy||!paths.length;el('aiProgress').hidden=!busy;}
 function setBusy(v){busy=v;window.imageProcessing=v;controls();}
 function clearResult(){masks=null;paths=[];outlines=[];detailPaths=[];maskCanvas=null;detailJob++;clearTimeout(detailTimer);el('aiStats').textContent='生成后会自动放入下方画布，照片背景不参与内部线条提取。';el('aiCandidate').replaceChildren(new Option('识别后可选','0'));paint();controls();}
 function stop(text){wholeWorker?.terminate();wholeWorker=null;if(wholeURL)URL.revokeObjectURL(wholeURL);wholeURL=null;revision++;detailJob++;clearTimeout(detailTimer);worker?.terminate();worker=null;if(workerURL)URL.revokeObjectURL(workerURL);workerURL=null;ready=false;encoded=false;el('aiBundle').disabled=true;clearTimeout(jobTimer);setBusy(false);message(text);}
 function timer(){clearTimeout(jobTimer);jobTimer=setTimeout(()=>message('仍在处理。大型照片或较慢的设备可能需要更久；可继续等待，或点“停止”后重试。'),90000);}
 function makeWorker(){if(worker)return;workerURL=URL.createObjectURL(new Blob([window.SAM_LIBRARY_SOURCE,';',rankSubject.toString(),maskOverlap.toString(),assembleSubject.toString(),traceGlyphMask.toString(),extractStructure.toString(),makeIllustration.toString(),'('+samWorkerMain.toString()+')()'],{type:'text/javascript'}));worker=new Worker(workerURL);worker.onerror=e=>stop('离线识别线程启动失败：'+(e.message||'浏览器未提供详细原因')+'（行 '+e.lineno+'，列 '+e.colno+'）。请用 Edge 或 Chrome 打开完整 HTML 文件。');worker.onmessage=({data:d})=>{
  if(d.type==='progress'){message(d.text+(d.loaded?' · '+(d.loaded/1e6).toFixed(1)+' MB'+(d.total?' / '+(d.total/1e6).toFixed(1)+' MB':''):''));if(Number.isFinite(d.percent))el('aiProgress').value=d.percent/100;else el('aiProgress').removeAttribute('value');}
  if(d.type==='ready'){ready=true;el('aiBundle').disabled=false;clearTimeout(jobTimer);if(picture)encode();else{setBusy(false);message('模型已准备好。在照片中的主体内部点一下开始。');}}
  if(d.type==='bundle'){const manifest=JSON.stringify({format:'fourier-sam-v21',tier:d.tier,files:d.bundle.map(f=>({name:f.name,size:f.bytes.byteLength}))});const header=new TextEncoder().encode(manifest);const length=new Uint32Array([header.length]);download(new Blob([length,header,...d.bundle.map(f=>f.bytes)]),'Sonify paint with Fourier模型-'+d.tier+'.sam');message('模型包已生成。以后可在下方直接导入这个 .sam 文件。');}
  if(d.type==='encoded'){encoded=true;decode();}
  if(d.type==='masks'){clearTimeout(jobTimer);masks=d;const best=d.scores.indexOf(Math.max(...d.scores));el('aiCandidate').replaceChildren(...d.scores.map((s,i)=>new Option('候选 '+(i+1)+(i===best?' · 模型推荐':''),String(i))));el('aiCandidate').value=String(Math.max(0,best));if(d.automatic)points=[d.seeds[Math.max(0,best)]];setBusy(false);updateResult();}
  if(d.type==='details'&&d.job===detailJob){detailPaths=d.paths.map(p=>p.map(q=>({x:q.x*picture.width/Math.round(picture.width*Math.min(1,detailSize()/Math.max(picture.width,picture.height))),y:q.y*picture.height/Math.round(picture.height*Math.min(1,detailSize()/Math.max(picture.width,picture.height)))})));paths=outlines.concat(detailPaths);setBusy(false);paint();el('aiStats').textContent=outlines.length+' 条外形轮廓 + '+detailPaths.length+' 条内部线条 · 已放入画布';apply(false,false);message('简笔画已自动生成。可以直接播放音乐；若选错主体，可切换候选或点选修正。');}
  if(d.type==='error')stop('识别未完成：'+d.text+'。可停止后重试，或重新打开完整离线文件。');
 };if(localFiles.length)worker.postMessage({type:'files',files:localFiles});}
 function start(){if(busy)return;if(picture&&el('aiScope').value==='whole'){runWhole();return;}setBusy(true);el('aiProgress').removeAttribute('value');timer();makeWorker();if(ready){if(picture){if(encoded)decode();else encode();}else{setBusy(false);message('模型已就绪，请先选择照片并点选主体。');}}else worker.postMessage({type:'init',tier:el('aiTier').value,library,wasm,modelRoot,wasmBytes:window.SAM_WASM_BYTES});}
 function encode(){const rgba=picture.getContext('2d').getImageData(0,0,picture.width,picture.height).data;worker.postMessage({type:'encode',rgba,width:picture.width,height:picture.height});}
 function decode(){message(points.length?'正在根据点选修正主体…':'正在自动寻找主体…');worker.postMessage({type:points.some(p=>p.label)?'decode':'auto',points});}
 async function openPicture(url){if(busy)return;const rev=++revision;try{const image=new Image();image.src=url;await image.decode();if(rev!==revision)return;picture=document.createElement('canvas');const ratio=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));picture.width=Math.round(image.naturalWidth*ratio);picture.height=Math.round(image.naturalHeight*ratio);picture.getContext('2d').drawImage(image,0,0,picture.width,picture.height);window.analyzeImageTone?.(picture);points=[];encoded=false;clearResult();message('照片已载入，正在自动生成简笔画…');start();}catch{message('无法读取照片，请使用正常的 PNG、JPG 或 WebP 文件。');}finally{if(url.startsWith('blob:'))URL.revokeObjectURL(url);}}
 function paint(){ctx.fillStyle='#f4f7f5';ctx.fillRect(0,0,800,600);pc.fillStyle='#f4f7f5';pc.fillRect(0,0,800,600);if(!picture){ctx.fillStyle='#678078';ctx.font='20px sans-serif';ctx.textAlign='center';ctx.fillText('上传照片，或点击“试用猫图”',400,300);pc.fillStyle='#678078';pc.font='18px sans-serif';pc.textAlign='center';pc.fillText('简笔画会自动出现在这里',400,300);return;}
  const r=Math.min(760/picture.width,560/picture.height);view={x:(800-picture.width*r)/2,y:(600-picture.height*r)/2,w:picture.width*r,h:picture.height*r};ctx.drawImage(picture,view.x,view.y,view.w,view.h);if(maskCanvas)ctx.drawImage(maskCanvas,view.x,view.y,view.w,view.h);
  for(const p of points){const x=view.x+p.x*view.w,y=view.y+p.y*view.h;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fillStyle=p.label?'#abf0d0':'#ff827e';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#102c27';ctx.stroke();ctx.fillStyle='#102c27';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.label?'+':'−',x,y);}
  drawPaths(pc,800,600);
 }
 function drawPaths(c,w,h){if(!paths.length)return;let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const p of paths)for(const q of p){xmin=Math.min(xmin,q.x);xmax=Math.max(xmax,q.x);ymin=Math.min(ymin,q.y);ymax=Math.max(ymax,q.y);}const r=Math.min((w-80)/Math.max(1,xmax-xmin),(h-80)/Math.max(1,ymax-ymin)),x=(w-(xmax-xmin)*r)/2-xmin*r,y=(h-(ymax-ymin)*r)/2-ymin*r;c.strokeStyle='#143e32';c.lineWidth=Math.max(1.3,w/500);c.lineJoin='round';c.lineCap='round';for(const p of paths){c.beginPath();p.forEach((q,i)=>i?c.lineTo(x+q.x*r,y+q.y*r):c.moveTo(x+q.x*r,y+q.y*r));c.stroke();}}
 function updateResult(){if(!masks)return;const {width:w,height:h,data}=masks,k=Number(el('aiCandidate').value),rgba=new Uint8ClampedArray(w*h*4),overlay=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)if(data[k*w*h+i]){rgba[i*4+3]=255;overlay.set([90,232,163,100],i*4);}
  maskCanvas=document.createElement('canvas');maskCanvas.width=w;maskCanvas.height=h;maskCanvas.getContext('2d').putImageData(new ImageData(overlay,w,h),0,0);
  paths=traceGlyphMask(rgba,w,h);const rounds=Number(el('aiSmooth').value);for(let n=0;n<rounds;n++)paths=paths.map(path=>{const p=path.slice(0,-1),out=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];out.push({x:.75*a.x+.25*b.x,y:.75*a.y+.25*b.y},{x:.25*a.x+.75*b.x,y:.25*a.y+.75*b.y});}if(out.length)out.push({...out[0]});return out;});
  outlines=paths;detailPaths=[];el('aiStats').textContent=paths.length?'已提取 '+paths.length+' 条闭合轮廓 · '+w+' × '+h+' 像素 · 预览确认后放入画布':'该候选没有有效轮廓，请换一个候选或调整点选。';paint();controls();requestDetails();
 }

 function detailSize(){return {fast:720,balanced:960,fine:1440}[el('aiQuality').value]||960;}
 function runWhole(){
  const token=++detailJob,begin=performance.now();clearTimeout(detailTimer);wholeWorker?.terminate();if(wholeURL)URL.revokeObjectURL(wholeURL);masks=null;maskCanvas=null;outlines=[];detailPaths=[];paths=[];points=[];
  const scale=Math.min(1,detailSize()/Math.max(picture.width,picture.height)),w=Math.max(8,Math.round(picture.width*scale)),h=Math.max(8,Math.round(picture.height*scale)),c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(picture,0,0,w,h);const rgba=g.getImageData(0,0,w,h).data;
  setBusy(true);paint();message('正在把整张图片转成线稿（不需要加载识别模型）…');
  try{wholeURL=URL.createObjectURL(new Blob([extractStructure.toString(),traceGlyphMask.toString(),makeIllustration.toString(),';onmessage=({data:d})=>{try{const mask=new Uint8Array(d.w*d.h).fill(1),paths=makeIllustration({...d,mask});postMessage({ok:true,result:{paths,candidates:paths.length,limit:paths.length}})}catch(e){postMessage({ok:false,error:String(e.message||e)})}}'],{type:'text/javascript'}));wholeWorker=new Worker(wholeURL);
   wholeWorker.onmessage=({data:d})=>{if(token!==detailJob)return;wholeWorker.terminate();wholeWorker=null;URL.revokeObjectURL(wholeURL);wholeURL=null;if(!d.ok){setBusy(false);message('整图转换失败：'+d.error);return;}paths=d.result.paths.map(p=>p.map(q=>({x:q.x*picture.width/w,y:q.y*picture.height/h})));setBusy(false);paint();if(paths.length)apply(false,false);el('aiStats').textContent=paths.length+' 条线 · 整张图片 · '+w+' × '+h+' · 处理 '+((performance.now()-begin)/1000).toFixed(1)+' 秒'+(d.result.candidates>d.result.limit?' · 已限制碎线数量，可提高细节档位':'');message(paths.length?'整张图片已转为线稿并放入画布，背景与多个物体均参与提取。':'没有发现足够清晰的线条，请提高细节或换用更清晰的图片。');};
   wholeWorker.onerror=e=>{if(token!==detailJob)return;stop('整图转换线程出错：'+(e.message||'请重新打开文件后重试'));};
   wholeWorker.postMessage({rgba,w,h,mode:'photo',detail:Math.max(1,+el('aiDetail').value),structural:false},[rgba.buffer]);
  }catch(e){stop('无法开始整图转换：'+e.message);}
 }

 function requestDetails(){
  if(!masks||!outlines.length)return;const job=++detailJob;clearTimeout(detailTimer);detailTimer=setTimeout(()=>{
   const scale=Math.min(1,detailSize()/Math.max(picture.width,picture.height)),w=Math.round(picture.width*scale),h=Math.round(picture.height*scale),c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(picture,0,0,w,h);const rgba=c.getContext('2d').getImageData(0,0,w,h).data,mask=new Uint8Array(w*h),k=+el('aiCandidate').value;
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)mask[y*w+x]=masks.data[k*masks.width*masks.height+Math.min(masks.height-1,Math.floor(y*masks.height/h))*masks.width+Math.min(masks.width-1,Math.floor(x*masks.width/w))];
   setBusy(true);message('保留主体内部结构，整理简笔画线条…');makeWorker();worker.postMessage({type:'details',rgba,w,h,mask,detail:+el('aiDetail').value,job});
  },80);
 }
 source.addEventListener('pointerdown',e=>{if(!picture||busy||el('aiScope').value==='whole')return;const b=source.getBoundingClientRect(),x=(e.clientX-b.left)*800/b.width,y=(e.clientY-b.top)*600/b.height;if(x<view.x||y<view.y||x>view.x+view.w||y>view.y+view.h)return;if(points.length>=32){message('最多保留 32 个点，请撤销部分点或清空重选。');return;}points.push({x:(x-view.x)/view.w,y:(y-view.y)/view.h,label:mode});clearResult();if(!points.some(p=>p.label)){message('先切换“补选主体”，在要保留的对象内部点一下。');return;}start();});
 el('aiPositive').onclick=()=>{mode=1;el('aiPositive').setAttribute('aria-pressed','true');el('aiNegative').setAttribute('aria-pressed','false');};el('aiNegative').onclick=()=>{mode=0;el('aiPositive').setAttribute('aria-pressed','false');el('aiNegative').setAttribute('aria-pressed','true');};
 el('aiFile').onchange=e=>{const file=e.target.files[0];if(!file)return;if(file.size>30*1024*1024){message('请选择 30 MB 以内的照片。');return;}openPicture(URL.createObjectURL(file));e.target.value='';};el('aiSample').onclick=()=>openPicture(window.SAM_SAMPLE_URL||'assets/cat.png');
 el('aiAuto').onclick=()=>{points=[];clearResult();start();};el('aiFlower').onclick=()=>openPicture(window.SAM_FLOWER_URL||'assets/flower.png');el('aiLoad').onclick=start;el('aiRun').onclick=start;el('aiCancel').onclick=()=>stop('已停止。图片与点选保留，点击“重新识别”可重试。');el('aiTier').onchange=()=>{stop('已切换模型档次，下次识别将加载所选权重。');clearResult();};
 el('aiUndo').onclick=()=>{points.pop();clearResult();if(points.some(p=>p.label))start();else message('已撤销。请重新点选主体。');};el('aiReset').onclick=()=>{points=[];clearResult();message('已清空选区，请重新点选主体。');};el('aiCandidate').onchange=()=>{if(masks?.seeds)points=[masks.seeds[+el('aiCandidate').value]];updateResult();};el('aiDetail').onchange=()=>el('aiScope').value==='whole'?start():updateResult();el('aiSmooth').oninput=()=>{if(el('aiScope').value!=='whole')updateResult();};
 el('aiScope').onchange=()=>{if(el('aiScope').value==='whole'&&+el('aiDetail').value<3)el('aiDetail').value='3';points=[];clearResult();if(picture)start();};
 el('aiQuality').onchange=()=>{if(!picture)return;if(el('aiScope').value==='whole')start();else if(masks)requestDetails();else start();};
 function apply(listen,scroll=true){if(!paths.length)return;if(!listen&&el('musicPlay').textContent.includes('继续音乐'))window.dispatchEvent(new Event('fourier-silent-edit'));window.dispatchEvent(new CustomEvent('flashapply',{detail:{paths,name:el('aiScope').value==='whole'?'整张图片线稿':'照片主体简笔画'}}));if(scroll)document.querySelector('.workspace').scrollIntoView({behavior:'smooth',block:'start'});if(listen&&!el('musicPlay').textContent.includes('暂停音乐'))el('musicPlay').click();}
 el('aiApply').onclick=()=>apply(false);el('aiListen').onclick=()=>apply(true);
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
 el('aiSVG').onclick=()=>{const d=paths.map(p=>'M'+p.map(q=>q.x.toFixed(2)+','+q.y.toFixed(2)).join('L')).join(' ');download(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+picture.width+' '+picture.height+'"><path d="'+d+'" fill="none" stroke="#143e32" stroke-width="2" stroke-linejoin="round"/></svg>'],{type:'image/svg+xml'}),'主体轮廓.svg');};
 el('aiPNG').onclick=()=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const p=c.getContext('2d');p.fillStyle='#fff';p.fillRect(0,0,c.width,c.height);drawPaths(p,c.width,c.height);c.toBlob(b=>download(b,'主体轮廓.png'));};
 el('aiBundle').onclick=()=>{if(ready&&!busy)worker.postMessage({type:'export'});};
 el('aiModelFiles').onchange=async e=>{try{const selected=Array.from(e.target.files);if(selected.length===1&&selected[0].name.endsWith('.sam')){const b=await selected[0].arrayBuffer(),n=new DataView(b).getUint32(0,true);if(n>10000||n+4>b.byteLength)throw Error('模型包格式不正确');const m=JSON.parse(new TextDecoder().decode(b.slice(4,n+4)));if(m.format!=='fourier-sam-v21')throw Error('不是Sonify paint with Fourier模型包');let offset=n+4;const imported=[];for(const f of m.files){if(!Number.isSafeInteger(f.size)||f.size<0||offset+f.size>b.byteLength)throw Error('模型包不完整');imported.push(new File([b.slice(offset,offset+f.size)],f.name));offset+=f.size;}localFiles=imported;el('aiTier').value=m.tier==='full'?'full':'light';}else localFiles=selected;const suffix=el('aiTier').value==='light'?'_quantized':'';const required=['config.json','preprocessor_config.json','vision_encoder'+suffix+'.onnx','prompt_encoder_mask_decoder'+suffix+'.onnx'];const missing=required.filter(n=>!localFiles.some(f=>f.name===n));el('aiImportStatus').textContent=missing.length?'当前档次还缺：'+missing.join('、'):'四个模型文件已导入。点击重新识别或准备模型。';stop('本地文件已更新，下一次加载优先使用这些文件。');}catch(err){el('aiImportStatus').textContent='无法导入：'+err.message;}};
 paint();controls();
 // Reuse the visible line-art workspace; the parent owns the modal lifecycle.
 if (new URLSearchParams(location.search).get('bridge') === 'photo') {
  let requestId = null, originalImage = null, sourceWidth = 0, sourceHeight = 0;
  const send = data => window.parent.postMessage(data, location.origin);
  const panel = document.querySelector('.ai-panel');
  const actions = document.createElement('div');
  actions.style.cssText = 'position:sticky;top:0;z-index:10001;padding:12px;background:#fffefa;border-bottom:1px solid #d4ded7;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  actions.innerHTML = '<strong>确认线稿</strong><button id="bridgeApply" class="primary">应用到 MusicPhoto</button><button id="bridgeCancel">取消</button><span>可调整范围与细节；原图色彩会保留。</span>';
  panel.prepend(actions);
  document.body.classList.add('photo-bridge');
  const style = document.createElement('style');
  style.textContent = '.photo-bridge #combined-home,.photo-bridge>header,.photo-bridge .intro,.photo-bridge .workspace,.photo-bridge .legacy{display:none!important}.photo-bridge main>:not(.ai-panel){display:none!important}.photo-bridge main{padding:12px}.photo-bridge .ai-panel{margin:0}';
  document.head.append(style);
  // The normal interface moves advanced controls later; keep bridge controls nearby.
  window.addEventListener('load', () => {
   document.querySelector('main').prepend(panel);
   for (const id of ['aiQuality','aiDetail','aiSmooth','aiTier']) {
    const label = el(id).closest('label'); if (label) panel.querySelector('.ai-actions').append(label);
   }
  });
  window.addEventListener('message', async event => {
   if (event.source !== window.parent || event.origin !== location.origin) return;
   const data = event.data;
   if (!data || data.type !== 'sonify:lineart:load' || typeof data.requestId !== 'string') return;
   requestId = data.requestId;
   try {
    if (typeof data.image !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(data.image) || data.image.length > 17*1024*1024) throw Error('请使用不超过12 MB的JPG或PNG。');
    const image = new Image(); image.src = data.image; await image.decode();
    if (image.naturalWidth*image.naturalHeight > 24000000) throw Error('图片像素过大，请缩小后再试。');
    originalImage = data.image; sourceWidth = image.naturalWidth; sourceHeight = image.naturalHeight;
    await openPicture(originalImage);
   } catch (error) { send({type:'sonify:lineart:error',requestId,error:error.message}); }
  });
  el('bridgeApply').onclick = () => {
   if (busy || !requestId || !picture || !paths.length) { message('请等待提取完成，再选择应用。'); return; }
   const canvas = document.createElement('canvas');canvas.width=sourceWidth;canvas.height=sourceHeight;
   const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
   context.scale(sourceWidth/picture.width,sourceHeight/picture.height);context.strokeStyle='#000';context.lineWidth=1.5;context.lineCap='round';context.lineJoin='round';
   for(const path of paths){if(path.length<2)continue;context.beginPath();path.forEach((q,i)=>i?context.lineTo(q.x,q.y):context.moveTo(q.x,q.y));context.stroke();}
   send({type:'sonify:lineart:result',requestId,image:originalImage,lineart:canvas.toDataURL('image/png'),width:sourceWidth,height:sourceHeight,method:el('aiScope').value==='whole'?'traditional':'slimsam'});
  };
  el('bridgeCancel').onclick=()=>send({type:'sonify:lineart:cancel',requestId});
  send({type:'sonify:lineart:ready'});
 }
})();
