(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s);

function make(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}

function opt(value,label){const o=make('option',null,label);o.value=value;return o;}

(function init(){
  if($('#musicSettings'))return;

const control=$('.control-panel');
  if(!control)return;
  const workspace=$('.workspace');
  const studio=$('.studio');
  const sourcebar=$('.sourcebar');
  const scoreSection=$('.score-section');
  const playbox=$('.playbox',control);

// ---------- 1. paper-studio + play-dock ----------
  if(studio)studio.classList.add('paper-studio');
  if(studio&&playbox){
    const dock=make('div','play-dock');
    playbox.parentNode.removeChild(playbox);
    dock.appendChild(playbox);
    studio.parentNode.insertBefore(dock,studio.nextSibling);
  }

// ---------- 2. settings dialog ----------
  const dialog=make('dialog');
  dialog.id='musicSettings';
  const head=make('div','dialog-head');
  const h2=make('h2',null,'曲式与音色设置');
  const closeBtn=make('button','dialog-close','×');
  closeBtn.type='button';
  closeBtn.setAttribute('aria-label','关闭');
  head.appendChild(h2);head.appendChild(closeBtn);
  dialog.appendChild(head);

  control.parentNode.insertBefore(dialog,control.nextSibling);
  dialog.appendChild(control);
  document.body.appendChild(dialog);

// ---------- 3. 曲式与色温控件 ----------
  const fineTune=$('.fine-tune',control);
  const colorControls=make('div','color-controls');

  // Each row is label + control, matching .field in studio.css. The panel is a
  // narrow drawer, so the label column is fixed and the control takes the rest.
  function field(labelText, control, id){
    const row=make('label','field');
    const cap=make('span',null,labelText);
    row.setAttribute('for',id);
    control.id=id;
    row.appendChild(cap);
    row.appendChild(control);
    return row;
  }

  const form=document.createElement('select');
  form.appendChild(opt('ternary','三部式'));
  form.appendChild(opt('rondo','回旋'));

  const warmthMode=document.createElement('select');
  warmthMode.appendChild(opt('auto','自动'));
  warmthMode.appendChild(opt('manual','手动'));
  warmthMode.appendChild(opt('off','关闭'));

  const warmth=document.createElement('input');
  warmth.type='range';
  warmth.min='-1';warmth.max='1';warmth.step='0.05';warmth.value='0';

  const colorStatus=make('p','color-status','暖度：自动');
  colorStatus.id='colorStatus';

  colorControls.appendChild(field('曲式',form,'form'));
  colorControls.appendChild(field('暖度模式',warmthMode,'warmthMode'));
  colorControls.appendChild(field('暖度',warmth,'warmth'));
  colorControls.appendChild(colorStatus);

  if(fineTune&&fineTune.parentNode)fineTune.parentNode.insertBefore(colorControls,fineTune);
  else control.appendChild(colorControls);

// ---------- 4. sourcebar 打开按钮 ----------
  if(sourcebar){
    const openBtn=make('button','ghost','音乐设置');
    openBtn.id='openSettings';
    openBtn.type='button';
    sourcebar.appendChild(openBtn);
    openBtn.addEventListener('click',()=>dialog.showModal&&dialog.showModal());
  }

// ---------- 4b. 精细提取按钮 ----------
  // 这个按钮以前写着“AI 选主体”却没有绑定任何行为，是个死按钮。
  // 现在它做一件具体的事：把细节拉到最大再重新提取一次；
  // 还没载入图片时，先带用户去选图。
  const fine=$('#aiLab');
  if(fine){
    fine.textContent='精细提取';
    fine.addEventListener('click',()=>{
      const detail=$('#imageDetail');
      const again=$('#extractAgain');
      if(detail){detail.value=detail.max||'5';}
      if(again&&!again.disabled){again.click();return;}
      const tab=$('#imageTab');
      if(tab)tab.click();
      const picker=$('#imageFile');
      if(picker)picker.click();
    });
  }

// ---------- 5. bars 32 选项与文案 ----------
  const bars=$('#bars');
  if(bars){
    const has32=[...bars.options].some(o=>o.value==='32');
    if(!has32){
      const o32=opt('32','32 小节');
      bars.appendChild(o32);
    }
    bars.value='32';
  }
  const pianoBtn=$('[data-style="piano"]');
  if(pianoBtn){
    const span=pianoBtn.querySelector('span');
    const text=pianoBtn.querySelector('span:nth-child(2)');
    if(text)text.firstChild.nodeValue='古典小品';
  }

// ---------- 6. score-details ----------
  if(scoreSection && scoreSection.parentNode && !scoreSection.closest('details')){
    const details=make('details','score-details');
    const summary=make('summary',null,'查看音符与声部');
    details.appendChild(summary);
    scoreSection.parentNode.insertBefore(details,scoreSection);
    details.appendChild(scoreSection);
    details.addEventListener('toggle',()=>{
      if(details.open)window.dispatchEvent(new Event('resize'));
    });
  }

// ---------- 7. help 文案 ----------
  const help=$('#help')||$('[id="help"]');
  if(help){
    const walker=document.createTreeWalker(help,NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode())){
      if(n.nodeValue.includes('AI选主体')||n.nodeValue.includes('AI 选主体')){
        n.nodeValue=n.nodeValue.replace(/AI\s*选主体/g,'本地精细提取');
      }
    }
  }

  const lab=$('#aiLab');if(lab)lab.textContent='精细提取';
  document.querySelectorAll('.topbar nav a,footer a').forEach(a=>a.remove());
  const helpNote=$('#help p:last-child');if(helpNote)helpNote.textContent='所有图片、作品和声音都在本机处理。图片可用精细提取与素稿；移动设备需先点击播放解锁声音。';
  dialog.setAttribute('aria-label','音乐设置');

// ---------- 8. 快捷键提示按平台显示 ----------
  // The same file ships to macOS and Windows. A hard-coded ⌘ means nothing on
  // a PC keyboard, so the shortcut hints follow the host platform.
  (function shortcuts(){
    const platform=(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||navigator.userAgent||'';
    const mac=/mac|iphone|ipad|ipod/i.test(platform);
    const mod=mac?'⌘':'Ctrl';
    const undoBtn=$('#undo'),redoBtn=$('#redo');
    if(undoBtn)undoBtn.title='撤销 '+(mac?'⌘Z':'Ctrl+Z');
    if(redoBtn)redoBtn.title='重做 '+(mac?'⇧⌘Z':'Ctrl+Shift+Z');
    const host=document.getElementById('help')||document.body;
    const walk=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walk.nextNode())){
      const text=node.nodeValue;
      if(text&&text.indexOf('⌘/Ctrl')>=0){
        node.nodeValue=text.replace(/Shift \+ ⌘\/Ctrl/g,'Shift + '+mod).replace(/⌘\/Ctrl/g,mod);
      }
    }
  })();

// ---------- 9. 关闭逻辑 ----------
  const closer=()=>{if(dialog.open)dialog.close();};
  closeBtn.addEventListener('click',closer);
  dialog.addEventListener('click',e=>{
    if(e.target!==dialog)return;
    const r=dialog.getBoundingClientRect();
    const inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
    if(!inside)closer();
  });
})();

})();
