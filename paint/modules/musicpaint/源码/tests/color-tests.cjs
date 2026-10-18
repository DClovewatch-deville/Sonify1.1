'use strict';
/* Colour extraction acceptance tests (color.js).
 * The rule under test: red/orange/yellow read warm (+), blue/cyan read cool
 * (-), green reads as neutral, grey/white/black do not vote, transparency is
 * composited on white, and very large images are sampled without blowing up.
 */
const assert = require('node:assert/strict');
const color = require('../color.js');

const checks = [];
function ok(name) { checks.push(name); }

function solid(w, h, rgba) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba.length > 3 ? rgba[3] : 255;
  }
  return { width: w, height: h, data };
}
function pattern(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y);
    const i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2];
    data[i + 3] = c.length > 3 ? c[3] : 255;
  }
  return { width: w, height: h, data };
}

/* 1. Hue sign: red warm, blue cool, green neutral ------------------------ */
{
  const red = color.extract(solid(64, 64, [200, 40, 40]));
  const orange = color.extract(solid(64, 64, [210, 120, 40]));
  const yellow = color.extract(solid(64, 64, [210, 200, 50]));
  const blue = color.extract(solid(64, 64, [40, 70, 200]));
  const cyan = color.extract(solid(64, 64, [40, 180, 200]));
  const green = color.extract(solid(64, 64, [60, 170, 60]));
  // A leaf green leans slightly teal in most photos; allow that, but keep it
  // far from either pole so foliage never reads as "fire" or "ice".
  const foliage = color.extract(solid(64, 64, [50, 170, 70]));

  assert(red.warmth > 0.5, 'red must read warm, got ' + red.warmth);
  assert(orange.warmth > 0.2, 'orange must read warm, got ' + orange.warmth);
  assert(yellow.warmth > 0.2, 'yellow must read warm, got ' + yellow.warmth);
  assert(blue.warmth < -0.5, 'blue must read cool, got ' + blue.warmth);
  assert(cyan.warmth < -0.2, 'cyan must read cool, got ' + cyan.warmth);
  assert(Math.abs(green.warmth) < 0.1, 'green must read near neutral, got ' + green.warmth);
  assert(Math.abs(foliage.warmth) < 0.25, 'leaf green must stay near neutral, got ' + foliage.warmth);
  assert(red.warmth > green.warmth && green.warmth > blue.warmth, 'ordering red > green > blue');
  ok('hue sign: red/orange/yellow warm, blue/cyan cool, green neutral');
}

/* 2. Neutral and extreme images do not vote ------------------------------ */
{
  for (const grey of [[128, 128, 128], [0, 0, 0], [255, 255, 255]]) {
    const c = color.extract(solid(32, 32, grey));
    assert(Math.abs(c.warmth) <= 0.05, 'grey/black/white must stay neutral, got ' + c.warmth);
  }
  const white = color.extract(solid(32, 32, [255, 255, 255]));
  assert(white.luminance > 0.98, 'white must read bright');
  const black = color.extract(solid(32, 32, [0, 0, 0]));
  assert(black.luminance < 0.02, 'black must read dark');
  assert(black.saturation < 0.05, 'black must read unsaturated');
  ok('neutral greys/whites/blacks abstain from the warmth vote');
}

/* 3. Luminance and saturation are meaningful ----------------------------- */
{
  const dark = color.extract(solid(32, 32, [80, 20, 20]));
  const light = color.extract(solid(32, 32, [230, 180, 180]));
  assert(light.luminance > dark.luminance, 'lighter image must have higher luminance');
  const vivid = color.extract(solid(32, 32, [250, 10, 10]));
  const pale = color.extract(solid(32, 32, [230, 190, 190]));
  assert(vivid.saturation > pale.saturation, 'vivid image must read more saturated');
  ok('luminance and saturation track the pixels');
}

