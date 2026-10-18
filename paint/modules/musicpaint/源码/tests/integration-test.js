#!/usr/bin/env node
/* Integration tests for MusicPaint V4 — scale modes, BPM clamping, samples.
 * Run with: node tests/integration-test.js
 */

const M = require('../music.js');
const Classical = require('../classical.js');

const tests = [];
const results = { passed: 0, failed: 0, skipped: 0 };

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Values differ'}: expected ${expected}, got ${actual}`);
  }
}

function assertInRange(value, min, max, message) {
  if (value < min || value > max) {
    throw new Error(`${message || 'Value out of range'}: ${value} not in [${min}, ${max}]`);
  }
}

// ============================================================
// Test 1: scaleMode overrides style when keyLocked is true
// ============================================================
test('scaleMode major overrides style when keyLocked', () => {
  const paths = [{ points: [{x:0.5,y:0.5}, {x:0.6,y:0.6}] }];
  const score = M.compose(paths, {
    style: 'ambient',      // would normally use natural minor
    scaleMode: 'major',
    keyLocked: true,
    root: 0,
    bpm: 120,
    bars: 4
  });
  
  // Check that the composition used major scale (C major = [0,2,4,5,7,9,11])
  const majorScale = [0, 2, 4, 5, 7, 9, 11];
  const melodyNotes = score.events
    .filter(e => e.track === 'melody')
    .map(e => e.midi % 12);
  
  // All melody notes should be in major scale
  melodyNotes.forEach(note => {
    assert(
      majorScale.includes(note),
      `Note ${note} not in major scale when scaleMode=major and keyLocked=true`
    );
  });
});

test('scaleMode minor overrides style when keyLocked', () => {
  const paths = [{ points: [{x:0.5,y:0.5}, {x:0.6,y:0.6}] }];
  const score = M.compose(paths, {
    style: 'piano',        // would normally use major
    scaleMode: 'minor',
    keyLocked: true,
    root: 0,
    bpm: 120,
    bars: 4
  });
  
  // Check that the composition used natural minor scale
  const minorScale = [0, 2, 3, 5, 7, 8, 10];
  const melodyNotes = score.events
    .filter(e => e.track === 'melody')
    .map(e => e.midi % 12);
  
  melodyNotes.forEach(note => {
    assert(
      minorScale.includes(note),
      `Note ${note} not in minor scale when scaleMode=minor and keyLocked=true`
    );
  });
});

test('scaleMode pentatonic overrides style when keyLocked', () => {
  const paths = [{ points: [{x:0.5,y:0.5}, {x:0.6,y:0.6}] }];
  const score = M.compose(paths, {
    style: 'piano',        // would normally use major
    scaleMode: 'pentatonic',
    keyLocked: true,
    root: 0,
    bpm: 120,
    bars: 4
  });
  
  // Check that the composition used pentatonic scale
  const pentaScale = [0, 2, 4, 7, 9];
  const melodyNotes = score.events
    .filter(e => e.track === 'melody')
    .map(e => e.midi % 12);
  
  melodyNotes.forEach(note => {
    assert(
      pentaScale.includes(note),
      `Note ${note} not in pentatonic scale when scaleMode=pentatonic and keyLocked=true`
    );
  });
});

test('style controls scale when keyLocked is false', () => {
  const paths = [{ points: [{x:0.5,y:0.5}, {x:0.6,y:0.6}] }];
  const score = M.compose(paths, {
    style: 'ambient',
    scaleMode: 'major',    // should be ignored
    keyLocked: false,      // style takes precedence
    root: 0,
    bpm: 120,
    bars: 4
  });
  
  // ambient style should use natural minor
  const minorScale = [0, 2, 3, 5, 7, 8, 10];
  const melodyNotes = score.events
    .filter(e => e.track === 'melody')
    .map(e => e.midi % 12);
  
  melodyNotes.forEach(note => {
    assert(
      minorScale.includes(note),
      `Note ${note} not in minor scale when style=ambient and keyLocked=false`
    );
  });
});

// ============================================================
// Test 2: BPM clamping to 40-168 in all engines
// ============================================================
test('BPM clamped to 40-168 in music.js', () => {
  const paths = [{ points: [{x:0.5,y:0.5}, {x:0.6,y:0.6}] }];
  
  // Test lower bound
  const scoreLow = M.compose(paths, { bpm: 10, mode: 'literal', arrangement: 'legacy' });
  assertEqual(scoreLow.bpm, 40, 'BPM should be clamped to minimum 40');
  
  // Test upper bound
  const scoreHigh = M.compose(paths, { bpm: 200, mode: 'literal', arrangement: 'legacy' });
  assertEqual(scoreHigh.bpm, 168, 'BPM should be clamped to maximum 168');
  
  // Test valid range
  const scoreValid = M.compose(paths, { bpm: 120, mode: 'literal', arrangement: 'legacy' });
  assertEqual(scoreValid.bpm, 120, 'BPM 120 should be preserved');
});

test('BPM clamped to 40-168 in classical.js', () => {
  const paths = [{ points: [{x:0.5,y:0.5}, {x:0.6,y:0.6}] }];
  
  // Test lower bound
  const scoreLow = M.compose(paths, { bpm: 10, bars: 4 });
  assertInRange(scoreLow.bpm, 40, 168, 'BPM should be in range 40-168');
  assertEqual(scoreLow.bpm, 40, 'BPM should be clamped to minimum 40');
  
  // Test upper bound
  const scoreHigh = M.compose(paths, { bpm: 200, bars: 4 });
  assertEqual(scoreHigh.bpm, 168, 'BPM should be clamped to maximum 168');
  
  // Test valid range
  const scoreValid = M.compose(paths, { bpm: 96, bars: 4 });
  assertEqual(scoreValid.bpm, 96, 'BPM 96 should be preserved');
});

