/* Sonify V3 vision adapter, 2026-10-15. Adapted from supplied Circle Drawing Music V2.33.
 * Reuses local contour extraction; adds bounded input, normalized paths, IDs, and independent Fourier helpers.
 * No network, model or user-data upload. This module is classic-script/file:// compatible.
 */
(function (root) {
  'use strict';

  // Trace both outside and inside glyph boundaries; only outlines are displayed.
  function traceGlyphMask(data, w, h) {
    const edges = [],
      starts = new Map(),
      solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 127;
    function edge(x, y, u, v) {
      const i = edges.length;
      edges.push({ x, y, u, v, used: false });
      const key = y * (w + 1) + x;
      if (!starts.has(key)) starts.set(key, []);
      starts.get(key).push(i);
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (solid(x, y)) {
          if (!solid(x, y - 1)) edge(x, y, x + 1, y);
          if (!solid(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
          if (!solid(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
          if (!solid(x - 1, y)) edge(x, y + 1, x, y);
        }
    const contours = [];
    for (const start of edges) {
      if (start.used) continue;
      let e = start,
        loop = [],
        guard = 0;
      while (e && !e.used && guard++ <= edges.length) {
        e.used = true;
        loop.push({ x: e.x, y: e.y });
        if (e.u === start.x && e.v === start.y) break;
        const candidates = (starts.get(e.v * (w + 1) + e.u) || [])
          .map((i) => edges[i])
          .filter((v) => !v.used);
        // Prefer a right turn at diagonally touching pixels to keep separate loops.
        const dx = e.u - e.x,
          dy = e.v - e.y;
        candidates.sort((a, b) => {
          const score = (v) => {
            const cross = dx * (v.v - v.y) - dy * (v.u - v.x),
              dot = dx * (v.u - v.x) + dy * (v.v - v.y);
            return cross > 0 ? 0 : dot > 0 ? 1 : cross < 0 ? 2 : 3;
          };
          return score(a) - score(b);
        });
        e = candidates[0];
      }
      if (loop.length < 8) continue;
      let area = 0;
      for (let i = 0; i < loop.length; i++) {
        let a = loop[i],
          b = loop[(i + 1) % loop.length];
        area += a.x * b.y - a.y * b.x;
      }
      if (Math.abs(area) < 12) continue;
      // Remove collinear raster edges while preserving corners and counters.
      loop = loop.filter((b, i, a) => {
        const p = a[(i + a.length - 1) % a.length],
          n = a[(i + 1) % a.length];
        return (b.x - p.x) * (n.y - b.y) !== (b.y - p.y) * (n.x - b.x);
      });
      function simplify(a) {
        if (a.length <= 2) return a;
        const p = a[0],
          q = a.at(-1),
          dx = q.x - p.x,
          dy = q.y - p.y,
          den = dx * dx + dy * dy;
        let best = 0.75 * 0.75,
          k = -1;
        for (let i = 1; i < a.length - 1; i++) {
          const v = a[i],
            t = den ? Math.max(0, Math.min(1, ((v.x - p.x) * dx + (v.y - p.y) * dy) / den)) : 0,
            d = (v.x - p.x - t * dx) ** 2 + (v.y - p.y - t * dy) ** 2;
          if (d > best) {
            best = d;
            k = i;
          }
        }
        return k < 0
          ? [p, q]
          : simplify(a.slice(0, k + 1))
              .slice(0, -1)
              .concat(simplify(a.slice(k)));
      }
      if (loop.length >= 3) {
        const mid = Math.floor(loop.length / 2);
        loop = simplify(loop.slice(0, mid + 1))
          .slice(0, -1)
          .concat(simplify(loop.slice(mid).concat([loop[0]])));
        contours.push(loop);
      }
    }
    return contours;
  }

  // Local image processing. This deliberately does not claim semantic recognition.
  function extractStructure({ rgba, w, h, mode, detail, subject, structural = false }) {
    const gray = new Float32Array(w * h),
      smooth = new Float32Array(w * h),
      mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      let a = rgba[i * 4 + 3] / 255;
      gray[i] =
        (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) * a +
        255 * (1 - a);
    }
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        let i = y * w + x;
        smooth[i] =
          (gray[i] * 4 +
            (gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w]) * 2 +
            gray[i - w - 1] +
            gray[i - w + 1] +
            gray[i + w - 1] +
            gray[i + w + 1]) /
          16;
      }
    if (mode === 'line') {
      const threshold = 95 + detail * 24;
      for (let i = 0; i < w * h; i++) mask[i] = gray[i] < threshold ? 1 : 0;
      // Zhang-Suen thinning turns thick ink into a single centerline.
      for (let iter = 0; iter < 40; iter++) {
        let removed = 0;
        for (let pass = 0; pass < 2; pass++) {
          const del = [];
          for (let y = 1; y < h - 1; y++)
            for (let x = 1; x < w - 1; x++) {
              let i = y * w + x;
              if (!mask[i]) continue;
              const n = [
                mask[i - w],
                mask[i - w + 1],
                mask[i + 1],
                mask[i + w + 1],
                mask[i + w],
                mask[i + w - 1],
                mask[i - 1],
                mask[i - w - 1]
              ];
              let sum = n.reduce((a, b) => a + b, 0),
                changes = 0;
              for (let j = 0; j < 8; j++) if (!n[j] && n[(j + 1) % 8]) changes++;
              if (sum < 2 || sum > 6 || changes !== 1) continue;
              if (
                pass === 0
                  ? n[0] * n[2] * n[4] || n[2] * n[4] * n[6]
                  : n[0] * n[2] * n[6] || n[0] * n[4] * n[6]
              )
                continue;
              del.push(i);
            }
          for (const i of del) mask[i] = 0;
          removed += del.length;
        }
        if (!removed) break;
      }
    } else {
      const mag = new Float32Array(w * h),
        dir = new Uint8Array(w * h);
      let peak = 0;
      for (let y = 2; y < h - 2; y++)
        for (let x = 2; x < w - 2; x++) {
          let i = y * w + x,
            gx =
              -smooth[i - w - 1] +
              smooth[i - w + 1] -
              2 * smooth[i - 1] +
              2 * smooth[i + 1] -
              smooth[i + w - 1] +
              smooth[i + w + 1],
            gy =
              -smooth[i - w - 1] -
              2 * smooth[i - w] -
              smooth[i - w + 1] +
              smooth[i + w - 1] +
              2 * smooth[i + w] +
              smooth[i + w + 1];
          mag[i] = subject && !subject[i] ? 0 : Math.hypot(gx, gy);
          peak = Math.max(peak, mag[i]);
          dir[i] = Math.round((((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180) / 45) % 4;
        }
      const values = subject
          ? Array.from(mag)
              .filter((v) => v > 8)
              .sort((a, b) => a - b)
          : [],
        adaptive = values.length
          ? values[Math.floor((0.94 - detail * 0.035) * (values.length - 1))]
          : Infinity;
      const high = Math.max(subject ? 12 : 24, Math.min(peak * (0.32 - detail * 0.045), adaptive)),
        low = high * 0.42,
        weak = new Uint8Array(w * h),
        queue = [];
      for (let y = 2; y < h - 2; y++)
        for (let x = 2; x < w - 2; x++) {
          const i = y * w + x,
            d = [1, w + 1, w, w - 1][dir[i]];
          if (mag[i] < low || mag[i] < mag[i - d] || mag[i] <= mag[i + d]) continue;
          weak[i] = 1;
          if (mag[i] >= high) {
            mask[i] = 1;
            queue.push(i);
          }
        }
      for (let q = 0; q < queue.length; q++) {
        const i = queue[q];
        for (const d of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
          const j = i + d;
          if (j >= 0 && j < mask.length && weak[j] && !mask[j]) {
            mask[j] = 1;
            queue.push(j);
          }
        }
      }
    }
    // Border pixels are excluded: cropping is not an object boundary.
    for (let x = 0; x < w; x++) {
      mask[x] = 0;
      mask[(h - 1) * w + x] = 0;
    }
    for (let y = 0; y < h; y++) {
      mask[y * w] = 0;
      mask[y * w + w - 1] = 0;
    }
    function neighbors(i) {
      const x = i % w,
        y = Math.floor(i / w),
        out = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || x + dx < 0 || x + dx >= w || y + dy < 0 || y + dy >= h) continue;
          const j = i + dy * w + dx;
          if (!mask[j]) continue;
          if (dx && dy && (mask[i + dx] || mask[i + dy * w])) continue;
          out.push(j);
        }
      return out;
    }
    const adj = new Map();
    for (let i = 0; i < mask.length; i++) if (mask[i]) adj.set(i, neighbors(i));
    const seen = new Set(),
      paths = [];
    const key = (a, b) => Math.min(a, b) * mask.length + Math.max(a, b);
    function trace(start, next) {
      const p = [start];
      let prev = start,
        current = next;
      seen.add(key(prev, current));
      for (let guard = 0; guard < mask.length; guard++) {
        p.push(current);
        const ns = adj.get(current) || [];
        if (current === start || ns.length !== 2) break;
        const n = ns[0] === prev ? ns[1] : ns[0];
        if (seen.has(key(current, n))) break;
        seen.add(key(current, n));
        prev = current;
        current = n;
      }
      if (p.length >= (structural ? 6 : Math.max(10, 21 - detail * 3)))
        paths.push(p.map((i) => ({ x: i % w, y: Math.floor(i / w) })));
    }
    for (const [i, ns] of adj)
      if (ns.length !== 2) for (const n of ns) if (!seen.has(key(i, n))) trace(i, n);
    for (const [i, ns] of adj) for (const n of ns) if (!seen.has(key(i, n))) trace(i, n);
    // Bound simplification error in preview pixels, preserving prominent corners.
    function simplify(a) {
      if (a.length < 3) return a;
      const first = a[0],
        last = a.at(-1),
        dx = last.x - first.x,
        dy = last.y - first.y,
        den = dx * dx + dy * dy;
      let best = (1.45 - detail * 0.18) ** 2,
        index = -1;
      for (let i = 1; i < a.length - 1; i++) {
        let p = a[i],
          t = den
            ? Math.max(0, Math.min(1, ((p.x - first.x) * dx + (p.y - first.y) * dy) / den))
            : 0,
          d = (p.x - first.x - t * dx) ** 2 + (p.y - first.y - t * dy) ** 2;
        if (d > best) {
          best = d;
          index = i;
        }
      }
      return index < 0
        ? [first, last]
        : simplify(a.slice(0, index + 1))
            .slice(0, -1)
            .concat(simplify(a.slice(index)));
    }
    paths.sort((a, b) => b.length - a.length);
    const limit = structural ? 160 : 20 + detail * 16;
    // Spatial quotas preserve short features instead of letting one textured region fill the budget.
    if (structural) {
      const bins = new Map();
      const ranked = [];
      for (const p of paths) {
        const mid = p[Math.floor(p.length / 2)],
          key = Math.floor((mid.x / w) * 8) + 8 * Math.floor((mid.y / h) * 8),
          n = bins.get(key) || 0;
        bins.set(key, n + 1);
        ranked.push({ p, score: p.length / (1 + n * 0.7) });
      }
      ranked.sort((a, b) => b.score - a.score);
      paths.splice(0, paths.length, ...ranked.map((v) => v.p));
    }
    return { paths: paths.slice(0, limit).map(simplify), candidates: paths.length, limit, w, h };
  }

  const point = (p) =>
    Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]) } : { x: Number(p?.x), y: Number(p?.y) };
  function clean(points) {
    const a = [];
    for (const value of points || []) {
      const p = point(value);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const q = a.at(-1);
      if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-10) a.push(p);
    }
    return a;
  }
  function lengthOf(p) {
    let d = 0;
    for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return d;
  }
  function simplify(points, tolerance = 0.002) {
    const a = clean(points);
    if (a.length < 3) return a;
    const keep = new Uint8Array(a.length);
    keep[0] = keep[a.length - 1] = 1;
    const todo = [[0, a.length - 1]],
      limit = Math.max(0, Number(tolerance) || 0) ** 2;
    while (todo.length) {
      const [start, end] = todo.pop(),
        p = a[start],
        q = a[end],
        dx = q.x - p.x,
        dy = q.y - p.y,
        den = dx * dx + dy * dy;
      let best = limit,
        k = -1;
      for (let i = start + 1; i < end; i++) {
        const v = a[i],
          t = den ? Math.max(0, Math.min(1, ((v.x - p.x) * dx + (v.y - p.y) * dy) / den)) : 0,
          d = (v.x - p.x - t * dx) ** 2 + (v.y - p.y - t * dy) ** 2;
        if (d > best) {
          best = d;
          k = i;
        }
      }
      if (k >= 0) {
        keep[k] = 1;
        todo.push([start, k], [k, end]);
      }
    }
    return a.filter((_, i) => keep[i]);
  }
  function resample(path, n = 64) {
    const p = clean(path);
    n = Math.max(2, Math.min(2048, Math.floor(Number(n) || 64)));
    if (p.length < 2) return p;
    const d = [0];
    for (let i = 1; i < p.length; i++)
      d.push(d[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
    if (d.at(-1) < 1e-10) return [p[0]];
    let j = 1;
    return Array.from({ length: n }, (_, i) => {
      const target = (i * d.at(-1)) / (n - 1);
      while (j < p.length - 1 && d[j] < target) j++;
      const f = (target - d[j - 1]) / (d[j] - d[j - 1] || 1);
      return {
        x: p[j - 1].x + (p[j].x - p[j - 1].x) * f,
        y: p[j - 1].y + (p[j].y - p[j - 1].y) * f
      };
    });
  }
  /* fitPaths accepts [{id?,points:[{x,y}]}] or raw arrays; raw pixels by default.
   * fitPaths(paths,{width,height,normalized:true}) accepts image-normalized inputs.
   * Uses ONE scale for x/y, centers ink bounds, and keeps input IDs/order. */
  function fitPaths(raw, width = 1, height = 1, options = {}) {
    if (width && typeof width === 'object') {
      options = width;
      width = options.width || 1;
      height = options.height || 1;
    }
    const pad = Math.max(0, Math.min(0.4, options.padding ?? 0.08)),
      items = (raw || [])
        .map((item, i) => ({
          id: item.id || 'stroke-' + String(i + 1).padStart(3, '0'),
          points: clean(item.points || item).map((p) =>
            options.normalized ? { x: p.x * width, y: p.y * height } : p
          )
        }))
        .filter((p) => p.points.length > 1);
    if (!items.length) return [];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const item of items)
      for (const p of item.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    const scale = (1 - 2 * pad) / Math.max(maxX - minX, maxY - minY, 1e-9),
      cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2;
    return items.map((item) => ({
      ...item,
      points: item.points.map((p) => ({ x: 0.5 + (p.x - cx) * scale, y: 0.5 + (p.y - cy) * scale }))
    }));
  }
  function boundedImage(image) {
    const iw = Math.floor(image?.width || image?.w || 0),
      ih = Math.floor(image?.height || image?.h || 0),
      data = image?.data || image?.rgba;
    if (!iw || !ih || iw < 2 || ih < 2 || !data || data.length < iw * ih * 4)
      throw new Error('图片数据无效，请换一张图片。');
    if (iw * ih > 24000000) throw new Error('图片过大，请先缩小到 2400 万像素以内。');
    const scale = Math.min(1, 384 / Math.max(iw, ih)),
      w = Math.max(2, Math.round(iw * scale)),
      h = Math.max(2, Math.round(ih * scale));
    if (w === iw && h === ih) return { rgba: data, w, h, inputWidth: iw, inputHeight: ih };
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx = ((x + 0.5) * iw) / w - 0.5,
          sy = ((y + 0.5) * ih) / h - 0.5,
          x0 = Math.max(0, Math.floor(sx)),
          y0 = Math.max(0, Math.floor(sy)),
          x1 = Math.min(iw - 1, x0 + 1),
          y1 = Math.min(ih - 1, y0 + 1),
          fx = Math.max(0, sx - x0),
          fy = Math.max(0, sy - y0);
        for (let c = 0; c < 4; c++)
          rgba[(y * w + x) * 4 + c] =
            data[(y0 * iw + x0) * 4 + c] * (1 - fx) * (1 - fy) +
            data[(y0 * iw + x1) * 4 + c] * fx * (1 - fy) +
            data[(y1 * iw + x0) * 4 + c] * (1 - fx) * fy +
            data[(y1 * iw + x1) * 4 + c] * fx * fy;
      }
    return { rgba, w, h, inputWidth: iw, inputHeight: ih };
  }
  function extract(imageData, { mode = 'photo', detail = 3, maxPaths = 32 } = {}) {
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    detail = Math.max(1, Math.min(5, Number(detail) || 3));
    maxPaths = Math.max(1, Math.min(64, Math.floor(Number(maxPaths) || 32)));
    const im = boundedImage(imageData),
      { rgba, w, h } = im;
    let min = 255,
      max = 0,
      variance = 0,
      sum = 0,
      visible = 0;
    for (let i = 0; i < w * h; i++) {
      const a = rgba[i * 4 + 3] / 255,
        v =
          (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) * a +
          255 * (1 - a);
      min = Math.min(min, v);
      max = Math.max(max, v);
      sum += v;
      variance += v * v;
      if (a > 0.05) visible++;
    }
    variance = variance / (w * h) - (sum / (w * h)) ** 2;
    const stats = {
      inputWidth: im.inputWidth,
      inputHeight: im.inputHeight,
      width: w,
      height: h,
      mode: mode === 'line' ? 'line' : 'photo',
      detail,
      maxPaths,
      candidates: 0,
      kept: 0,
      discarded: 0,
      pointCount: 0,
      emptyReason: null,
      coordinateFrame: 'full-image',
      framePadding: 0.08
    };
    if (!visible || max - min < 7 || variance < 0.2) {
      stats.emptyReason = 'empty-image';
      return {
        paths: [],
        stats: {
          ...stats,
          elapsedMs: Math.round(
            (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started
          )
        }
      };
    }
    const result = extractStructure({ rgba, w, h, mode: stats.mode, detail, structural: true });
    const candidates = result.paths
      .map((p, i) => ({
        id: 'stroke-' + String(i + 1).padStart(3, '0'),
        points: simplify(p, Math.max(0.5, 1.6 - detail * 0.18)),
        length: lengthOf(p)
      }))
      .filter((p) => p.points.length > 1 && p.length >= Math.max(5, 15 - detail * 2));
    // Spread the budget across the frame while keeping longer contours preferentially.
    const bins = new Map();
    const ranked = candidates
      .map((p) => {
        const q = p.points[Math.floor(p.points.length / 2)],
          k = Math.min(5, Math.floor((q.x / w) * 6)) + 6 * Math.min(5, Math.floor((q.y / h) * 6)),
          count = bins.get(k) || 0;
        bins.set(k, count + 1);
        return { ...p, score: p.length / (1 + count * 0.6) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPaths);
    // Stable original extraction order; IDs do not change as the path budget is reduced.
    ranked.sort((a, b) => Number(a.id.slice(7)) - Number(b.id.slice(7)));
    // Match the full source-image overlay: preserve position within the frame and one uniform scale.
    const frameScale = 0.84 / Math.max(w, h);
    const paths = ranked.map((p) => ({
      id: p.id,
      points: (p.points.length > 256 ? resample(p.points, 256) : p.points).map((q) => ({
        x: 0.5 + (q.x - w / 2) * frameScale,
        y: 0.5 + (q.y - h / 2) * frameScale
      }))
    }));
    stats.candidates = result.candidates;
    stats.kept = paths.length;
    stats.discarded = Math.max(0, result.candidates - paths.length);
    stats.pointCount = paths.reduce((n, p) => n + p.points.length, 0);
    stats.emptyReason = paths.length ? null : 'no-clear-contours';
    stats.elapsedMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started
    );
    return { paths, stats };
  }
  function fourier(points, terms = 20) {
    const p = clean(points);
    if (p.length < 2) return { coeff: [], closed: false };
    const len = lengthOf(p),
      closed = Math.hypot(p[0].x - p.at(-1).x, p[0].y - p.at(-1).y) <= Math.max(1e-5, len * 0.002);
    let source = closed ? p : p.concat(p.slice(1, -1).reverse());
    if (Math.hypot(source[0].x - source.at(-1).x, source[0].y - source.at(-1).y) > 1e-10)
      source = source.concat([{ ...source[0] }]);
    const n = 128,
      s = resample(source, n + 1).slice(0, n),
      coeff = [];
    terms = Math.max(1, Math.min(n, Math.floor(Number(terms) || 20)));
    for (let k = 0; k < n; k++) {
      let re = 0,
        im = 0;
      for (let j = 0; j < n; j++) {
        const a = (2 * Math.PI * k * j) / n;
        re += s[j].x * Math.cos(a) + s[j].y * Math.sin(a);
        im += s[j].y * Math.cos(a) - s[j].x * Math.sin(a);
      }
      re /= n;
      im /= n;
      coeff.push({
        freq: k > n / 2 ? k - n : k,
        re,
        im,
        amp: Math.hypot(re, im),
        phase: Math.atan2(im, re)
      });
    }
    const dc = coeff[0];
    return {
      coeff: [
        dc,
        ...coeff
          .slice(1)
          .sort((a, b) => b.amp - a.amp)
          .slice(0, terms - 1)
      ],
      closed
    };
  }
  /* Periodic endpoint. Use t*0.5 for an open reflected path to traverse once. */
  function endpoint(coeff, t) {
    let x = 0,
      y = 0;
    for (const c of coeff || []) {
      const a = c.freq * t * 2 * Math.PI + c.phase;
      x += c.amp * Math.cos(a);
      y += c.amp * Math.sin(a);
    }
    return { x, y };
  }
  const api = {
    extract,
    fitPaths,
    resample,
    simplify,
    fourier,
    endpoint,
    extractStructure,
    traceGlyphMask
  };
  root.SonifyVision = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
