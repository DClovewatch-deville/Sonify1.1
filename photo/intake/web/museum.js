'use strict';
const $ = id => document.getElementById(id);
const player = $('player'), reader = $('reader');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const VOLUMES = [
 {id:'campus',title:'在熟悉的地方',coverTitle:'在熟悉\n的地方',en:'THE CAMPUS, REHEARD',label:'CAMPUS SYMPHONY',color:'#264c3b',cover:'campus-maple',ids:['campus-maple','campus-sunset','campus-promenade','campus-bluehour','campus-dining','campus-stars','axis','library','crescent','tower'],note:'把日常，翻成另一种风景。',intro:'沿着熟悉的校园，走向灯光亮起的时刻。',style:'nature'},
 {id:'architecture',title:'光住过的房间',coverTitle:'光住过\n的房间',en:'ROOMS THAT HOLD THE LIGHT',label:'ARCHITECTURE & LIGHT',color:'#555b4b',cover:'clementinum',ids:['longroom','clementinum','courtyard','viktor'],note:'在空间的深处，停一会儿。',intro:'从书页的回廊，到光落下的地方。',style:'chamber'},
 {id:'nature',title:'风经过的地方',coverTitle:'风经过\n的地方',en:'WHERE THE WIND WANDERS',label:'LANDSCAPES & STILLNESS',color:'#8b6f51',cover:'woodland',ids:['luang','allos','sninsky','woodland'],note:'让目光走远，让呼吸回来。',intro:'越过河流与群山，回到一束林间的光。',style:'nature'}
];
const POEMS = {axis:'沿着这条路，\n把熟悉的日常重新听一遍。',library:'有些安静，\n像一页还没有翻开的书。',crescent:'光沿着长廊走过，\n时间也有了轻轻的脚步。',tower:'当校园慢慢暗下来，\n总有一处光，还在等你。',longroom:'走得再慢一点。\n让所有还没读完的故事，在这里相逢。',clementinum:'光曾在这里停留，\n把时间染成温柔的金色。',courtyard:'在建筑围起的空白里，\n留一小块地方给自己。',viktor:'不必急着说些什么。\n让光，替你停留片刻。',luang:'河流不会催促谁。\n它只是一直向远方走去。',allos:'把目光交给山脊，\n把没有说完的话留给风。',sninsky:'冷色的世界里，\n仍有一点温暖，慢慢亮起来。',woodland:'再往前走一点，\n光就在树与树之间。'};
const SOUND_CHOICES = [
 {mode:'portrait',style:null,label:'本页音乐肖像',hint:'展册配乐'},
 {mode:'progressive',style:'nature',label:'东方自然',hint:'渐显乐章'},
 {mode:'progressive',style:'chamber',label:'室内交响',hint:'渐显乐章'},
 {mode:'progressive',style:'piano',label:'独奏钢琴',hint:'渐显乐章'},
 {mode:'progressive',style:'strings',label:'弦乐叙事',hint:'渐显乐章'},
 {mode:'soul',style:null,label:'灵魂交响',hint:'另一种聆听'},
 {mode:'blueprint',style:null,label:'蓝图谱',hint:'另一种聆听'}
];
let works = [], volume = null, page = 0, selection = SOUND_CHOICES[0], busy = false, autoTurn = false, isClosing = false;
let transitionTimer = null, finishTimer = null, playRevision = 0, lastOpener = null, swipeStart = null;
let lastPageTurn = 0;
function write(id,value){$(id).textContent = value;}
function currentWork(){return volume.pages[page];}
function currentTrack(){const a=currentWork();return a.tracks.find(t=>t.mode===selection.mode&&(selection.mode!=='progressive'||t.style===selection.style)) || a.tracks.find(t=>t.mode==='progressive') || a.tracks[0];}
function fmt(t){if(!Number.isFinite(t)||t<0)return '0:00';return `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;}
function setStatus(message){write('audio-status',message);}
function timeUpdate(){const duration=Number.isFinite(player.duration)?player.duration:currentWork()?.tracks?.[0]?.duration||0;$('seek').value=duration?String(Math.round(player.currentTime/duration*1000)):'0';write('clock',`${fmt(player.currentTime)} / ${fmt(duration)}`);}
function syncPlaying(){const playing=!player.paused&&!player.ended&&!player.error&&player.readyState>=3;reader.classList.toggle('is-playing',playing);$('play-toggle').setAttribute('aria-label',playing?'暂停音乐':'播放音乐');write('play-symbol',playing?'Ⅱ':'▶');}
function stopAudio(){++playRevision;player.pause();player.removeAttribute('src');player.load();syncPlaying();}
function closePanels(){for(const id of ['contents','colophon','sound-menu'])$(id).hidden=true;for(const id of ['contents-button','info-button','sound-button'])$(id).setAttribute('aria-expanded','false');}
function togglePanel(id,control){const show=$(id).hidden;closePanels();$(id).hidden=!show;$(control).setAttribute('aria-expanded',String(show));if(show)$(id).querySelector('button,a,summary')?.focus();}
function loadTrack(resume){
 ++playRevision;const revision=playRevision;player.pause();
 const track=currentTrack();player.src=track.audio;player.load();write('sound-button',`${track.mode==='portrait'?track.label:selection.label} ⌄`);write('now-title',currentWork().title);$('save-audio').href=track.audio;$('save-midi').href=track.midi;write('music-evidence',`这一页的配乐：${track.label}。由当前照片生成，约 ${Math.round(track.duration)} 秒。`);$('seek').value='0';write('clock',`0:00 / ${fmt(track.duration)}`);syncPlaying();
 if(resume){setStatus('正在落针…');player.play().then(()=>{if(revision===playRevision)setStatus('');}).catch(()=>{if(revision===playRevision)setStatus('轻触唱片，让这一页开始歌唱。');});}else setStatus('轻触唱片，聆听这一页。');
 drawSoundChoices();
 window.dispatchEvent(new CustomEvent('sonify-museum-track',{detail:{work:currentWork(),track}}));
}
function drawSoundChoices(){
 $('sound-options').replaceChildren(...SOUND_CHOICES.filter(c=>currentWork().tracks.some(t=>t.mode===c.mode&&(c.mode!=='progressive'||t.style===c.style))).map(choice=>{
 const b=document.createElement('button');b.textContent=choice.label+' · '+choice.hint;b.setAttribute('aria-pressed',String(selection.mode===choice.mode&&selection.style===choice.style));b.onclick=()=>{const resume=!player.paused;selection=choice;loadTrack(resume);closePanels();$('sound-button').focus();};return b;}));
}
function drawContents(){
 write('contents-title',volume.title);$('contents-list').replaceChildren(...volume.pages.map((work,i)=>{const li=document.createElement('li'),b=document.createElement('button'),n=document.createElement('span');n.textContent=String(i+1).padStart(2,'0');b.append(n,document.createTextNode(work.title));b.setAttribute('aria-current',String(i===page));b.onclick=()=>{closePanels();turnTo(i);};li.append(b);return li;}));
}
function renderPage(resume){
 const a=currentWork();$('page-image').src=a.image;$('page-image').alt=`${a.title} · ${a.place||'摄影作品'}`;write('page-place',a.place||'来源未注明拍摄地点');write('page-title',a.title);write('page-poem',POEMS[a.id]||a.story);write('folio-number',String(page+1).padStart(2,'0')+' / '+String(volume.pages.length).padStart(2,'0'));write('page-author','摄影 / '+a.source.author);write('chapter-note',volume.title+' / '+String(page+1).padStart(2,'0'));
 $('previous-page').disabled=page===0;$('next-page').disabled=page===volume.pages.length-1;
 $('page-dots').replaceChildren(...volume.pages.map((_,i)=>{const b=document.createElement('button');b.setAttribute('aria-label',`翻到第 ${i+1} 页：${volume.pages[i].title}`);b.setAttribute('aria-current',String(i===page));b.onclick=()=>turnTo(i);return b;}));
 write('credit-title',a.title);write('credit-story',a.story);write('credit-author','摄影：'+(a.source.attribution||a.source.author));write('credit-place',(a.place||'来源未注明拍摄地点')+'。地点依据原始作品标题及说明。');$('source-link').href=a.source.page;$('license-link').href=a.source.license_url;write('license-link',a.source.license);write('source-changes',a.source.changes+' 画册跨页阴影为展示效果，原照片本身未改写。');$('colophon').querySelector('details').open=false;
 drawContents();loadTrack(resume);
 // Preload only neighboring images; audio stays on a single element.
 for(const index of [page-1,page+1]){if(volume.pages[index]){const img=new Image();img.src=volume.pages[index].image;}}
}
function cloneLeaf(){
 for(const side of ['.leaf-front','.leaf-back']){const copy=$('spread').cloneNode(true);copy.removeAttribute('id');copy.classList.add('leaf-copy');copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));$('turn-leaf').querySelector(side).replaceChildren(copy);}
}
function clearTurn(){clearTimeout(transitionTimer);clearTimeout(finishTimer);$('open-book').classList.remove('turning-forward','turning-back','opening');busy=false;}
function turnTo(target,fromAuto=false){
 if(!reader.open||busy||isClosing||target===page||target<0||target>=volume.pages.length)return;
 lastPageTurn=Date.now();const resume=fromAuto||!player.paused;
 closePanels();
 if(reducedMotion.matches){page=target;renderPage(resume);return;}
 busy=true;const forward=target>page;cloneLeaf();$('open-book').classList.add(forward?'turning-forward':'turning-back');
 transitionTimer=setTimeout(()=>{if(!reader.open||isClosing)return;page=target;renderPage(resume);},360);
 finishTimer=setTimeout(()=>{clearTurn();},820);
}
function openVolume(book,opener){
 if(reader.open||!book.pages.length)return;
 volume=book;page=0;isClosing=false;busy=false;autoTurn=false;lastOpener=opener;selection=book.preferredStyle?(SOUND_CHOICES.find(c=>c.mode==='progressive'&&c.style===book.preferredStyle)||SOUND_CHOICES[0]):book.pages[0].tracks.some(t=>t.mode==='portrait')?SOUND_CHOICES[0]:(SOUND_CHOICES.find(c=>c.mode==='progressive'&&c.style===book.style)||SOUND_CHOICES[1]);$('auto-turn').setAttribute('aria-pressed','false');write('auto-turn','自动翻阅');reader.classList.remove('quiet');$('quiet-button').setAttribute('aria-pressed','false');write('quiet-button','静心观看');closePanels();reader.style.setProperty('--cover',book.color);write('room-name',book.label);write('opening-title',book.coverTitle);write('opening-volume','VOLUME '+String(VOLUMES.indexOf(book)+1).padStart(2,'0'));document.body.style.overflow='hidden';reader.showModal();renderPage(true);
 if(!reducedMotion.matches){busy=true;$('open-book').classList.add('opening');finishTimer=setTimeout(clearTurn,1180);}
 $('close-book').focus();
}
function closeBook(){
 if(!reader.open||isClosing)return;isClosing=true;clearTurn();closePanels();stopAudio();const finishClose=()=>{reader.close();reader.classList.remove('closing');document.body.style.overflow='';isClosing=false;lastOpener?.focus();};if(reducedMotion.matches){finishClose();}else{reader.classList.add('closing');finishTimer=setTimeout(finishClose,680);}
}
function drawBooks(){
 const shelf=document.querySelector('.shelf-heading span:last-child');if(shelf)shelf.textContent=`精选与自选 · ${VOLUMES.filter(b=>b.pages.length).length} 册风景`;
 $('books').replaceChildren(...VOLUMES.filter(book=>book.pages.length).map((book,i)=>{
 const b=document.createElement('button');b.className='volume';b.style.setProperty('--cover',book.color);b.setAttribute('aria-label',`翻开并聆听《${book.title}》，共 ${book.pages.length} 页`);
 const cover=document.createElement('div');cover.className='closed-book';const no=document.createElement('span');no.className='volume-no';no.textContent='SONIFY / VOLUME '+String(i+1).padStart(2,'0');const title=document.createElement('h2');title.textContent=book.coverTitle;const en=document.createElement('p');en.className='volume-en';en.textContent=book.en;const window=document.createElement('div');window.className='cover-window';const image=document.createElement('img');image.src=(book.pages.find(a=>a.id===book.cover)||book.pages[0]).image;image.alt=book.title+'封面';image.decoding='async';window.append(image);const foot=document.createElement('div');foot.className='cover-footer';const label=document.createElement('span');label.textContent=book.id==='campus'?'SHANGHAITECH':'A LISTENING ALBUM';const count=document.createElement('span');count.textContent=String(book.pages.length).padStart(2,'0')+' PLATES';foot.append(label,count);cover.append(no,title,en,window,foot);
 const note=document.createElement('div');note.className='volume-note';const line=document.createElement('p');line.textContent=book.note;const enter=document.createElement('span');enter.textContent='翻开并聆听 ↗';note.append(line,enter);b.append(cover,note);b.onclick=()=>openVolume(book,b);return b;
 }));
}
$('close-book').onclick=closeBook;reader.addEventListener('cancel',event=>{event.preventDefault();if(!['contents','colophon','sound-menu'].every(id=>$(id).hidden)){closePanels();return;}closeBook();});
$('next-page').onclick=()=>turnTo(page+1);$('previous-page').onclick=()=>turnTo(page-1);
$('next-volume').onclick=closeBook;
$('play-toggle').onclick=()=>{if(!player.paused){player.pause();setStatus('');}else{player.play().then(()=>setStatus('')).catch(()=>setStatus('暂时无法播放，请再试一次，或换一种声音。'));}};
$('seek').oninput=()=>{if(Number.isFinite(player.duration)&&player.duration>0){player.currentTime=Number($('seek').value)/1000*player.duration;timeUpdate();}};
$('volume').oninput=()=>{player.volume=Number($('volume').value);player.muted=false;updateMute();};
function updateMute(){$('mute').setAttribute('aria-pressed',String(player.muted));$('mute').setAttribute('aria-label',player.muted?'取消静音':'静音');write('mute',player.muted?'♩':'♫');}
$('mute').onclick=()=>{player.muted=!player.muted;updateMute();};player.volume=.6;
$('auto-turn').onclick=()=>{autoTurn=!autoTurn;$('auto-turn').setAttribute('aria-pressed',String(autoTurn));write('auto-turn',autoTurn?'自动翻阅 · 开':'自动翻阅');setStatus(autoTurn?'每页音乐结束后，翻向下一幅风景。':'由你决定，在每一页停留多久。');};
$('quiet-button').onclick=()=>{const quiet=reader.classList.toggle('quiet');$('quiet-button').setAttribute('aria-pressed',String(quiet));write('quiet-button',quiet?'回到画册':'静心观看');closePanels();};
$('contents-button').onclick=()=>togglePanel('contents','contents-button');$('info-button').onclick=()=>togglePanel('colophon','info-button');$('sound-button').onclick=()=>togglePanel('sound-menu','sound-button');
reader.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{const id=b.dataset.close;closePanels();$(id==='contents'?'contents-button':'info-button').focus();});
reader.addEventListener('click',event=>{if(event.target.closest('.reader-panel,.sound-menu,#contents-button,#info-button,#sound-button'))return;closePanels();});
reader.addEventListener('keydown',event=>{
 if(event.target.closest('input,select,textarea')||!['contents','colophon','sound-menu'].every(id=>$(id).hidden))return;
 if(event.key==='ArrowRight'){event.preventDefault();turnTo(page+1);}else if(event.key==='ArrowLeft'){event.preventDefault();turnTo(page-1);}else if(event.code==='Space'&&!event.target.closest('button,a,summary')){event.preventDefault();$('play-toggle').click();}
});
$('open-book').addEventListener('pointerdown',event=>{if(event.pointerType!=='touch'||event.target.closest('a,button,input,summary'))return;swipeStart={x:event.clientX,y:event.clientY,time:Date.now()};});
$('open-book').addEventListener('pointerup',event=>{if(!swipeStart)return;const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y,elapsed=Date.now()-swipeStart.time;swipeStart=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4&&elapsed<850)turnTo(page+(dx<0?1:-1));});
$('open-book').addEventListener('pointercancel',()=>swipeStart=null);
player.addEventListener('timeupdate',timeUpdate);player.addEventListener('loadedmetadata',()=>{if(reader.open)timeUpdate();});
for(const event of ['play','pause','playing','ended','error','emptied'])player.addEventListener(event,syncPlaying);
player.addEventListener('playing',()=>setStatus(''));
player.addEventListener('waiting',()=>{syncPlaying();if(reader.open&&!player.paused)setStatus('正在加载这一页的音乐…');});
player.addEventListener('error',()=>{if(reader.open&&player.hasAttribute('src'))setStatus('这一页的声音暂时无法加载，可以换一种声音继续聆听。');});
player.addEventListener('ended',()=>{if(!reader.open||busy)return;if(autoTurn&&page<volume.pages.length-1){turnTo(page+1,true);}else if(page===volume.pages.length-1){setStatus('这一册读完了。可以再停留一会儿，或合上画册。');autoTurn=false;$('auto-turn').setAttribute('aria-pressed','false');write('auto-turn','自动翻阅');}else setStatus('不妨再停留一会儿，也可以翻向下一页。');});
window.addEventListener('pagehide',stopAudio);
$('about-open').onclick=()=>$('about').showModal();$('about-close').onclick=()=>$('about').close();
async function init(){try{const response=await fetch('/museum/albums-v2.json');if(!response.ok)throw Error();works=(await response.json()).albums;await mergeMuseumExtensions();for(const book of VOLUMES)book.pages=book.ids.map(id=>works.find(a=>a.id===id)).filter(Boolean);for(const book of VOLUMES){if(!works.some(a=>a.id===book.cover))book.cover=book.pages[0]?.id;}drawBooks();window.dispatchEvent(new Event('sonify-library-ready'));}catch(_){write('load-status','画册暂时没有取到，请刷新后重试。');}}
init();

/* Independent featured exhibition; readiness is owned by its future module. */
async function initScrollEntry(){
 try{
  const response=await fetch('/museum/scroll-entry.json');if(!response.ok)return;
  const exhibit=await response.json();
  for(const [id,key] of [['scroll-title','title'],['scroll-description','description'],['scroll-work','work']])if(typeof exhibit[key]==='string')write(id,exhibit[key]);
  const localRoute=typeof exhibit.href==='string'&&/^\/scroll(?:[/?#]|$)/.test(exhibit.href);
  const ready=exhibit.status==='ready'&&localRoute;
  $('scroll-entry').hidden=!ready;$('scroll-state').hidden=ready;
  if(ready)$('scroll-entry').href=exhibit.href;
 }catch(_){/* A missing exhibition manifest must not interrupt the books. */}
}
initScrollEntry();

/* Photography-only additions. The Scroll entry and its audio stay independent. */
async function mergeMuseumExtensions(){
 try{
  const r=await fetch('/museum/museum-extensions.json');if(!r.ok)return;
  const additions=(await r.json()).works||{};
  for(const work of works){const extra=additions[work.id];if(!extra||extra.image_sha256!==work.evidence.image_sha256)continue;
   work.tracks=work.tracks.map(track=>({...track,mapping:extra.mappings[track.mode+(track.style?'-'+track.style:'')]}));
   work.tracks.unshift(extra.track);work.lab_url=extra.lab_url;work.museum_expression=extra.expression;
  }
 }catch(_){/* Existing editions remain playable if optional data is unavailable. */}
}

/* Data-driven classical scroll collection, independent of photography books. */
async function initScrollCollection(){
 const grid=document.getElementById('scroll-collection-grid');if(!grid)return;
 try{const r=await fetch('/museum/scroll/catalog.json',{cache:'no-cache'});if(!r.ok)return;
 const catalog=await r.json();const cards=[];
 for(const work of catalog.works){
  if(!/^\/scroll\?work=[a-z]+$/.test(work.href)||!work.image.startsWith('/museum/scroll/'))continue;
  const a=document.createElement('a');a.className='scroll-work-card';a.href=work.href;a.setAttribute('aria-label',`展开并聆听《${work.title}》`);
  const img=document.createElement('img');img.src=work.image;img.alt=`${work.title}精华片段`;img.loading='lazy';
  const content=document.createElement('div'),meta=document.createElement('p'),title=document.createElement('h4'),mood=document.createElement('p'),entry=document.createElement('span');
  meta.className='work-author';meta.textContent=work.artist;title.textContent=work.title;mood.className='work-mood';mood.textContent=work.mood;entry.textContent='展开并聆听 ↗';
  content.append(meta,title,mood,entry);a.append(img,content);cards.push(a);
 }
 grid.replaceChildren(...cards);
 }catch(_){/* Keep the existing exhibition entry usable if the catalog is unavailable. */}
}
initScrollCollection();

// Narrow bridge for optional discovery and browser-local personal collections.
window.SonifyLibrary={
 getBook:id=>VOLUMES.find(book=>book.id===id),
 getWorks:()=>works.slice(),getCurrent:()=>reader.open?{work:currentWork(),book:volume}:null,
 register(book,items=[]){
  for(const item of items){const index=works.findIndex(w=>w.id===item.id);if(index<0)works.push(item);else works[index]=item;}
  const existing=VOLUMES.find(v=>v.id===book.id);const value=existing||{...book};if(!existing)VOLUMES.push(value);else Object.assign(value,book);
  value.pages=value.ids.map(id=>works.find(w=>w.id===id)).filter(Boolean);drawBooks();return value;
 },
 open(id,workId){const book=VOLUMES.find(b=>b.id===id);if(!book?.pages?.length)return false;if(reader.open)closeBook();const enter=()=>{if(reader.open){setTimeout(enter,80);return;}openVolume(book,document.getElementById('discover-start'));if(workId){const index=book.pages.findIndex(w=>w.id===workId);if(index>0){page=index;renderPage(true);}}};enter();return true;}
};