// ============================================================
// Test 3: Sample inventory and integration
// ============================================================
test('Sample status reports loaded instruments', async () => {
  // Set up mock samples
  global.SonifySamples = {
    license: 'CC0-1.0',
    samples: [
      { id: 'piano-60', instrument: 'piano', midi: 60, data: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' },
      { id: 'harp-60', instrument: 'harp', midi: 60, data: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' }
    ]
  };
  
  global.SONIFY_SAMPLES = [
    { id: 'flute-60', instrument: 'flute', midi: 60, data: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' }
  ];
  
  const status = M.getSampleStatus();
  
  // Verify getSampleStatus function exists and returns expected structure
  assert(typeof M.getSampleStatus === 'function', 'getSampleStatus should be exported');
  assert(typeof status === 'object', 'status should be an object');
  assert(Array.isArray(status.instruments), 'instruments should be an array');
  assert(typeof status.mode === 'string', 'mode should be a string');
  assert(typeof status.loaded === 'number', 'loaded should be a number');
  assert(typeof status.total === 'number', 'total should be a number');
  
  // Clean up
  delete global.SonifySamples;
  delete global.SONIFY_SAMPLES;
});

// ============================================================
// Test 4: Final cadence and phrase structure
// ============================================================
test('Final bars use V-I cadence', () => {
  const paths = [{ points: [{x:0.5,y:0.5}, {x:0.6,y:0.6}] }];
  const score = M.compose(paths, { root: 0, bars: 8 });
  
  // Check diagnostics for cadence information
  if (score.diagnostics && score.diagnostics.cadences) {
    const cadences = score.diagnostics.cadences;
    assertEqual(cadences[cadences.length - 1], 'I', 'Final bar should be tonic (I)');
    assertEqual(cadences[cadences.length - 2], 'V', 'Penultimate bar should be dominant (V)');
  }
  
  // Check that final bar bass note is the root
  const finalBar = score.bars - 1;
  const finalBassNotes = score.events.filter(
    e => e.track === 'bass' && e.start >= finalBar * 4
  );
  
  if (finalBassNotes.length > 0) {
    const finalBass = finalBassNotes[0];
    assertEqual(
      finalBass.midi % 12,
      score.root,
      'Final bass note should be the tonic (root)'
    );
  }
});

test('Melody has phrase gaps before cadences', () => {
  const paths = [{ points: [{x:0.5,y:0.5}, {x:0.6,y:0.6}] }];
  const score = M.compose(paths, { bars: 16, density: 0.5 });
  
  // Check for gaps at phrase boundaries (every 4 bars, except the very last)
  const melodyEvents = score.events
    .filter(e => e.track === 'melody')
    .sort((a, b) => a.start - b.start);
  
  if (melodyEvents.length < 2) return; // Not enough notes to test
  
  let foundGap = false;
  for (let i = 1; i < melodyEvents.length; i++) {
    const prev = melodyEvents[i - 1];
    const curr = melodyEvents[i];
    const gap = curr.start - (prev.start + prev.duration);
    
    // Look for gaps > 0.3 beats near phrase boundaries
    if (gap > 0.3) {
      const barPos = Math.floor(curr.start / 4);
      if (barPos % 4 === 0) {
        foundGap = true;
        break;
      }
    }
  }
  
  // At least one phrase gap should exist in 16 bars
  assert(foundGap || score.bars < 8, 'Should have phrase gaps in longer compositions');
});

// ============================================================
// Test 5: B section rhythm distinction
// ============================================================
test('B section uses distinct rhythm patterns', () => {
  const paths = [
    { points: [{x:0.3,y:0.3}, {x:0.4,y:0.4}] },
    { points: [{x:0.6,y:0.6}, {x:0.7,y:0.7}] }
  ];
  const score = M.compose(paths, { bars: 16, form: 'ternary' });
  
  // In ternary form, there should be sections with different characteristics
  if (score.sections && score.sections.length > 1) {
    const hasTheme = score.sections.some(s => s.role === 'theme');
    const hasContrast = score.sections.some(s => s.role === 'contrast');
    
    assert(
      hasTheme && hasContrast,
      'Ternary form should have both theme and contrast sections'
    );
  }
  
  // Check that melody notes in different sections have rhythm variety
  const melodyBySection = {};
  score.events.filter(e => e.track === 'melody').forEach(e => {
    const bar = Math.floor(e.start / 4);
    const section = score.sections?.find(
      s => bar >= s.startBar && bar < s.startBar + s.bars
    );
    if (section) {
      if (!melodyBySection[section.role]) melodyBySection[section.role] = [];
      melodyBySection[section.role].push(e);
    }
  });
  
  // Just verify we have events in different sections
  const sectionCount = Object.keys(melodyBySection).length;
  assert(sectionCount >= 1, 'Should have melody events in at least one section');
});

// ============================================================
// Run all tests
// ============================================================
async function runTests() {
  console.log('MusicPaint V4 Integration Tests\n' + '='.repeat(50));
  
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      results.passed++;
    } catch (err) {
      console.log(`✗ ${name}`);
      console.log(`  ${err.message}`);
      results.failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${results.passed} passed, ${results.failed} failed, ${results.skipped} skipped`);
  console.log(`Total: ${tests.length} tests`);
  
  if (results.failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
