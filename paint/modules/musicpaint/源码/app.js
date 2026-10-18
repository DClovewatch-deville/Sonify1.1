/* Sonify Studio V3 — new local UI and traceable editing, 2026-10-15.
   Source geometry remains independent from the performance representation. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id),
    V = window.SonifyVision,
    M = window.SonifyMusic;
  const palette = ['#39715b', '#b58b4c', '#67929b', '#9d8299'];
  const state = {
    paths: [],
    options: {
      style: 'piano',
      bpm: 88,
      bars: 32,
      form: 'ternary',
      warmthMode: 'auto',
      warmth: 0,
      mode: 'compose',
      density: 0.5,
      root: 0,
      scaleMode: 'auto',
      keyLocked: false,
      instrument: 'auto',
      reverb: 0.3,
      brightness: 0.55,
      humanize: 0.25
    },
    sourceName: '屋檐与窗',
    image: null,
    color: null,
    mix: { volume: 0.65, muted: [], loop: false }
  };
  let score = null,
    player = M.createPlayer(),
    tool = 'pen',
    active = null,
    selected = null,
    selectedEvent = null,
    muted = [],
    history = [],
    future = [],
    sourceBitmap = null,
    photoCanvas = null,
    labWindow = null,
    fouriers = [],
    beat = 0,
    seeking = 0,
    previewAt = 0,
    oldPlaying = false,
    changed = false,
    ioRevision = 0,
    busy = false,
    lastPaint = 0,
    lastBeat = -1;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const noteName = (m) => names[m % 12] + (Math.floor(m / 12) - 1);
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  function message(text, error = false) {
    $('status').textContent = text;
    $('status').style.color = error ? '#ae5844' : '';
  }
  function timeLabel(seconds) {
    return (
      Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0') +
      ':' +
      Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0')
    );
  }
  function snapshot() {
    return clone(state);
  }
  function record() {
    history.push(snapshot());
    if (history.length > 30) history.shift();
    future = [];
  }
  function persist() {
    try {
      localStorage.setItem(
        'sonify-studio-v4',
        JSON.stringify({
          format: 'sonify-studio-v3',
          ...state,
          updatedAt: new Date().toISOString()
        })
      );
      $('saveState').textContent =
        '已自动保存 · ' +
        new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      $('saveState').textContent = '浏览器存储不可用，请点击“保存工程”留档';
    }
  }
  function stop() {
    player.stop();
    beat = seeking = 0;
    updatePlay();
  }
  function updatePlay() {
    const on = player.isPlaying();
    $('play').replaceChildren();
    const icon = document.createElement('span');
    icon.textContent = on ? 'Ⅱ' : '▶';
    $('play').append(
      icon,
      document.createTextNode(on ? ' 暂停聆听' : seeking > 0 ? ' 继续聆听' : ' 听听这幅画')
    );
    $('play').disabled = !score?.events?.length;
  }
  function rebuild({ save = true, resume = false } = {}) {
    player.stop();
    beat = seeking = 0;
    state.paths = state.paths.filter((p) => p.points.length > 1);
    
    const warmth = state.options.warmthMode === 'off' ? 0
      : state.options.warmthMode === 'manual' ? clamp(+state.options.warmth || 0, -1, 1)
      : clamp(state.color?.warmth || 0, -1, 1);
    const scaleMode = state.options.scaleMode === 'auto'
      ? (state.options.style === 'eastern' ? 'pentatonic' : warmth < -0.25 ? 'minor' : 'major')
      : state.options.scaleMode;
    if (!state.options.keyLocked && state.options.warmthMode !== 'off' && (state.color || state.options.warmthMode === 'manual')) {
      state.options.root = scaleMode === 'minor' ? (warmth < -0.3 ? 9 : 2) : (warmth > 0.3 ? 5 : warmth < -0.3 ? 0 : 7);
    }
    score = M.compose(state.paths, { ...state.options, warmth, scaleMode });
    fouriers = state.paths
      .slice()
      .sort((a, b) => length(b.points) - length(a.points))
      .slice(0, 3)
      .map((p) => ({ id: p.id, ...V.fourier(p.points, 18) }));
    if (selected && !state.paths.some((p) => p.id === selected)) selected = null;
    selectedEvent = null;
    $('sourceName').textContent = state.sourceName;
    $('pathCount').textContent = state.paths.length + ' 条线';
    $('empty').hidden = state.paths.length > 0;
    $('undo').disabled = !history.length;
    $('redo').disabled = !future.length;
    $('removePath').disabled = !selected;
    $('clear').disabled = !state.paths.length;
    const disabled = !score.events.length;
    for (const id of ['exportWav', 'exportMidi', 'exportPng', 'exportEvents'])
      $(id).disabled = disabled;
    const secs = (score.totalBeats * 60) / score.bpm;
    $('compositionInfo').textContent = disabled
      ? '画下一笔，音乐会从这里开始'
      : score.bars + ' 小节 · ' + score.events.length + ' 个音符 · ' + timeLabel(secs);
    $('durationLabel').textContent = timeLabel(secs || 0);
    syncControls();
    buildTracks();
    updatePlay();
    drawStage();
    drawRoll();
    if (save) persist();
    if (resume && score.events.length) start();
  }
  function updateAudioStatus() {
    const a = M.getAudioStatus?.();
    if (!a) return;
    $('audioStatus').textContent = a.loaded
      ? '已载入 ' + a.loaded + ' 个真实采样' + (a.fallbackNotes ? ' · ' + a.fallbackNotes + ' 个音符使用备用合成' : ' · 当前作品全部使用采样音色')
      : a.warnings?.length
        ? '采样不可用，已切换为合成音源'
        : '首次播放时准备内置真实乐器音源';
  }
  async function start() {
    if (!score?.events.length) return;
    try {
      await player.play(score, {
        offsetBeat: seeking,
        muted,
        volume: +$('volume').value,
        loop: $('loop').checked
      });
      updatePlay();
      updateAudioStatus();
      message('正在聆听。点选音符可查看图形来源。');
    } catch (e) {
      message('声音尚未启动：' + e.message + '。请再次点击播放。', true);
    }
  }
  async function togglePlay() {
    if (player.isPlaying()) {
      seeking = player.getBeat();
      player.pause();
      beat = seeking;
      updatePlay();
    } else {
      if (seeking >= score.totalBeats) seeking = 0;
      await start();
    }
  }
  // Keep edit-time geometry small, without simplifying the same path twice.
  function editablePoints(points) {
    const simplified = V.simplify(points, 0.0015);
    return simplified.length > 256 ? V.resample(points, 256) : simplified;
  }
  function length(p) {
    let d = 0;
    for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return d;
  }
  function syncControls() {
    state.mix = state.mix || { volume: 0.65, muted: [], loop: false };
    muted = state.mix.muted.slice();
    $('volume').value = state.mix.volume;
    $('loop').checked = state.mix.loop;
    $('bpm').value = state.options.bpm;
    $('tempoExact').value = state.options.bpm;
    const tempoPresets = [46, 66, 88, 108, 132, 152];
    const tempoNames = {46: 'Largo', 66: 'Andante', 88: 'Moderato', 108: 'Allegretto', 132: 'Allegro', 152: 'Vivace'};
    const tempoName = tempoNames[state.options.bpm] || '';
    $('bpmValue').textContent = state.options.bpm + ' BPM' + (tempoName ? ' · ' + tempoName : '');
    document.querySelectorAll('.tempo-preset').forEach(btn => {
      btn.classList.toggle('active', +btn.dataset.bpm === state.options.bpm);
    });
    $('bars').value = state.options.bars;
    if ($('form')) $('form').value = state.options.form;
    if ($('warmthMode')) $('warmthMode').value = state.options.warmthMode;
    if ($('warmth')) {
      $('warmth').value = state.options.warmth;
      $('warmth').disabled = state.options.warmthMode !== 'manual';
    }
    if ($('colorStatus')) $('colorStatus').textContent = colorStatusText();
    $('density').value = state.options.density;
    $('densityValue').textContent =
      state.options.density < 0.35 ? '疏朗' : state.options.density > 0.65 ? '丰富' : '适中';
    $('root').value = state.options.root;
    if ($('scaleMode')) $('scaleMode').value = state.options.scaleMode || 'major';
    if ($('lockKey')) {
      $('lockKey').textContent = state.options.keyLocked ? '🔒' : '🔓';
      $('lockKey').title = state.options.keyLocked ? '解锁调性自动推荐' : '锁定当前调性';
    }
    for (const key of ['instrument', 'reverb', 'brightness', 'humanize'])
      $(key).value = state.options[key];
    document.querySelectorAll('[data-style]').forEach((b) => {
      const yes = b.dataset.style === state.options.style;
      b.classList.toggle('selected', yes);
      b.setAttribute('aria-pressed', yes);
    });
    for (const [id, value] of [
      ['composeMode', 'compose'],
      ['literalMode', 'literal']
    ]) {
      $(id).classList.toggle('selected', state.options.mode === value);
      $(id).setAttribute('aria-pressed', state.options.mode === value);
    }
    $('modeDescription').textContent =
      state.options.mode === 'compose'
        ? '把线条组织成主题、变化与回归。'
        : '更直接地映射线条，比较图形本身的声音。';
  }
  function colorStatusText() {
    if (!state.color) return '未导入图片色彩';
    const w = +state.color.warmth || 0,
      label = w > 0.12 ? '暖' : w < -0.12 ? '冷' : '中性',
      follow =
        state.options.warmthMode === 'auto'
          ? ' · 跟随原图'
          : state.options.warmthMode === 'manual'
            ? ' · 手动'
            : ' · 不跟随';
    return '原图' + label + follow;
  }
  function setting(key, value) {
    record();
    const resume = player.isPlaying();
    state.options[key] = value;
    syncControls();
    rebuild({ resume });
  }
  function setTool(t) {
    tool = t;
    for (const [id, v] of [
      ['penTool', 'pen'],
      ['selectTool', 'select']
    ]) {
      $(id).classList.toggle('active', t === v);
      $(id).setAttribute('aria-pressed', t === v);
    }
    $('stage').style.cursor = t === 'pen' ? 'crosshair' : 'default';
    $('stageHint').textContent =
      t === 'pen' ? '高处音高更高 · 转折带来重音' : '点选线条查看音符 · 拖动整条线改变旋律';
  }
  function setTab(tab) {
    document
      .querySelectorAll('[data-tab]')
      .forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    $('imagePanel').hidden = tab !== 'image';
    $('textPanel').hidden = tab !== 'text';
    $('canvasMode').textContent = {
      draw: 'FREEHAND / 自由绘画',
      image: 'CAPTURE / 图像轮廓',
      text: 'LETTER / 文字的形状'
    }[tab];
    if (tab === 'draw') setTool('pen');
    else setTool('select');
  }
  function canvasMetrics(canvas) {
    const box = canvas.getBoundingClientRect(),
      d = Math.min(2, devicePixelRatio || 1);
    if (
      canvas.width !== Math.round(box.width * d) ||
      canvas.height !== Math.round(box.height * d)
    ) {
      canvas.width = Math.round(box.width * d);
      canvas.height = Math.round(box.height * d);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: box.width, h: box.height, d };
  }
  function stageGeometry(w, h) {
    const s = Math.min(w - 48, h - 58);
    return { s, x: (w - s) / 2, y: (h - s) / 2 };
  }
  function pointer(e) {
    const b = $('stage').getBoundingClientRect(),
      g = stageGeometry(b.width, b.height);
    return {
      x: clamp((e.clientX - b.left - g.x) / g.s),
      y: clamp((e.clientY - b.top - g.y) / g.s)
    };
  }
  function line(ctx, pts, g, color, width = 2, alpha = 1) {
    if (!pts?.length) return;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    pts.forEach((p, i) =>
      i
        ? ctx.lineTo(g.x + p.x * g.s, g.y + p.y * g.s)
        : ctx.moveTo(g.x + p.x * g.s, g.y + p.y * g.s)
    );
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function liveEvents() {
    return (
      score?.events.filter(
        (e) =>
          !muted.includes(e.track) && e.start <= beat && e.start + Math.min(e.duration, 2) > beat
      ) || []
    );
  }
  function drawStage() {
    const { ctx, w, h } = canvasMetrics($('stage')),
      g = stageGeometry(w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fcfbf5';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#dedfd540';
    for (let x = 20; x < w; x += 24)
      for (let y = 20; y < h; y += 24) {
        ctx.beginPath();
        ctx.arc(x, y, 0.7, 0, 7);
        ctx.fill();
      }
    if (sourceBitmap && $('showImage').checked) {
      const ratio = Math.min((g.s * 0.84) / sourceBitmap.width, (g.s * 0.84) / sourceBitmap.height);
      ctx.globalAlpha = 0.2;
      ctx.drawImage(
        sourceBitmap,
        w / 2 - (sourceBitmap.width * ratio) / 2,
        h / 2 - (sourceBitmap.height * ratio) / 2,
        sourceBitmap.width * ratio,
        sourceBitmap.height * ratio
      );
      ctx.globalAlpha = 1;
    }
    const live = player.isPlaying() ? liveEvents() : [],
      activeIds = new Set(live.map((e) => e.sourceId));
    state.paths.forEach((p, i) => {
      const picked = p.id === selected,
        lit = activeIds.has(p.id);
      line(
        ctx,
        p.points,
        g,
        picked ? '#b1854a' : palette[i % 4],
        picked ? 3.3 : lit ? 2.7 : 1.7,
        selected && !picked ? 0.3 : lit || picked ? 1 : 0.75
      );
      if (picked && p.points.length) {
        for (const q of [p.points[0], p.points.at(-1)]) {
          ctx.beginPath();
          ctx.arc(g.x + q.x * g.s, g.y + q.y * g.s, 4, 0, 7);
          ctx.fillStyle = '#fffefa';
          ctx.fill();
          ctx.strokeStyle = '#b1854a';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    });
    if (active?.points) line(ctx, active.points, g, '#b1854a', 2.3);
    if (false && score?.totalBeats) { // Fourier circles removed
      for (const [i, f] of fouriers.entries()) {
        let p = { x: 0, y: 0 };
        const t = (beat / score.totalBeats) * (f.closed ? 1 : 0.5);
        for (const c of f.coeff) {
          const a = 2 * Math.PI * c.freq * t + c.phase,
            q = { x: p.x + c.amp * Math.cos(a), y: p.y + c.amp * Math.sin(a) };
          if (c.freq && c.amp * g.s > 2) {
            ctx.beginPath();
            ctx.arc(g.x + p.x * g.s, g.y + p.y * g.s, c.amp * g.s, 0, 7);
            ctx.strokeStyle = palette[i] + '32';
            ctx.lineWidth = 0.7;
            ctx.stroke();
            line(ctx, [p, q], g, palette[i], 0.6, 0.25);
          }
          p = q;
        }
        ctx.beginPath();
        ctx.arc(g.x + p.x * g.s, g.y + p.y * g.s, 3, 0, 7);
        ctx.fillStyle = palette[i];
        ctx.fill();
      }
    }
    const marked = selectedEvent
      ? [selectedEvent]
      : live.filter((e) => e.track === 'melody').slice(-4);
    for (const e of marked) {
      const p = e.sourcePoint;
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(g.x + p.x * g.s, g.y + p.y * g.s, 9, 0, 7);
      ctx.fillStyle = '#b1854a22';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(g.x + p.x * g.s, g.y + p.y * g.s, 4, 0, 7);
      ctx.fillStyle = '#b1854a';
      ctx.fill();
    }
  }
  let noteRects = [];
  function trackInfo() {
    return score.tracks?.length
      ? score.tracks
      : [
          { id: 'melody', name: '旋律', color: palette[0] },
          { id: 'harmony', name: '和声', color: palette[1] },
          { id: 'bass', name: '低音', color: palette[2] },
          { id: 'pulse', name: '轻节奏', color: palette[3] }
        ];
  }
  function buildTracks() {
    const frag = document.createDocumentFragment();
    trackInfo().forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.track = t.id;
      b.setAttribute('aria-pressed', !muted.includes(t.id));
      b.title = '点击' + (muted.includes(t.id) ? '恢复' : '静音') + t.name;
      b.className = muted.includes(t.id) ? 'muted' : '';
      const dot = document.createElement('i');
      dot.style.background = palette[i % 4];
      const name = document.createElement('span');
      name.textContent = t.name;
      const count = document.createElement('small');
      count.textContent = score.events.filter((e) => e.track === t.id).length;
      b.append(dot, name, count);
      b.onclick = () => {
        muted = muted.includes(t.id) ? muted.filter((x) => x !== t.id) : [...muted, t.id];
        state.mix.muted = muted.slice();
        player.setMuted(muted);
        persist();
        buildTracks();
        drawRoll();
      };
      frag.append(b);
    });
    $('tracks').replaceChildren(frag);
  }
  function drawRoll() {
    const { ctx, w, h } = canvasMetrics($('pianoRoll'));
    ctx.clearRect(0, 0, w, h);
    noteRects = [];
    const tracks = trackInfo(),
      left = 1,
      top = 17,
      lane = (h - top - 2) / 4,
      total = score?.totalBeats || 32;
    ctx.font = '8px -apple-system,sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#f6f7f0' : '#fafbf5';
      ctx.fillRect(left, top + i * lane, w - 1, lane - 1);
    }
    for (let bar = 0; bar <= score.bars; bar++) {
      const x = left + ((bar * 4) / total) * (w - left - 1);
      ctx.strokeStyle = '#d6ddcf';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (bar < score.bars && (w > 500 || bar % 2 === 0)) {
        ctx.fillStyle = '#91a08f';
        ctx.fillText(String(bar + 1).padStart(2, '0'), x + 3, 10);
      }
    }
    tracks.forEach((t, idx) => {
      const events = score.events.filter((e) => e.track === t.id),
        pitches = events.map((e) => e.midi),
        lo = Math.min(...pitches, 48),
        hi = Math.max(...pitches, 78);
      events.forEach((e) => {
        const x = left + (e.start / total) * (w - left - 1),
          ew = Math.max(2, (e.duration / total) * (w - left - 1) - 1),
          y = top + idx * lane + 4 + ((hi - e.midi) / (hi - lo || 1)) * (lane - 13),
          eh = 4.7,
          playing = player.isPlaying() && e.start <= beat && e.start + e.duration > beat;
        ctx.globalAlpha = muted.includes(t.id)
          ? 0.14
          : selected && e.sourceId !== selected
            ? 0.18
            : playing
              ? 1
              : 0.68;
        ctx.fillStyle = selectedEvent?.id === e.id ? '#202f28' : palette[idx % 4];
        ctx.fillRect(x, y, ew, eh);
        if (playing) {
          ctx.globalAlpha = 0.15;
          ctx.fillRect(x - 2, y - 2, ew + 4, eh + 4);
        }
        ctx.globalAlpha = 1;
        noteRects.push({ x, y, w: ew, h: eh, event: e });
      });
    });
    const x = clamp(beat / total) * (w - 2) + 1;
    ctx.strokeStyle = '#aa7e3e';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x, top - 3);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.fillStyle = '#aa7e3e';
    ctx.beginPath();
    ctx.moveTo(x - 3, top - 5);
    ctx.lineTo(x + 3, top - 5);
    ctx.lineTo(x, top);
    ctx.fill();
    $('timeLabel').textContent = timeLabel((beat * 60) / score.bpm);
    const index = Math.min(score.bars - 1, Math.floor(beat / 4)),
      section = score.sections?.find((s) => beat >= s.start && beat < s.start + s.duration);
    $('sectionLabel').textContent =
      (section?.name || '收束') + ' · ' + (index + 1) + ' / ' + score.bars + ' 小节';
  }
  const ruleNames = {
    'literal.arc-length-to-scale': '沿轮廓取样，再对齐音阶',
    'compose.strong-beat-chord-tone': '强拍靠近当前和弦',
    'compose.geometry-scale-contour': '线条高度映射到音阶',
    'compose.tonic-cadence': '回到主音，让乐句收束',
    'compose.stepwise-voice-leading': '平缓过渡，避免突兀跳跃',
    'compose.minimum-motion-triad': '和声平稳连接',
    'compose.harmonic-root': '和弦根音支撑旋律',
    'compose.metrical-pulse': '轻节拍支撑乐句'
  };
  function explain(e) {
    selectedEvent = e;
    selected = e.sourceId;
    $('removePath').disabled = !selected;
    const n = state.paths.findIndex((p) => p.id === e.sourceId);
    const track = trackInfo().find((t) => t.id === e.track);
    const rule = ruleNames[e.ruleId] || e.ruleId;
    const p = e.sourcePoint;
    $('provenance').lastElementChild.textContent =
      (track?.name || e.track) +
      ' ' +
      noteName(e.midi) +
      ' · 第 ' +
      (Math.floor(e.start / 4) + 1) +
      ' 小节 · 来自第 ' +
      (n + 1) +
      ' 条线' +
      (p ? '（高度 ' + Math.round((1 - p.y) * 100) + '%）' : '') +
      ' · ' +
      rule;
    drawStage();
    drawRoll();
  }
  function selectPath(id) {
    selected = id;
    selectedEvent = null;
    $('removePath').disabled = !id;
    const es = score.events.filter((e) => e.sourceId === id);
    $('provenance').lastElementChild.textContent = id
      ? '第 ' +
        (state.paths.findIndex((p) => p.id === id) + 1) +
        ' 条线，关联 ' +
        es.length +
        ' 个音符。拖动它可改变旋律，或点击“删除选中”。'
      : '点一个音符，查看它对应的线条和生成规则。';
    drawStage();
    drawRoll();
  }
  function distance(p, a, b) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function hitPath(p) {
    let best = null,
      d = 0.035;
    for (const path of state.paths)
      for (let i = 1; i < path.points.length; i++) {
        const x = distance(p, path.points[i - 1], path.points[i]);
        if (x < d) {
          d = x;
          best = path;
        }
      }
    return best;
  }
  $('stage').addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || busy) return;
    if (tool === 'pen' && state.paths.length >= 64) {
      message('已达到 64 条线，请删除部分细节后继续。', true);
      return;
    }
    $('stage').setPointerCapture(e.pointerId);
    const p = pointer(e);
    oldPlaying = player.isPlaying();
    if (oldPlaying) {
      player.pause();
      seeking = player.getBeat();
      updatePlay();
    }
    changed = false;
    if (tool === 'pen') {
      active = { id: 'line-' + Date.now(), points: [p] };
      selected = null;
      preview(p);
    } else {
      const path = hitPath(p);
      selectPath(path?.id || null);
      if (path)
        active = { dragId: path.id, start: p, original: clone(path.points), before: snapshot() };
    }
    drawStage();
  });
  $('stage').addEventListener('pointermove', (e) => {
    if (!active) return;
    const p = pointer(e);
    if (active.points) {
      const q = active.points.at(-1);
      if (Math.hypot(p.x - q.x, p.y - q.y) > 0.003 && active.points.length < 1500) {
        active.points.push(p);
        preview(p);
      }
    } else if (active.dragId) {
      const orig = active.original,
        dx = p.x - active.start.x,
        dy = p.y - active.start.y,
        xs = orig.map((v) => v.x),
        ys = orig.map((v) => v.y),
        tx = clamp(dx, -Math.min(...xs), 1 - Math.max(...xs)),
        ty = clamp(dy, -Math.min(...ys), 1 - Math.max(...ys));
      state.paths.find((v) => v.id === active.dragId).points = orig.map((q) => ({
        x: q.x + tx,
        y: q.y + ty
      }));
      changed = Math.abs(tx) + Math.abs(ty) > 0.002;
    }
    drawStage();
  });
  function finishPointer(cancel = false) {
    if (!active) return;
    if (active.points) {
      if (!cancel && active.points.length > 1 && length(active.points) > 0.008) {
        record();
        state.paths.push({
          id: active.id,
          points: editablePoints(active.points)
        });
        state.sourceName = '自由绘画';
        changed = true;
      }
    } else if (cancel && active.dragId) {
      state.paths.find((p) => p.id === active.dragId).points = active.original;
      changed = false;
    } else if (changed) {
      history.push(active.before);
      if (history.length > 30) history.shift();
      future = [];
    }
    active = null;
    if (changed) {
      rebuild({ resume: oldPlaying });
      message('线条已更新，音乐也跟着改变了。');
    } else {
      drawStage();
      if (oldPlaying) start();
    }
  }
  $('stage').addEventListener('pointerup', () => finishPointer());
  $('stage').addEventListener('pointercancel', () => finishPointer(true));
  function preview(p) {
    if (!$('livePreview').checked || performance.now() - previewAt < 100) return;
    previewAt = performance.now();
    const scale =
        state.options.style === 'eastern'
          ? [0, 2, 4, 7, 9]
          : state.options.style === 'ambient'
            ? [0, 2, 3, 5, 7, 8, 10]
            : [0, 2, 4, 5, 7, 9, 11],
      index = Math.round((1 - p.y) * 13);
    const midi =
      60 + state.options.root + 12 * Math.floor(index / scale.length) + scale[index % scale.length];
    Promise.resolve(player.preview(midi, state.options.style, state.options)).catch(() => {});
  }
  $('pianoRoll').addEventListener('click', (e) => {
    if (!score.events.length) return;
    const box = $('pianoRoll').getBoundingClientRect(),
      x = e.clientX - box.left,
      y = e.clientY - box.top;
    let found = noteRects
      .filter((n) => x >= n.x - 3 && x <= n.x + n.w + 3 && y >= n.y - 4 && y <= n.y + n.h + 4)
      .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y))[0];
    if (found) {
      explain(found.event);
      Promise.resolve(player.preview(found.event.midi, state.options.style, state.options)).catch(
        () => {}
      );
    } else {
      const on = player.isPlaying();
      player.pause();
      seeking = clamp(x / box.width) * score.totalBeats;
      beat = seeking;
      selectedEvent = null;
      if (on) start();
      else {
        updatePlay();
        drawStage();
        drawRoll();
      }
    }
  });
  function makeDemo(type) {
    const paths = [];
    function add(points) {
      paths.push({
        id: 'demo-' + type + '-' + paths.length,
        points: points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p))
      });
    }
    const loop = (cx, cy, rx, ry, n = 70) =>
      Array.from({ length: n + 1 }, (_, i) => ({
        x: cx + rx * Math.cos((i / n) * 2 * Math.PI),
        y: cy + ry * Math.sin((i / n) * 2 * Math.PI)
      }));
    if (type === 'house') {
      add([
        [0.12, 0.43],
        [0.5, 0.18],
        [0.88, 0.43]
      ]);
      add([
        [0.21, 0.4],
        [0.21, 0.78],
        [0.79, 0.78],
        [0.79, 0.4]
      ]);
      for (const x of [0.31, 0.57])
        add([
          [x, 0.52],
          [x + 0.12, 0.52],
          [x + 0.12, 0.65],
          [x, 0.65],
          [x, 0.52]
        ]);
      add([
        [0.1, 0.82],
        [0.9, 0.82]
      ]);
    }
    if (type === 'mountain') {
      add([
        [0.06, 0.69],
        [0.2, 0.43],
        [0.32, 0.55],
        [0.48, 0.2],
        [0.7, 0.58],
        [0.81, 0.39],
        [0.94, 0.68]
      ]);
      add([
        [0.1, 0.66],
        [0.24, 0.61],
        [0.44, 0.72],
        [0.61, 0.54],
        [0.89, 0.69]
      ]);
      for (let j = 0; j < 3; j++)
        add(
          Array.from({ length: 80 }, (_, i) => ({
            x: 0.15 + (i / 79) * 0.7,
            y: 0.77 + j * 0.055 + 0.014 * Math.sin((i / 79) * Math.PI * 5 + j)
          }))
        );
      add(loop(0.78, 0.22, 0.065, 0.065));
    }
    if (type === 'flower') {
      add(
        Array.from({ length: 180 }, (_, i) => {
          const a = (i / 179) * Math.PI * 2,
            r = 0.24 + 0.12 * Math.cos(a * 6);
          return { x: 0.5 + r * Math.cos(a), y: 0.44 + r * Math.sin(a) };
        })
      );
      add(loop(0.5, 0.44, 0.055, 0.055));
      add([
        [0.5, 0.79],
        [0.5, 0.94]
      ]);
      add([
        [0.5, 0.89],
        [0.35, 0.79],
        [0.42, 0.9],
        [0.5, 0.92]
      ]);
    }
    if (type === 'wave') {
      for (let j = 0; j < 3; j++)
        add(
          Array.from({ length: 100 }, (_, i) => ({
            x: 0.07 + (0.86 * i) / 99,
            y: 0.3 + j * 0.2 + (0.15 - j * 0.04) * Math.sin((i / 99) * 4 * Math.PI + j * 0.6)
          }))
        );
    }
    return paths;
  }
  async function loadImageData(data) {
    const rev = ioRevision;
    if (!data) {
      sourceBitmap = null;
      photoCanvas = null;
      $('extractAgain').disabled = true;
      return;
    }
    const im = new Image();
    im.src = data;
    await im.decode();
    if (rev !== ioRevision) return;
    sourceBitmap = im;
    photoCanvas = document.createElement('canvas');
    photoCanvas.width = im.width;
    photoCanvas.height = im.height;
    photoCanvas.getContext('2d').drawImage(im, 0, 0);
    $('extractAgain').disabled = false;
  }
  function useDemo(type) {
    ioRevision++;
    record();
    stop();
    state.paths = makeDemo(type);
    state.sourceName = {
      house: '屋檐与窗',
      mountain: '山水之间',
      flower: '花的回旋',
      wave: '慢慢流动'
    }[type];
    state.image = null;
    state.color = null;
    sourceBitmap = null;
    photoCanvas = null;
    $('extractAgain').disabled = true;
    selected = null;
    setTab('draw');
    rebuild();
    message('已载入「' + state.sourceName + '」。选一种风格，听听它。');
  }
  async function openImage(file) {
    if (!file) return;
    const rev = ++ioRevision;
    try {
      setBusy(true, '正在读取图片…');
      const canvas = await window.SonifyPhoto.readPhoto(file);
      if (rev !== ioRevision) return;
      photoCanvas = canvas;
      await extractPhoto(file.name.slice(0, 80));
      if (rev === ioRevision) setTab('image');
    } catch (error) {
      if (rev === ioRevision) message('图片读取失败：' + error.message, true);
    } finally {
      setBusy(false);
    }
  }
  function extractColor(canvas) {
    if (!canvas || !window.SonifyColor?.extract) return null;
    try {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const c = window.SonifyColor.extract(data);
      return c && Number.isFinite(c.warmth) ? c : null;
    } catch {
      return null;
    }
  }
  function imageDataUrl(canvas) {
    const png = canvas.toDataURL('image/png');
    return png.length < 2800000 ? png : canvas.toDataURL('image/jpeg', 0.92);
  }
  async function applySketch(canvas, name, original) {
    if (busy) throw Error('请等待当前处理完成后再试。');
    const result = V.extract(
      canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height),
      { mode: 'photo', detail: 4, maxPaths: 32 }
    );
    if (!result.paths.length)
      throw Error('素稿里没有清晰轮廓；可先下载 PNG，或换一张照片。当前作品已保留。');
    const color = extractColor(original || photoCanvas);
    ioRevision++;
    record();
    stop();
    state.paths = result.paths.map((path, i) => ({
      ...path,
      id: 'sketch-' + Date.now() + '-' + i
    }));
    state.sourceName = (name.replace(/\.[^.]+$/, '') + ' · 素稿').slice(0, 80);
    state.color = color;
    state.image = imageDataUrl(canvas);
    await loadImageData(state.image);
    selected = null;
    setTab('image');
    setTool('select');
    rebuild();
    message('素稿已转成 ' + state.paths.length + ' 条音乐轮廓。可以试听、编辑，或撤销恢复。');
  }
  window.SonifyPhoto.mount({
    getSource: () => ({ canvas: photoCanvas, name: state.sourceName }),
    apply: applySketch,
    download
  });

  function setBusy(v, text) {
    busy = v;
    document.body.classList.toggle('busy', v);
    $('extractAgain').disabled = v || !photoCanvas;
    $('makeText').disabled = v;
    if (text) message(text);
  }
  async function extractPhoto(newImageName = null) {
    if (!photoCanvas) return;
    const rev = ioRevision;
    setBusy(true, '正在提取可演奏的轮廓…');
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    if (rev !== ioRevision) {
      setBusy(false);
      return;
    }
    try {
      const data = photoCanvas
        .getContext('2d')
        .getImageData(0, 0, photoCanvas.width, photoCanvas.height);
      const result = V.extract(data, {
        mode: $('imageMode').value,
        detail: +$('imageDetail').value,
        maxPaths: 32
      });
      const color = extractColor(photoCanvas);
      if (!result.paths.length) {
        message(
          '没有找到清晰轮廓。试试黑白线稿或提高细节；当前作品已保留。',
          true
        );
        return;
      }
      record();
      stop();
      if (newImageName) state.sourceName = newImageName;
      state.paths = result.paths.map((p, i) => ({ ...p, id: 'photo-' + Date.now() + '-' + i }));
      state.color = color;
      state.image = imageDataUrl(photoCanvas);
      await loadImageData(state.image);
      selected = null;
      rebuild();
      message('提取了 ' + state.paths.length + ' 条轮廓。用“选择 / 移动”删掉干扰线，再试听。');
    } catch (e) {
      message('轮廓提取未完成：' + e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function makeText() {
    const value = $('textValue').value.trim();
    if (!value) {
      message('先写下一个字或一个名字。');
      $('textValue').focus();
      return;
    }
    const rev = ++ioRevision;
    setBusy(true, '正在描出文字轮廓…');
    try {
      await new Promise((r) => setTimeout(r, 0));
      if (rev !== ioRevision) return;
      const c = document.createElement('canvas');
      c.width = 384;
      c.height = 384;
      const ctx = c.getContext('2d');
      const chars = Array.from(value).slice(0, 12),
        perRow = Math.min(4, chars.length),
        rows = Math.ceil(chars.length / perRow),
        fs = Math.min(112, 300 / perRow);
      ctx.font = '600 ' + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'white';
      chars.forEach((ch, i) =>
        ctx.fillText(
          ch,
          192 + ((i % perRow) - (perRow - 1) / 2) * fs,
          192 + (Math.floor(i / perRow) - (rows - 1) / 2) * fs * 1.25
        )
      );
      const contours = V.traceGlyphMask(ctx.getImageData(0, 0, 384, 384).data, 384, 384);
      if (!contours.length) throw Error('未找到文字轮廓，请换一种字符');
      record();
      stop();
      state.paths = V.fitPaths(contours.slice(0, 64), 384, 384).map((p, i) => ({
        id: 'text-' + Date.now() + '-' + i,
        points: (p.points || p).length > 256 ? V.resample(p.points || p, 256) : p.points || p
      }));
      state.sourceName = '「' + value + '」';
      state.image = null;
      state.color = null;
      sourceBitmap = null;
      photoCanvas = null;
      selected = null;
      rebuild();
      message('文字已成为 ' + state.paths.length + ' 条线。点击播放试听。');
    } catch (e) {
      message(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  function download(blob, name) {
    // Keep a visible retry link for embedded browsers that block automatic downloads.
    const previous = $('lastDownload');
    if (previous) { URL.revokeObjectURL(previous.href); previous.remove(); }
    const a = document.createElement('a');
    a.id = 'lastDownload';
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.textContent = '下载已生成的文件：' + name;
    a.style.cssText = 'display:block;margin:12px 0;font-size:13px';
    $('status').after(a);
    a.click();
  }
  function exportJSON(data, name) {
    download(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
      name
    );
  }
  function validProject(data) {
    if (
      !data ||
      data.format !== 'sonify-studio-v3' ||
      !Array.isArray(data.paths) ||
      data.paths.length > 64
    )
      throw Error('不是兼容的 Sonify Studio 工程');
    let count = 0;
    const ids = new Set();
    const paths = data.paths.map((p, i) => {
      if (!Array.isArray(p.points) || p.points.length < 2 || p.points.length > 2000)
        throw Error('线条点数不合法');
      count += p.points.length;
      const id = typeof p.id === 'string' ? p.id.slice(0, 100) : 'import-' + i;
      if (ids.has(id)) throw Error('线条标识重复');
      ids.add(id);
      return {
        id,
        points: p.points.map((q) => {
          if (
            !q ||
            !Number.isFinite(q.x) ||
            !Number.isFinite(q.y) ||
            q.x < 0 ||
            q.x > 1 ||
            q.y < 0 ||
            q.y > 1
          )
            throw Error('坐标不合法');
          return { x: q.x, y: q.y };
        })
      };
    });
    if (count > 20000) throw Error('工程点数过多');
    const o = data.options || {},
      options = {
        style: ['piano', 'eastern', 'ambient'].includes(o.style) ? o.style : 'piano',
        bpm: clamp(Number(o.bpm) || 88, 40, 168),
        bars: [4, 8, 16, 32].includes(+o.bars) ? +o.bars : 32,
        form: ['ternary', 'rondo'].includes(o.form) ? o.form : 'ternary',
        warmthMode: ['auto', 'manual', 'off'].includes(o.warmthMode) ? o.warmthMode : 'auto',
        warmth: clamp(Number.isFinite(o.warmth) ? o.warmth : 0, -1, 1),
        mode: o.mode === 'literal' ? 'literal' : 'compose',
        density: clamp(Number.isFinite(o.density) ? o.density : 0.5),
        root: [0, 2, 4, 5, 7, 9].includes(+o.root) ? +o.root : 0,
        scaleMode: ['auto', 'major', 'minor', 'pentatonic'].includes(o.scaleMode) ? o.scaleMode : 'auto',
        keyLocked: !!o.keyLocked,
        instrument: (['auto'].concat(['piano', 'harp', 'flute', 'strings', 'violin', 'cello', 'koto', 'shakuhachi', 'guitar', 'epiano', 'clarinet', 'vibes', 'marimba', 'bass'])).includes(o.instrument)
          ? o.instrument
          : 'auto',
        reverb: clamp(Number.isFinite(o.reverb) ? o.reverb : 0.3),
        brightness: clamp(Number.isFinite(o.brightness) ? o.brightness : 0.55),
        humanize: clamp(Number.isFinite(o.humanize) ? o.humanize : 0.25)
      };
    const image =
      typeof data.image === 'string' &&
      data.image.length < 3000000 &&
      /^data:image\/(png|jpeg|webp);base64,/.test(data.image)
        ? data.image
        : null;
    const m = data.mix || {},
      mix = {
        volume: clamp(Number.isFinite(m.volume) ? m.volume : 0.65),
        muted: Array.isArray(m.muted)
          ? [...new Set(m.muted.filter((t) => ['melody', 'harmony', 'bass', 'pulse'].includes(t)))]
          : [],
        loop: !!m.loop
      };
    let color = null;
    const c = data.color;
    if (c && typeof c === 'object') {
      color = {
        warmth: clamp(Number.isFinite(c.warmth) ? c.warmth : 0, -1, 1),
        luminance: clamp(Number.isFinite(c.luminance) ? c.luminance : 0.5),
        saturation: clamp(Number.isFinite(c.saturation) ? c.saturation : 0.4),
        palette: Array.isArray(c.palette)
          ? c.palette
              .filter((h) => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h))
              .slice(0, 5)
          : []
      };
    }
    return {
      paths,
      options,
      image,
      color,
      mix,
      sourceName: String(data.sourceName || '导入作品').slice(0, 80)
    };
  }
  async function applyProject(data, saveHistory = true) {
    const rev = ++ioRevision;
    const next = validProject(data);
    if (next.image) {
      const im = new Image();
      im.src = next.image;
      await im.decode();
      if (im.width * im.height > 50000000) throw Error('工程图片过大');
      sourceBitmap = im;
    } else sourceBitmap = null;
    if (rev !== ioRevision) return;
    if (saveHistory) record();
    stop();
    Object.assign(state, next);
    selected = null;
    await loadImageData(state.image);
    syncControls();
    rebuild();
  }
  function legacyPaths(raw) {
    if (!Array.isArray(raw) || raw.length > 512) throw Error('轮廓数量不合法');
    let n = 0;
    const valid = raw
      .filter((p) => Array.isArray(p) && p.length > 1)
      .map((p) => {
        n += p.length;
        if (n > 100000) throw Error('轮廓点数过多');
        return p.map((q) => {
          if (
            !q ||
            !Number.isFinite(q.x) ||
            !Number.isFinite(q.y) ||
            Math.abs(q.x) > 100000 ||
            Math.abs(q.y) > 100000
          )
            throw Error('轮廓坐标不合法');
          return { x: q.x, y: q.y };
        });
      });
    if (!valid.length) throw Error('没有有效轮廓');
    const fitted = V.fitPaths(valid);
    return fitted.slice(0, 64).map((p, i) => ({
      id: 'ai-' + Date.now() + '-' + i,
      points: editablePoints(p.points || p)
    }));
  }
  function applyLegacy(raw) {
    ioRevision++;
    const paths = legacyPaths(raw);
    record();
    stop();
    state.paths = paths;
    state.sourceName = 'AI 主体轮廓';
    state.image = null;
    state.color = null;
    sourceBitmap = null;
    photoCanvas = null;
    $('extractAgain').disabled = true;
    selected = null;
    setTab('draw');
    setTool('select');
    rebuild();
    message('已接收 ' + paths.length + ' 条 AI 轮廓。现在可以选风格、编辑和导出音乐。');
  }
  window.addEventListener('message', (e) => {
    if (e.source !== labWindow || e.data?.type !== 'sonify-paths-v3') return;
    try {
      applyLegacy(e.data.paths);
    } catch (err) {
      message('轮廓导入失败：' + err.message, true);
    }
  });
  $('aiLab').onclick = async () => {
    if (!photoCanvas) {
      message('请先导入一张图片，再进行精细提取。', true);
      setTab('image');
      return;
    }
    if ($('imageDetail')) $('imageDetail').value = 5;
    await extractPhoto();
  };
  $('projectFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      if (f.size > 6 * 1024 * 1024) throw Error('工程须小于 6 MB');
      const data = JSON.parse(await f.text());
      if (data.format === 'sonify-legacy-paths') applyLegacy(data.strokes);
      else {
        await applyProject(data);
        message('工程已恢复，形状、风格和音符可以继续编辑。');
      }
    } catch (err) {
      message('工程打开失败：' + err.message, true);
    } finally {
      e.target.value = '';
    }
  };
  $('saveProject').onclick = () => {
    exportJSON(
      { format: 'sonify-studio-v3', version: 3, ...state },
      '圆绘作品-' + stamp() + '.json'
    );
    message('已导出工程，包含线条、参数与原图参考。');
  };
  $('exportEvents').onclick = () => {
    exportJSON(
      {
        format: 'sonify-score-v3',
        score,
        paths: state.paths,
        notes:
          'Rule-based composition. Every event retains geometry source; musical rules are project design.'
      },
      '圆绘音乐事件-' + stamp() + '.json'
    );
    message('已导出音符与来源数据。');
  };
  $('exportMidi').onclick = () => {
    try {
      download(
        new Blob([M.exportMIDI(score)], { type: 'audio/midi' }),
        '圆绘音乐-' + stamp() + '.mid'
      );
      message('已导出四轨 MIDI。可用 DAW 更换音源、继续编曲；MIDI 不包含本页音色。');
    } catch (e) {
      message('MIDI 导出失败：' + e.message, true);
    }
  };
  $('exportWav').onclick = async () => {
    if (busy) return;
    $('exportWav').disabled = true;
    setBusy(true, '正在渲染 WAV，保留当前声部和音量…');
    try {
      const data = await M.renderWav(score, { muted, volume: +$('volume').value });
      download(
        data instanceof Blob ? data : new Blob([data], { type: 'audio/wav' }),
        '圆绘音乐-' + stamp() + '.wav'
      );
      updateAudioStatus();
      message('WAV 已导出。可以直接播放或放进视频剪辑。');
    } catch (e) {
      message('WAV 导出失败：' + e.message, true);
    } finally {
      $('exportWav').disabled = false;
      setBusy(false);
    }
  };
  $('exportPng').onclick = () => {
    drawStage();
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f6f5ef';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#315b49';
    ctx.font = '500 26px sans-serif';
    ctx.fillText('SONIFY / 圆绘音乐', 80, 85);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#718677';
    ctx.fillText(
      state.sourceName + ' · ' + state.options.bpm + ' BPM · ' + score.bars + ' 小节',
      80,
      118
    );
    const stage = $('stage'),
      r = Math.min(1440 / stage.width, 880 / stage.height);
    ctx.drawImage(
      stage,
      (1600 - stage.width * r) / 2,
      170 + (880 - stage.height * r) / 2,
      stage.width * r,
      stage.height * r
    );
    ctx.font = '15px sans-serif';
    ctx.fillText('Let the world sing.', 80, 1130);
    c.toBlob((blob) => {
      if (blob) download(blob, '圆绘画面-' + stamp() + '.png');
    }, 'image/png');
  };
  $('imageFile').onchange = (e) => {
    openImage(e.target.files[0]);
    e.target.value = '';
  };
  $('extractAgain').onclick = () => extractPhoto();
  $('makeText').onclick = makeText;
  $('textValue').onkeydown = (e) => {
    if (e.key === 'Enter') makeText();
  };
  for (const ev of ['dragenter', 'dragover'])
    $('dropzone').addEventListener(ev, (e) => {
      e.preventDefault();
      $('dropzone').classList.add('dragover');
    });
  $('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragover'));
  $('dropzone').addEventListener('drop', (e) => {
    e.preventDefault();
    $('dropzone').classList.remove('dragover');
    openImage(e.dataTransfer.files[0]);
  });
  $('penTool').onclick = () => setTool('pen');
  $('selectTool').onclick = () => setTool('select');
  $('removePath').onclick = () => {
    if (!selected) return;
    record();
    state.paths = state.paths.filter((p) => p.id !== selected);
    selected = null;
    rebuild();
    message('已删除选中线条，可撤销恢复。');
  };
  $('clear').onclick = () => {
    ioRevision++;
    record();
    stop();
    state.paths = [];
    state.image = null;
    state.color = null;
    sourceBitmap = null;
    photoCanvas = null;
    $('extractAgain').disabled = true;
    state.sourceName = '空白画布';
    selected = null;
    rebuild();
    message('画布已清空，可撤销恢复。');
  };
  async function restore(dir) {
    const from = dir === 'undo' ? history : future,
      to = dir === 'undo' ? future : history;
    if (!from.length) return;
    ioRevision++;
    to.push(snapshot());
    const prev = from.pop();
    stop();
    Object.assign(state, prev);
    await loadImageData(state.image);
    selected = null;
    syncControls();
    rebuild();
    message(dir === 'undo' ? '已撤销。' : '已重做。');
  }
  $('undo').onclick = () => restore('undo');
  $('redo').onclick = () => restore('redo');
  document
    .querySelectorAll('[data-demo]')
    .forEach((b) => (b.onclick = () => useDemo(b.dataset.demo)));
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  document
    .querySelectorAll('[data-style]')
    .forEach((b) => (b.onclick = () => setting('style', b.dataset.style)));
  $('composeMode').onclick = () => setting('mode', 'compose');
  $('literalMode').onclick = () => setting('mode', 'literal');
  
  // Tempo presets and snap
  const tempoPresets = [46, 66, 88, 108, 132, 152];
  const snapThreshold = 3;
  function updateTempoUI(bpm) {
    const tempoNames = {46: 'Largo', 66: 'Andante', 88: 'Moderato', 108: 'Allegretto', 132: 'Allegro', 152: 'Vivace'};
    const tempoName = tempoNames[bpm] || '';
    $('bpmValue').textContent = bpm + ' BPM' + (tempoName ? ' · ' + tempoName : '');
    document.querySelectorAll('.tempo-preset').forEach(btn => {
      btn.classList.toggle('active', +btn.dataset.bpm === bpm);
    });
  }
  $('tempoExact').onchange = () => setting('bpm', Math.round(clamp(+$('tempoExact').value || 88, 40, 168)));
  $('bpm').oninput = () => {
    let v = +$('bpm').value;
    const nearest = tempoPresets.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
    if (Math.abs(v - nearest) <= snapThreshold) v = nearest;
    $('bpm').value = v;
    updateTempoUI(v);
  };
  $('bpm').onchange = () => {
    const v = +$('bpm').value;
    setting('bpm', clamp(v, 40, 168));
    updateTempoUI(v);
  };
  document.querySelectorAll('.tempo-preset').forEach(btn => {
    btn.onclick = () => {
      const v = +btn.dataset.bpm;
      $('bpm').value = v;
      setting('bpm', v);
      updateTempoUI(v);
    };
  });
  
  $('bars').onchange = () => setting('bars', +$('bars').value);
  if ($('form')) $('form').onchange = () => setting('form', $('form').value);
  if ($('warmthMode'))
    $('warmthMode').onchange = () => setting('warmthMode', $('warmthMode').value);
  if ($('warmth'))
    $('warmth').onchange = () => setting('warmth', clamp(+$('warmth').value || 0, -1, 1));
  $('density').oninput = () => {
    $('densityValue').textContent =
      +$('density').value < 0.35 ? '疏朗' : +$('density').value > 0.65 ? '丰富' : '适中';
  };
  $('density').onchange = () => setting('density', +$('density').value);
  $('root').onchange = () => {
    state.options.keyLocked = true;
    setting('root', +$('root').value);
    syncControls();
  };
  if ($('scaleMode')) $('scaleMode').onchange = () => {
    setting('scaleMode', $('scaleMode').value);
  };
  if ($('lockKey')) $('lockKey').onclick = () => {
    state.options.keyLocked = !state.options.keyLocked;
    syncControls();
    if (!state.options.keyLocked) rebuild();
    message(state.options.keyLocked ? '已锁定调性，不再自动推荐。' : '已解锁调性，将根据图片色温自动推荐。');
  };
  
  // Emotion presets
  document.querySelectorAll('.emotion-preset').forEach(btn => {
    btn.onclick = () => {
      const emotion = btn.dataset.emotion;
      const presets = { bright: { brightness: .75, reverb: .2, density: .65 },
        balanced: { brightness: .55, reverb: .3, density: .5 },
        melancholy: { brightness: .35, reverb: .45, density: .4 } };
      Object.assign(state.options, presets[emotion] || presets.balanced);
      rebuild();
      syncControls();
      message('已应用情感预设：' + btn.textContent);
    };
  });
  
  for (const key of ['instrument', 'reverb', 'brightness', 'humanize'])
    $(key).onchange = () => setting(key, key === 'instrument' ? $(key).value : +$(key).value);
  $('play').onclick = togglePlay;
  $('stop').onclick = () => {
    stop();
    drawStage();
    drawRoll();
  };
  $('volume').oninput = () => {
    state.mix.volume = +$('volume').value;
    player.setVolume(state.mix.volume);
  };
  $('volume').onchange = persist;
  $('loop').onchange = () => {
    state.mix.loop = $('loop').checked;
    persist();
    if (player.isPlaying()) {
      seeking = player.getBeat();
      start();
    }
  };
  if ($('showImage')) $('showImage').onchange = drawStage;
  $('helpButton').onclick = () => $('help').showModal();
  $('closeHelp').onclick = () => $('help').close();
  $('help').addEventListener('click', (e) => {
    if (e.target === $('help')) {
      const r = $('help').getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        $('help').close();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector('dialog[open]'))
      return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      restore(e.shiftKey ? 'redo' : 'undo');
    } else if (e.code === 'Space' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      togglePlay();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      $('removePath').click();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && player.isPlaying()) {
      seeking = player.getBeat();
      player.pause();
      updatePlay();
      message('切换到后台时已暂停，回来后可继续聆听。');
    }
  });
  window.addEventListener('pagehide', () => player.stop());
  new ResizeObserver(() => {
    drawStage();
    if (score) drawRoll();
  }).observe($('stage'));
  function tick(now) {
    if (now - lastPaint > 40) {
      lastPaint = now;
      const on = player.isPlaying();
      if (on) {
        beat = player.getBeat();
        seeking = beat;
        drawStage();
        drawRoll();
        lastBeat = beat;
      } else if (lastBeat >= 0) {
        lastBeat = -1;
        beat = player.getBeat();
        seeking = beat;
        updatePlay();
        drawStage();
        drawRoll();
      }
    }
    requestAnimationFrame(tick);
  }
  async function boot() {
    let restored = false;
    try {
      const raw =
        localStorage.getItem('sonify-studio-v4') || localStorage.getItem('sonify-studio-v3');
      if (raw) {
        await applyProject(JSON.parse(raw), false);
        restored = true;
        message('已恢复上次的创作。');
      }
    } catch {
      message('上次存档无法读取，已打开示例。', true);
    }
    if (!restored) {
      state.paths = makeDemo('house');
      syncControls();
      rebuild({ save: false });
    }
    requestAnimationFrame(tick);
  }
  // Read-only diagnostic access for verification and source-level integration.
  window.SonifyStudio = {
    getState: () => snapshot(),
    getScore: () => clone(score),
    getPlayer: () => player,
    makeDemo,
    validProject,
    legacyPaths
  };
  boot();
})();
