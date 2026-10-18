/*
 * Small reusable page inspector: open the built app in headless Chrome at a
 * chosen viewport, run an expression from a file, print the JSON result.
 *
 * Usage: node tools/inspect.mjs <width> <height> <expr-file> [html]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const WIDTH = Number(process.argv[2] || 390);
const HEIGHT = Number(process.argv[3] || 844);
const EXPR = readFileSync(process.argv[4], 'utf8');
const ENTRY = resolve(process.argv[5] || join(ROOT, 'MusicPaint-V4.0.html'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9340;
const PROFILE = '/tmp/sonify-inspect-profile';

rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(PROFILE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-crash-reporter', '--disable-breakpad',
  '--remote-debugging-port=' + PORT, '--remote-allow-origins=*', '--user-data-dir=' + PROFILE,
  '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files',
  `--window-size=${WIDTH},${Math.max(600, HEIGHT)}`, 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(250);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    wsUrl = (await r.json()).webSocketDebuggerUrl;
  } catch { /* not up */ }
}
if (!wsUrl) { proc.kill('SIGKILL'); throw new Error('no devtools endpoint'); }

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
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride',
  { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: WIDTH < 760 }, sessionId);
await send('Page.navigate', { url: 'file://' + ENTRY }, sessionId);
await sleep(2200);

const r = await send('Runtime.evaluate',
  { expression: EXPR, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
if (r.exceptionDetails) {
  console.error('PAGE ERROR:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  proc.kill('SIGKILL');
  process.exit(2);
}
console.log(JSON.stringify(r.result.value, null, 2));
ws.close();
proc.kill('SIGKILL');
process.exit(0);
