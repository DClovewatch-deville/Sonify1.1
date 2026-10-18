/* Small browser adapter. Raster math lives in sketch.js; music remains in app.js. */
(function (root) {
  'use strict';

  async function readPhoto(file) {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type))
      throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片');
    if (file.size > 20 * 1024 * 1024) throw new Error('请选择 20 MB 以内的图片');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.width || !image.height || image.width * image.height > 50000000)
        throw new Error('图片像素过大，请先缩小');
      const scale = Math.min(1, root.SonifySketch.MAX_SIDE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function mount({ getSource, apply, download }) {
    const $ = (id) => document.getElementById(id);
    const dialog = $('sketchDialog');
    let original = null,
      rendered = null,
      sourceName = '照片',
      revision = 0,
      applying = false;
    const status = (text, error = false) => {
      $('sketchStatus').textContent = text;
      $('sketchStatus').style.color = error ? '#ae5844' : '';
    };
    const ready = (value) => {
      $('downloadSketch').disabled = !value;
      $('useSketch').disabled = !value;
    };
    const show = (canvas, source) => {
      canvas.width = source.width;
      canvas.height = source.height;
      canvas.getContext('2d').drawImage(source, 0, 0);
    };

    async function generate() {
      if (!original || applying) return;
      const token = ++revision;
      ready(false);
      status('正在本机生成素稿…');
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (token !== revision || !dialog.open) return;
      try {
        const input = original.getContext('2d').getImageData(0, 0, original.width, original.height);
        const result = root.SonifySketch.render(input, {
          style: $('sketchStyle').value,
          strength: +$('sketchStrength').value
        });
        rendered = document.createElement('canvas');
        rendered.width = result.width;
        rendered.height = result.height;
        rendered
          .getContext('2d')
          .putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
        show($('sketchResult'), rendered);
        $('sketchPreview').hidden = false;
        $('sketchEmpty').hidden = true;
        ready(true);
        status(`已生成 ${result.width} × ${result.height} 素稿，可以下载或继续生成音乐。`);
      } catch (error) {
        rendered = null;
        status('素稿生成失败：' + error.message, true);
      }
    }

    function setSource(canvas, name) {
      original = document.createElement('canvas');
      show(original, canvas);
      show($('sketchOriginal'), original);
      sourceName = name || '照片';
      rendered = null;
      generate();
    }

    $('openSketch').onclick = () => {
      dialog.showModal();
      const source = getSource();
      if (source?.canvas) setSource(source.canvas, source.name);
      else {
        original = rendered = null;
        ready(false);
        $('sketchPreview').hidden = true;
        $('sketchEmpty').hidden = false;
        status('先选择一张照片。照片只在设备内处理。');
      }
    };
    $('closeSketch').onclick = () => dialog.close();
    dialog.addEventListener('close', () => {
      revision++;
    });
    $('sketchFile').onchange = async (event) => {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file || applying) return;
      const token = ++revision;
      ready(false);
      status('正在读取照片…');
      try {
        const canvas = await readPhoto(file);
        if (token !== revision || !dialog.open) return;
        setSource(canvas, file.name);
      } catch (error) {
        if (token !== revision) return;
        ready(!!rendered);
        status(error.message + '；上一次结果已保留。', true);
      }
    };
    $('sketchStyle').onchange = generate;
    $('sketchStrength').oninput = () => {
      $('sketchStrengthValue').textContent = ['很淡', '偏淡', '适中', '偏浓', '浓重'][
        +$('sketchStrength').value - 1
      ];
      generate();
    };
    $('downloadSketch').onclick = () => {
      if (!rendered) return;
      const name = sourceName
        .replace(/\.[^.]+$/, '')
        .replace(/[\\/:*?"<>|]/g, '-')
        .slice(0, 60);
      rendered.toBlob((blob) => {
        if (blob) {
          download(blob, name + '-素稿.png');
          status('已下载素稿 PNG；音乐作品保持原样。');
        } else status('导出未完成，请重试。', true);
      }, 'image/png');
    };
    $('useSketch').onclick = async () => {
      if (!rendered || applying) return;
      applying = true;
      ready(false);
      for (const id of ['sketchFile', 'sketchStyle', 'sketchStrength', 'closeSketch'])
        $(id).disabled = true;
      status('正在将素稿转成音乐轮廓…');
      try {
        await apply(rendered, sourceName, original);
        dialog.close();
      } catch (error) {
        status(error.message, true);
      } finally {
        applying = false;
        for (const id of ['sketchFile', 'sketchStyle', 'sketchStrength', 'closeSketch'])
          $(id).disabled = false;
        ready(!!rendered);
      }
    };
    dialog.addEventListener('cancel', (event) => {
      if (applying) event.preventDefault();
    });
  }

  root.SonifyPhoto = { readPhoto, mount };
})(window);
