# Sonify 最终整合版 · 项目结构

> 统计对象：`Sonify-最终整合版!!!-20261018`
> 总计：**7,942.5 MB（约 7.94 GB）· 4,377 个文件**

---

## 1. 一句话结论

**这不是一个 8 GB 的代码库，而是一个 8 GB 的“演示产物包”。**

- **85.8% 是生成的 WAV 音频**（6.82 GB / 2,015 个文件）
- **6.9% 是 JSON 乐谱/几何数据**（0.55 GB）
- **真正的可编辑源码只有约 2 MB Python + 少量 JS/CSS/HTML**
- 大 HTML/JS 多数是**内联了音源/模型的构建产物**（Fourier 68 MB、MusicPaint 31 MB、圆绘 49 MB）

---

## 2. 顶层结构

```
Sonify-最终整合版!!!-20261018/            7.94 GB · 4,377 files
├─ photo/                                7.67 GB · 4,232 files   ← MusicPhoto
│  ├─ intake/                            6.58 GB · 3,659 files   ← 上传 / 社区 / Lab / 长卷 / HTTP
│  └─ experiment/                        1.08 GB · 559 files     ← 几何 / 编曲 / Color DNA / 四时
├─ paint/                                273 MB · 84 files       ← MusicPaint
│  └─ modules/
│     ├─ fourier/                        209 MB · 34 files
│     └─ musicpaint/                     64 MB · 47 files
├─ verification/                         1.5 MB · 41 files      ← 验收记录
├─ 第三方许可/                           4 files
├─ portable/                             2 files（构建脚本，无运行时）
├─ start_sonify.py                       启动器
├─ 启动最终版!!!.cmd                     双击启动
├─ run-local.cmd                         离线启动
├─ README-最终版!!!.md / 使用说明.txt
├─ Sonify.html / 优化报告.html
├─ research-day3.json / 打包清单.json
└─ SHA256SUMS.json                       0.5 MB（全包校验）
```

---

## 3. 详细树状图

