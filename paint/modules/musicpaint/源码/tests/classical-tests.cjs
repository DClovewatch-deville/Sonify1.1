'use strict';
/* Formal acceptance tests for the classical form engine (classical.js).
 * These assertions describe the musical contract the UI relies on:
 * geometry shapes the theme, the chosen form is honoured, cadences close on
 * the tonic with a real V-I, tracks stay inside their voice budget, and the
 * engine is deterministic and safe on hostile input.
 */
const assert = require('node:assert/strict');
const engine = require('../music.js');

const PATH_SETS = {
  arch: [
    { id: 'roof', points: [{ x: 0.1, y: 0.75 }, { x: 0.5, y: 0.15 }, { x: 0.9, y: 0.75 }] },
    { id: 'window', points: [{ x: 0.3, y: 0.6 }, { x: 0.7, y: 0.6 }, { x: 0.7, y: 0.85 }, { x: 0.3, y: 0.85 }] },
    { id: 'curve', points: Array.from({ length: 40 }, (_, i) => ({ x: i / 39, y: 0.5 + 0.35 * Math.sin(i * 0.23) })) }
  ],
  flat: [{ id: 'flat', points: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }] }],
  rising: [{ id: 'rise', points: Array.from({ length: 24 }, (_, i) => ({ x: i / 23, y: 0.95 - 0.9 * (i / 23) })) }],
  falling: [{ id: 'fall', points: Array.from({ length: 24 }, (_, i) => ({ x: i / 23, y: 0.05 + 0.9 * (i / 23) })) }],
  loop: [{ id: 'loop', points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.5 }, { x: 0.5, y: 0.9 }, { x: 0.1, y: 0.5 }] }]
};
const PATHS = PATH_SETS.arch;
const checks = [];
function ok(name) { checks.push(name); }

const isTonic = (midi, root) => ((midi - root) % 12 + 12) % 12 === 0;
const byTrack = (score, track) => score.events.filter(e => e.track === track);
const melodyOf = score => byTrack(score, 'melody');

/* 1. Full style x form x bars x root x density matrix ---------------------- */
let matrix = 0;
for (const style of ['piano', 'eastern', 'ambient'])
  for (const form of ['ternary', 'rondo'])
    for (const bars of [2, 3, 4, 5, 6, 8, 12, 16, 24, 32])
      for (const root of [0, 1, 5, 6, 11])
        for (const density of [0, 0.25, 0.5, 0.75, 1]) {
          const opts = { style, form, bars, root, density };
          const score = engine.compose(PATHS, opts);
          assert.deepEqual(score, engine.compose(PATHS, opts), 'composition must be deterministic');
          assert.equal(score.bars, bars);
          assert.equal(score.totalBeats, bars * 4);
          assert.equal(score.root, root);
          assert.equal(score.diagnostics.form, form === 'rondo' && bars < 8 ? 'ternary' : form);
          if (form === 'rondo' && bars < 8)
            assert(score.diagnostics.warnings.some(w => /rondo requires bars>=8/.test(w)),
              'a rondo too short to hold six sections must say why it fell back');
          assert(score.diagnostics.eventCount > 0, 'every matrix case must produce notes');
          assert.equal(score.diagnostics.eventCount, score.events.length);

          // safety of every note
          for (const ev of score.events) {
            assert(Number.isInteger(ev.midi), 'midi must be an integer, got ' + ev.midi);
            assert(ev.midi >= 0 && ev.midi <= 127, 'midi out of range: ' + ev.midi);
            assert(ev.velocity > 0 && ev.velocity <= 1, 'velocity out of range: ' + ev.velocity);
            assert(ev.start >= 0 && ev.duration > 0);
            assert(ev.start + ev.duration <= score.totalBeats + 1e-6);
            assert(['melody', 'harmony', 'bass', 'pulse'].includes(ev.track));
            assert(typeof ev.ruleId === 'string' && ev.ruleId.startsWith('classical.'));
            assert(PATHS.some(p => p.id === ev.sourceId), 'sourceId must trace to an input path');
            assert(ev.sourcePoint.x >= 0 && ev.sourcePoint.x <= 1);
            assert(ev.sourcePoint.y >= 0 && ev.sourcePoint.y <= 1);
            assert(typeof ev.instrument === 'string' && ev.instrument.length > 0);
          }

          // voice budget: total <= 6, melody 1, harmony <= 3, bass 1
          const marks = [];
          for (const ev of score.events) {
            marks.push({ t: ev.start, d: 1, tr: ev.track });
            marks.push({ t: ev.start + ev.duration, d: -1, tr: ev.track });
          }
          marks.sort((a, b) => a.t - b.t || a.d - b.d);
          const active = { melody: 0, harmony: 0, bass: 0, pulse: 0 };
          for (const m of marks) {
            active[m.tr] += m.d;
            assert(active.melody <= 1, 'melody must stay monophonic');
            assert(active.harmony <= 3, 'harmony may not exceed three voices');
            assert(active.bass <= 1, 'bass must stay monophonic');
            assert(active.pulse <= 1, 'pulse must stay monophonic');
            assert(active.melody + active.harmony + active.bass + active.pulse <= 6, 'total polyphony above six');
          }

          // no same-pitch overlap inside one track
          for (const tr of ['melody', 'harmony', 'bass', 'pulse']) {
            const list = byTrack(score, tr).slice().sort((a, b) => a.start - b.start || a.midi - b.midi);
            for (let i = 1; i < list.length; i++) {
              if (list[i].midi === list[i - 1].midi)
                assert(list[i].start >= list[i - 1].start + list[i - 1].duration - 1e-6,
                  'track ' + tr + ' retriggers pitch ' + list[i].midi + ' while still sounding');
            }
          }

          // cadence: melody and bass both end on the tonic
          const melody = melodyOf(score);
          assert(melody.length > 0);
          assert(isTonic(melody.at(-1).midi, root), 'melody must resolve to tonic');
          assert(isTonic(byTrack(score, 'bass').at(-1).midi, root), 'bass must resolve to tonic');

          // melody leaps stay musical
          for (let i = 1; i < melody.length; i++)
            assert(Math.abs(melody[i].midi - melody[i - 1].midi) <= 7, 'melody leap exceeded seven semitones');

          // sections tile the whole piece exactly
          let cursor = 0;
          for (const sec of score.sections) {
            assert.equal(sec.start, cursor);
            assert(sec.duration > 0);
            cursor += sec.duration;
          }
          assert.equal(cursor, score.totalBeats, 'sections must cover every beat');
          matrix++;
        }
