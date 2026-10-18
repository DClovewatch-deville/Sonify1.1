# Third-Party Notices

Sonify 使用了以下第三方组件、音源、模型与素材。许可证全文见 [`第三方许可/`](第三方许可/)。

## 运行库

| 名称 | 类型 | 版本 | 许可证 | 用途 |
|---|---|---|---|---|
| Python | 运行时 | 3.12 | PSF License | 服务端与渲染管线 |
| NumPy | 库 | — | BSD-3-Clause | 数值计算、音频数组 |
| Pillow | 库 | — | HPND | 图片读写与缩放 |
| opencv-contrib-python-headless | 库 | 5.0.0.93 | Apache-2.0 | 轮廓与结构提取 |
| tinysoundfont | 库 | 0.3.7 | MIT | SoundFont 离线渲染 |
| qrcode[pil] | 库 | 8.2 | BSD | 现场配对二维码 |
| mido | 库 | — | MIT | MIDI 读写 |
| soundfile | 库 | — | BSD-3-Clause | 音频文件读写 |

## 音源与素材

| 名称 | 类型 | 许可证 | 用途 |
|---|---|---|---|
| FluidR3Mono GM SoundFont | 音源 | 见 `第三方许可/FluidR3Mono-LICENSE.txt` | 乐器音色与离线渲染 |
| MIDI.js Soundfonts | 音源 | 见 `第三方许可/MIDI-js-soundfonts-README.txt` | Web 端音色 |
| VSCO-2-CE | 音源 | 见 `paint/modules/musicpaint/来源/VSCO-2-CE-LICENSE.txt` | MusicPaint 音源 |
| Wikimedia Commons | 图片素材 | CC-BY（逐条保留作者与来源） | 在线发现、声音画册 |

## 云端模型

| 名称 | 类型 | 说明 |
|---|---|---|
| 豆包 Seedream | 图生图 API | 将上传照片转换为结构线稿；需用户自行开通火山方舟模型与额度，遵守其服务条款 |

> 上传图片仅用于本次生成；不在仓库中保存用户原图。生产部署时应根据实际服务条款补充隐私说明。

## 字体与浏览器

| 名称 | 类型 | 说明 |
|---|---|---|
| Microsoft YaHei | 系统字体 | 界面文字；随操作系统许可使用 |
| Chrome / Edge | 浏览器 | 运行前端 |

---

如发现遗漏，请在 Issue 中指出，我们会补充许可证与来源。
