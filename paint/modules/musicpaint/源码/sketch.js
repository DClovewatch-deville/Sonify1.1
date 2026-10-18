/* Local photo-to-sketch raster processing. No dependencies or network requests.
 * Pure ImageData-like input/output: shared by the browser UI and Node tests.
 * Three sliding box blurs approximate a soft Gaussian in O(width * height).
 */
(function (root) {
  'use strict';

  const MAX_SIDE = 1024;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function grayscale(image) {
    const { width: iw, height: ih, data } = image || {};
    if (
      !Number.isInteger(iw) ||
      !Number.isInteger(ih) ||
      iw < 1 ||
      ih < 1 ||
      iw * ih > 50000000 ||
      !data ||
      data.length !== iw * ih * 4
    ) {
      throw new Error('图片数据无效或像素过大');
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
    const width = Math.max(1, Math.round(iw * scale));
    const height = Math.max(1, Math.round(ih * scale));
    const gray = new Float32Array(width * height);
    const luminance = (x, y) => {
      const i = (y * iw + x) * 4,
        alpha = data[i + 3] / 255;
      return (
        (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * alpha + 255 * (1 - alpha)
      );
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = clamp(((x + 0.5) * iw) / width - 0.5, 0, iw - 1);
        const sy = clamp(((y + 0.5) * ih) / height - 0.5, 0, ih - 1);
        const x0 = Math.floor(sx),
          y0 = Math.floor(sy);
        const x1 = Math.min(iw - 1, x0 + 1),
          y1 = Math.min(ih - 1, y0 + 1);
        const fx = sx - x0,
          fy = sy - y0;
        gray[y * width + x] =
          luminance(x0, y0) * (1 - fx) * (1 - fy) +
          luminance(x1, y0) * fx * (1 - fy) +
          luminance(x0, y1) * (1 - fx) * fy +
          luminance(x1, y1) * fx * fy;
      }
    }
    return { gray, width, height };
  }

  function boxBlur(source, width, height, radius) {
    const horizontal = new Float32Array(source.length);
    const output = new Float32Array(source.length);
    const span = radius * 2 + 1;
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += source[row + clamp(k, 0, width - 1)];
      for (let x = 0; x < width; x++) {
        horizontal[row + x] = sum / span;
        sum +=
          source[row + clamp(x + radius + 1, 0, width - 1)] -
          source[row + clamp(x - radius, 0, width - 1)];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++)
        sum += horizontal[clamp(k, 0, height - 1) * width + x];
      for (let y = 0; y < height; y++) {
        output[y * width + x] = sum / span;
        sum +=
          horizontal[clamp(y + radius + 1, 0, height - 1) * width + x] -
          horizontal[clamp(y - radius, 0, height - 1) * width + x];
      }
    }
    return output;
  }

  function render(image, options = {}) {
    const { gray, width, height } = grayscale(image);
    const style = options.style === 'outline' ? 'outline' : 'pencil';
    const strength = clamp(Number.isFinite(options.strength) ? options.strength : 3, 1, 5);
    const gain = 0.55 + strength * 0.23;
    const smooth = boxBlur(gray, width, height, 1);
    const radius = Math.max(2, Math.round(Math.max(width, height) / 100));
    let soft = smooth;
    for (let pass = 0; pass < 3; pass++) soft = boxBlur(soft, width, height, radius);
    const data = new Uint8ClampedArray(width * height * 4);
    let inkTotal = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const at = (dx, dy) =>
          smooth[clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)];
        const gx = -at(-1, -1) + at(1, -1) - 2 * at(-1, 0) + 2 * at(1, 0) - at(-1, 1) + at(1, 1);
        const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
        const edge = clamp((Math.hypot(gx, gy) / 4 - 4) / 65, 0, 1);
        const dodgeInk = clamp(((soft[i] - smooth[i]) / Math.max(8, soft[i])) * 2.8, 0, 1);
        const shading = (1 - smooth[i] / 255) * 0.18;
        const ink = clamp(
          gain * (style === 'outline' ? edge : dodgeInk * 0.76 + edge * 0.32 + shading),
          0,
          1
        );
        const value = Math.round(255 * (1 - ink));
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = value;
        data[i * 4 + 3] = 255;
        inkTotal += 255 - value;
      }
    }
    return { width, height, data, style, strength, meanInk: inkTotal / (width * height) };
  }

  const api = { render, MAX_SIDE };
  root.SonifySketch = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