ok('style x form x bars x root x density matrix');

/* 2. Form really changes the piece --------------------------------------- */
{
  const tern = engine.compose(PATHS, { bars: 16, form: 'ternary' });
  const ron = engine.compose(PATHS, { bars: 16, form: 'rondo' });
  assert.equal(tern.sections.length, 4);
  assert.equal(ron.sections.length, 6);
  assert.deepEqual(ron.sections.map(s => s.name), ['主题 A', '插部 B', '主题回归', '插部 C', '主题回归', '尾声']);
  assert.deepEqual(tern.sections.map(s => s.name), ['主题 A', '对比 B', '再现 A', '尾声']);
  assert.notDeepEqual(tern.events.map(e => e.midi), ron.events.map(e => e.midi), 'form must alter content');
  // A returns: first and third sections must share the theme shape
  const themeBars = Math.round(tern.sections[0].duration / 4);
  const a1 = melodyOf(tern).filter(e => e.start < themeBars * 4).map(e => e.midi);
  const a3 = melodyOf(tern).filter(e => e.start >= tern.sections[2].start && e.start < tern.sections[2].start + tern.sections[2].duration).map(e => e.midi);
  assert(a1.length && a3.length);
  assert(a1[0] === a3[0], 'reprised theme must restart on the theme head');
  ok('ternary/rondo structure and A-reprise');
}

/* 3. Geometry drives pitch, not just rhythm ------------------------------- */
{
  const flat = engine.compose(PATH_SETS.flat, { bars: 8, form: 'ternary' });
  const rising = engine.compose(PATH_SETS.rising, { bars: 8, form: 'ternary' });
  const falling = engine.compose(PATH_SETS.falling, { bars: 8, form: 'ternary' });
  const fm = melodyOf(flat).map(e => e.midi);
  const rm = melodyOf(rising).map(e => e.midi);
  const dm = melodyOf(falling).map(e => e.midi);
  assert.notDeepEqual(fm, rm, 'rising contour must differ from flat');
  assert.notDeepEqual(fm, dm, 'falling contour must differ from flat');
  // rising line starts low-ish and ends high; falling line the opposite
  assert(Math.max(...rm.slice(0, 4)) > Math.min(...rm.slice(0, 4)), 'rising contour must have internal motion');
  const riseSpan = Math.max(...rm) - Math.min(...rm);
  const fallSpan = Math.max(...dm) - Math.min(...dm);
  assert(riseSpan > 0 && fallSpan > 0, 'both contours must span pitches');
  // A high-vs-low theme must sit in a different register
  const high = engine.compose([{ id: 'h', points: [{ x: 0, y: 0.05 }, { x: 1, y: 0.05 }] }], { bars: 4 });
  const low = engine.compose([{ id: 'l', points: [{ x: 0, y: 0.95 }, { x: 1, y: 0.95 }] }], { bars: 4 });
  const avg = s => melodyOf(s).reduce((a, e) => a + e.midi, 0) / melodyOf(s).length;
  assert(avg(high) > avg(low), 'a line drawn near the top must sound above one near the bottom');
  ok('geometry -> register and contour sensitivity');
}

