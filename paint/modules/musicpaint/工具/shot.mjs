/*
 * Screenshot helper: full-page capture of the built app at a given viewport.
 * Usage: node tools/shot.mjs <width> <height> <out.png> [html] [action.js]
 * The optional action file is evaluated in the page before the capture.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const WIDTH = Number(process.argv[2] || 1440);
const HEIGHT = Number(process.argv[3] || 960);
const OUT = resolve(process.argv[4] || join(ROOT, 'outputs', 'shot.png'));
const ENTRY = resolve(process.argv[5] || join(ROOT, 'MusicPaint-V4.0.html'));
const ACTION = process.argv[6] ? readFileSync(process.argv[6], 'utf8') : null;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9342;
const PROFILE = '/tmp/sonify-shot-profile';

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad',
  '--remote-debugging-port=' + PORT, '--remote-allow-origins=*', '--user-data-dir=' + PROFILE,
  '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files',
  `--window-size=${WIDTH},${HEIGHT}`, 'about:blank'
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
  setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('timeout ' + method)); } }, 30000);
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride',
  { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: WIDTH < 760 }, sessionId);
await send('Page.navigate', { url: 'file://' + ENTRY }, sessionId);
await sleep(2400);

if (ACTION) {
  const r = await send('Runtime.evaluate',
    { expression: ACTION, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
  if (r.exceptionDetails) {
    console.error('ACTION ERROR:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    proc.kill('SIGKILL');
    process.exit(2);
  }
  await sleep(900);
}

const metrics = await send('Page.getLayoutMetrics', {}, sessionId);
const { width, height } = metrics.cssContentSize;
const shot = await send('Page.captureScreenshot',
  { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } }, sessionId);
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ out: OUT, width, height }));
ws.close();
proc.kill('SIGKILL');
process.exit(0);