/* 4. Transparency composites on white ------------------------------------ */
{
  const clear = color.extract(solid(32, 32, [0, 0, 0, 0]));
  assert(Math.abs(clear.warmth) <= 0.05, 'fully transparent must stay neutral');
  // A canvas that is half transparent black and half opaque black is still black.
  const half = pattern(40, 40, (x) => (x < 20 ? [0, 0, 0, 0] : [0, 0, 0, 255]));
  const h = color.extract(half);
  assert(Math.abs(h.warmth) <= 0.05);
  // Semi-transparent red over white should stay warm but paler.
  const ghost = color.extract(solid(32, 32, [200, 30, 30, 64]));
  const full = color.extract(solid(32, 32, [200, 30, 30, 255]));
  assert(ghost.warmth > 0.2, 'translucent red must still read warm');
  assert(ghost.saturation < full.saturation, 'translucent red must read paler');
  ok('alpha is composited on white, not dropped');
}

/* 5. Mixed image: dominant hue wins -------------------------------------- */
{
  const mostlyRed = pattern(60, 60, (x) => (x < 50 ? [220, 40, 40] : [40, 40, 220]));
  const mostlyBlue = pattern(60, 60, (x) => (x < 10 ? [220, 40, 40] : [40, 40, 220]));
  assert(color.extract(mostlyRed).warmth > 0, 'red-dominant image must read warm');
  assert(color.extract(mostlyBlue).warmth < 0, 'blue-dominant image must read cool');
  ok('the dominant area drives the reading');
}

/* 6. Palette is valid, deduplicated, present ----------------------------- */
{
  const striped = pattern(90, 30, (x) => (x % 30 < 10 ? [220, 40, 40] : x % 30 < 20 ? [30, 60, 220] : [240, 220, 40]));
  const c = color.extract(striped);
  assert(Array.isArray(c.palette));
  assert(c.palette.length > 0 && c.palette.length <= 5, 'palette should hold 1..5 colours');
  assert.equal(new Set(c.palette).size, c.palette.length, 'palette must not repeat a colour');
  for (const hex of c.palette) assert(/^#[0-9A-F]{6}$/.test(hex), 'palette entries must be #RRGGBB');
  ok('palette is valid, deduplicated and bounded at five');
}

/* 7. Large images are sampled, bounded, and still correct ---------------- */
{
  // A 6000x4000 red field is 24M pixels; extraction must stay fast and exact.
  const big = solid(6000, 4000, [200, 40, 40]);
  const started = Date.now();
  const c = color.extract(big);
  const elapsed = Date.now() - started;
  assert(c.warmth > 0.5, 'a huge red image must still read warm');
  assert(elapsed < 4000, 'sampling should finish quickly, took ' + elapsed + 'ms');
  // Sampling must not always hit the top-left corner: half red, half blue
  // on a large canvas still has to read as a mixture, not as the first rows.
  const split = pattern(4000, 4000, (x) => (x < 2000 ? [200, 40, 40] : [40, 40, 200]));
  const s = color.extract(split);
  assert(Math.abs(s.warmth) < Math.abs(c.warmth), 'a split image must read less extreme than a solid one');
  assert(s.palette.length >= 2, 'a split image must yield both colours');
  ok('large images are spread-sampled, bounded, and still correct');
}

/* 8. Bad input returns a safe neutral ------------------------------------ */
{
  const cases = [null, undefined, {}, { width: 0, height: 0, data: [] }, { width: -5, height: 5, data: [] },
    { width: 10, height: 10, data: new Uint8ClampedArray(4) }, { width: 1.5, height: 2, data: new Uint8ClampedArray(0) },
    { width: 1e5, height: 1e5, data: new Uint8ClampedArray(4) }];
  for (const bad of cases) {
    const c = color.extract(bad);
    assert(c && typeof c === 'object');
    assert.equal(c.warmth, 0);
    assert.equal(c.luminance, 0.5);
    assert.equal(c.saturation, 0);
    assert.deepEqual(c.palette, []);
  }
  ok('invalid buffers degrade to a neutral colour');
}

/* 9. Determinism --------------------------------------------------------- */
{
  const img = pattern(120, 80, (x, y) => [x * 2, y * 3, (x + y) % 255]);
  assert.deepEqual(color.extract(img), color.extract(img));
  ok('extraction is deterministic');
}

console.log(JSON.stringify({ status: 'passed', checks }, null, 2));