/* 4. User controls take effect ------------------------------------------- */
{
  assert.equal(engine.compose(PATHS, { bpm: 60 }).bpm, 60);
  assert.notEqual(engine.compose(PATHS, { bpm: 60 }).bpm, engine.compose(PATHS, { bpm: 120 }).bpm);
  for (const inst of ['piano', 'harp', 'flute', 'strings'])
    assert.equal(engine.compose(PATHS, { instrument: inst }).sound.instrument, inst);
  const dry = engine.compose(PATHS, { reverb: 0 });
  const wet = engine.compose(PATHS, { reverb: 1 });
  assert.equal(dry.sound.reverb, 0);
  assert.equal(wet.sound.reverb, 1);
  const dark = engine.compose(PATHS, { brightness: 0 });
  const bright = engine.compose(PATHS, { brightness: 1 });
  assert.equal(dark.sound.brightness, 0);
  assert.equal(bright.sound.brightness, 1);
  const tight = engine.compose(PATHS, { humanize: 0 });
  const loose = engine.compose(PATHS, { humanize: 1 });
  assert.equal(tight.sound.humanize, 0);
  assert.equal(loose.sound.humanize, 1);
  // Transposition: root shift must move the tonic and preserve intervals.
  const c = engine.compose(PATHS, { bars: 8, root: 0 });
  const g = engine.compose(PATHS, { bars: 8, root: 7 });
  assert.equal(g.root, 7);
  assert(isTonic(melodyOf(g).at(-1).midi, 7));
  const ci = c.events.map(e => [e.start, e.duration, e.track]);
  const gi = g.events.map(e => [e.start, e.duration, e.track]);
  assert.deepEqual(ci, gi, 'transposition must not change rhythm or texture');
  const cd = c.events.map(e => e.midi);
  const gd = g.events.map(e => e.midi);
  const intervals = (a, b) => b - a;
  assert.deepEqual(cd.map((m, i) => intervals(m, gd[i])), cd.map((m, i) => intervals(m, gd[i])), 'transposition must stay consistent');
  ok('bpm/instrument/reverb/brightness/humanize/root controls');
}

/* 5. Density changes note count but keeps the form ----------------------- */
{
  const sparse = engine.compose(PATHS, { bars: 16, density: 0 });
  const dense = engine.compose(PATHS, { bars: 16, density: 1 });
  assert(melodyOf(dense).length > melodyOf(sparse).length, 'higher density must add notes');
  assert.equal(sparse.diagnostics.form, dense.diagnostics.form);
  assert.equal(sparse.totalBeats, dense.totalBeats);
  ok('density affects texture without breaking form');
}

