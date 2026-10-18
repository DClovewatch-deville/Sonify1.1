/* Open discovery is separate from Scroll and the existing photography pipeline. */
(() => {
 'use strict';
 const API='/api/discover',library=()=>window.SonifyLibrary;
 const standalone=document.body.classList.contains('discovery-page');
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 function stored(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch(_){return fallback;}}
 const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}};
 let favorites=new Set(stored('sonify-favorites',[])),personal=stored('sonify-personal-books',[]),selected=new Map(),scope='online',query='森林',offset=null,lastSearch=0,job=null,poll=0;
 const section=el('section','discover-section');section.id='discover-start';section.setAttribute('aria-labelledby','discover-title');
 section.innerHTML='<div class="discover-heading"><div><p class="eyebrow">DISCOVER · CHOOSE · LISTEN</p><h2 id="discover-title">下一本画册，由你发现。</h2><p>探索开放作品，选出喜欢的画面，听见属于它们的声音。</p></div><button id="discover-favorites" class="discover-secondary">♡ 我的收藏</button></div><div class="discover-toolbar"><div role="group" aria-label="发现范围"><button data-scope="online" aria-pressed="true">在线发现</button><button data-scope="local" aria-pressed="false">现有作品自选</button></div><form id="discover-search"><label class="sr-only" for="discover-query">搜索主题、作者或作品</label><input id="discover-query" placeholder="搜索森林、建筑、梵高、山水…" maxlength="160" value="森林"><button type="submit">寻找作品 →</button></form></div><div id="discover-topics" class="discover-topics" aria-label="探索专题"></div><p id="discover-status" role="status">选择一个专题，开启下一次发现。在线图片按需载入，选中后才生成音乐。</p><div id="discover-results" class="discover-results"></div><button id="discover-more" class="discover-secondary" hidden>再看一些作品</button><div id="discover-selection" class="discover-selection"><div><b id="discover-count">选出 1—4 幅作品</b><p>先选图，再取一个属于你的画册名字。</p></div><label><span class="sr-only">画册名称</span><input id="discover-album-title" placeholder="我的声音画册" maxlength="24"></label><label><span class="sr-only">音乐风格</span><select id="discover-style"><option value="nature">东方自然</option><option value="chamber">室内交响</option><option value="piano">独奏钢琴</option><option value="strings">弦乐叙事</option></select></label><button id="discover-create" disabled>生成我的画册</button><button id="discover-clear" class="discover-secondary">清空选择</button></div><p class="discover-footnote">在线来源：Wikimedia Commons · 作者与许可随画册保留。自选画册保存在这台设备；分享链接可在能访问这台服务的浏览器中打开。</p>';
 document.querySelector('.library').before(section);
 if(standalone){
  const back=el('a','discover-back','← 回到声音画册');back.href='/musiclab';section.prepend(back);
 }else{
  section.hidden=true;
  const entry=el('section','discover-entry');entry.id='discover-entry';
  const copy=el('div'),eyebrow=el('p','eyebrow','DISCOVER YOUR NEXT ALBUM'),title=el('h2','','下一本画册，由你发现。'),note=el('p','','在线搜作品，选出喜欢的画面，组成自己的声音画册。');copy.append(eyebrow,title,note);
  const actions=el('div','discover-entry-actions'),link=el('a','discover-entry-link','在线探索 →');link.href='/batches/museum-lab/shared/discover.html';const saved=el('button','discover-secondary','♡ 我的收藏');saved.onclick=()=>document.getElementById('discover-favorites').click();actions.append(link,saved);entry.append(copy,actions);section.before(entry);
 }
 const $=id=>document.getElementById(id),status=text=>$('discover-status').textContent=text;
 for(const topic of ['森林','山川','建筑','东方山水','花卉','海洋','星空','梵高','莫奈','图书馆','上海','上科大']){const b=el('button','',topic);b.onclick=()=>{scope='online';syncScope();$('discover-query').value=topic;search(topic);};$('discover-topics').append(b);}
 const preview=document.createElement('dialog');preview.className='discover-preview';preview.innerHTML='<button class="discover-preview-close" aria-label="关闭作品预览">×</button><img alt=""><h3></h3><p class="preview-credit"></p><p class="preview-description"></p><a target="_blank" rel="noopener">查看原作与许可 ↗</a><button class="preview-select">选入我的画册</button>';document.body.append(preview);preview.querySelector('.discover-preview-close').onclick=()=>preview.close();
 function syncScope(){section.querySelectorAll('[data-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scope===scope)));$('discover-more').hidden=true;}
 function updateSelection(){
  $('discover-count').textContent=selected.size?`已选 ${selected.size} / 4 幅作品`:'选出 1—4 幅作品';$('discover-create').disabled=!selected.size||!!job;
  section.querySelectorAll('[data-select]').forEach(b=>{const on=selected.has(b.dataset.select);b.setAttribute('aria-pressed',String(on));b.textContent=on?'✓ 已选入':'＋ 选入画册';});
 }
 function toggle(item){if(job)return;if(selected.has(item.id))selected.delete(item.id);else{if(selected.size>=4){status('先让这四幅作品组成一册，再开始下一本。');return;}if(selected.size&&[...selected.values()][0].local!==item.local){status('请先清空选择；在线作品与现有作品分别成册。');return;}selected.set(item.id,item);}updateSelection();}
 function showPreview(item){preview.querySelector('img').src=item.image||item.thumbnail;preview.querySelector('img').alt=item.title;preview.querySelector('h3').textContent=item.title;preview.querySelector('.preview-credit').textContent=`${item.author} · ${item.license}`;preview.querySelector('.preview-description').textContent=item.description||'';preview.querySelector('a').href=item.source;const b=preview.querySelector('.preview-select');b.textContent=selected.has(item.id)?'从画册选择中移除':'选入我的画册';b.onclick=()=>{toggle(item);preview.close();};preview.showModal();}
 function cards(items,append=false){
  if(!append)$('discover-results').replaceChildren();
  for(const item of items){const card=el('article','discover-card'),view=el('button','discover-card-view');view.setAttribute('aria-label','预览 '+item.title);const image=el('img');image.src=item.thumbnail;image.alt=item.title;image.loading='lazy';image.referrerPolicy='no-referrer';image.onerror=()=>{image.remove();view.classList.add('image-unavailable');view.textContent='预览暂未载入 · 点击查看来源';};const title=el('h3','',item.title),credit=el('p','',item.author+' · '+item.license);view.append(image);view.onclick=()=>showPreview(item);const choose=el('button','discover-select','＋ 选入画册');choose.dataset.select=item.id;choose.onclick=()=>toggle(item);card.append(view,title,credit,choose);$('discover-results').append(card);}
  updateSelection();
 }
 function localItems(){return(library()?.getWorks()||[]).map(w=>({id:w.id,title:w.title,thumbnail:w.image,image:w.image,author:w.source.author,license:w.source.license,source:w.source.page,description:w.story,local:true}));}
 async function search(text,more=false){
  const request=++lastSearch;query=text;syncScope();
  if(scope==='local'){const q=text.trim().toLowerCase();const items=localItems().filter(i=>!q||[i.title,i.author,i.description].join(' ').toLowerCase().includes(q));cards(items);status(items.length?`${items.length} 件已生成声音的作品 · 自由选择，立即成册`:'没有匹配的现有作品，可清空搜索浏览全部。');return;}
  status('正在打开世界的作品库…');$('discover-search').querySelector('button').disabled=true;
  try{const r=await fetch(API+'/search?'+new URLSearchParams({q:text,offset:more?offset||0:0}));const data=await r.json();if(!r.ok)throw Error(data.error);if(request!==lastSearch)return;cards(data.items,more);offset=data.next;$('discover-more').hidden=offset==null;status(data.items.length?'在线搜索已更新 · 点击图片预览，或选入自己的画册':'这个关键词暂时没有可导入图片，试试其他题材或英文名称。');}
  catch(e){if(request!==lastSearch)return;status((e.message==='Failed to fetch'?'在线服务暂未连接':e.message)+'。可重试，或切换“现有作品自选”继续体验。');}
  finally{if(request===lastSearch)$('discover-search').querySelector('button').disabled=false;}
 }
 $('discover-search').onsubmit=e=>{e.preventDefault();search($('discover-query').value);};$('discover-more').onclick=()=>search(query,true);
 section.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.scope;syncScope();$('discover-query').value=scope==='local'?'':query;search($('discover-query').value);});
 $('discover-clear').onclick=()=>{if(job)return;selected.clear();updateSelection();};
 function makeBook(ids,title,style,id='mix-'+Date.now()){return{id,title,coverTitle:title,en:'SELECTED BY YOU',label:'YOUR LISTENING ALBUM',color:'#53644d',cover:ids[0],ids,note:'由你选出的风景。',style,preferredStyle:style};}
 $('discover-create').onclick=async()=>{
  if(!selected.size||job)return;const title=$('discover-album-title').value.trim()||'我的声音画册',style=$('discover-style').value;
  if([...selected.values()][0].local){const book=makeBook([...selected.keys()],title,style);personal.push(book);save('sonify-personal-books',personal);library().register(book);selected.clear();updateSelection();library().open(book.id);return;}
  $('discover-create').disabled=true;
  try{const r=await fetch(API+'/albums',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:[...selected.keys()],title,style})});const data=await r.json();if(!r.ok)throw Error(data.error);job=data.id;save('sonify-discovery-pending',job);updateSelection();watch();}
  catch(e){status(e.message==='Failed to fetch'?'在线生成服务暂时未连接，请重试。':e.message);updateSelection();}
 };
 async function watch(){
  if(!job)return;
  try{const r=await fetch(API+'/jobs/'+job);const data=await r.json();
   if(data.status==='completed'){const book=library().register(data.album,data.works);job=null;save('sonify-discovery-pending',null);selected.clear();updateSelection();status('你的画册已经准备好，之后也可从书架再次打开。');library().open(book.id);return;}
   if(['failed','missing'].includes(data.status)){job=null;save('sonify-discovery-pending',null);updateSelection();status(data.error||'上次任务已结束，请重新选择生成。');return;}
   status(`${data.stage} · 第 ${data.current||0} / ${data.total} 幅 · 已完成 ${data.completed||0} 幅。你可以继续浏览，完成后会打开画册。`);
  }catch(_){status('生成连接暂时中断，正在重新连接；已提交的任务会继续。');}
  poll=setTimeout(watch,2000);
 }
 function favoritesBook(){return makeBook([...favorites].filter(id=>library().getWorks().some(w=>w.id===id)),'收藏的风景','nature','favorites');}
 $('discover-favorites').onclick=()=>{const book=favoritesBook();if(!book.ids.length){status('在画册的“题记与来源”里收藏一页，让喜欢的风景留在这里。');return;}library().register(book);library().open(book.id);};
 const actions=el('div','discover-page-actions'),favorite=el('button','discover-secondary','♡ 收藏这一页'),share=el('button','discover-secondary','分享这一页 ↗'),notice=el('p');actions.append(favorite,share,notice);$('colophon').append(actions);
 function syncFavorite(){const current=library()?.getCurrent();if(current){favorite.textContent=favorites.has(current.work.id)?'♥ 已收藏这一页':'♡ 收藏这一页';favorite.setAttribute('aria-pressed',String(favorites.has(current.work.id)));}notice.textContent='';}
 window.addEventListener('sonify-museum-track',()=>{syncFavorite();$('reader').classList.toggle('online-reading',library()?.getCurrent()?.work.category==='在线发现');});
 favorite.onclick=()=>{const id=library().getCurrent().work.id;favorites.has(id)?favorites.delete(id):favorites.add(id);save('sonify-favorites',[...favorites]);syncFavorite();notice.textContent='收藏保存在这台浏览器。';};
 share.onclick=async()=>{const current=library().getCurrent(),url=new URL('/musiclab',location.origin);url.hash=new URLSearchParams({book:current.book.id,work:current.work.id,mix:current.book.ids.join(','),title:current.book.title,style:current.book.preferredStyle||current.book.style}).toString();try{await navigator.clipboard.writeText(url.href);notice.textContent='链接已复制；接收方需能访问这台服务。';}catch(_){notice.textContent=url.href;}};
 async function ready(){
  if(standalone){library().open=(id,workId)=>{const b=library().getBook(id);if(!b?.pages?.length)return false;const url=new URL('/musiclab',location.origin);url.hash=new URLSearchParams({book:id,work:workId||b.ids[0],mix:b.ids.join(','),title:b.title,style:b.preferredStyle||b.style||'nature'}).toString();location.assign(url.href);return true;};}
  try{const r=await fetch('/museum/discover-albums.json',{cache:'no-cache'});if(r.ok){const data=await r.json();for(const b of data.albums)library().register(b,data.works);}}catch(_){}
  for(const b of personal)library().register(b);
  const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('book')){if(!library().open(hash.get('book'),hash.get('work'))&&hash.get('mix')){const ids=hash.get('mix').split(',').filter(id=>library().getWorks().some(w=>w.id===id));if(ids.length){const b=makeBook(ids,hash.get('title')||'分享的声音画册',hash.get('style')||'nature',hash.get('book'));library().register(b);library().open(b.id,hash.get('work'));}}}
  job=stored('sonify-discovery-pending',null);if(job)watch();
 }
 window.addEventListener('sonify-library-ready',ready,{once:true});
 if(library()?.getWorks().length)ready();
 window.addEventListener('pagehide',()=>clearTimeout(poll));
})();
