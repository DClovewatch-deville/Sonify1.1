# Sprint 0 完成报告（2026-10-13，01:02 — 2026-10-14 00:45）

## 推送状态
- 分支：`feature/sprint0-geometry-grammar`
- PR：[#3 Sonify Sprint 0: geometry-driven primitives + multi-voice grammar engine](https://github.com/petersuncj-wq/sonify_musicphoto/pull/3)
- 状态：Open，等待 review / 合并
- 最新提交：`cb884b2` v0.3.5 — live soundfont in 3 modes + offline FluidR3_GM render for Soul/Progressive

## 完整版本历程（v0.1 → v0.3.5）

| 版本 | 关键内容 |
|---|---|
| v0.1 | 原始 Blueprint Score：12 000+ 像素同时发声（音墙） |
| v0.2 | 几何分类 + 5 voice grammar + 加性合成 WAV（演示页 lab-v2.html） |
| v0.3.0 | 三模式：Blueprint / Soul Symphony / Progressive Revelation |
| v0.3.1 | Blueprint 8 变体音 + Soul Symphony 5 轨五线谱 |
| v0.3.2 | 修复 8 变体音色 + tab 切换 |
| v0.3.3 | 修复 tab 切换（内联 onclick）+ 音频进度条 |
| v0.3.4 | 通过 smplr + FluidR3 GM 真实乐器合成 **Blueprint Live 播放** |
| **v0.3.5** | **Live 真实乐器扩展到 Soul Symphony + Progressive Revelation**（10 个 Live 按钮/样本）；**离线 WAV 全部用 FluidR3_GM 重渲**（60 个文件从加性 sine 升级为真实钢琴/笛子/弦乐/音乐盒/古琴/箫/电子琴） |

## 主要成果

### 新模块
| 文件 | 作用 |
|---|---|
| `primitives.py` | 自适应几何单元分类器 |
| `grammar.py` | 声明式音律规则引擎 |
| `compose_v2.py` | mido 多通道 MIDI + 加性合成 WAV（Blueprint 仍用） |
| `compose_blueprint.py` | Blueprint 8 变体（5 voice，每声部独立乐器） |
| `compose_soul.py` | Soul Symphony 5 轨五线谱（被 grammar.compose 替代） |
| `compose_revelation.py` | Progressive Revelation 6 阶段分层（被 grammar.compose_progressive 替代） |
| `render_soundfont.py` | **v0.3.5** 离线 FluidR3_GM 渲染（共享 .sf3 池，60 文件 < 5s） |
| `render_soul_progressive_wavs.py` | **v0.3.5** 一键重渲 60 个 Soul/Progressive WAV |
| `build_v3_visual.py` | 生成 `lab-v3.html`（11 MB，含全部 6 样本 3 模式 8 变体 Live） |
| `test_pipeline_v2.py` | **31 个行为测试**（从 25 增至 31，含 6 个新 live + soundfont 测试） |
| `dist/vendor/smplr.mjs` | GM SoundFont Web Audio 引擎（vendored） |
| `dist/vendor/sonify-soundfont-bridge.js` | ESM → 全局桥 |
| `dist/vendor/sonify-live.js` | **v0.3.5** 实时客户端 SoundFont 调度（Blueprint + Soul + Progressive） |
| `dist/vendor/sonify-tabs.js` | tab 切换逻辑 |

### 数字对比（sample0）
| 指标 | v0.1 | v0.3.5 |
|---|---|---|
| 最大同时发声 | ~378（音墙） | **≤5** |
| Blueprint 模式符号数 | 12 000（同时） | **12 095**（同时但分声部） |
| Soul 模式音符数 | n/a | 30–90 |
| Progressive 总时长 | n/a | 105 s |
| 真实乐器（在线） | 无 | **8 套 GM 组合 × 3 模式** |
| 真实乐器（离线 WAV） | 无 | **60 个 Soul/Progressive WAV** |
| 测试 | 4/4 | **31/31** |

### 8 套 Blueprint 乐器组合（Live + offline）
| 编号 | 中文 | GM 乐器组合 |
|---|---|---|
| A | 钢琴独奏 | church_organ / piano / glockenspiel / kalimba / violin |
| B | 弦乐四重奏 | string_ensemble / violin / cello / viola / choir_aahs |
| C | 铜管合奏 | church_organ / brass_section / tuba / tenor_sax / alto_sax |
| D | 笛子·钟 | church_organ / flute / music_box / pan_flute / whistle |
| E | 音乐盒 | music_box / tinkle_bell / marimba / glockenspiel / celesta |
| F | 古琴·西塔 | church_organ / sitar / shamisen / koto / pan_flute |
| G | 氛围 | pad_1_new_age / marimba / tinkle_bell / music_box / pad_5_bowed |
| H | 混合室内乐 | string_ensemble / piano / violin / marimba / flute |

### Soul Symphony + Progressive 乐器（grammar 分配）
- roof (V0) → electric_piano_1
- column (V1) → string_ensemble_1
- support (V2) → music_box
- decoration (V3) → lead_1_square（fallback to brighter）
- curve (V4) → flute

### 自适应分类器亮点
- **sample2（线稿2.jpg）**被正确识别为 **Column-façade**（希腊/罗马神庙风格），6 根柱子全部标为绿色
- 其他 5 张样本识别为 Non-column（中式亭台/混合风格），各有 1-2 个 roof
- **v0.3.5 修复**：column-façade 的 Progressive Phase 1 现在用最高柱顶作为虚拟 roof（之前 0 音符，听感上"什么都不响"）

### 演示页
- `dist/lab-v3.html`（**11.5 MB，自包含，可在任何浏览器直接打开**）
- 深色专业主题，评委友好
- 6 个样本，每个有：原图+3 模式 tab + 8 套 Live 真实乐器按钮（Blueprint）+ 4 套 Live 真实乐器按钮（Soul）+ 6 套 Live 真实乐器按钮（Progressive）
- 右上角 badge 标识 Column-façade 检测结果
- 无需网络（SoundFont 通过 smplr 从本地 CDN 拉取，可缓存离线）

## Live 验证（headless browser 已确认）
- Blueprint 6 样本 × 8 变体 = 48 套 Live 按钮 → ▶ 8000-12000 notes (real piano/koto/sitar/flute)
- Soul Symphony 6 样本 × 4 ablations = 24 套 Live 按钮 → ▶ 32-90 notes (electric_piano/cello/string_ensemble/flute/music_box)
- Progressive 6 样本 × 6 phases = 36 套 Live 按钮 → phase 1 单音 → phase 6 100 notes（5 真实乐器）
- Tab 切换 Blueprint / Soul Symphony / Progressive Revelation 全部正常

## 待办（可选）
- [ ] Blueprint 离线 WAV 也升级到 FluidR3_GM（需要分批 + 调小 polyphony）
- [ ] Sprint 1：规则细化（触发率、重复阈值）
- [ ] README 更新：说明 `render_soul_progressive_wavs.py` 用法
- [ ] Sprint 2：动态速度（tempo map）

## 测试命令
```bash
# v0.1 测试（不变）
py -m unittest test_pipeline

# v0.3.5 测试
py -m unittest test_pipeline_v2

# 重新生成 v3 制品
py build_v3_visual.py

# 重新用 FluidR3_GM 渲染 60 个 Soul/Progressive WAV
py render_soul_progressive_wavs.py
```