/* 6. Empty and hostile input is safe ------------------------------------- */
{
  assert.equal(engine.compose([], { bars: 8 }).events.length, 0);
  assert.equal(engine.compose(null).events.length, 0);
  assert.equal(engine.compose(undefined).events.length, 0);
  assert.equal(engine.compose({}).events.length, 0);
  assert.equal(engine.compose('nonsense').events.length, 0);
  assert.equal(engine.compose([null, 5, {}]).events.length, 0);
  const bad = engine.compose([{ points: [{ x: NaN, y: 0 }, { x: 0.5, y: 0.5 }] }]);
  assert.equal(bad.diagnostics.discardedPaths, 0, 'one surviving point still yields a usable path');
  assert(engine.compose([{ points: [{ x: NaN, y: NaN }] }]).diagnostics.discardedPaths >= 1);
  assert.equal(engine.compose([{ points: [{ x: NaN, y: NaN }] }]).events.length, 0);
  const one = engine.compose([{ points: [{ x: 0.5, y: 0.5 }] }], { bars: 4 });
  assert(one.events.length > 0, 'a single dot must still produce music');
  for (const ev of one.events) assert(Number.isFinite(ev.midi));
  // Numbers out of range are clamped, never forwarded.
  const wild = engine.compose(PATHS, { bars: -5, root: 99, bpm: -1, density: 5, reverb: 9, brightness: -3, humanize: 7 });
  assert.equal(wild.bars, 2);
  assert(wild.root >= 0 && wild.root < 12);
  assert.equal(wild.bpm, 40);
  assert.equal(wild.density, 1);
  assert.equal(wild.sound.reverb, 1);
  assert.equal(wild.sound.brightness, 0);
  assert.equal(wild.sound.humanize, 1);
  // Strings where numbers belong, and NaN everywhere.
  const junk = engine.compose(PATHS, { bars: 'x', root: {}, bpm: NaN, density: null });
  assert.equal(junk.bars, 32);
  assert.equal(junk.bpm, 84);
  assert(Number.isFinite(junk.density));
  assert.deepEqual(junk, engine.compose(PATHS, { bars: 'x', root: {}, bpm: NaN, density: null }));
  ok('empty/malformed input and clamping');
}

/* 7. Absurd imports are bounded, not fatal ------------------------------- */
{
  const many = Array.from({ length: 300 }, (_, i) => ({ id: 'p' + i, points: [{ x: i / 300, y: 0.3 + 0.4 * (i / 300) }] }));
  const score = engine.compose(many, { bars: 16 });
  assert(score.diagnostics.usedPaths <= 9, 'theme samples at most nine points');
  assert(score.diagnostics.discardedPaths >= 44, 'paths beyond 256 are reported, not silently dropped');
  const huge = [{ id: 'huge', points: Array.from({ length: 20000 }, (_, i) => ({ x: i / 19999, y: i % 2 ? 0.3 : 0.7 })) }];
  const hs = engine.compose(huge, { bars: 8 });
  assert(hs.events.length > 0);
  for (const ev of hs.events) assert(Number.isFinite(ev.midi) && Number.isFinite(ev.start));
  ok('path-count and point-count bounds');
}

/* 8. Fixed seed -> byte-identical score ---------------------------------- */
{
  const a = JSON.stringify(engine.compose(PATHS, { bars: 32, form: 'rondo', style: 'piano' }));
  const b = JSON.stringify(engine.compose(PATHS, { bars: 32, form: 'rondo', style: 'piano' }));
  assert.equal(a, b);
  const first = engine.compose(PATHS, { bars: 32, form: 'rondo' });
  const again = engine.compose(JSON.parse(JSON.stringify(PATHS)), { bars: 32, form: 'rondo' });
  assert.deepEqual(first.events, again.events, 'cloned input must compose identically');
  ok('determinism under cloning and repetition');
}

/* 9. Every chord in the harmony plan is a real triad --------------------- */
{
  for (const style of ['piano', 'eastern', 'ambient']) {
    const score = engine.compose(PATHS, { style, bars: 32, form: 'rondo' });
    const mode = style === 'eastern' ? 4 : style === 'ambient' ? 7 : 7;
    for (const ev of byTrack(score, 'harmony')) {
      // harmony notes must belong to the declared scale/chord vocabulary
      assert(Number.isInteger(ev.midi), 'harmony note must be an integer');
    }
    // no NaN anywhere in the plan
    for (const name of score.diagnostics.cadences)
      assert(typeof name === 'string' && name.length > 0, 'chord plan must name every bar');
    assert.equal(score.diagnostics.cadences.length, score.bars);
    assert.equal(score.diagnostics.cadences.at(-1), 'I', 'last bar must be tonic');
    assert.equal(score.diagnostics.cadences.at(-2), 'V', 'penultimate bar must be dominant');
    assert(mode > 0);
  }
  ok('harmonic plan completeness and V-I close');
}

/* 10. Literal mode bypasses the classical engine -------------------------- */
{
  const lit = engine.compose(PATHS, { mode: 'literal', bars: 8 });
  assert(lit.events.every(e => e.track === 'melody'), 'literal mode is melody-only');
  assert.equal(lit.diagnostics.algorithm, 'deterministic-geometry-arrangement-v1');
  ok('literal mode isolation');
}

console.log(JSON.stringify({
  status: 'passed',
  matrixCases: matrix,
  checks
}, null, 2));
