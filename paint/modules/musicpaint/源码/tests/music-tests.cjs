'use strict';
const assert = require('node:assert/strict');
const engine = require('../music.js');
const paths = [
  { id: 'roof', points: [{ x: .1, y: .75 }, { x: .5, y: .15 }, { x: .9, y: .75 }] },
  { id: 'window', points: [{ x: .3, y: .6 }, { x: .7, y: .6 }, { x: .7, y: .85 }, { x: .3, y: .85 }] },
  { id: 'curve', points: Array.from({ length: 40 }, (_, i) => ({ x: i / 39, y: .5 + .35 * Math.sin(i * .23) })) }
];
let combinations = 0;
for (const style of ['piano', 'eastern', 'ambient']) for (const mode of ['compose', 'literal'])
  for (const bars of [2, 3, 4, 8, 16, 32]) for (const root of [0, 1, 6, 11]) for (const density of [0, .5, 1]) {
    const score = engine.compose(paths, { style, mode, bars, root, density });
    assert.deepEqual(score, engine.compose(paths, { style, mode, bars, root, density }), 'composition must be reproducible');
    assert.equal(score.totalBeats, bars * 4);
    assert.equal(score.tracks.length, 4);
    const boundaries = [];
    for (const event of score.events) {
      assert(Number.isInteger(event.midi) && event.midi >= 0 && event.midi <= 127);
      assert(event.start >= 0 && event.duration > 0 && event.start + event.duration <= score.totalBeats + 1e-6);
      assert(event.velocity > 0 && event.velocity <= 1);
      assert(paths.some(path => path.id === event.sourceId));
      assert(event.sourcePoint.x >= 0 && event.sourcePoint.x <= 1 && event.sourcePoint.y >= 0 && event.sourcePoint.y <= 1);
      assert.equal(typeof event.ruleId, 'string');
      boundaries.push([event.start, 1, event.track], [event.start + event.duration, -1, event.track]);
    }
    boundaries.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const active = { melody: 0, harmony: 0, bass: 0, pulse: 0 };
    for (const boundary of boundaries) {
      active[boundary[2]] += boundary[1];
      assert(active.melody <= 1 && active.harmony <= 3 && active.bass <= 1 && active.pulse <= 1, 'voice budget exceeded');
      assert(Object.values(active).reduce((a, b) => a + b, 0) <= 6);
    }
    if (mode === 'compose') {
      const melody = score.events.filter(event => event.track === 'melody');
      for (let i = 1; i < melody.length; i++) assert(Math.abs(melody[i].midi - melody[i - 1].midi) <= 7, 'melody leap exceeded seven semitones');
      assert.equal((melody.at(-1).midi - root + 120) % 12, 0, 'last melody note must resolve to tonic');
    } else assert(score.events.every(event => event.track === 'melody'));
    combinations++;
  }

assert.equal(engine.compose(null).events.length, 0);
assert.equal(engine.compose({}).events.length, 0);
assert.equal(engine.compose([{ points: [{ x: NaN, y: 0 }] }]).diagnostics.discardedPaths, 1);
assert(engine.compose([{ points: [{ x: 0.5, y: 0.5 }] }]).events.length > 0);
assert.notDeepEqual(engine.compose(paths).events, engine.compose(paths.map(p => ({ ...p, points: p.points.map(v => ({ x: v.x, y: 1 - v.y })) }))).events);
// --- legacy-engine regression -------------------------------------------------
// The corner-accent and closed-contour rules belong to the pre-classical
// arrangement. They are kept as real assertions, but run explicitly through
// arrangement:'legacy' so the classical engine is not forced to imitate them.
const straight = engine.compose([{ id: 'shape', points: [{ x: 0, y: .5 }, { x: .5, y: .5 }, { x: 1, y: .5 }] }], { bars: 4, humanize: 0, arrangement: 'legacy' });
const corner = engine.compose([{ id: 'shape', points: [{ x: 0, y: .5 }, { x: .5, y: 0 }, { x: 1, y: .5 }] }], { bars: 4, humanize: 0, arrangement: 'legacy' });
const straightMelody = straight.events.filter(e => e.track === 'melody');
const cornerMelody = corner.events.filter(e => e.track === 'melody');
assert(straightMelody.every(e => e.geometryFeature.turn < .00001));
const cornerIndex = cornerMelody.findIndex(e => e.geometryFeature.turn > .4);
assert(cornerIndex >= 0, 'a right-angle turning point must be recognized');
assert(cornerMelody[cornerIndex].velocity > straightMelody[cornerIndex].velocity, 'turning point must increase accent');
assert(cornerMelody[cornerIndex].duration < straightMelody[cornerIndex].duration, 'turning point must add a short separation');
const closed = engine.compose([{ id: 'loop', points: [{ x: .1, y: .5 }, { x: .5, y: .1 }, { x: .9, y: .5 }, { x: .5, y: .9 }, { x: .1, y: .5 }] }], { bars: 8, arrangement: 'legacy' });
assert(closed.events.some(e => e.ruleId === 'compose.closed-contour-return'));
assert(closed.events.filter(e => e.track === 'melody').every(e => e.geometryFeature.closed));
assert.equal(engine.compose(paths, { instrument: 'flute', arrangement: 'legacy' }).sound.instrument, 'flute');
assert.equal(engine.compose(paths, { instrument: 'invalid', arrangement: 'legacy' }).sound.instrument, 'auto');