```
Sonify-最终整合版!!!-20261018/                        7.94 GB · 4,377
│
├─ photo/                                              7.67 GB · 4,232
│  │
│  ├─ intake/                                          6.58 GB · 3,659
│  │  ├─ web/                                          4.95 GB · 2,506
│  │  │  ├─ museum/                                    4.95 GB · 2,478  ★ 最大目录
│  │  │  │  ├─ scroll/                                 ~102 MB · 46     千古长卷
│  │  │  │  │  ├─ v3/                                  35.2 MB          清明上河图（当前）
│  │  │  │  │  ├─ fuchun/                              24.0 MB          富春山居图
│  │  │  │  │  ├─ qianli/                              23.0 MB          千里江山图
│  │  │  │  │  ├─ v2/                                  11.2 MB          旧版
│  │  │  │  │  └─ hongqiao.jpg / wav / geometry...     ~9 MB
│  │  │  │  ├─ campus-*/                               160–220 MB × N    校园作品
│  │  │  │  ├─ online-*/                               260–285 MB × 6    在线发现
│  │  │  │  ├─ tower/ crescent/ library/ axis/ ...     170–220 MB × N    建筑作品
│  │  │  │  └─ 共 26 个作品目录；每目录约 100–120 个文件
│  │  │  ├─ sonify.html                                门户（三分区）
│  │  │  ├─ index.html                                 /capture 图片上传
│  │  │  ├─ host.html                                  /host 接待台
│  │  │  ├─ community.html / .js / .css                /community 社区 + 点赞
│  │  │  ├─ experience.html / .js                      /experience 作品列表
│  │  │  ├─ journey.html / .js                         /journey 生成旅程
│  │  │  ├─ scroll.html                                /scroll 长卷播放器
│  │  │  ├─ musiclab.html                              /musiclab 声音画册
│  │  │  ├─ phone.html / .js                           手机访客上传
│  │  │  ├─ paint.html                                 MusicPaint 入口
│  │  │  └─ style.css / sonify.css / museum.css
│  │  │
│  │  ├─ runtime/                                      1.49 GB · 653   ★ 生成任务
│  │  │  ├─ 6702762e.../                               544 MB
│  │  │  ├─ e73a2a43.../                               473 MB
│  │  │  ├─ c35e1e04.../                               471 MB
│  │  │  └─ community-assets/                          0 MB
│  │  │     └─ 每个任务：original / skeleton / structural /
│  │  │        artistic / geometry.json / workspace/studio/*
│  │  │
│  │  ├─ batch_results/                                88.3 MB · 108  批量 Lab 结果
│  │  ├─ modules/circle/index.html                     48.7 MB        圆绘 / SAM 单文件
│  │  ├─ museum_ui/                                    discover / mapping
│  │  ├─ vendor/                                       5.5 MB · 299   Python 依赖
│  │  ├─ server.py                                     HTTP / 路由 / 任务队列
│  │  ├─ bridge.py                                     上传 → 工作区
│  │  ├─ seedream.py                                   豆包 Seedream 适配
│  │  ├─ role_remix.py                                 角色改派
│  │  ├─ community.py                                  社区 / 发布 / 点赞
│  │  ├─ scroll_score.py / scroll_player.js            长卷乐谱
│  │  ├─ discover_service.py                           在线发现代理
│  │  ├─ test_*.py                                     测试
│  │  └─ README.md / SCROLL_*.md / MUSICLAB_*.md 等
│  │
│  └─ experiment/                                      1.08 GB · 559
│     ├─ dist/                                         943 MB · 311
│     │  ├─ studio/                                    910 MB · 288   ★ 内置样张全套音频
│     │  │  ├─ sample0–5.json                          5.7–7.5 MB each
│     │  │  ├─ sample*-blueprint.wav                   ~1.1 MB each
│     │  │  ├─ sample*-soul-0..4.wav                   ~7.1 MB each
│     │  │  ├─ sample*-progressive-*.wav               3.2 MB each
│     │  │  ├─ sample*-season-v11-*.wav                四季 × 4 曲风
│     │  │  └─ sample*-identity-*.wav                  nature/chamber/piano/strings
│     │  ├─ soundfonts/FluidR3Mono_GM.sf3              22.6 MB        ★ 渲染音源
│     │  ├─ sample*-blueprint.json                     1.3–2.1 MB each
│     │  ├─ studio.html / studio.js / studio.css
│     │  ├─ role_editor.js / soul_*.js / living_color.js
│     │  └─ progressive-*.html / color-*.html
│     ├─ vendor/                                       138 MB · 138   OpenCV / NumPy
│     │  ├─ cv2/cv2.pyd                                107.2 MB
│     │  └─ cv2/opencv_videoio_ffmpeg500_64.dll        29.4 MB
│     ├─ ui/                                           0.2 MB · 15    前端源码
│     │  ├─ studio.html / studio.js / studio.css
│     │  ├─ role_editor.js                             角色改派 UI
│     │  ├─ soul_experience.js / soul_interaction.js
│     │  ├─ progressive_revelation.js
│     │  └─ living_color.js                            四时共鸣 UI
│     ├─ assets/                                       1.6 MB
│     ├─ *.py                                          几何 / 编曲 / Color DNA / 四时
│     │  ├─ blueprint.py / compose_blueprint.py
│     │  ├─ soul_composition.py / studio_grammar.py
│     │  ├─ progressive_arrangement.py / progressive_features.py
│     │  ├─ color_dna.py / seasonal_rules.py / identity_motif.py
│     │  └─ build_*.py / render_*.py
│     └─ test_*.py / test_*.cjs
│
├─ paint/                                              273 MB · 84
│  └─ modules/
│     ├─ fourier/                                      209 MB · 34
│     │  ├─ Sonify-Fourier.html                        68.2 MB        构建产物
│     │  ├─ 源码/                                      68.2 MB · 20    V4.31 源码
│     │  │  ├─ 00-offline-assets.js                    48.5 MB
│     │  │  ├─ 04-instrument-samples.js                17.0 MB
│     │  │  └─ 01–17 分模块
│     │  ├─ V4.31-original/                            70.1 MB · 5     原始离线版
│     │  └─ 材料1-傅里叶开场循环.gif                   1.9 MB
│     └─ musicpaint/                                   64 MB · 47
│        ├─ MusicPaint.html                            31.3 MB        构建产物
│        ├─ 源码/                                      31.4 MB · 23
│        │  ├─ 04-instrument-samples.js                17.0 MB
│        │  ├─ samples.js                              14.1 MB
│        │  └─ app.js / music.js / sketch.js / vision.js ...
│        ├─ 示例/                                      1.2 MB · 7
│        └─ 工具/                                      5 个 mjs 脚本
│
├─ verification/                                       1.5 MB · 41
│  ├─ FINAL_ACCEPTANCE.json
│  ├─ integration-sources.json                         1.0 MB
│  ├─ latest-upload-pipeline.json
│  ├─ *-tests.txt
│  └─ *.png                                            验收截图
│
├─ 第三方许可/                                          4 files
│  ├─ Apache-2.0.txt
│  ├─ FluidR3Mono-LICENSE.txt
│  ├─ MIDI-js-soundfonts-README.txt
│  └─ manifest.json
│
└─ 根目录启动/文档
   ├─ start_sonify.py                                  集成启动器
   ├─ 启动最终版!!!.cmd                                双击启动
   ├─ run-local.cmd                                    离线启动
   ├─ Sonify.html                                      入口页
   ├─ 使用说明.txt / README-最终版!!!.md
   ├─ 优化报告.html
   ├─ research-day3.json / 打包清单.json
   └─ SHA256SUMS.json                                  全包 SHA256
```

