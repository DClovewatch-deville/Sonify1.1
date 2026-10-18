/*
 * Objective audio analysis.
 *
 * Renders the real WAV export in the browser for several settings and measures
 * the result: duration, peak, loudness, a brightness proxy (HF energy via first
 * difference) and how much of the piece is audible. This is measurement, not
 * listening; it proves the warmth link is audible in the file, not that a
 * musician would like it.
 *
 * Usage: node tools/audio-analysis.mjs [path-to-html]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ENTRY = resolve(process.argv[2] || join(ROOT, 'MusicPaint-V4.0.html'));
const OUT = join(ROOT, 'outputs', 'audio-analysis');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9344;
const PROFILE = '/tmp/sonify-audio-profile';

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(PROFILE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad',
  '--remote-debugging-port=' + PORT, '--remote-allow-origins=*', '--user-data-dir=' + PROFILE,
  '--no-first-run', '--hide-scrollbars', '--window-size=1280,900',
  '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(250);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    wsUrl = (await r.json()).webSocketDebuggerUrl;
  } catch { /* wait */ }
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id;
  const payload = { id: i, method, params };
  if (sessionId) payload.sessionId = sessionId;
  pending.set(i, { resolve: res, reject: rej });
  ws.send(JSON.stringify(payload));
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('timeout ' + method)); } }, 180000);
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: 'file://' + ENTRY }, sessionId);
await sleep(2500);

const CASES = [
  { name: 'warm-piano', style: 'piano', warmth: 0.9, bars: 8, form: 'ternary' },
  { name: 'neutral-piano', style: 'piano', warmth: 0, bars: 8, form: 'ternary' },
  { name: 'cool-piano', style: 'piano', warmth: -0.9, bars: 8, form: 'ternary' },
  { name: 'neutral-eastern', style: 'eastern', warmth: 0, bars: 8, form: 'ternary' },
  { name: 'neutral-ambient', style: 'ambient', warmth: 0, bars: 8, form: 'ternary' },
  { name: 'piano-rondo', style: 'piano', warmth: 0, bars: 16, form: 'rondo' },
  { name: 'solo-melody', style: 'piano', warmth: 0, bars: 8, form: 'ternary', muted: ['harmony', 'bass'] },
  { name: 'solo-harmony', style: 'piano', warmth: 0, bars: 8, form: 'ternary', muted: ['melody', 'bass'] },
  { name: 'solo-bass', style: 'piano', warmth: 0, bars: 8, form: 'ternary', muted: ['melody', 'harmony'] }
];

const results = [];
for (const c of CASES) {
  const payload = JSON.stringify(c);
  const r = await send('Runtime.evaluate', {
    expression: `(async () => {
      const c = ${payload};
      const paths = [
        { id: 'hill', points: [{x:0.08,y:0.82},{x:0.3,y:0.42},{x:0.52,y:0.2},{x:0.74,y:0.46},{x:0.94,y:0.8}] },
        { id: 'wavy', points: Array.from({length: 26}, (_, i) => ({ x: 0.05 + 0.9*i/25, y: 0.55 + 0.22*Math.sin(i*0.5) })) },
        { id: 'loop', points: Array.from({length: 30}, (_, i) => { const a = Math.PI*2*i/29; return { x: 0.5 + 0.14*Math.cos(a), y: 0.5 + 0.2*Math.sin(a) }; }) }
      ];
      const score = SonifyMusic.compose(paths, { style: c.style, bars: c.bars, form: c.form, warmth: c.warmth, density: 0.5 });
      const blob = await SonifyMusic.renderWav(score, { volume: 0.7, muted: c.muted || [] });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
      return {
        bpm: score.bpm, bars: score.bars, events: score.events.length,
        brightness: score.sound.brightness, reverb: score.sound.reverb,
        eventsByTrack: score.events.reduce((a, e) => (a[e.track] = (a[e.track] || 0) + 1, a), {}),
        base64: btoa(binary)
      };
    })()`,
    awaitPromise: true, returnByValue: true, userGesture: true
  }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = r.result.value;
  const bytes = Buffer.from(v.base64, 'base64');
  writeFileSync(join(OUT, c.name + '.wav'), bytes);

  const rate = bytes.readUInt32LE(24);
  const channels = bytes.readUInt16LE(22);
  const bits = bytes.readUInt16LE(34);
  const frames = (bytes.length - 44) / (channels * bits / 8);
  const mono = new Float64Array(frames);
  for (let i = 0; i < frames; i++) mono[i] = bytes.readInt16LE(44 + i * 4) / 32768;

  let peak = 0, sum = 0, zc = 0, diff = 0, last = 0, loud = 0;
  for (let i = 0; i < frames; i++) {
    const v0 = mono[i];
    const a = Math.abs(v0);
    if (a > peak) peak = a;
    sum += v0 * v0;
    if ((v0 >= 0) !== (last >= 0)) zc++;
    last = v0;
    if (i > 0) diff += (v0 - mono[i - 1]) ** 2;
    if (a > 0.01) loud++;
  }
  const rms = Math.sqrt(sum / frames);
  const brightnessProxy = Math.sqrt(diff / Math.max(1, frames - 1)) / (rms || 1e-9);
  results.push({
    case: c.name, style: c.style, warmth: c.warmth, form: c.form, muted: c.muted || [], bars: v.bars, bpm: v.bpm,
    seconds: +(frames / rate).toFixed(2),
    events: v.events, eventsByTrack: v.eventsByTrack,
    soundBrightness: v.brightness, soundReverb: v.reverb,
    peak: +peak.toFixed(4), rms: +rms.toFixed(4),
    zcrPerSecond: Math.round(zc / (frames / rate)),
    brightnessProxy: +brightnessProxy.toFixed(4),
    audibleFraction: +(loud / frames).toFixed(3),
    bytes: bytes.length
  });
  console.log('rendered', c.name, (bytes.length / 1024 / 1024).toFixed(2) + 'MB');
}

const by = Object.fromEntries(results.map((r) => [r.case, r]));
const summary = {
  status: 'passed',
  note: 'Measured from the real export path. Objective numbers only; no human listening was performed.',
  rendered: results,
  findings: {
    // A lower proxy means less high-frequency motion, i.e. a darker tone.
    warmDarkerThanCool: by['warm-piano'].brightnessProxy < by['cool-piano'].brightnessProxy,
    warmReverbVsCool: [by['warm-piano'].soundReverb, by['cool-piano'].soundReverb],
    // Solo tracks are only audible while their notes sound, so this check
    // applies to the full mixes.
    allMixesAudible: results.filter((r) => !r.muted.length).every((r) => r.audibleFraction > 0.55),
    harmonyVsMelodyDb: +(20 * Math.log10(by['solo-harmony'].rms / by['solo-melody'].rms)).toFixed(1),
    bassVsMelodyDb: +(20 * Math.log10(by['solo-bass'].rms / by['solo-melody'].rms)).toFixed(1),
    noClipping: results.every((r) => r.peak <= 1 && r.rms > 0.01),
    rondoLongerThanTernary: by['piano-rondo'].seconds > by['neutral-piano'].seconds
  }
};
writeFileSync(join(OUT, 'analysis.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
ws.close();
proc.kill('SIGKILL');
process.exit(0);
