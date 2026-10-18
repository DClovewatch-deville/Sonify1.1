(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SonifyColor = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MAX_SAMPLES = 12000;

  function empty() {
    return { warmth: 0, luminance: 0.5, saturation: 0, palette: [] };
  }

  var HEX = function (v) {
    var s = Math.round(v).toString(16).toUpperCase();
    return s.length < 2 ? "0" + s : s;
  };
  function toHex(r, g, b) {
    return "#" + HEX(r) + HEX(g) + HEX(b);
  }

  // sRGB -> linear light, then perceived luminance
  function luma(r, g, b) {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function valid(e) {
    if (!e || typeof e !== "object") return false;
    var d = e.data, w = e.width, h = e.height;
    if (!d || typeof d.length !== "number") return false;
    if (typeof w !== "number" || typeof h !== "number") return false;
    if (!(w > 0) || !(h > 0) || w % 1 !== 0 || h % 1 !== 0) return false;
    if (w * h > 1e8) return false; // sanity: reject absurd framebuffers
    if (d.length < w * h * 4) return false;
    return true;
  }

  function extract(imageData) {
    if (!valid(imageData)) return empty();

    var data = imageData.data;
    var w = imageData.width, h = imageData.height;
    var total = w * h;

    // Sample on a two-dimensional grid. A single linear stride would walk
    // diagonally and only ever visit the left-hand slice of a wide image, so
    // large photos would lose half their colours.
    var stepX = 1, stepY = 1;
    if (total > MAX_SAMPLES) {
      var ratio = Math.ceil(Math.sqrt(total / MAX_SAMPLES));
      stepX = stepY = ratio;
      while (Math.ceil(w / stepX) * Math.ceil(h / stepY) > MAX_SAMPLES) { stepX++; stepY++; }
    }

    var sumL = 0, sumS = 0, sumW = 0, weight = 0;
    var buckets = {}; // key -> {r,g,b,w}
    var count = 0;

    for (var y = 0; y < h; y += stepY) {
      var rowStart = y * w;
      for (var x = 0; x < w; x += stepX) {
        var i = (rowStart + x) * 4;
        var a = data[i + 3];
        if (a === 0) continue;

        var r = data[i], g = data[i + 1], b = data[i + 2];
        if (a !== 255) { // composite on white
          var f = a / 255;
          r = Math.round(r * f + 255 * (1 - f));
          g = Math.round(g * f + 255 * (1 - f));
          b = Math.round(b * f + 255 * (1 - f));
        }
        count++;

        var L = luma(r, g, b);
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        var chroma = (mx - mn) / 255;          // 0..1
        var S = mx > 0 ? (mx - mn) / mx : 0;    // HSV-style saturation

        // Warmth: only saturated pixels of a genuinely warm/cool hue vote.
        // Hue-driven sign: red/orange/yellow > 0, blue/cyan < 0, pure green ~ 0.
        var warm = 0;
        if (chroma > 0.04) {
          var rr = r - g, bb = b - g; // green is the neutral pivot
          var axis = rr - bb;        // >0 r-dominant(warm), <0 b-dominant(cool)
          if (axis !== 0) {
            // normalise by chroma so pale tints don't vote wildly
            warm = axis / (chroma * 255);
            if (warm > 1) warm = 1; else if (warm < -1) warm = -1;
          }
        }

        // Weight: chroma and mid-lightness matter; near-white/black/neutral fade out.
        var lightnessMid = 1 - Math.abs(L * 2 - 1);     // 0 at black/white, 1 at mid
        var wgt = chroma * (0.25 + 0.75 * lightnessMid);
        if (wgt <= 0.0005) { // grey/white/black: don't skew warmth
          sumL += L * 0.02; sumS += S * 0.02; weight += 0.02;
          sumW += 0;
          continue;
        }

        sumL += L * wgt;
        sumS += S * wgt;
        sumW += warm * wgt;
        weight += wgt;

        // Small-bucket quantisation for the palette (5 bits per channel + weight)
        var bucketWeight = wgt;
        var qr = r >> 3, qg = g >> 3, qb = b >> 3;
        var key = (qr << 10) | (qg << 5) | qb;
        var bk = buckets[key];
        if (bk) {
          bk.r += r * bucketWeight;
          bk.g += g * bucketWeight;
          bk.b += b * bucketWeight;
          bk.w += bucketWeight;
        } else {
          buckets[key] = { r: r * bucketWeight, g: g * bucketWeight, b: b * bucketWeight, w: bucketWeight };
        }
      }
    }

    if (count === 0 || weight <= 0) return empty();

    var warmth = sumW / weight;
    if (!isFinite(warmth)) warmth = 0;
    var luminance = sumL / weight;
    if (!isFinite(luminance)) luminance = 0.5;
    var saturation = sumS / weight;
    if (!isFinite(saturation)) saturation = 0;

    var list = [];
    for (var k in buckets) {
      if (!Object.prototype.hasOwnProperty.call(buckets, k)) continue;
      list.push(buckets[k]);
    }
    list.sort(function (x, y) { return y.w - x.w; });

    var palette = [];
    for (var j = 0; j < list.length && palette.length < 5; j++) {
      var e = list[j];
      if (!(e.w > 0)) continue;
      var cr = Math.max(0, Math.min(255, Math.round(e.r / e.w)));
      var cg = Math.max(0, Math.min(255, Math.round(e.g / e.w)));
      var cb = Math.max(0, Math.min(255, Math.round(e.b / e.w)));
      var hex = toHex(cr, cg, cb);
      if (/^#[0-9A-F]{6}$/.test(hex) && palette.indexOf(hex) === -1) palette.push(hex);
    }

    return clampAll(warmth, luminance, saturation, palette);
  }

  function clampAll(warmth, luminance, saturation, palette) {
    return {
      warmth: clamp(warmth, -1, 1),
      luminance: clamp(luminance, 0, 1),
      saturation: clamp(saturation, 0, 1),
      palette: palette
    };
  }

  function clamp(v, lo, hi) {
    if (!isFinite(v)) return lo === -1 ? 0 : (lo === 0 ? 0.5 : 0);
    return v < lo ? lo : v > hi ? hi : v;
  }

  return { extract: extract };
});