---

## 4. 体积构成（按扩展名）

| 类型 | 大小 | 文件数 | 占比 |
|---|---:|---:|---:|
| `.wav` 生成音频 | **6,815.8 MB** | 2,015 | **85.8%** |
| `.json` 乐谱/几何 | 551.8 MB | 821 | 6.9% |
| `.html` 构建页面 | 217.0 MB | 79 | 2.7% |
| `.pyd` 二进制扩展 | 107.7 MB | 3 | 1.4% |
| `.js` 脚本/内联音源 | 100.5 MB | 90 | 1.3% |
| `.mp3` | 33.2 MB | 72 | 0.4% |
| `.dll` | 31.7 MB | 2 | 0.4% |
| `.jpg` | 31.6 MB | 88 | 0.4% |
| `.sf3` SoundFont | 22.6 MB | 1 | 0.3% |
| `.png` | 16.5 MB | 94 | 0.2% |
| `.mid` | 2.3 MB | 410 | 0.03% |
| `.py` 源码 | **2.0 MB** | 248 | **0.03%** |

---

## 5. 三个模块的职责

| 模块 | 目录 | 职责 | 体积 |
|---|---|---|---:|
| **MusicPhoto** | `photo/intake` + `photo/experiment` | 上传、线稿、几何提取、三模式编曲、社区、长卷、角色改派 | 7.67 GB |
| **MusicPaint** | `paint/modules` | 手绘/文字/图像 → 旋律；Fourier 绘谱 | 273 MB |
| **验收/授权** | `verification` + `第三方许可` | 验收记录与许可证 | 1.5 MB |

---

## 6. 开发 vs 演示：该留什么

| 用途 | 需要的内容 | 约大小 |
|---|---|---:|
| **只改代码 / 看架构** | 仓库源码 + 文档 | **2.4 MB** |
| **最小可运行开发** | 源码 + SoundFont + vendor + 1 个作品 + 1 个长卷 | **~200 MB** |
| **完整三模式 + 全量画册** | 全部 museum + dist/studio + runtime | **7.94 GB** |

> 结论：朋友远程开发只需要 **~200 MB**；完整 7.94 GB 放网盘/Release，不要进 Git。

---

## 7. 一句话记忆

```
photo/intake/web/museum  (4.95 GB)  ← 展览媒体
photo/intake/runtime     (1.49 GB)  ← 生成任务
photo/experiment/dist    (0.94 GB)  ← 内置样张音频
paint/modules            (0.27 GB)  ← Paint
其余（代码/文档/验收）   (≈0.01 GB) ← 真正要读的
```
