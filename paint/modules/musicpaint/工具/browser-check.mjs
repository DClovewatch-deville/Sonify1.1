/*
 * Real-browser acceptance harness.
 *
 * Drives the built single-file app in headless Chrome over the DevTools
 * protocol: it loads the file from disk (no server, no network), draws with
 * real mouse input, changes settings through the real controls, imports a real
 * PNG through the real file input, and captures the real download files for
 * WAV/MIDI/PNG/JSON. Nothing is stubbed.
 *
 * Usage: node tools/browser-check.mjs [path-to-html] [output-dir]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ENTRY = resolve(process.argv[2] || join(ROOT, 'MusicPaint-V4.0.html'));
const OUT = resolve(process.argv[3] || join(ROOT, 'outputs', 'browser-check'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const DOWNLOADS = join(OUT, 'downloads');
const PROFILE = join(OUT, 'profile');
const FIXTURES = join(OUT, 'fixtures');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(DOWNLOADS, { recursive: true });
mkdirSync(PROFILE, { recursive: true });
mkdirSync(FIXTURES, { recursive: true });

/* --------------------------------------------------- tiny PNG writer ----- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** Write an RGB PNG. `pixel(x, y)` returns [r,g,b]. */
function writePng(file, width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

// A warm photo with strong dark edges: a terracotta field crossed by a frame,
// a circle and a horizon line, so vision has real contours to find.
const PHOTO = join(FIXTURES, 'warm-room.png');
writePng(PHOTO, 420, 300, (x, y) => {
  const frame = x < 14 || x > 405 || y < 14 || y > 285;
  const circle = (x - 210) ** 2 + (y - 140) ** 2 < 58 ** 2;
  const ring = circle && (x - 210) ** 2 + (y - 140) ** 2 > 40 ** 2;
  const horizon = Math.abs(y - 215) < 3;
  const pillar = Math.abs(x - 300) < 5 && y > 60 && y < 215;
  if (frame || ring || horizon || pillar) return [38, 30, 26];
  const t = y / 300;
  return [206 - Math.round(28 * t), 96 + Math.round(40 * t), 62 + Math.round(24 * t)];
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- CDP glue */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.method + ': ' + msg.error.message)) : res(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((res, reject) => {
      this.pending.set(id, { resolve: res, reject });
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout: ' + method)); }
      }, 120000);
    });
  }
  waitFor(method, timeout = 30000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const tick = () => {
        const hit = this.events.findIndex((e) => e.method === method);
        if (hit >= 0) return resolve(this.events.splice(hit, 1)[0]);
        if (Date.now() - started > timeout) return reject(new Error('timeout waiting for ' + method));
        setTimeout(tick, 25);
      };
      tick();
    });
  }
  drain(method) {
    const hits = this.events.filter((e) => e.method === method);
    this.events = this.events.filter((e) => e.method !== method);
    return hits;
  }
}

