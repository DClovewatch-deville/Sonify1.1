(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.SonifyClassical = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var NAT_MINOR = [0, 2, 3, 5, 7, 8, 10];
  var PENTA = [0, 2, 4, 7, 9];

  function deg(scale, i) { return scale[((i % scale.length) + scale.length) % scale.length]; }

  // absolute pitch classes for a scale degree, clamped to 0..11
  function pcsOf(scale, root, degrees) {
    var out = [];
    for (var i = 0; i < degrees.length; i++) {
      var p = (root + deg(scale, degrees[i])) % 12;
      if (out.indexOf(p) < 0) out.push(p);
    }
    return out;
  }

  function chordsFor(scale, root, mode) {
    // Functional harmony skeleton. A pentatonic melody still needs full triads
    // underneath it, so the eastern style borrows the major scale for harmony.
    var harm = mode === 'pentatonic' ? MAJOR : scale;
    var lib = {
      I: pcsOf(harm, root, [0, 2, 4]),
      ii: pcsOf(harm, root, [1, 3, 5]),
      iii: pcsOf(harm, root, [2, 4, 6]),
      IV: pcsOf(harm, root, [3, 5, 0]),
      V: pcsOf(harm, root, [4, 6, 1]),
      vi: pcsOf(harm, root, [5, 0, 2])
    };
    // Functional minor uses a raised leading tone on the dominant.
    if (mode === 'natural-minor') lib.V = [7, 11, 2].map(function (n) { return (root + n) % 12; });
    return lib;
  }

  function compose(input, options, tools) {
    options = options || {};
    var clamp = tools.clamp, number = tools.number, mod = tools.mod, round = tools.round;
    var normalizePaths = tools.normalizePaths, sample = tools.sample;
    var allScaleNotes = tools.allScaleNotes, geometryFeature = tools.geometryFeature;
    var nearest = tools.nearest, voicedChord = tools.voicedChord;
    var TRACKS = tools.TRACKS;

    var warnings = [];

    // ---- 1. input normalization -------------------------------------------
    var style = options.style === 'eastern' || options.style === 'ambient' ? options.style : 'piano';
    if (options.style && options.style !== style) warnings.push('unknown style "' + options.style + '" -> piano');
    var root = mod(Math.round(number(options.root, 0)), 12);
    var barsRaw = Math.round(number(options.bars, 32));
    var bars = clamp(barsRaw, 2, 32);
    if (barsRaw !== bars) warnings.push('bars clamped to ' + bars);
    bars = Math.round(bars);
    var warmth = clamp(number(options.warmth, 0), -1, 1);
    var density = clamp(number(options.density, 0.5), 0, 1);
    var keyLocked = options.keyLocked === true;
    var scaleMode = options.scaleMode;

    // A manual mode always applies; key locking only controls automatic root selection.
    var mode, scale;
    if (scaleMode === 'major') {
      mode = 'major';
      scale = MAJOR;
    } else if (scaleMode === 'minor') {
      mode = 'natural-minor';
      scale = NAT_MINOR;
    } else if (scaleMode === 'pentatonic') {
      mode = 'pentatonic';
      scale = PENTA;
    } else {
      mode = style === 'eastern' ? 'pentatonic' : style === 'ambient' ? 'natural-minor' : 'major';
      scale = mode === 'pentatonic' ? PENTA : mode === 'natural-minor' ? NAT_MINOR : MAJOR;
    }

    var instrOpt = options.instrument;
    if (!(['auto'].concat(['piano', 'harp', 'flute', 'strings', 'violin', 'cello', 'koto', 'shakuhachi', 'guitar', 'epiano', 'clarinet', 'vibes', 'marimba', 'bass'])).includes(instrOpt)) {
      if (instrOpt) warnings.push('unknown instrument "' + instrOpt + '" -> auto');
      instrOpt = 'auto';
    }
    var autoInstr = style === 'eastern' ? 'harp' : style === 'ambient' ? 'strings' : 'piano';
    // Warmth colours timbre only: warm images get a rounder, darker tone and a
    // little more room; cool images stay bright and dry. It never touches key.
    var sound = {
      instrument: instrOpt === 'auto' ? autoInstr : instrOpt,
      reverb: round(clamp(0.3 + warmth * 0.12, 0, 1)),
      brightness: round(clamp(0.56 - warmth * 0.22, 0, 1)),
      humanize: round(clamp(0.24 + (1 - Math.abs(warmth)) * 0.12, 0, 1)),
      arrangement: 'classical'
    };
    if (options.reverb != null) sound.reverb = round(clamp(number(options.reverb, sound.reverb), 0, 1));
    if (options.brightness != null) sound.brightness = round(clamp(number(options.brightness, sound.brightness), 0, 1));
    if (options.humanize != null) sound.humanize = round(clamp(number(options.humanize, sound.humanize), 0, 1));

    var norm = normalizePaths(input);
    var paths = norm.paths;
    var diagnostics = {
      algorithm: 'hierarchical-classical-v4',
      inputPaths: Array.isArray(input) ? input.length : 0,
      usedPaths: 0,
      discardedPaths: norm.discarded,
      eventCount: 0,
      maxVoices: 0,
      form: '',
      mapping: '',
      warnings: warnings,
      cadences: []
    };

    var score = {
      version: 2, style: style, mode: 'compose', root: root, density: round(density),
      sound: sound, events: [], bpm: clamp(Math.round(number(options.bpm, style === 'ambient' ? 68 : style === 'eastern' ? 76 : 84)), 40, 168),
      bars: bars, totalBeats: bars * 4, tracks: TRACKS.slice(),
      sections: [], diagnostics: diagnostics
    };

    var totalBeats = bars * 4;

    // ---- 2. form ----------------------------------------------------------
    function splitTernary(n) {
      if (n >= 32) return [8, 8, 8, 8];
      if (n >= 16) return [4, 4, 4, 4];
      if (n >= 8) return [2, 2, 2, 2];
      if (n >= 4) return [2, 1, 0, 1];
      return [1, 0, 0, 1];
    }
    function splitRondo(n) {
      var base = [8, 4, 4, 8, 4, 4];
      var sum = 0, i;
      for (i = 0; i < base.length; i++) sum += base[i];
      if (n >= 32) return base;
      var parts = [], used = 0;
      for (i = 0; i < base.length; i++) {
        var want = Math.max(base[i] / sum * n, 0);
        var take = i === base.length - 1 ? n - used : Math.max(0, Math.round(want));
        if (i < base.length - 1 && used + take > n - 1) take = Math.max(0, n - 1 - used);
        parts.push(take);
        used += take;
      }
      // remove empty segments, then redistribute leftovers to keep the sum exact
      var kept = [], names = ['主题 A', '插部 B', '主题回归', '插部 C', '主题回归', '尾声'];
      for (i = 0; i < parts.length; i++) if (parts[i] > 0) kept.push({ name: names[i], bars: parts[i] });
      var diff = n - kept.reduce(function (s, k) { return s + k.bars; }, 0);
      if (diff !== 0 && kept.length) kept[kept.length - 1].bars += diff;
      if (kept.length && kept[kept.length - 1].bars < 1) kept[kept.length - 1].bars = 1;
      return kept.map(function (k) { return k.bars; });
    }

    var wantRondo = options.form === 'rondo';
    if (options.form && options.form !== 'rondo' && options.form !== 'ternary') warnings.push('unknown form "' + options.form + '" -> ternary');
    var isRondo = !!wantRondo && bars >= 8;
    if (wantRondo && bars < 8) warnings.push('form rondo requires bars>=8; fell back to ternary');
    var formName = isRondo ? 'rondo' : 'ternary';
    var labels = isRondo
      ? ['主题 A', '插部 B', '主题回归', '插部 C', '主题回归', '尾声']
      : ['主题 A', '对比 B', '再现 A', '尾声'];

    var plan = isRondo ? splitRondo(bars) : splitTernary(bars);

    // ternary: ensure the four parts really sum to bars
    if (!isRondo) {
      var d = bars - plan.reduce(function (s, v) { return s + v; }, 0);
      plan[plan.length - 1] += d;
      // drop empty middle parts but keep theme + coda
      var keepIdx = [0, 1, 2, 3];
      plan = plan.map(function (v, i) { return Math.max(0, v); });
      if (plan[2] === 0 && plan[1] === 0 && bars <= 2) plan = bars >= 2 ? [1, 0, 0, 1] : [1, 0, 0, 0];
      if (plan[2] === 0 && plan[1] === 0 && bars >= 2) plan = [1, 0, 0, bars - 1];
    }

    var sections = [], cursorBar = 0;
    for (var si = 0; si < plan.length; si++) {
      if (plan[si] <= 0) continue;
      sections.push({ name: labels[si] || '尾声', start: cursorBar * 4, duration: plan[si] * 4 });
      cursorBar += plan[si];
    }
    if (cursorBar !== bars) {
      // safety: force exact coverage
      var missing = bars - cursorBar;
      if (sections.length) {
        sections[sections.length - 1].duration += missing * 4;
        // rebuild starts
        var c = 0;
        for (var si2 = 0; si2 < sections.length; si2++) { sections[si2].start = c * 4; c += sections[si2].duration / 4; }
        cursorBar = c;
      }
      if (cursorBar !== bars) warnings.push('form coverage adjusted');
    }
    score.sections = sections;
    diagnostics.form = formName;

    // section spans in bars: {startBar, bars, role, themeIndex}
    var spans = [];
    (function () {
      var b = 0, roles = [], themeCount = 0;
      if (isRondo) roles = ['theme', 'contrast', 'theme', 'contrast', 'theme', 'coda'];
      else roles = ['theme', 'contrast', 'theme', 'coda'];
      for (var i = 0; i < plan.length; i++) {
        if (plan[i] <= 0) continue;
        var role = roles[i] || 'coda';
        var sp = { startBar: b, bars: plan[i], role: role, name: labels[i] };
        if (role === 'theme') sp.themeIndex = themeCount++;
        spans.push(sp);
        b += plan[i];
      }
    })();

    // ---- 3. harmony -------------------------------------------------------
    var chords = chordsFor(scale, root, mode);
    var themeHalf = ['I', 'IV', 'ii', 'V'];
    var themeFull = ['I', 'vi', 'V', 'I'];
    var contrastLib = [['vi', 'iii', 'IV', 'ii'], ['vi', 'IV', 'ii', 'V'], ['iii', 'vi', 'ii', 'V']];

    function chordNameForBar(bar) {
      // final cadence: penultimate bar is dominant (V), final bar is tonic (I)
      if (bar === bars - 1) return 'I';
      if (bar === bars - 2) return 'V';
      // locate section
      var sp = spans[0];
      for (var i = 0; i < spans.length; i++) if (bar >= spans[i].startBar && bar < spans[i].startBar + spans[i].bars) { sp = spans[i]; break; }
      var local = bar - sp.startBar, len = sp.bars;
      var cyc;
      if (sp.role === 'theme') cyc = len >= 8 ? themeHalf.concat(themeFull) : themeHalf.concat(themeFull.slice(0, 4));
      else if (sp.role === 'contrast') cyc = contrastLib[(sp.startBar + len) % contrastLib.length];
      else cyc = ['I', 'IV', 'V', 'I'];
      var nm = cyc[local % cyc.length];
      return nm;
    }
    var barChord = [], barPcs = [];
    for (var b = 0; b < bars; b++) {
      var cn = chordNameForBar(b);
      barChord.push(cn);
      barPcs.push(chords[cn]);
    }
    diagnostics.cadences = barChord.slice();
    diagnostics.mapping = 'scale=' + mode + '; chords=' + barChord.join(',');

    // ---- 4. motif from geometry ------------------------------------------
    var MOTIF_POINTS = 9;
    var motif = null;
    if (paths.length) {
      var usedIdx = new Set();
      motif = [];
      for (var mi = 0; mi < MOTIF_POINTS; mi++) {
        var pIdx = mi % paths.length;
        var path = paths[pIdx];
        var frac = MOTIF_POINTS === 1 ? 0 : mi / (MOTIF_POINTS - 1);
        frac = clamp(frac, 0, 1);
        var pt = sample(path, frac);
        var desired = 60 + (1 - pt.y) * 18;
        // snap to scale (initial anchor must be a legal scale tone)
        var snapPool = allScaleNotes(scale, root, 48, 84);
        var snapped = snapPool.reduce(function (best, n) {
          return Math.abs(n - desired) < Math.abs(best - desired) ? n : best;
        }, snapPool[0]);
        usedIdx.add(pIdx);
        motif.push({
          midi: snapped, sourceId: path.id, sourcePoint: { x: round(pt.x), y: round(pt.y) },
          feature: geometryFeature(path, frac), pathIndex: pIdx, fraction: frac, x: round(pt.x)
        });
      }
      diagnostics.usedPaths = usedIdx.size;
    } else {
      warnings.push('no usable paths: events left empty');
      score.events = [];
      diagnostics.eventCount = 0;
      return score;
    }

    function shiftMotif(m, steps) {
      var notes = allScaleNotes(scale, root, 36, 96);
      return m.map(function (p) {
        var idx = notes.indexOf(p.midi);
        var ni = idx < 0 ? 0 : clamp(idx + steps, 0, notes.length - 1);
        return { midi: notes[ni], sourceId: p.sourceId, sourcePoint: p.sourcePoint, feature: p.feature, x: p.x };
      });
    }
    function invertMotif(m) {
      var center = m.reduce(function (s, p) { return s + p.midi; }, 0) / m.length;
      var notes = allScaleNotes(scale, root, 36, 96);
      return m.map(function (p) {
        var target = center - (p.midi - center);
        var best = notes.reduce(function (b, n) { return Math.abs(n - target) < Math.abs(b - target) ? n : b; }, notes[0]);
        return { midi: best, sourceId: p.sourceId, sourcePoint: p.sourcePoint, feature: p.feature, x: p.x };
      });
    }

    // ---- 5. melody generation --------------------------------------------
    // The drawing supplies a nine-point contour. A cursor walks that contour
    // across bars instead of restarting it every bar, so a phrase traces the
    // whole gesture rather than looping one five-note cell.
    var events = [];
    var evId = 0;
    var harmonyInstr = style === 'eastern' ? 'harp' : style === 'ambient' ? 'strings' : 'piano';

    function push(ev) {
      ev.id = 'e' + (evId++);
      if (ev.velocity > 1) ev.velocity = ev.velocity / 127;
      ev.velocity = clamp(ev.velocity, 0, 1);
      if (!ev.instrument) ev.instrument = ev.track === 'melody' ? sound.instrument : ev.track === 'bass' ? (style === 'piano' ? 'piano' : 'cello') : harmonyInstr;
      if (!ev.ruleId) ev.ruleId = 'motif-theme';
      if (ev.ruleId.indexOf('classical.') !== 0) ev.ruleId = 'classical.' + ev.ruleId;
      if (ev.sourceId == null || ev.sourcePoint == null || ev.geometryFeature == null) {
        var fallback = motif[mod(ev.srcBar || 0, MOTIF_POINTS)];
        ev.sourceId = fallback.sourceId;
        ev.sourcePoint = fallback.sourcePoint;
        ev.geometryFeature = fallback.feature;
      }
      delete ev.srcBar;
      events.push(ev);
      return ev;
    }

    function sectionAt(bar) {
      for (var i = 0; i < spans.length; i++)
        if (bar >= spans[i].startBar && bar < spans[i].startBar + spans[i].bars) return spans[i];
      return spans[spans.length - 1];
    }
    function motifSource(bar) { return motif[mod(bar, MOTIF_POINTS)]; }

    // Four-bar phrase grammar: statement, continuation, sequence, cadence.
    // Every bar has its own profile, so the phrase has a shape of its own.
    // Each cell sums to four beats.
    var CELLS = {
      sparse: [[2, 2], [2, 1, 1], [2, 2], [1, 1, 2]],
      medium: [[1, 1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1, 1], [1, 0.5, 0.5, 1, 1], [1.5, 0.5, 1, 1]],
      dense: [
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5, 0.5, 1, 1]
      ]
    };
    var cells = density < 0.3 ? CELLS.sparse : density < 0.7 ? CELLS.medium : CELLS.dense;
    
    // B section uses different rhythm patterns for variety
    var cellsB = [
      [1, 2, 1],   // syncopated
      [2, 1, 1],   // back-weighted
      [1, 1, 1, 1], // steady quarters
      [3, 1]       // long then short
    ];

    var rootPc = root;
    var motifCursor = 0;
    var lastMelodyMidi = null;

    for (var bar = 0; bar < bars; bar++) {
      var sp = sectionAt(bar);
      var localInSection = bar - sp.startBar;
      var phrasePos = localInSection % 4;
      var isContrast = sp.role === 'contrast';
      var isLast = bar === bars - 1;

      // B answers the theme with a step-sequence, then its inversion; every
      // return of the theme restarts the contour, so A' really is a reprise.
      var shape = motif, shapeRule = 'motif-theme';
      var isRecap = sp.role === 'theme' && (sp.themeIndex || 0) > 0;
      if (isContrast) {
        if (localInSection % 2 === 0) { shape = shiftMotif(motif, 2); shapeRule = 'motif-shift'; }
        else { shape = invertMotif(motif); shapeRule = 'motif-invert'; }
      } else if (isRecap) {
        // Keep the head recognizable, then answer it with a real sequence.
        if (phrasePos >= 2) { shape = shiftMotif(motif, sp.themeIndex); shapeRule = 'recap-sequence'; }
        else shapeRule = 'motif-reprise';
      } else if (sp.role === 'coda' && localInSection % 2 === 1) {
        shape = invertMotif(motif); shapeRule = 'motif-echo';
      }

      var cell;
      if (isLast) cell = [4];
      else if (sp.role === 'coda') cell = [[2, 2], [1, 1, 2], [1, 1, 2], [4]][phrasePos];
      else if (isContrast) cell = cellsB[phrasePos]; // Independent rhythm for B section
      else cell = cells[phrasePos];

      var barStart = bar * 4;
      // Every section restarts the contour: that is what makes B sound like an
      // answer and A' sound like the theme coming home.
      if (localInSection === 0) motifCursor = 0;
      var chordPcs = barPcs[bar];
      var melodicScale = mode === 'natural-minor' && barChord[bar] === 'V' ? [0, 2, 3, 5, 7, 8, 11] : scale;
      var scaleNotes = allScaleNotes(melodicScale, root, 58, 81);
      var chordTones = scaleNotes.filter(function (n) { return chordPcs.indexOf(mod(n, 12)) >= 0; });
      var cadenceBar = isLast || phrasePos === 3;
      var tonics = scaleNotes.filter(function (n) { return mod(n, 12) === rootPc; });

      var t = 0, prev = lastMelodyMidi;
      for (var ri = 0; ri < cell.length; ri++) {
        var dur = cell[ri];
        var start = barStart + t;
        if (start >= totalBeats) break;
        if (start + dur > totalBeats) dur = totalBeats - start;
        if (dur <= 0) break;

        var mPoint = shape[mod(motifCursor + ri, MOTIF_POINTS)];
        var onBeat = Math.abs(t - Math.round(t)) < 1e-9 && Math.round(t) % 2 === 0;
        var strong = t === 0 || onBeat;
        var isFinalSlot = ri === cell.length - 1;

        // Chord tones on strong beats anchor the harmony; weak beats may move
        // freely inside the scale.
        var pool = strong || isLast ? (chordTones.length ? chordTones : scaleNotes) : scaleNotes;
        var desired = mPoint.midi;

        if (isLast) {
          // Perfect authentic cadence: land on the tonic near the previous note.
          var near = tonics.filter(function (n) { return prev == null || Math.abs(n - prev) <= 5; });
          var cand = near.length ? near : tonics;
          var anchor = prev == null ? 72 : prev;
          desired = cand.reduce(function (best, n) {
            return Math.abs(n - anchor) < Math.abs(best - anchor) ? n : best;
          }, cand[0]);
          pool = [desired];
        } else if (cadenceBar && isFinalSlot) {
          // Phrase close: settle on the nearest chord tone, inside the leap limit.
          var closePool = chordTones.length ? chordTones : scaleNotes;
          var reachable = prev == null ? closePool : closePool.filter(function (n) { return Math.abs(n - prev) <= 5; });
          if (reachable.length) closePool = reachable;
          desired = closePool.reduce(function (best, n) {
            return Math.abs(n - desired) < Math.abs(best - desired) ? n : best;
          }, closePool[0]);
          pool = [desired];
        }

        var pick = nearest(pool, desired, prev, 5);
        if (prev != null && Math.abs(pick - prev) > 5) {
          var nearPool = pool.filter(function (n) { return Math.abs(n - prev) <= 5; });
          if (nearPool.length) pick = nearest(nearPool, desired, prev, 5);
        }
        if (isLast) pick = desired;

        // Phrase arc: lift through the first half, ease into the cadence.
        var arc = 0.86 + 0.18 * Math.sin((phrasePos + ri / cell.length + 0.5) / 4 * Math.PI);
        var sectionLift = isContrast ? 5 : isRecap ? 2 : sp.role === 'coda' ? -6 - 8 * localInSection / Math.max(1, sp.bars - 1) : 0;
        var vel = clamp(Math.round(56 + arc * 24 + (strong ? 6 : 0) + sectionLift + warmth * 3), 36, 106);
        var held = isLast || (cadenceBar && isFinalSlot);
        var noteDur = held ? dur : dur * 0.94;
        
        // Add 0.5-1 beat rest at phrase ends (not at final cadence)
        if (cadenceBar && isFinalSlot && !isLast) {
          var restDur = Math.min(1, dur * 0.6); // 0.5-1 beat rest
          noteDur = Math.max(0.25, dur - restDur);
        }

        push({
          midi: pick, start: round(start), duration: round(noteDur), velocity: vel, track: 'melody',
          sourceId: mPoint.sourceId, sourcePoint: mPoint.sourcePoint,
          ruleId: isLast ? 'authentic-cadence' : (cadenceBar && isFinalSlot) ? 'phrase-close' : shapeRule,
          geometryFeature: mPoint.feature, srcBar: bar
        });

        prev = pick;
        lastMelodyMidi = pick;
        t += dur;
      }
      motifCursor = mod(motifCursor + cell.length, MOTIF_POINTS);
    }
    if (!events.length) warnings.push('melody empty');

    // ---- 6. accompaniment ------------------------------------------------
    var prevVoicing = null;
    var ALBERTI = [0, 2, 1, 2];

    for (var ab = 0; ab < bars; ab++) {
      var pcs = barPcs[ab];
      var voicing = voicedChord(pcs, prevVoicing);
      // Fold the voicing into a comfortable middle register without losing a voice.
      if (voicing[0] < 48) voicing = voicing.map(function (n) { return n + 12 * Math.ceil((48 - n) / 12); });
      while (voicing[2] > 67) voicing = voicing.map(function (n) { return n - 12; });
      while (voicing[0] < 48) voicing = voicing.map(function (n) { return n + 12; });
      voicing.sort(function (a, b) { return a - b; });
      if (voicing[0] === voicing[1] || voicing[1] === voicing[2]) voicing = voicedChord(pcs, null);
      prevVoicing = voicing;

      var absStart = ab * 4;
      var isFinalBar = ab === bars - 1;
      var spanHere = sectionAt(ab);
      var phraseEnd = isFinalBar || (ab - spanHere.startBar) % 4 === 3;
      var room = totalBeats - absStart;
      var src = motifSource(ab);
      var hit = function (midi, at, dur, velocity, rule) {
        push({
          midi: midi, start: round(at), duration: round(Math.max(0, Math.min(dur, totalBeats - at))),
          velocity: velocity, track: 'harmony',
          sourceId: src.sourceId, sourcePoint: src.sourcePoint, srcBar: ab,
          ruleId: rule, geometryFeature: src.feature
        });
      };

      if (isFinalBar || phraseEnd) {
        // Cadence chord: the three voices arrive together and are held.
        hit(voicing[0], absStart, isFinalBar ? 4 : 3.5, 54, isFinalBar ? 'final-chord' : 'cadence-chord');
        hit(voicing[1], absStart, isFinalBar ? 4 : 3.5, 48, isFinalBar ? 'final-chord' : 'cadence-chord');
        hit(voicing[2], absStart, isFinalBar ? 4 : 3.5, 46, isFinalBar ? 'final-chord' : 'cadence-chord');
      } else if (style === 'ambient') {
        hit(voicing[0], absStart, 3.7, 52, 'sustain-root');
        hit(voicing[1], absStart, 3.7, 48, 'sustain-third');
        hit(voicing[2], absStart, 3.7, 45, 'sustain-fifth');
      } else if (style === 'eastern') {
        // Two plucked attacks per bar, low then high.
        hit(voicing[0], absStart, 1.8, 52, 'pluck-low');
        hit(voicing[2], absStart + 2, 1.8, 50, 'pluck-high');
      } else {
        // Piano Alberti: bass, upper, middle, upper -- one voice at a time.
        var unit = density >= 0.6 ? 0.5 : 1;
        var steps = Math.floor(4 / unit);
        for (var ai = 0; ai < steps; ai++) {
          var st = absStart + ai * unit;
          if (st >= totalBeats) break;
          hit(voicing[ALBERTI[ai % 4]], st, Math.min(unit * 0.9, 0.9), ai === 0 ? 54 : 46, 'alberti');
        }
      }

      // Bass: the chord root, held to the next bar; the final bar resolves to I.
      var bassMidi = isFinalBar ? 36 + root : 36 + pcs[0];
      push({
        midi: bassMidi, start: round(absStart),
        duration: round(Math.min(isFinalBar ? 4 : phraseEnd ? 3.4 : 3.6, room)),
        velocity: isFinalBar ? 60 : 62, track: 'bass',
        sourceId: src.sourceId, sourcePoint: src.sourcePoint, srcBar: ab,
        ruleId: isFinalBar ? 'final-tonic' : 'bass-root', geometryFeature: src.feature
      });
    }

    // ---- 7. validate & finalize -----------------------------------------
    var kept = [];
    var maxEnd = totalBeats;
    events.forEach(function (ev) {
      if (!(ev.duration > 0)) return;
      if (ev.start < 0) ev.start = 0;
      if (ev.start >= maxEnd) return;
      if (ev.start + ev.duration > maxEnd) ev.duration = round(maxEnd - ev.start);
      if (ev.duration <= 0) return;
      kept.push(ev);
    });

    // Only the same pitch on the same track must stop before it sounds again.
    // Different pitches may legitimately ring together inside one track.
    var byTrack = {};
    kept.forEach(function (ev) { (byTrack[ev.track] = byTrack[ev.track] || []).push(ev); });
    Object.keys(byTrack).forEach(function (tr) {
      var groups = {};
      byTrack[tr].forEach(function (ev) { (groups[ev.midi] = groups[ev.midi] || []).push(ev); });
      Object.keys(groups).forEach(function (key) {
        var list = groups[key].sort(function (a, b) { return a.start - b.start; });
        for (var i = 1; i < list.length; i++) {
          var prevEv = list[i - 1], cur = list[i];
          if (prevEv.start + prevEv.duration > cur.start) {
            var newDur = round(cur.start - prevEv.start);
            prevEv.duration = newDur > 0 ? newDur : 0;
          }
        }
      });
    });

    kept = kept.filter(function (ev) { return ev.duration > 0 && ev.start >= 0 && ev.start + ev.duration <= totalBeats; });
    kept.sort(function (a, b) {
      if (a.start !== b.start) return a.start - b.start;
      var ta = String(a.track), tb = String(b.track);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.midi - b.midi;
    });

    // voice count
    var maxVoices = 0;
    var marks = [];
    kept.forEach(function (ev) { marks.push({ t: ev.start, d: 1 }); marks.push({ t: ev.start + ev.duration, d: -1 }); });
    marks.sort(function (a, b) { return a.t - b.t || a.d - b.d; });
    var cur = 0;
    marks.forEach(function (m) { cur += m.d; if (cur > maxVoices) maxVoices = cur; });

    score.events = kept;
    diagnostics.eventCount = kept.length;
    diagnostics.maxVoices = maxVoices;
    diagnostics.notes = 'Rule-based composition inspired by hierarchical repetition principles (MeloForm, MusicTransformer); not a trained model nor a real sonata implementation.';
    return score;
  }

  return { compose: compose };
});
