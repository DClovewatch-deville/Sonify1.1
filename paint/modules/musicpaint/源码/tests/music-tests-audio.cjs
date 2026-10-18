'use strict';
// Web Audio API contract tests using an instrumented clock/context.
// These tests do not assert perceptual audio quality or native browser rendering.
const assert = require('node:assert/strict');
const engine = require('../music.js');
const contexts = [];
const intervals = new Map(); let nextTimer = 1;
const originalInterval = global.setInterval, originalClear = global.clearInterval;
global.setInterval = fn => { const id = nextTimer++; intervals.set(id, fn); return id; };
global.clearInterval = id => intervals.delete(id);
class Param {
  constructor(value = 0) { this.value = value; this.history = []; }
  setValueAtTime(value, time) { assert(Number.isFinite(value) && Number.isFinite(time)); this.value = value; this.history.push({ value, time }); }
  linearRampToValueAtTime(value, time) { this.setValueAtTime(value, time); }
  exponentialRampToValueAtTime(value, time) { assert(value > 0); this.setValueAtTime(value, time); }
  setTargetAtTime(value, time, constant) { assert(constant > 0); this.setValueAtTime(value, time); }
  cancelScheduledValues(time) { assert(Number.isFinite(time)); }
}
class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.gain = new Param(1); this.frequency = new Param(440); this.detune = new Param(); this.Q = new Param(); this.playbackRate = new Param(1); this.threshold = new Param(); this.knee = new Param(); this.ratio = new Param(); this.attack = new Param(); this.release = new Param(); }
  connect(target) { assert(target); return target; }
  disconnect() { this.disconnected = true; }
  start(time, offset = 0) { assert(time >= 0 && offset >= 0); this.startTime = time; this.offset = offset; this.ctx.started.push(this); }
  stop(time) { assert(Number.isFinite(time)); this.stopTime = time; this.ctx.stopped.push(this); }
}
class Buffer {
  constructor(channels, length, rate) { this.length = length; this.sampleRate = rate; this.numberOfChannels = channels; this.duration = length / rate; this.channels = Array.from({ length: channels }, () => new Float32Array(length)); }
  getChannelData(c) { return this.channels[c]; }
}
class Context {
  constructor() { this.sampleRate = 44100; this.currentTime = 0; this.state = 'suspended'; this.destination = {}; this.started = []; this.stopped = []; this.decodes = 0; contexts.push(this); }
  createGain() { return new Node(this, 'gain'); }
  createDynamicsCompressor() { return new Node(this, 'compressor'); }
  createWaveShaper() { return new Node(this, 'limiter'); }
  createConvolver() { return new Node(this, 'convolver'); }
  createBiquadFilter() { return new Node(this, 'filter'); }
  createOscillator() { return new Node(this, 'oscillator'); }
  createBufferSource() { return new Node(this, 'sample'); }
  createBuffer(channels, length, rate) { return new Buffer(channels, length, rate); }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  async decodeAudioData(bytes) { this.decodes++; if (new Uint8Array(bytes)[0] === 102) throw new Error('fixture decode failure'); const buffer = new Buffer(1, 441000, 44100); buffer.channels[0].fill(.4); return buffer; }
}
class OfflineContext extends Context {
  constructor(channels, length, rate) { super(); this.output = new Buffer(channels, length, rate); }
  async startRendering() { for (let c = 0; c < this.output.numberOfChannels; c++) for (let i = 0; i < this.output.length; i++) this.output.channels[c][i] = Math.sin(i * .1) * 1.1; return this.output; }
}
global.AudioContext = Context; global.OfflineAudioContext = OfflineContext;
global.SonifySamples = { license: 'test fixture', samples: [{ instrument: 'piano', midi: 60, data: 'data:audio/wav;base64,AA==' }, { instrument: 'strings', midi: 60, data: 'data:audio/wav;base64,AQ==' }] };
const score = engine.compose([{ id: 'line', points: [{ x: 0, y: .2 }, { x: 1, y: .8 }] }], { bars: 4, humanize: 0 });
async function run() {
  const player = engine.createPlayer();
  assert.equal(await player.play(score), true);
  assert(player.isPlaying()); assert.equal(intervals.size, 1);
  const ctx = contexts[0];
  assert.equal(ctx.state, 'running'); assert.equal(ctx.decodes, 1);
  assert.equal(player.getAudioStatus().mode, 'sampled'); assert.equal(player.getAudioStatus().loaded, 1);
  assert(ctx.started.some(node => node.kind === 'sample'));
  ctx.currentTime = 1.25;
  const beforePause = player.getBeat(); const paused = player.pause();
  assert.equal(paused, beforePause); assert(!player.isPlaying()); assert.equal(intervals.size, 0);
  ctx.currentTime += 10; assert.equal(player.getBeat(), paused, 'paused position must not follow wall-clock time');
  const startCount = ctx.started.length;
  await player.play(score, { offsetBeat: paused });
  assert.equal(ctx.decodes, 1, 'decoded audio must be reused');
  assert(ctx.started.slice(startCount).some(node => node.kind === 'sample' && node.offset > 0), 'seek must resume sample position');
  assert.equal(intervals.size, 1, 'play must replace timer');
  const count = ctx.started.length; player.setMuted(['melody', 'harmony']);
  assert(!ctx.started.slice(count).some(node => node.kind === 'sample'), 'muted sampler tracks must not restart');
  player.setVolume(.35); player.stop(); assert.equal(player.getBeat(), 0); assert.equal(intervals.size, 0);
  await player.play(score, { loop: true }); ctx.currentTime += 60;
  for (const callback of intervals.values()) callback();
  assert(player.isPlaying()); assert(player.getBeat() < .1, 'loop must restart with a fresh audio clock origin');
  player.stop();
  const pending = player.play(score); player.stop(); assert.equal(await pending, false, 'stop must cancel an in-flight async play');
  assert.equal(intervals.size, 0);
  await player.preview(60, 'piano');
  await player.dispose(); assert.equal(ctx.state, 'closed'); assert.equal(intervals.size, 0);
  const wav = await engine.renderWav(score, { muted: ['pulse'] });
  const bytes = new Uint8Array(await wav.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...bytes.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), 44100); assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), bytes.length - 44);
  let peak = 0;
  for (let i = 44; i < bytes.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
  assert(peak > 10000 && peak <= Math.ceil(32768 * .96), 'WAV normalizer must prevent clipping');
  global.SonifySamples.samples.push({ instrument: 'flute', midi: 72, data: 'data:audio/wav;base64,ZmFpbA==' });
  const retry = engine.createPlayer(); await retry.play(engine.compose([{id:'line',points:[{x:0,y:.2},{x:1,y:.8}]}], {bars:4,instrument:'flute'}));
  assert.equal(retry.getAudioStatus().loaded, 1); assert(retry.getAudioStatus().warnings.length); await retry.dispose();
  console.log(JSON.stringify({ status: 'passed', method: 'instrumented Web Audio API contract tests; not native rendering or listening', checks: ['audio unlock', 'sample decode/cache', 'pause clock', 'seek sample offset', 'mute', 'timer ownership', 'loop', 'async cancellation', 'preview and disposal', 'stereo PCM WAV encoding and clipping ceiling', 'decode-error fallback'] }, null, 2));
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.setInterval = originalInterval; global.clearInterval = originalClear; });