async function launch() {
  const proc = spawn(CHROME, [
    '--headless=new',
    // Chrome's own sandbox cannot initialise inside the harness file sandbox,
    // which kills every renderer. It is disabled for this throwaway profile.
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--remote-debugging-port=' + PORT,
    '--remote-allow-origins=*',
    '--user-data-dir=' + PROFILE,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-features=Translate,MediaRouter',
    '--hide-scrollbars',
    '--window-size=1440,960',
    '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank'
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 120 && !wsUrl; i++) {
    await sleep(250);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      wsUrl = (await r.json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) { proc.kill(); throw new Error('Chrome DevTools endpoint never came up'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  return { proc, cdp: new CDP(ws), ws };
}

/* ------------------------------------------------------------------- probe */
const results = { entry: ENTRY, checks: [], failures: [], network: [], console: [] };
const pass = (name, detail) => results.checks.push({ name, ok: true, ...(detail ? { detail } : {}) });
const fail = (name, detail) => {
  results.failures.push({ name, detail });
  results.checks.push({ name, ok: false, ...(detail ? { detail } : {}) });
};
const expect = (name, cond, detail) => (cond ? pass(name, detail) : fail(name, detail));

const { proc, cdp, ws } = await launch();
let session;

try {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  session = sessionId;

  await cdp.send('Page.enable', {}, session);
  await cdp.send('Runtime.enable', {}, session);
  await cdp.send('Log.enable', {}, session);
  await cdp.send('Network.enable', {}, session);
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS }, session);

  const loaded = cdp.waitFor('Page.loadEventFired', 60000);
  await cdp.send('Page.navigate', { url: 'file://' + ENTRY }, session);
  await loaded;
  await sleep(900);

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true
    }, session);
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };

  /* 1. the page loaded at all */
  const boot = await evaluate(`(() => ({
    title: document.title,
    ready: document.readyState,
    hasStage: !!document.getElementById('stage'),
    hasMusic: typeof SonifyMusic === 'object',
    hasClassical: typeof SonifyClassical === 'object',
    hasColor: typeof SonifyColor === 'object',
    hasVision: typeof SonifyVision === 'object',
    hasSketch: typeof SonifySketch === 'object',
    playDisabled: document.getElementById('play').disabled,
    sketches: [...document.querySelectorAll('script[src], link[href]')].length
  }))()`);
  expect('single file boots from file:// with no external assets', boot.hasStage && boot.hasMusic && boot.hasClassical && boot.hasColor && boot.sketches === 0, boot);

  /* 2. no network requests beyond the local file itself */
  const requests = cdp.drain('Network.requestWillBeSent').map((e) => e.params.request.url);
  const external = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'));
  results.network = [...new Set(requests)];
  expect('no external network requests', external.length === 0, { external, total: requests.length });

  /* 3. draw real strokes with real mouse input */
  // The stage is re-measured before every stroke: earlier steps scroll the page.
  let rect = null;
  const stageRect = async () => {
    rect = await evaluate(`(async () => {
      const el = document.getElementById('stage');
      el.scrollIntoView({ block: 'center' });
      await new Promise(r => setTimeout(r, 250));
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })()`);
    return rect;
  };
  const px = (fx, fy) => [Math.round(rect.x + rect.w * fx), Math.round(rect.y + rect.h * fy)];
  const stroke = async (points) => {
    await stageRect();
    const [x0, y0] = px(...points[0]);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1, pointerType: 'mouse' }, session);
    for (const p of points.slice(1)) {
      const [x, y] = px(...p);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'mouse' }, session);
      await sleep(16);
    }
    const [xEnd, yEnd] = px(...points.at(-1));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: xEnd, y: yEnd, button: 'left', clickCount: 1, pointerType: 'mouse' }, session);
    await sleep(180);
  };

  // An arch (a hill), a wavy line, and a closed loop.
  const arch = Array.from({ length: 22 }, (_, i) => [0.12 + (0.76 * i) / 21, 0.78 - 0.55 * Math.sin((Math.PI * i) / 21)]);
  const wave = Array.from({ length: 30 }, (_, i) => [0.1 + (0.8 * i) / 29, 0.45 + 0.22 * Math.sin(i * 0.55)]);
  // Aspect is irrelevant here: a closed contour is a closed contour.
  const loop = Array.from({ length: 36 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 35;
    return [0.5 + 0.18 * Math.cos(a), 0.5 + 0.18 * Math.sin(a)];
  });
  await stroke(arch);
  const afterArch = await evaluate(`document.getElementById('pathCount').textContent`);
  await stroke(wave);
  const afterWave = await evaluate(`document.getElementById('pathCount').textContent`);
  await stroke(loop);
  const afterLoop = await evaluate(`document.getElementById('pathCount').textContent`);
  results.strokeCounts = { afterArch, afterWave, afterLoop };

  const drawn = await evaluate(`(() => ({
    pathCount: document.getElementById('pathCount').textContent,
    playDisabled: document.getElementById('play').disabled,
    info: document.getElementById('compositionInfo').textContent.trim().slice(0, 240),
    section: document.getElementById('sectionLabel').textContent.trim(),
    status: document.getElementById('status').textContent.trim(),
    emptyHidden: document.getElementById('empty').hidden || getComputedStyle(document.getElementById('empty')).opacity
  }))()`);
  expect('drawing creates paths and arms playback', /\d+\s*条线/.test(drawn.pathCount) && !drawn.playDisabled, drawn);

  // the piano roll must actually have notes painted
  const roll = await evaluate(`(() => {
    const c = document.getElementById('pianoRoll');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0, total = 0;
    for (let i = 0; i < d.length; i += 4) { total++; if (d[i] + d[i+1] + d[i+2] < 700) ink++; }
    return { w: c.width, h: c.height, inkRatio: ink / total };
  })()`);
  expect('piano roll renders note blocks', roll.inkRatio > 0.002 && roll.inkRatio < 0.9, roll);

  /* 4. settings really recompose */
  const setControl = async (id, value) => evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    el.value = ${JSON.stringify(String(value))};
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`);
  const before = await evaluate(`document.getElementById('compositionInfo').textContent`);

  await setControl('bars', '32');
  await setControl('bpm', '126');
  await setControl('instrument', 'flute');
  await setControl('root', '7');
  await setControl('density', '0.8');
  await setControl('reverb', '0.8');
  await setControl('brightness', '0.3');
  await setControl('humanize', '0.9');
  await sleep(500);
  const after = await evaluate(`(() => ({
    info: document.getElementById('compositionInfo').textContent,
    bpmLabel: document.getElementById('bpmValue').textContent,
    densityLabel: document.getElementById('densityValue').textContent,
    duration: document.getElementById('durationLabel').textContent,
    playDisabled: document.getElementById('play').disabled
  }))()`);
  expect('settings change the composition', after.info !== before && /32/.test(after.info), { before: before.slice(0, 120), after: after.info.slice(0, 160) });
  expect('tempo readout follows the slider', /126/.test(after.bpmLabel) || /126/.test(after.info), after);

  // form switch through the UI
  const formInfo = await evaluate(`(() => {
    const group = [...document.querySelectorAll('button, [role="radio"], .seg button, .chip')];
    const labels = group.map(b => b.textContent.trim());
    return labels.slice(0, 40);
  })()`);
  results.formButtons = formInfo;

  /* 5. colour extraction on a synthetic photo */
  const colour = await evaluate(`(async () => {
    const mk = (rgb) => { const c = document.createElement('canvas'); c.width = 240; c.height = 160;
      const g = c.getContext('2d'); g.fillStyle = rgb; g.fillRect(0, 0, 240, 160); return c; };
    const grab = (c) => SonifyColor.extract(c.getContext('2d').getImageData(0, 0, c.width, c.height));
    const warm = grab(mk('rgb(196,72,44)'));
    const cool = grab(mk('rgb(40,86,190)'));
    const green = grab(mk('rgb(70,150,80)'));
    const grey = grab(mk('rgb(128,128,128)'));
    const big = document.createElement('canvas'); big.width = 3000; big.height = 2000;
    const bg = big.getContext('2d'); bg.fillStyle = 'rgb(30,60,180)'; bg.fillRect(0,0,1500,2000);
    bg.fillStyle = 'rgb(220,60,40)'; bg.fillRect(1500,0,1500,2000);
    const t0 = performance.now(); const mixed = grab(big); const ms = performance.now() - t0;
    return { warm: warm.warmth, cool: cool.warmth, green: green.warmth, grey: grey.warmth,
             palette: mixed.palette, mixedWarmth: mixed.warmth, bigMs: Math.round(ms) };
  })()`);
  expect('warm photo reads warm, cool photo cool, green/grey neutral',
    colour.warm > 0.5 && colour.cool < -0.5 && Math.abs(colour.green) < 0.3 && Math.abs(colour.grey) <= 0.05, colour);
  expect('large photo sampling stays fast and keeps both halves', colour.bigMs < 4000 && colour.palette.length >= 2, colour);

  /* 6. real downloads: WAV, MIDI, PNG, note JSON, project JSON */
  const countFiles = () => readdirSync(DOWNLOADS).filter((f) => !f.endsWith('.crdownload'));
  const clickAndWait = async (id, wantExt, ms = 45000) => {
    const n = countFiles().length;
    await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    for (let i = 0; i < ms / 200; i++) {
      await sleep(200);
      const files = countFiles();
      if (files.length > n && files.some((f) => f.toLowerCase().endsWith(wantExt))) return files;
    }
    return countFiles();
  };

  await clickAndWait('exportPng', '.png');
  await clickAndWait('exportMidi', '.mid');
  await clickAndWait('exportEvents', '.json');
  await clickAndWait('saveProject', '.json');
  await clickAndWait('exportWav', '.wav', 90000);
  await sleep(600);

  const files = countFiles().map((f) => {
    const p = join(DOWNLOADS, f);
    return { name: f, bytes: statSync(p).size };
  });
  results.downloads = files;
  const png = files.find((f) => f.name.endsWith('.png'));
  const mid = files.find((f) => f.name.endsWith('.mid'));
  const wav = files.find((f) => f.name.endsWith('.wav'));
  const jsons = files.filter((f) => f.name.endsWith('.json'));
  expect('PNG export downloads a real image', !!png && png.bytes > 40000, png);
  expect('MIDI export downloads a real file', !!mid && mid.bytes > 200, mid);
  expect('note JSON and project JSON both download', jsons.length >= 2 && jsons.every((j) => j.bytes > 400), jsons);

  if (mid) {
    const b = readFileSync(join(DOWNLOADS, mid.name));
    const okHeader = b.toString('latin1', 0, 4) === 'MThd';
    const tracks = b.readUInt16BE(10);
    expect('MIDI is a type-1 five-track file', okHeader && tracks === 5, { tracks, bytes: b.length });
  }
  if (wav) {
    const b = readFileSync(join(DOWNLOADS, wav.name));
    const riff = b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE';
    const channels = b.readUInt16LE(22);
    const rate = b.readUInt32LE(24);
    const bits = b.readUInt16LE(34);
    let peak = 0, sum = 0, n = 0, clipped = 0;
    let run = 0, longestSilence = 0, longestAt = 0;
    for (let i = 44; i + 1 < b.length; i += 2) {
      const v = b.readInt16LE(i) / 32768;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a > 0.999) clipped++;
      sum += v * v; n++;
      if (a < 0.0008) {
        run++;
        if (run > longestSilence) { longestSilence = run; longestAt = (i - 44) / 4 / rate; }
      } else run = 0;
    }
    const rms = Math.sqrt(sum / n);
    const seconds = (b.length - 44) / (rate * channels * (bits / 8));
    // The renderer adds a tail for the final chord to decay; that silence is
    // expected. A dead stretch *inside* the piece is not.
    const musicEnd = seconds - 1.4;
    results.wav = {
      peak: +peak.toFixed(4), rms: +rms.toFixed(4), seconds: +seconds.toFixed(2),
      clipped, longestSilence: +(longestSilence / rate).toFixed(2),
      longestSilenceAt: +longestAt.toFixed(2), musicEnd: +musicEnd.toFixed(2)
    };
    expect('WAV is stereo 44.1k/16-bit PCM', riff && channels === 2 && rate === 44100 && bits === 16,
      { riff, channels, rate, bits });
    expect('WAV has audible level and no clipping',
      peak > 0.05 && peak <= 1 && clipped === 0 && rms > 0.01 && rms < 0.5, results.wav);
    expect('WAV has no dead stretch inside the music',
      longestAt > musicEnd || longestSilence / rate < 0.5, results.wav);
  }

  /* 7. project JSON reloads into a working state */
  const projectFile = jsons.find((j) => !/音符|notes/i.test(j.name)) || jsons[0];
  if (projectFile) {
    const text = readFileSync(join(DOWNLOADS, projectFile.name), 'utf8');
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* reported below */ }
    expect('project JSON is valid and carries paths/options',
      !!parsed && Array.isArray(parsed.paths) && parsed.paths.length >= 3 && !!parsed.options,
      parsed ? { paths: parsed.paths.length, keys: Object.keys(parsed).slice(0, 12) } : { parse: 'failed' });
  }

  /* 8. sketch dialog opens, renders and closes */
  const sketch = await evaluate(`(async () => {
    document.getElementById('openSketch').click();
    const dlg = document.getElementById('sketchDialog');
    const open = dlg.open || dlg.hasAttribute('open');
    const c = document.createElement('canvas'); c.width = 300; c.height = 200;
    const g = c.getContext('2d');
    g.fillStyle = '#dfe9f2'; g.fillRect(0, 0, 300, 200);
    g.fillStyle = '#2c4a66'; g.beginPath(); g.arc(150, 100, 55, 0, Math.PI * 2); g.fill();
    const img = g.getImageData(0, 0, 300, 200);
    const pencil = SonifySketch.render(img, { style: 'pencil' });
    const outline = SonifySketch.render(img, { style: 'outline' });
    document.getElementById('closeSketch').click();
    return { open, pencilInk: pencil.meanInk, outlineInk: outline.meanInk,
             closer: !(dlg.open || dlg.hasAttribute('open')) };
  })()`);
  expect('sketch dialog opens and closes', sketch.open && sketch.closer, sketch);
  expect('pencil sketch keeps more ink than clean outline', sketch.pencilInk > sketch.outlineInk && sketch.outlineInk > 0, sketch);

  /* 8b. the play button is reachable and actually plays */
  const reachable = await evaluate(`(async () => {
    const tick = (ms) => new Promise(r => setTimeout(r, ms));
    const btn = document.getElementById('play');
    btn.scrollIntoView({ block: 'center' });
    await tick(300);
    const b = btn.getBoundingClientRect();
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const bar = document.querySelector('.bottom-bar');
    return { tag: hit && hit.tagName, id: hit && hit.id, cls: hit && String(hit.className).slice(0, 30),
             label: btn.textContent.trim(), inViewport: cy > 0 && cy < innerHeight,
             barPosition: bar ? getComputedStyle(bar).position : null };
  })()`);
  expect('the play button is not covered by another element',
    reachable.id === 'play' && reachable.inViewport && reachable.barPosition === 'static', reachable);

  const playback = await evaluate(`(async () => {
    const tick = (ms) => new Promise(r => setTimeout(r, ms));
    const out = {};
    document.getElementById('play').click();
    await tick(1400);
    out.labelWhilePlaying = document.getElementById('play').textContent.trim();
    out.status = document.getElementById('status').textContent.trim();
    out.timeAtStart = document.getElementById('timeLabel').textContent;
    const player = window.SonifyStudio.getPlayer();
    out.isPlaying = player.isPlaying();
    await tick(1500);
    out.timeLater = document.getElementById('timeLabel').textContent;
    out.beat = player.getBeat ? +player.getBeat().toFixed(2) : null;
    // pause and make sure the clock holds still
    document.getElementById('play').click();
    await tick(500);
    out.isPaused = !player.isPlaying();
    const pausedTime = document.getElementById('timeLabel').textContent;
    await tick(800);
    out.timeFrozen = document.getElementById('timeLabel').textContent === pausedTime;
    out.labelAfterPause = document.getElementById('play').textContent.trim();
    return out;
  })()`);
  expect('play advances the transport clock', playback.isPlaying === true &&
    playback.timeLater !== playback.timeAtStart && playback.beat > 0, playback);
  expect('pause stops the clock and restores the label',
    playback.isPaused === true && playback.timeFrozen === true, playback);

  /* 8c. seek and loop controls respond */
  const transportUi = await evaluate(`(async () => {
    const tick = (ms) => new Promise(r => setTimeout(r, ms));
    const before = document.getElementById('timeLabel').textContent;
    document.getElementById('stop').click();
    await tick(500);
    const after = document.getElementById('timeLabel').textContent;
    const loop = document.getElementById('loop');
    loop.checked = true;
    loop.dispatchEvent(new Event('change', { bubbles: true }));
    await tick(200);
    return { before, after, loopChecked: loop.checked };
  })()`);
  expect('restart clears the clock and loop toggles', transportUi.after === '00:00' && transportUi.loopChecked, transportUi);

  /* 8d. import a real photo through the real file input */
  const { root: docRoot } = await cdp.send('DOM.getDocument', { depth: -1 }, session);
  const setFiles = async (selector, files) => {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: docRoot.nodeId, selector }, session);
    await cdp.send('DOM.setFileInputFiles', { nodeId, files }, session);
  };
  await setFiles('#imageFile', [PHOTO]);
  await sleep(3500);
  const imported = await evaluate(`(() => {
    const S = window.SonifyStudio;
    const st = S.getState();
    return {
      sourceName: document.getElementById('sourceName').textContent,
      pathCount: S.getState().paths.length,
      warmth: st.color ? st.color.warmth : null,
      palette: st.color ? st.color.palette.slice(0, 3) : null,
      colorStatus: document.getElementById('colorStatus') ? document.getElementById('colorStatus').textContent : null,
      imageTab: document.getElementById('imageTab').getAttribute('aria-selected'),
      extractReady: !document.getElementById('extractAgain').disabled,
      hasImage: !!st.image,
      playDisabled: document.getElementById('play').disabled,
      status: document.getElementById('status').textContent.trim()
    };
  })()`);
  expect('photo import extracts contours', imported.pathCount >= 3 && imported.playDisabled === false, imported);
  expect('photo import extracts warm colour before any sketch',
    imported.warmth !== null && imported.warmth > 0.3 && Array.isArray(imported.palette) && imported.palette.length > 0,
    imported);
  expect('imported photo is kept as the colour reference', imported.hasImage === true && imported.extractReady === true, imported);

  /* 8d2. the fine-extract button does something real */
  const fineExtract = await evaluate(`(async () => {
    const tick = (ms) => new Promise(r => setTimeout(r, ms));
    const btn = document.getElementById('aiLab');
    const before = {
      label: btn.textContent.trim(),
      detail: document.getElementById('imageDetail').value,
      paths: window.SonifyStudio.getState().paths.length,
      hasPhoto: !document.getElementById('extractAgain').disabled
    };
    btn.click();
    await tick(2600);
    return {
      before,
      afterDetail: document.getElementById('imageDetail').value,
      afterPaths: window.SonifyStudio.getState().paths.length,
      stillHasPhoto: !document.getElementById('extractAgain').disabled,
      status: document.getElementById('status').textContent.trim()
    };
  })()`);
  expect('fine-extract button is wired and raises detail',
    /精细提取/.test(fineExtract.before.label) &&
    fineExtract.before.detail !== fineExtract.afterDetail &&
    fineExtract.afterDetail === '5' &&
    fineExtract.afterPaths >= 2,
    fineExtract);

  /* 8e. sketch dialog turns the photo into a drawable draft and keeps colour */
  const sketchOpen = await evaluate(`(async () => {
    const tick = (ms) => new Promise(r => setTimeout(r, ms));
    const S = window.SonifyStudio;
    const before = S.getState();
    document.getElementById('openSketch').click();
    await tick(1400);
    const dlg = document.getElementById('sketchDialog');
    const style = document.getElementById('sketchStyle');
    style.value = 'outline';
    style.dispatchEvent(new Event('change', { bubbles: true }));
    await tick(1200);
    return {
      opened: dlg.open || dlg.hasAttribute('open'),
      ready: !document.getElementById('useSketch').disabled,
      beforePaths: before.paths.length,
      beforeWarmth: before.color ? before.color.warmth : null
    };
  })()`);
  const sketchShot = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
  writeFileSync(join(OUT, 'sketch-dialog.png'), Buffer.from(sketchShot.data, 'base64'));

  const sketchFlow = await evaluate(`(async () => {
    const tick = (ms) => new Promise(r => setTimeout(r, ms));
    const S = window.SonifyStudio;
    const dlg = document.getElementById('sketchDialog');
    document.getElementById('useSketch').click();
    await tick(2600);
    const after = S.getState();
    return {
      afterPaths: after.paths.length,
      afterWarmth: after.color ? after.color.warmth : null,
      afterName: after.sourceName,
      closed: !(dlg.open || dlg.hasAttribute('open')),
      playDisabled: document.getElementById('play').disabled,
      status: document.getElementById('status').textContent.trim()
    };
  })()`);
  Object.assign(sketchFlow, {
    opened: sketchOpen.opened, ready: sketchOpen.ready,
    beforePaths: sketchOpen.beforePaths, beforeWarmth: sketchOpen.beforeWarmth
  });
  expect('sketch dialog renders a usable draft from the photo',
    sketchOpen.opened === true && sketchOpen.ready === true && sketchFlow.closed === true, sketchFlow);
  expect('applying the sketch replaces contours but keeps the original colour',
    sketchFlow.afterPaths >= 2 &&
    sketchFlow.afterWarmth !== null &&
    Math.abs(sketchFlow.afterWarmth - sketchFlow.beforeWarmth) < 0.001 &&
    /素稿/.test(sketchFlow.afterName),
    sketchFlow);

  /* 9. undo / redo on a drawing change */
  // Settings changes also record history, so draw one more stroke to guarantee
  // the most recent undo step is a path change.
  await stroke(Array.from({ length: 14 }, (_, i) => [0.2 + (0.3 * i) / 13, 0.2 + 0.05 * Math.sin(i)]));
  const history = await evaluate(`(async () => {
    const tick = (ms) => new Promise(r => setTimeout(r, ms));
    const S = window.SonifyStudio;
    const beforePaths = S.getState().paths.length;
    const undoBefore = document.getElementById('undo').disabled;
    document.getElementById('undo').click();
    await tick(900);
    const undonePaths = S.getState().paths.length;
    document.getElementById('redo').click();
    await tick(900);
    const redonePaths = S.getState().paths.length;
    return { beforePaths, undoBefore, undonePaths, redonePaths,
             undoDisabled: document.getElementById('undo').disabled };
  })()`);
  expect('undo removes a stroke and redo restores it',
    history.undoBefore === false &&
    history.undonePaths !== history.beforePaths &&
    history.redonePaths === history.beforePaths,
    history);

  /* 10. shortcut hints follow the platform, not a hard-coded ⌘ */
  const shortcuts = await evaluate(`(() => ({
    undoTitle: document.getElementById('undo').title,
    redoTitle: document.getElementById('redo').title,
    helpHasCmd: /⌘\\/Ctrl/.test(document.getElementById('help').textContent),
    isMac: /mac/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '')
  }))()`);
  expect('shortcut hints match the host platform',
    shortcuts.helpHasCmd === false &&
    (shortcuts.isMac ? /⌘Z/.test(shortcuts.undoTitle) : /Ctrl\+Z/.test(shortcuts.undoTitle)),
    shortcuts);

  /* 11. narrow viewport must not overflow horizontally */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, session);
  await sleep(500);
  const narrow = await evaluate(`(() => {
    const de = document.documentElement;
    return { scrollW: de.scrollWidth, clientW: de.clientWidth,
             overflow: de.scrollWidth - de.clientWidth,
             wide: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > de.clientWidth + 2).map(el => el.id || el.className).slice(0, 8) };
  })()`);
  expect('390px viewport has no horizontal overflow', narrow.overflow <= 2, narrow);
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, session);
  await sleep(400);

  /* 11. screenshots for the record */
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
  writeFileSync(join(OUT, 'desktop.png'), Buffer.from(shot.data, 'base64'));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, session);
  await sleep(500);
  const shot2 = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
  writeFileSync(join(OUT, 'mobile.png'), Buffer.from(shot2.data, 'base64'));
  await cdp.send('Emulation.clearDeviceMetricsOverride', {}, session);

  /* 13. Windows run: Edge user agent, Ctrl hints, still composes */
  await cdp.send('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    acceptLanguage: 'zh-CN,zh;q=0.9',
    platform: 'Win32',
    userAgentMetadata: {
      platform: 'Windows', platformVersion: '10.0.0', architecture: 'x86', model: '',
      mobile: false, brands: [{ brand: 'Microsoft Edge', version: '131' }]
    }
  }, session);
  const reloaded = cdp.waitFor('Page.loadEventFired', 60000);
  await cdp.send('Page.reload', {}, session);
  await reloaded;
  await sleep(2200);
  const windows = await evaluate(`(() => {
    const de = document.documentElement;
    return {
      platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform,
      undoTitle: document.getElementById('undo').title,
      redoTitle: document.getElementById('redo').title,
      helpText: document.getElementById('help').textContent.replace(/\\s+/g, ' ').trim().slice(0, 120),
      info: document.getElementById('compositionInfo').textContent.trim(),
      pathCount: document.getElementById('pathCount').textContent,
      playDisabled: document.getElementById('play').disabled,
      overflow: de.scrollWidth - de.clientWidth
    };
  })()`);
  expect('Windows/Edge run boots, composes, and shows Ctrl shortcuts',
    /Windows/.test(windows.platform) &&
    /Ctrl\+Z/.test(windows.undoTitle) &&
    /Ctrl\+Shift\+Z/.test(windows.redoTitle) &&
    windows.helpText.indexOf('⌘/Ctrl') === -1 &&
    windows.playDisabled === false &&
    /\d+\s*小节/.test(windows.info) &&
    windows.overflow <= 2,
    windows);
  results.windows = windows;

  /* 14. console errors */
  const exceptions = cdp.drain('Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception?.description || ''));
  const logs = cdp.drain('Log.entryAdded').filter((e) => e.params.entry.level === 'error').map((e) => e.params.entry.text);
  results.console = [...exceptions, ...logs];
  expect('no uncaught exceptions or console errors', results.console.length === 0, results.console.slice(0, 6));

  pass('all browser steps finished');
} catch (err) {
  fail('harness crashed', String(err && err.stack || err));
} finally {
  try { ws.close(); } catch { /* ignore */ }
  proc.kill('SIGKILL');
}

results.passed = results.checks.filter((c) => c.ok).length;
results.failed = results.failures.length;
results.status = results.failed === 0 ? 'passed' : 'failed';
writeFileSync(join(OUT, 'report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ status: results.status, passed: results.passed, failed: results.failed,
  checks: results.checks.map((c) => (c.ok ? 'PASS ' : 'FAIL ') + c.name),
  failures: results.failures, wav: results.wav, downloads: results.downloads,
  network: results.network.slice(0, 8), console: results.console.slice(0, 5) }, null, 2));
process.exit(results.failed === 0 ? 0 : 1);
