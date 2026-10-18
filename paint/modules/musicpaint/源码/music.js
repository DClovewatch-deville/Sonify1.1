/* Sonify music engine. Local, deterministic composition and Web Audio synthesis.
 * The musical rules below are product design choices, not learned models.
 * No third-party runtime, remote samples, network requests, or training data.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SonifyMusic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TRACKS = [
    { id: 'melody', name: '旋律', color: '#ddb16d' },
    { id: 'harmony', name: '和声', color: '#8faeae' },
    { id: 'bass', name: '低音', color: '#ad9cc4' },
    { id: 'pulse', name: '律动', color: '#c58f87' }
  ];
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9]
  };
  const STYLE_SCALES = {
    piano: [0, 2, 4, 5, 7, 9, 11],
    eastern: [0, 2, 4, 7, 9],
    ambient: [0, 2, 3, 5, 7, 8, 10]
  };
  // Per-track balance, tuned by rendering each track solo and measuring RMS:
  // accompaniment should sit clearly under the melody, not disappear beneath it.
  const TRACK_GAIN = { melody: 0.15, harmony: 0.095, bass: 0.06, pulse: 0.035 };
  const INSTRUMENTS = ['piano', 'harp', 'flute', 'strings', 'violin', 'cello', 'koto', 'shakuhachi', 'guitar', 'epiano', 'clarinet', 'vibes', 'marimba', 'bass'];
  const MASTER_LEVEL = 3.2;
  const decodedSamples = new Map();
  let sampleStatus = { mode: 'synth', loaded: 0, total: 0, instruments: [], warnings: [] };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const number = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  const mod = (n, m) => ((n % m) + m) % m;
  const round = (n) => Math.round(n * 1000000) / 1000000;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function normalizePaths(input) {
    const paths = [];
    let discarded = 0;
    (Array.isArray(input) ? input : []).slice(0, 256).forEach((p, i) => {
      if (!p || !Array.isArray(p.points)) {
        discarded++;
        return;
      }
      let points = p.points
        .filter((v) => v && Number.isFinite(v.x) && Number.isFinite(v.y))
        .map((v) => ({ x: clamp(v.x, 0, 1), y: clamp(v.y, 0, 1) }));
      if (!points.length) {
        discarded++;
        return;
      }
      // Bound pathological imports while retaining both endpoints.
      if (points.length > 4096)
        points = Array.from(
          { length: 4096 },
          (_, j) => points[Math.round((j * (points.length - 1)) / 4095)]
        );
      if (points.length === 1) points.push({ ...points[0] });
      const cumulative = [0];
      for (let j = 1; j < points.length; j++)
        cumulative.push(cumulative[j - 1] + distance(points[j], points[j - 1]));
      const length = cumulative[cumulative.length - 1];
      paths.push({
        id: p.id == null ? 'path-' + i : p.id,
        points,
        cumulative,
        length,
        closed:
          points.length >= 4 &&
          length > 0.12 &&
          distance(points[0], points[points.length - 1]) < Math.min(0.055, length * 0.075),
        color: p.color,
        role: p.role
      });
    });
    return {
      paths,
      discarded: discarded + Math.max(0, (Array.isArray(input) ? input.length : 0) - 256)
    };
  }

  function sample(path, fraction) {
    fraction = clamp(fraction, 0, 1);
    if (path.length < 1e-9) return { ...path.points[0] };
    const target = path.length * fraction;
    let lo = 1,
      hi = path.points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (path.cumulative[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const a = path.points[lo - 1],
      b = path.points[lo];
    const span = path.cumulative[lo] - path.cumulative[lo - 1];
    const t = span > 0 ? (target - path.cumulative[lo - 1]) / span : 0;
    return { x: round(a.x + (b.x - a.x) * t), y: round(a.y + (b.y - a.y) * t) };
  }

  function allScaleNotes(scale, root, min, max) {
    const notes = [];
    for (let n = min; n <= max; n++) if (scale.includes(mod(n - root, 12))) notes.push(n);
    return notes;
  }

  function geometryFeature(path, fraction) {
    if (fraction < 0.015 || fraction > 0.985 || path.length < 1e-6)
      return { turn: 0, closed: path.closed };
    const left = sample(path, Math.max(0, fraction - 0.07));
    const at = sample(path, fraction);
    const right = sample(path, Math.min(1, fraction + 0.07));
    const ax = at.x - left.x,
      ay = at.y - left.y,
      bx = right.x - at.x,
      by = right.y - at.y;
    const length = Math.hypot(ax, ay) * Math.hypot(bx, by);
    const turn =
      length > 1e-10 ? Math.acos(clamp((ax * bx + ay * by) / length, -1, 1)) / Math.PI : 0;
    return { turn: round(turn), closed: path.closed };
  }

  function nearest(notes, desired, previous, maxLeap) {
    let candidates = notes;
    if (previous != null && maxLeap != null) {
      const nearby = notes.filter((n) => Math.abs(n - previous) <= maxLeap);
      if (nearby.length) candidates = nearby;
    }
    return candidates.reduce((best, n) => {
      const cost = Math.abs(n - desired) + (previous == null ? 0 : Math.abs(n - previous) * 0.24);
      const old =
        Math.abs(best - desired) + (previous == null ? 0 : Math.abs(best - previous) * 0.24);
      return cost < old ? n : best;
    }, candidates[0]);
  }

  function voicedChord(pcs, previous) {
    // Exhaustive three-note voicing search is tiny; adjacent voices move as little as possible.
    const notes = [];
    for (let n = 48; n <= 76; n++) if (pcs.includes(mod(n, 12))) notes.push(n);
    const target = previous || [55, 60, 64];
    let best = null,
      bestCost = Infinity;
    for (let a = 0; a < notes.length; a++)
      for (let b = a + 1; b < notes.length; b++)
        for (let c = b + 1; c < notes.length; c++) {
          const chord = [notes[a], notes[b], notes[c]];
          if (new Set(chord.map((n) => n % 12)).size !== 3 || chord[2] - chord[0] > 17) continue;
          const cost =
            chord.reduce((s, n, j) => s + Math.abs(n - target[j]), 0) +
            Math.abs(chord[1] - 60) * 0.06;
          if (cost < bestCost) {
            bestCost = cost;
            best = chord;
          }
        }
    return best || [48 + pcs[0], 60 + pcs[1], 60 + pcs[2]].sort((a, b) => a - b);
  }

  function compose(input, options) {
    options = options || {};
    if (options.mode !== 'literal' && options.arrangement !== 'legacy') {
      const classical =
        typeof globalThis.SonifyClassical !== 'undefined'
          ? globalThis.SonifyClassical
          : typeof require === 'function'
            ? require('./classical.js')
            : null;
      if (classical && typeof classical.compose === 'function') {
        return classical.compose(input, options, {
          TRACKS,
          clamp,
          number,
          mod,
          round,
          normalizePaths,
          sample,
          geometryFeature,
          allScaleNotes,
          nearest,
          voicedChord
        });
      }
    }
    const style = Object.hasOwn(STYLE_SCALES, options.style) ? options.style : 'piano';
    const mode = options.mode === 'literal' ? 'literal' : 'compose';
    const bpm = clamp(number(options.bpm, 84), 40, 168);
    const bars = Math.round(clamp(number(options.bars, 8), 2, 32));
    const density = clamp(number(options.density, 0.5), 0, 1);
    const root = mod(Math.round(number(options.root, 0)), 12);
    const keyLocked = options.keyLocked === true;
    const scaleMode = ['major', 'minor', 'pentatonic'].includes(options.scaleMode) ? options.scaleMode : null;
    const totalBeats = bars * 4;
    const sound = {
      reverb: clamp(number(options.reverb, 0.3), 0, 1),
      brightness: clamp(number(options.brightness, 0.55), 0, 1),
      humanize: clamp(number(options.humanize, 0.25), 0, 1),
      instrument: INSTRUMENTS.includes(options.instrument)
        ? options.instrument
        : 'auto'
    };
    const cleaned = normalizePaths(input);
    const paths = cleaned.paths;
    const events = [];
    const sections = [];
    const scale = scaleMode ? SCALES[scaleMode] : STYLE_SCALES[style];
    const legalMelody = allScaleNotes(scale, root, 57, 84);
    const add = (track, midi, start, duration, velocity, path, point, ruleId, feature) => {
      if (!(start < totalBeats) || !(duration > 0)) return;
      events.push({
        id: 'note-' + events.length,
        midi: Math.round(clamp(midi, 0, 127)),
        start: round(start),
        duration: round(Math.min(duration, totalBeats - start)),
        velocity: round(clamp(velocity, 0.04, 0.95)),
        track,
        sourceId: path.id,
        sourcePoint: { x: point.x, y: point.y },
        ruleId,
        ...(feature ? { geometryFeature: feature } : {})
      });
    };
    const diagnostics = {
      algorithm: 'deterministic-geometry-arrangement-v1',
      mode,
      inputPaths: Array.isArray(input) ? input.length : 0,
      usedPaths: paths.length,
      discardedPaths: cleaned.discarded,
      maxVoices: 6,
      melodyMaxLeap: mode === 'compose' ? 7 : null,
      warnings: cleaned.discarded ? ['有无效或超量路径已跳过。'] : [],
      mapping: {
        pitch: '纵向位置映射到调式音阶',
        rhythm:
          mode === 'literal'
            ? '各路径按弧长连续采样'
            : '两小节动机重复与变奏；局部转角增加重音和音间停顿',
        closure: '闭合路径在乐句末回到开头动机音高，受和弦与跳进约束',
        harmony: mode === 'literal' ? '关闭伴奏以听清轮廓' : '调内和弦与最小声部移动'
      }
    };
    if (!paths.length) diagnostics.warnings.push('请先画一条线，或导入图片轮廓。');
    if (paths.length && mode === 'literal') {
      const perPath = totalBeats / paths.length;
      paths.forEach((path, pi) => {
        const count = Math.max(1, Math.min(24, Math.round(perPath * (0.75 + density * 1.25))));
        const step = perPath / count;
        for (let j = 0; j < count; j++) {
          const point = sample(path, count === 1 ? 0.5 : j / (count - 1));
          const midi = nearest(legalMelody, 59 + (1 - point.y) * 24);
          add(
            'melody',
            midi,
            pi * perPath + j * step,
            step * 0.8,
            0.54 + point.x * 0.17,
            path,
            point,
            'literal.arc-length-to-scale'
          );
        }
      });
      sections.push({ name: '原始轮廓', start: 0, duration: totalBeats });
    } else if (paths.length) {
      const harmonyScale = style === 'ambient' ? STYLE_SCALES.ambient : STYLE_SCALES.piano;
      const progression = [0, 5, 3, 4, 0, 3, 4, 0];
      const chords = [];
      let previousChord = null;
      for (let bar = 0; bar < bars; bar++) {
        const degree =
          bar === bars - 1 ? 0 : bar === bars - 2 ? 4 : progression[bar % progression.length];
        const pcs = [0, 2, 4].map((n) => mod(root + harmonyScale[(degree + n) % 7], 12));
        const voiced = voicedChord(pcs, previousChord);
        chords.push({ pcs, voiced, bass: mod(root + harmonyScale[degree], 12) });
        previousChord = voiced;
      }
      // Two bars form the motif. Geometry determines its contour, not a random melody.
      const slots =
        density < 0.25
          ? [0, 2, 4, 6]
          : density < 0.7
            ? [0, 1, 2.5, 4, 5, 6, 7]
            : [0, 0.5, 1, 2, 3, 3.5, 4, 5, 5.5, 6, 7, 7.5];
      const motif = slots.map((beat, j) => {
        const position = (j / Math.max(1, slots.length - 1)) * Math.max(0, paths.length - 1);
        const pi = Math.min(paths.length - 1, Math.floor(position));
        const path = paths[pi];
        const fraction =
          paths.length === 1
            ? j / Math.max(1, slots.length - 1)
            : j === slots.length - 1
              ? 1
              : position - pi;
        return {
          beat,
          path,
          point: sample(path, fraction),
          feature: geometryFeature(path, fraction)
        };
      });
      let previousMelody = null;
      for (let phrase = 0; phrase < Math.ceil(bars / 2); phrase++) {
        const phraseStart = phrase * 8;
        const contrasting = phrase % 4 === 2;
        sections.push({
          name:
            phrase === 0
              ? '主题 A'
              : contrasting
                ? '展开 B'
                : phraseStart + 8 >= totalBeats
                  ? '回归与收束'
                  : '主题 A′',
          start: phraseStart,
          duration: Math.min(8, totalBeats - phraseStart)
        });
        for (let j = 0; j < motif.length; j++) {
          const base = motif[j];
          const source = contrasting ? motif[motif.length - 1 - j] : base;
          const start = phraseStart + base.beat;
          if (start >= totalBeats) break;
          const bar = Math.floor(start / 4);
          const strong = mod(start, 2) === 0;
          const chordNotes = legalMelody.filter((n) => chords[bar].pcs.includes(n % 12));
          let desired = 60 + (1 - source.point.y) * 20 + (contrasting ? 2 : 0);
          let candidates = strong && chordNotes.length ? chordNotes : legalMelody;
          const finalNote = start >= totalBeats - 2;
          let ruleId = strong ? 'compose.strong-beat-chord-tone' : 'compose.geometry-scale-contour';
          if (source.path.closed && j === motif.length - 1) {
            desired = 60 + (1 - sample(source.path, 0).y) * 20;
            ruleId = 'compose.closed-contour-return';
          }
          // A clear tonic ending keeps the composition from sounding cut off.
          if (finalNote) {
            candidates = legalMelody.filter((n) => mod(n - root, 12) === 0);
            ruleId = 'compose.tonic-cadence';
          }
          let midi = nearest(candidates, desired, previousMelody, 7);
          // If chord restrictions make a larger leap unavoidable, use a stepwise scale bridge.
          if (previousMelody != null && Math.abs(midi - previousMelody) > 7) {
            midi = nearest(legalMelody, midi, previousMelody, 7);
            ruleId = 'compose.stepwise-voice-leading';
          }
          const next = j + 1 < motif.length ? phraseStart + motif[j + 1].beat : phraseStart + 8;
          const duration = Math.max(
            0.12,
            (Math.min(next, totalBeats) - start) * (style === 'ambient' ? 0.93 : 0.81) -
              source.feature.turn * 0.12
          );
          add(
            'melody',
            midi,
            start,
            duration,
            0.54 + (strong ? 0.1 : 0) + source.point.x * 0.06 + source.feature.turn * 0.18,
            source.path,
            source.point,
            ruleId,
            source.feature
          );
          previousMelody = midi;
        }
      }
      let previousBass = 43;
      for (let bar = 0; bar < bars; bar++) {
        const path = paths[bar % paths.length];
        const point = sample(path, (bar % 4) / 3);
        const chord = chords[bar];
        chord.voiced.forEach((midi) =>
          add('harmony', midi, bar * 4, 3.72, 0.37, path, point, 'compose.minimum-motion-triad')
        );
        const bassChoices = [];
        for (let n = 36; n <= 55; n++) if (n % 12 === chord.bass) bassChoices.push(n);
        const bass = nearest(bassChoices, 43, previousBass, 12);
        add(
          'bass',
          bass,
          bar * 4,
          style === 'ambient' ? 3.5 : 1.7,
          0.53,
          path,
          point,
          'compose.harmonic-root'
        );
        if (style !== 'ambient' && density > 0.2)
          add(
            'bass',
            bass,
            bar * 4 + 2,
            1.65,
            0.43,
            path,
            sample(path, 0.7),
            'compose.harmonic-root'
          );
        previousBass = bass;
        if (style !== 'ambient' || density > 0.65) {
          for (let beat = 0; beat < 4; beat += density > 0.75 ? 1 : 2)
            add(
              'pulse',
              beat % 2 ? 42 : 36,
              bar * 4 + beat,
              0.18,
              beat === 0 ? 0.45 : 0.29,
              path,
              sample(path, beat / 4),
              'compose.metrical-pulse'
            );
        }
      }
    }
    if (mode === 'compose' && sound.humanize > 0)
      events.forEach((event, i) => {
        if (event.track !== 'melody' && event.track !== 'pulse') return;
        const shift = (mod(i * 13, 7) / 6) * 0.035 * sound.humanize;
        event.start = round(event.start + shift);
        event.duration = round(Math.max(0.01, event.duration - shift));
        event.velocity = round(
          clamp(event.velocity * (1 + (mod(i * 7, 9) - 4) * 0.015 * sound.humanize), 0.04, 0.95)
        );
      });
    events.sort(
      (a, b) =>
        a.start - b.start ||
        TRACKS.findIndex((t) => t.id === a.track) - TRACKS.findIndex((t) => t.id === b.track) ||
        a.midi - b.midi
    );
    diagnostics.retainedPaths = paths.length;
    diagnostics.usedPaths = new Set(events.map((event) => event.sourceId)).size;
    const score = {
      version: 1,
      style,
      mode,
      root,
      density,
      sound,
      events,
      bpm,
      bars,
      totalBeats,
      tracks: TRACKS.map((t) => ({ ...t })),
      sections,
      diagnostics
    };
    diagnostics.eventCount = events.length;
    return score;
  }

  function exportMIDI(score) {
    const ticks = 480;
    const bytes = [];
    const be16 = (n) => [(n >>> 8) & 255, n & 255];
    const be32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const ascii = (s) => Array.from(s).map((c) => c.charCodeAt(0) & 127);
    const vlq = (n) => {
      n = Math.max(0, Math.round(n));
      let out = [n & 127];
      while ((n >>>= 7)) out.unshift((n & 127) | 128);
      return out;
    };
    const chunk = (name, data) => bytes.push(...ascii(name), ...be32(data.length), ...data);
    bytes.push(...ascii('MThd'), ...be32(6), ...be16(1), ...be16(5), ...be16(ticks));
    const tempo = Math.round(60000000 / clamp(number(score.bpm, 84), 40, 180));
    chunk('MTrk', [
      0,
      255,
      81,
      3,
      (tempo >>> 16) & 255,
      (tempo >>> 8) & 255,
      tempo & 255,
      0,
      255,
      88,
      4,
      4,
      2,
      24,
      8,
      ...vlq(score.totalBeats * ticks),
      255,
      47,
      0
    ]);
    TRACKS.forEach((track, index) => {
      const channel = index;
      const instrument =
        score.sound && score.sound.instrument !== 'auto'
          ? score.sound.instrument
          : score.style === 'eastern'
            ? 'harp'
            : score.style === 'ambient'
              ? 'strings'
              : 'piano';
      const gm = { piano: 0, harp: 46, flute: 73, strings: 48, violin: 40, cello: 42,
        koto: 107, shakuhachi: 77, guitar: 24, epiano: 4, clarinet: 71, vibes: 11, marimba: 12, bass: 32 };
      const firstEvent = score.events.find(event => event.track === track.id);
      const voice = firstEvent?.instrument || (track.id === 'melody' ? instrument : track.id === 'bass' ? 'cello' : track.id === 'pulse' ? 'marimba' : 'strings');
      const programs = { [track.id]: gm[voice] ?? 0 };
      const name = ascii(track.id);
      const data = [
        0,
        255,
        3,
        name.length,
        ...name,
        0,
        192 | channel,
        programs[track.id],
        0,
        176 | channel,
        7,
        100
      ];
      const changes = [];
      score.events
        .filter((e) => e.track === track.id)
        .forEach((e, i) => {
          const start = Math.round(e.start * ticks);
          const end = Math.max(start + 1, Math.round((e.start + e.duration) * ticks));
          changes.push({
            tick: start,
            off: false,
            order: i,
            midi: e.midi,
            velocity: clamp(Math.round(e.velocity * 127), 1, 127)
          });
          changes.push({ tick: end, off: true, order: i, midi: e.midi, velocity: 0 });
        });
      changes.sort((a, b) => a.tick - b.tick || Number(b.off) - Number(a.off) || a.order - b.order);
      let last = 0;
      changes.forEach((e) => {
        data.push(...vlq(e.tick - last), (e.off ? 128 : 144) | channel, e.midi, e.velocity);
        last = e.tick;
      });
      data.push(...vlq(Math.max(0, Math.round(score.totalBeats * ticks) - last)), 255, 47, 0);
      chunk('MTrk', data);
    });
    return new Uint8Array(bytes);
  }

  function audioConstructors() {
    const g = typeof globalThis === 'object' ? globalThis : {};
    return {
      AudioContext: g.AudioContext || g.webkitAudioContext,
      OfflineAudioContext: g.OfflineAudioContext || g.webkitOfflineAudioContext
    };
  }

  function getAudioStatus() {
    return {
      ...sampleStatus,
      instruments: sampleStatus.instruments.slice(),
      warnings: sampleStatus.warnings.slice()
    };
  }

  function sampleCatalog() {
    const catalog = globalThis.SonifySamples;
    const base = catalog && Array.isArray(catalog.samples) ? catalog.samples.map(item => ({ ...item, license: catalog.license })) : [];
    const extra = globalThis.SONIFY_SAMPLES || {};
    return base.concat(Object.entries(extra).flatMap(([instrument, notes]) =>
      Object.entries(notes).map(([midi, data]) => ({
        instrument, midi: Number(midi), license: 'CC-BY-3.0 / FluidR3_GM', data: data.startsWith('data:') ? data : 'data:audio/mpeg;base64,' + data
      }))));
  }

  async function prepareSamples(ctx, score) {
    const catalog = globalThis.SonifySamples;
    const available = sampleCatalog();
    // Decode just the anchors needed by this score; reuse buffers across playback/export.
    const wanted = new Set((score?.events || []).map(event =>
      selectSample(available, event, score.style, score.sound, event.duration * 60 / score.bpm)
    ).filter(Boolean));
    const descriptors = [...wanted];
    const warnings = [];
    const bank = [];
    await Promise.all(
      descriptors.map(async (item) => {
        if (
          !item ||
          typeof item.data !== 'string' ||
          !item.data.startsWith('data:audio/') ||
          !Number.isFinite(item.midi)
        ) {
          warnings.push('无效采样描述已跳过。');
          return;
        }
        try {
          if (!decodedSamples.has(item.data)) {
            const job = (async () => {
              const comma = item.data.indexOf(',');
              if (comma < 0 || !item.data.slice(0, comma).includes(';base64'))
                throw new Error('采样应为 base64 音频');
              const raw = atob(item.data.slice(comma + 1));
              const bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
              const buffer = await ctx.decodeAudioData(bytes.buffer);
              let peak = 0,
                energy = 0;
              for (let c = 0; c < buffer.numberOfChannels; c++) {
                const channel = buffer.getChannelData(c);
                for (let i = 0; i < channel.length; i++) {
                  peak = Math.max(peak, Math.abs(channel[i]));
                  energy += channel[i] * channel[i];
                }
              }
              if (peak < 0.0001) throw new Error('silent sample');
              return {
                buffer,
                peak,
                rms: Math.sqrt(energy / (buffer.length * buffer.numberOfChannels)),
                normalization: 1
              };
            })();
            decodedSamples.set(item.data, job);
          }
          const decoded = await decodedSamples.get(item.data);
          bank.push({ ...item, ...decoded });
        } catch (_) {
          warnings.push('有采样解码失败，相关声部使用合成音色。');
        }
      })
    );
    bank.sort(
      (a, b) => String(a.instrument).localeCompare(String(b.instrument)) || a.midi - b.midi
    );
    const instruments = [...new Set(bank.map((item) => item.instrument))];
    const calibration = [];
    instruments.forEach((instrument) => {
      const members = bank.filter((item) => item.instrument === instrument);
      const peaks = members.map((item) => item.peak).sort((a, b) => a - b);
      const referencePeak = peaks[Math.floor(peaks.length / 2)];
      // Share gain across a sampled instrument to preserve relative loudness across its anchors.
      // Quiet piano layers need substantially more than 4x gain; peak ceiling bounds that boost.
      const gain = Math.min(64, 0.55 / referencePeak);
      members.forEach((item) => {
        item.normalization = gain;
      });
      calibration.push({ instrument, referencePeak: round(referencePeak), gain: round(gain) });
    });
    sampleStatus = {
      mode: bank.length ? 'sampled' : 'synth',
      sampledNotes: (score?.events || []).filter(event => selectSample(bank, event, score.style, score.sound, event.duration * 60 / score.bpm)).length,
      fallbackNotes: (score?.events || []).filter(event => !selectSample(bank, event, score.style, score.sound, event.duration * 60 / score.bpm)).length,
      loaded: bank.length,
      total: descriptors.length,
      available: available.length,
      instruments,
      calibration,
      warnings,
      license: [...new Set(bank.map(item => item.license).filter(Boolean))].join('; ')
    };
    return bank;
  }

  function selectSample(bank, event, style, sound, seconds) {
    if (!bank || !bank.length) return null;
    const chosen =
      (event.track === 'melody' && sound && sound.instrument && sound.instrument !== 'auto'
        ? sound.instrument
        : event.instrument);
    const desired = chosen
      ? [chosen]
      : event.track === 'pulse'
        ? ['marimba']
        : event.track === 'bass'
        ? ['cello']
        : event.track === 'harmony'
          ? ['strings', 'piano']
          : style === 'ambient'
            ? ['strings', 'flute']
            : style === 'eastern'
              ? ['harp', 'flute']
              : ['piano'];
    for (const instrument of desired) {
      let candidates = bank.filter((item) => item.instrument === instrument);
      const layers = candidates.filter((item) => Number.isFinite(item.velocityLow) && Math.abs(item.midi - event.midi) <= 4);
      if (layers.length) {
        const gap = (item) => Math.max(item.velocityLow - event.velocity, event.velocity - item.velocityHigh, 0);
        const nearestLayer = Math.min(...layers.map(gap));
        candidates = layers.filter((item) => gap(item) <= nearestLayer + 0.000001);
      }
      const sustained = candidates.filter((item) => !/stacc|spic/i.test(item.articulation || ''));
      const short = candidates.filter((item) => /stacc|spic/i.test(item.articulation || ''));
      if (seconds >= 0.42 && sustained.length) candidates = sustained;
      else if (seconds < 0.42 && short.length) candidates = short;
      if (candidates.length) {
        const selected = candidates.reduce((best, item) =>
          Math.abs(item.midi - event.midi) < Math.abs(best.midi - event.midi) ? item : best
        );
        // Extreme transposition destroys timbre; use the controlled synthesis fallback.
        if (Math.abs(selected.midi - event.midi) <= 19) return selected;
      }
    }
    return null;
  }

  function makeGraph(ctx, destination, volume, sound) {
    const input = ctx.createGain(),
      master = ctx.createGain(),
      compressor = ctx.createDynamicsCompressor();
    const limiter = ctx.createWaveShaper();
    const reverb = ctx.createConvolver(),
      wet = ctx.createGain();
    master.gain.value = MASTER_LEVEL * clamp(number(volume, 0.7), 0, 1);
    compressor.threshold.value = -14;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.18;
    const safetyCurve = new Float32Array(8193);
    for (let i = 0; i < safetyCurve.length; i++) {
      const value = (i * 2) / (safetyCurve.length - 1) - 1,
        absolute = Math.abs(value);
      safetyCurve[i] =
        absolute <= 0.9
          ? value
          : Math.sign(value) * (0.9 + 0.06 * Math.tanh((absolute - 0.9) / 0.06));
    }
    limiter.curve = safetyCurve;
    limiter.oversample = 'none';
    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 1.1), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let seed = 101 + ch * 991;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        data[i] = (seed / 2147483648) * Math.pow(1 - i / data.length, 3.7) * 0.35;
      }
    }
    reverb.buffer = impulse;
    wet.gain.value = 0.36 * clamp(number(sound && sound.reverb, 0.3), 0, 1);
    input.connect(master);
    master.connect(compressor);
    master.connect(reverb);
    reverb.connect(wet);
    wet.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(destination);
    return {
      input,
      master,
      setReverb(value) {
        wet.gain.setTargetAtTime(0.36 * clamp(number(value, 0.3), 0, 1), ctx.currentTime, 0.03);
      },
      dispose() {
        [input, master, compressor, limiter, reverb, wet].forEach((n) => {
          try {
            n.disconnect();
          } catch (_) {}
        });
      }
    };
  }

  function makeVoice(ctx, destination, event, when, seconds, style, bank, sound, elapsed) {
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const track = event.track;
    const selected = selectSample(bank, event, style, sound, seconds);
    const peak =
      event.velocity * (track === 'harmony' ? ({ piano: 0.22, eastern: 0.065, ambient: 0.06 }[style] || 0.095) : TRACK_GAIN[track] || 0.08) * (selected ? selected.normalization * 1.35 : 1);
    const attack = style === 'ambient' && track !== 'pulse' ? Math.min(0.16, seconds * 0.2) : 0.007;
    const release =
      track === 'pulse'
        ? 0.04
        : style === 'ambient'
          ? 0.22
          : selected && selected.instrument === 'piano'
            ? 0.16
            : 0.08;
    const end = when + Math.max(seconds, 0.025);
    const sustain = selected
      ? selected.instrument === 'strings' || selected.instrument === 'flute'
        ? 0.84
        : 0.72
      : style === 'ambient'
        ? 0.68
        : track === 'bass'
          ? 0.5
          : 0.24;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + attack);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.00001, peak * sustain),
      Math.max(when + attack + 0.001, end)
    );
    gain.gain.linearRampToValueAtTime(0, end + release);
    const brightness = 0.48 + 1.1 * clamp(number(sound && sound.brightness, 0.55), 0, 1);
    filter.type = 'lowpass';
    filter.frequency.value =
      (track === 'bass'
        ? 4500
        : track === 'pulse'
          ? 1800
          : style === 'ambient'
            ? 4200
            : selected
              ? 7000
              : 4800) * brightness;
    filter.Q.value = 0.35;
    // Warmth also shapes tone with a gentle high shelf. On sampled piano the
    // low-pass alone sits above most of the sample's energy, so without this
    // the warm/cool link would not be audible at all.
    const tone = ctx.createBiquadFilter();
    tone.type = 'highshelf';
    tone.frequency.value = 2600;
    tone.Q.value = 0.4;
    tone.gain.value = clamp(
      (clamp(number(sound && sound.brightness, 0.55), 0, 1) - 0.55) * 22,
      -7,
      6
    );
    gain.connect(tone);
    tone.connect(filter);
    filter.connect(destination);
    const sources = [],
      nodes = [gain, tone, filter];
    const frequency = 440 * Math.pow(2, (event.midi - 69) / 12);
    const oscillator = (multiplier, mix, type, detune) => {
      const osc = ctx.createOscillator(),
        part = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency * multiplier, when);
      osc.detune.value = detune || 0;
      part.gain.value = mix;
      osc.connect(part);
      part.connect(gain);
      sources.push(osc);
      nodes.push(part, osc);
      osc.start(when);
      osc.stop(end + release + 0.012);
      return osc;
    };
    if (selected) {
      const source = ctx.createBufferSource();
      source.buffer = selected.buffer;
      source.playbackRate.value = Math.pow(2, (event.midi - selected.midi) / 12);
      if (
        Number.isFinite(selected.loopStart) &&
        Number.isFinite(selected.loopEnd) &&
        selected.loopEnd > selected.loopStart &&
        selected.loopEnd <= selected.buffer.duration
      ) {
        source.loop = true;
        source.loopStart = selected.loopStart;
        source.loopEnd = selected.loopEnd;
      }
      source.connect(gain);
      sources.push(source);
      nodes.push(source);
      const offset = Math.max(0, number(elapsed, 0)) * source.playbackRate.value;
      source.start(
        when,
        source.loop
          ? offset < source.loopEnd
            ? offset
            : source.loopStart + mod(offset - source.loopStart, source.loopEnd - source.loopStart)
          : Math.min(offset, selected.buffer.duration)
      );
      source.stop(end + release + 0.01);
    } else if (track === 'pulse') {
      if (event.midi === 36) {
        const osc = oscillator(1, 0.8, 'sine');
        osc.frequency.setValueAtTime(88, when);
        osc.frequency.exponentialRampToValueAtTime(43, when + Math.min(0.12, seconds));
      } else {
        const buffer = ctx.createBuffer(
          1,
          Math.ceil(ctx.sampleRate * (seconds + release + 0.02)),
          ctx.sampleRate
        );
        const data = buffer.getChannelData(0);
        let seed = event.midi * 19 + 11;
        for (let i = 0; i < data.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
          data[i] = (seed / 2147483648) * 0.5;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        sources.push(source);
        nodes.push(source);
        source.start(when);
        source.stop(end + release + 0.01);
        filter.type = 'highpass';
        filter.frequency.value = 2700;
      }
    } else if (track === 'bass') {
      oscillator(1, 0.83, 'sine');
      oscillator(2, 0.12, 'triangle');
    } else if (style === 'eastern') {
      oscillator(1, 0.72, 'sine');
      oscillator(2, 0.17, 'sine');
      oscillator(3, 0.075, 'sine');
    } else if (style === 'ambient') {
      oscillator(1, 0.55, 'sine', -4);
      oscillator(1, 0.34, 'triangle', 4);
      oscillator(2, 0.045, 'sine');
    } else {
      oscillator(1, 0.72, 'triangle');
      oscillator(2, 0.15, 'sine');
      oscillator(3, 0.055, 'sine');
    }
    let finished = 0,
      disconnected = false;
    const disconnect = () => {
      if (disconnected) return;
      disconnected = true;
      nodes.forEach((n) => {
        try {
          n.disconnect();
        } catch (_) {}
      });
    };
    sources.forEach((source) => {
      source.onended = () => {
        if (++finished === sources.length) disconnect();
      };
    });
    return {
      track,
      start: when,
      end: end + release,
      stop(at) {
        at = Math.max(ctx.currentTime, at == null ? ctx.currentTime : at);
        try {
          gain.gain.cancelScheduledValues(at);
          gain.gain.setValueAtTime(Math.min(peak, Math.max(0, gain.gain.value)), at);
          gain.gain.linearRampToValueAtTime(0, at + 0.015);
        } catch (_) {}
        sources.forEach((s) => {
          try {
            s.stop(at + 0.02);
          } catch (_) {}
        });
      },
      disconnect
    };
  }

  function createPlayer() {
    let ctx,
      graph,
      timer = null,
      score = null,
      voices = [],
      playing = false;
    let origin = 0,
      pausedBeat = 0,
      nextIndex = 0,
      muted = new Set(),
      volume = 0.7,
      loop = false,
      request = 0,
      bank = [];
    const ensureAudio = () => {
      if (!ctx) {
        const Ctor = audioConstructors().AudioContext;
        if (!Ctor) throw new Error('此浏览器不支持 Web Audio，请使用新版 Chrome、Edge 或 Safari。');
        ctx = new Ctor();
        graph = makeGraph(ctx, ctx.destination, volume);
      }
      return ctx;
    };
    const getBeat = () =>
      playing && ctx && score
        ? clamp(((ctx.currentTime - origin) * score.bpm) / 60, pausedBeat, score.totalBeats)
        : pausedBeat;
    function clearVoices() {
      voices.forEach((v) => v.stop());
      voices = [];
    }
    function halt() {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
      clearVoices();
      playing = false;
    }
    function resetAt(beat) {
      clearVoices();
      pausedBeat = beat;
      const secondsPerBeat = 60 / score.bpm;
      origin = ctx.currentTime + 0.035 - beat * secondsPerBeat;
      nextIndex = 0;
      while (nextIndex < score.events.length && score.events[nextIndex].start <= beat) {
        const event = score.events[nextIndex++];
        const remaining = event.start + event.duration - beat;
        if (remaining > 0.01 && !muted.has(event.track))
          voices.push(
            makeVoice(
              ctx,
              graph.input,
              event,
              ctx.currentTime + 0.035,
              remaining * secondsPerBeat,
              score.style,
              bank,
              score.sound,
              Math.max(0, beat - event.start) * secondsPerBeat
            )
          );
      }
    }
    function schedule() {
      if (!playing || !score) return;
      if (((ctx.currentTime - origin) * score.bpm) / 60 >= score.totalBeats) {
        if (loop) resetAt(0);
        else {
          pausedBeat = score.totalBeats;
          playing = false;
          clearInterval(timer);
          timer = null;
          return;
        }
      }
      const horizon = ctx.currentTime + 0.14;
      const secondsPerBeat = 60 / score.bpm;
      while (nextIndex < score.events.length) {
        const event = score.events[nextIndex];
        const when = origin + event.start * secondsPerBeat;
        if (when > horizon) break;
        nextIndex++;
        const remaining = event.duration * secondsPerBeat - Math.max(0, ctx.currentTime - when);
        if (remaining > 0.008 && !muted.has(event.track))
          voices.push(
            makeVoice(
              ctx,
              graph.input,
              event,
              Math.max(ctx.currentTime + 0.002, when),
              remaining,
              score.style,
              bank,
              score.sound,
              Math.max(0, ctx.currentTime - when)
            )
          );
      }
      voices = voices.filter((v) => v.end > ctx.currentTime - 0.1);
    }
    return {
      async play(newScore, options) {
        options = options || {};
        const ticket = ++request;
        halt();
        score = newScore;
        if (!score || !score.events.length) {
          pausedBeat = 0;
          return false;
        }
        if (options.volume != null) volume = clamp(number(options.volume, 0.7), 0, 1);
        muted = new Set(options.muted || []);
        loop = !!options.loop;
        ensureAudio();
        if (ctx.state === 'suspended') await ctx.resume();
        bank = await prepareSamples(ctx, score);
        if (ticket !== request) return false;
        graph.master.gain.setTargetAtTime(MASTER_LEVEL * volume, ctx.currentTime, 0.015);
        graph.setReverb(score.sound && score.sound.reverb);
        const offset = clamp(number(options.offsetBeat, 0), 0, score.totalBeats);
        resetAt(offset >= score.totalBeats ? 0 : offset);
        playing = true;
        schedule();
        timer = setInterval(schedule, 25);
        return true;
      },
      pause() {
        request++;
        const beat = getBeat();
        halt();
        pausedBeat = beat;
        return beat;
      },
      stop() {
        request++;
        halt();
        pausedBeat = 0;
      },
      getBeat,
      setVolume(v) {
        volume = clamp(number(v, volume), 0, 1);
        if (graph) graph.master.gain.setTargetAtTime(MASTER_LEVEL * volume, ctx.currentTime, 0.015);
      },
      setMuted(ids) {
        muted = new Set(ids || []);
        if (playing) {
          const beat = getBeat();
          resetAt(beat);
          schedule();
        }
      },
      isPlaying() {
        return playing;
      },
      getAudioStatus,
      async preview(midi, style, options) {
        const ticket = request,
          currentContext = ensureAudio();
        if (ctx.state === 'suspended') await ctx.resume();
        const previewSound = options || (score && score.sound) || {};
        bank = await prepareSamples(ctx, { style, sound: previewSound, bpm: 60, events: [{ midi, track: 'melody', velocity: 0.66, duration: 0.22 }] });
        if (ticket !== request || ctx !== currentContext) return false;
        voices = voices.filter((v) => v.end > ctx.currentTime);
        while (voices.length >= 12) voices.shift().stop();
        const sound = options || (score && score.sound);
        if (!playing) graph.setReverb(sound && sound.reverb);
        const voice = makeVoice(
          ctx,
          graph.input,
          { midi: clamp(number(midi, 60), 24, 96), track: 'melody', velocity: 0.66 },
          ctx.currentTime + 0.005,
          0.22,
          STYLE_SCALES[style] ? style : 'piano',
          bank,
          sound
        );
        voices.push(voice);
        return true;
      },
      async dispose() {
        request++;
        halt();
        if (graph) graph.dispose();
        if (ctx) await ctx.close();
        ctx = null;
        graph = null;
      }
    };
  }

  async function renderWav(score, options) {
    options = options || {};
    const Ctor = audioConstructors().OfflineAudioContext;
    if (!Ctor) throw new Error('此浏览器不支持离线音频导出，请使用新版 Chrome、Edge 或 Safari。');
    const sampleRate = 44100;
    const secondsPerBeat = 60 / score.bpm;
    const duration = score.totalBeats * secondsPerBeat + 1.4;
    const ctx = new Ctor(2, Math.ceil(duration * sampleRate), sampleRate);
    const bank = await prepareSamples(ctx, score);
    const graph = makeGraph(
      ctx,
      ctx.destination,
      options.volume == null ? 0.7 : options.volume,
      score.sound
    );
    const muted = new Set(options.muted || []);
    score.events.forEach((event) => {
      if (!muted.has(event.track))
        makeVoice(
          ctx,
          graph.input,
          event,
          0.03 + event.start * secondsPerBeat,
          event.duration * secondsPerBeat,
          score.style,
          bank,
          score.sound
        );
    });
    const buffer = await ctx.startRendering();
    graph.dispose();
    const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
    let peak = 0;
    for (let i = 0; i < buffer.length; i++)
      peak = Math.max(peak, Math.abs(channels[0][i]), Math.abs(channels[1][i]));
    const gain = peak > 0.96 ? 0.96 / peak : 1;
    const data = new Uint8Array(44 + buffer.length * 4),
      view = new DataView(data.buffer);
    const text = (offset, value) => {
      for (let i = 0; i < value.length; i++) data[offset + i] = value.charCodeAt(i);
    };
    text(0, 'RIFF');
    view.setUint32(4, data.length - 8, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, buffer.length * 4, true);
    for (let i = 0; i < buffer.length; i++)
      for (let c = 0; c < 2; c++) {
        const value = clamp(channels[c][i] * gain, -1, 1);
        view.setInt16(44 + (i * 2 + c) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
      }
    return typeof Blob === 'function' ? new Blob([data], { type: 'audio/wav' }) : data;
  }

  return {
    compose,
    exportMIDI,
    renderWav,
    createPlayer,
    getAudioStatus,
    getSampleStatus: () => ({ ...sampleStatus }),
    version: '3.0.0',
    tracks: TRACKS.map((t) => ({ ...t }))
  };
});
