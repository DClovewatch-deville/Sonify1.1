/*
 * Offline self-containment verifier.
 *
 * Proves that the built single-file HTML needs nothing but itself:
 * no external script/style/img refs, no CSS @import, no absolute http(s) URLs
 * in loading positions, and no runtime network calls in the shipped code.
 *
 * Usage: node tools/verify-build.mjs [path-to-html]
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FILE = resolve(process.argv[2] || resolve(ROOT, 'MusicPaint-V4.0.html'));

const buf = readFileSync(FILE);
const html = buf.toString('utf8');
const sha256 = createHash('sha256').update(buf).digest('hex');
const size = statSync(FILE).size;

const problems = [];
const notes = [];

/* 1. no external element references */
const externalScript = html.match(/<script\b[^>]*\ssrc\s*=/gi) || [];
const externalLink = html.match(/<link\b[^>]*\shref\s*=\s*"(?!#)[^"]*"/gi) || [];
const externalImg = html.match(/<img\b[^>]*\ssrc\s*=\s*"(?!data:)[^"]*"/gi) || [];
const externalMedia = html.match(/<(video|audio|source|iframe)\b[^>]*\s(src|href)\s*=\s*"(?!data:|blob:)[^"]*"/gi) || [];
if (externalScript.length) problems.push('external <script src>: ' + externalScript.join(' '));
if (externalLink.length) problems.push('external <link href>: ' + externalLink.join(' '));
if (externalImg.length) problems.push('external <img src>: ' + externalImg.join(' '));
if (externalMedia.length) problems.push('external media/iframe: ' + externalMedia.join(' '));

/* 2. no CSS imports or remote font/asset URLs */
const cssImports = html.match(/@import\s+(?:url\()?\s*["']?[^;]+/gi) || [];
if (cssImports.length) problems.push('CSS @import: ' + cssImports.slice(0, 3).join(' | '));
const remoteCssUrls = html.match(/url\(\s*["']?(https?:)?\/\//gi) || [];
if (remoteCssUrls.length) problems.push('remote url() in CSS: ' + remoteCssUrls.slice(0, 3).join(' | '));

/* 3. no runtime network calls in shipped code */
const runtimePatterns = [
  [/\bfetch\s*\(/g, 'fetch('],
  [/XMLHttpRequest/g, 'XMLHttpRequest'],
  [/new\s+WebSocket\s*\(/g, 'new WebSocket('],
  [/navigator\.sendBeacon/g, 'navigator.sendBeacon'],
  [/importScripts\s*\(/g, 'importScripts(']
];
for (const [re, label] of runtimePatterns) {
  const hits = html.match(re) || [];
  if (hits.length) problems.push('runtime network call ' + label + ' x' + hits.length);
}

/* 4. the content-security-policy must forbid connections */
const csp = (html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i) || [])[1] || '';
if (!/connect-src\s+'none'/.test(csp)) problems.push('CSP does not set connect-src \'none\'');
if (!/default-src\s+'self'/.test(csp)) notes.push('CSP default-src is not \'self\'');

/* 5. embedded assets and expected modules must be present */
const embeddedPng = (html.match(/data:image\/png;base64,/g) || []).length;
const embeddedWav = (html.match(/data:audio\/wav;base64,/g) || []).length;
const modules = ['SonifyVision', 'SonifyColor', 'SonifyClassical', 'SonifyMusic', 'SonifySketch', 'SonifyPhoto', 'SonifyStudio'];
for (const m of modules) if (!html.includes(m)) problems.push('missing module: ' + m);
if (!embeddedWav) problems.push('no embedded audio samples found');

/* 6. no leftover build placeholders */
if (html.includes('src="index.html"')) problems.push('unrewritten index.html link');
if (/<\/script\s*>\s*<\/script>/i.test(html)) problems.push('nested script close tag');

const report = {
  file: FILE,
  bytes: size,
  megabytes: +(size / 1024 / 1024).toFixed(2),
  sha256,
  embeddedPngDataUrls: embeddedPng,
  embeddedWavDataUrls: embeddedWav,
  inlineStyles: (html.match(/<style>/g) || []).length,
  inlineScripts: (html.match(/<script>/g) || []).length,
  csp,
  notes,
  problems,
  status: problems.length ? 'failed' : 'passed'
};
console.log(JSON.stringify(report, null, 2));
process.exit(problems.length ? 1 : 0);