// --- classical engine contract ------------------------------------------------
// 'auto' is a UI choice; the classical engine must resolve it to a concrete
// instrument so playback and MIDI export never see a placeholder.
assert.equal(engine.compose(paths, { instrument: 'flute' }).sound.instrument, 'flute');
assert.equal(engine.compose(paths, { instrument: 'harp' }).sound.instrument, 'harp');
assert.equal(engine.compose(paths, { instrument: 'invalid' }).sound.instrument, 'piano');
assert(engine.compose(paths, { instrument: 'invalid' }).diagnostics.warnings.some(w => /unknown instrument/.test(w)));
assert.equal(engine.compose(paths, { style: 'eastern' }).sound.instrument, 'harp');
assert.equal(engine.compose(paths, { style: 'ambient' }).sound.instrument, 'strings');
assert.equal(engine.compose(paths, { form: 'rondo' }).diagnostics.form, 'rondo');
assert.equal(engine.compose(paths, { form: 'ternary' }).diagnostics.form, 'ternary');
assert.equal(engine.compose(paths, { form: 'nonsense' }).diagnostics.form, 'ternary');
assert.equal(engine.compose(paths, { form: 'rondo', bars: 4 }).diagnostics.form, 'ternary');
assert.equal(engine.compose(paths, { bpm: 55 }).bpm, 55);
assert.equal(engine.compose(paths, { bpm: 999 }).bpm, 168);
assert.equal(engine.compose(paths, { bpm: 1 }).bpm, 40);
assert.equal(engine.compose(paths, { bars: 99 }).bars, 32);
assert.equal(engine.compose(paths, { bars: 1 }).bars, 2);
// Classical sections must tile the piece exactly once, in order.
for (const bars of [2, 3, 4, 5, 8, 9, 16, 17, 32]) for (const form of ['ternary', 'rondo'])
  for (const style of ['piano', 'eastern', 'ambient']) {
    const s = engine.compose(paths, { bars, form, style });
    let cursor = 0;
    for (const sec of s.sections) {
      assert.equal(sec.start, cursor, 'section must start where the previous ended');
      assert(sec.duration > 0, 'section must be non-empty');
      cursor += sec.duration;
    }
    assert.equal(cursor, s.totalBeats, 'sections must cover every beat exactly');
    assert.equal(s.sections[0].name, '主题 A');
    assert.equal(s.sections.at(-1).name, '尾声');
  }
// Warmth must shape timbre but never force a key or mode change.
const warm = engine.compose(paths, { warmth: 0.9 });
const cool = engine.compose(paths, { warmth: -0.9 });
assert(warm.sound.brightness < cool.sound.brightness, 'warm images should sound rounder/darker, cool brighter');
assert(warm.sound.reverb > cool.sound.reverb, 'warm images should carry more room');
assert.equal(warm.mode, cool.mode, 'warmth must not change mode');
assert.equal(warm.root, cool.root, 'warmth must not transpose');
assert.equal(warm.sound.arrangement, 'classical');
// User settings must win over warmth-derived defaults.
assert.equal(engine.compose(paths, { warmth: 0.9, brightness: 0.9 }).sound.brightness, 0.9);
assert.equal(engine.compose(paths, { warmth: -0.9, reverb: 0.05 }).sound.reverb, 0.05);
assert.equal(engine.compose(paths, { warmth: 0.9, humanize: 0 }).sound.humanize, 0);

function parseMidi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start, count) => String.fromCharCode(...bytes.slice(start, start + count));
  assert.equal(text(0, 4), 'MThd'); assert.equal(view.getUint32(4), 6);
  assert.equal(view.getUint16(8), 1); assert.equal(view.getUint16(10), 5); assert.equal(view.getUint16(12), 480);
  let offset = 14, notesOn = 0, notesOff = 0, tempos = 0;
  const endTicks = [];
  for (let track = 0; track < 5; track++) {
    assert.equal(text(offset, 4), 'MTrk');
    const length = view.getUint32(offset + 4); offset += 8;
    const end = offset + length;
    let tick = 0, ended = false;
    const active = new Set();
    const vlq = () => { let n = 0, b; do { b = bytes[offset++]; n = (n << 7) | (b & 127); } while (b & 128); return n; };
    while (offset < end) {
      tick += vlq(); const status = bytes[offset++];
      if (status === 255) {
        const kind = bytes[offset++], count = vlq();
        if (kind === 81) { assert.equal(count, 3); tempos++; }
        if (kind === 47) { assert.equal(count, 0); ended = true; }
        offset += count;
      } else if ((status & 240) === 192) offset++;
      else {
        const a = bytes[offset++], b = bytes[offset++];
        assert(a < 128 && b < 128);
        const key = (status & 15) + ':' + a;
        if ((status & 240) === 144) { assert(!active.has(key), 'retriggered active MIDI note'); active.add(key); notesOn++; }
        if ((status & 240) === 128) { assert(active.has(key), 'orphan MIDI note-off'); active.delete(key); notesOff++; }
      }
    }
    assert.equal(offset, end); assert(ended); assert.equal(active.size, 0); endTicks.push(tick);
  }
  assert.equal(offset, bytes.length); assert.equal(notesOn, notesOff); assert.equal(tempos, 1);
  return { notesOn, endTicks };
}
for (const style of ['piano', 'eastern', 'ambient']) {
  const score = engine.compose(paths, { style, bars: 8 });
  const parsed = parseMidi(engine.exportMIDI(score));
  assert.equal(parsed.notesOn, score.events.length);
  assert(parsed.endTicks.every(tick => tick === score.totalBeats * 480));
}
parseMidi(engine.exportMIDI(engine.compose([])));
console.log(JSON.stringify({ status: 'passed', compositions: combinations, checks: ['determinism', 'valid events', 'source traceability', 'four-track polyphony budgets', 'melody intervals', 'tonic endings', 'literal mode', 'malformed input', 'geometry sensitivity', 'type-1 MIDI decoding and complete note-off pairing'] }, null, 2));
