# Sonify · 可运行精简版（v1.0）

> 下载 → 解压 → 安装依赖 → 启动。
> 已去掉 **6.8 GB** 批量预渲染音频与生成任务，只保留能直接演示的核心资产。

---

## 1. 包含什么

| 内容 | 说明 |
|---|---|
| 全部源码 | `photo/intake`、`photo/experiment`、`paint/modules` |
| SoundFont | `FluidR3Mono_GM.sf3`（22.6 MB，渲染必需） |
| 一个完整样张 | `sample5`：蓝图谱 / 灵魂交响（demo 五轨）/ 渐显乐章（五章）/ 四季 / 身份主题 |
| 千古长卷 | 清明上河图、千里江山图、富春山居图（含图、JSON、WAV） |
| Paint | MusicPaint + Fourier 构建页与源码 |
| 依赖 | `photo/experiment/vendor`、`photo/intake/vendor`（Windows 便携依赖） |
| 验收/许可 | `verification/`、`第三方许可/` |

## 2. 不包含什么

- 6.8 GB 批量 WAV（所有色彩强度 / 乐器 / 季节变体）
- `photo/intake/runtime` 生成任务（可重新上传生成）
- 18 册校园/在线声音画册的完整媒体
- `batch_results` 全量、`V4.31-original` 重复构建、`circle` 模块
- 豆包 API Key（自行配置；不配置可用 OpenCV 回退）

## 3. 运行

### 环境

- Windows 10/11
- Python **3.12**
- Chrome / Edge

### 安装与启动

```bash
pip install -r requirements.txt
python start_sonify.py --port 8895
```

或双击：

```
启动最终版!!!.cmd
```

打开：

```
http://127.0.0.1:8895/
```

- 三模式：`/showcase/studio.html`
- 长卷：`/scroll?work=qingming`（或 qianli / fuchun）
- 上传：`/capture`
- Paint：`/paint`
- 接待：`/host`
- 社区：`/community`

### 豆包 Seedream（可选）

1. 复制 `photo/intake/ark.env.example` → `photo/intake/ark.local.env`
2. 填入 `ARK_API_KEY=...`
3. 在 `photo/intake/config.local.json` 配置 `ark_model`

不配置时，上传可用 OpenCV 回退出稿。

## 4. 已知限制

- **只带 sample5 的默认变体**（nature / auto / demo）。切换到未包含的 piano / strings / 色彩强度等预设会 404。
- **MusicLab 画册为 0 册**；保留了长卷与 3 个精选封面。完整 18 册需完整包。
- `/experience` 初始为空；上传生成后才有作品。
- `/circle` 模块未包含。
- 长卷第一次打开仍需 10–20 秒（13.9 MB 几何 + 画布），页面已内置 90 秒超时。

## 5. 完整包

如果要做全量画册 / 所有色彩与季节变体 / 生成任务回放，使用完整包：

```
Sonify-最终整合版!!!-20261018（7.9 GB）
```

放在网盘或 Release，按 `ASSETS.md` 的路径覆盖即可。

## 6. 源码仓库

<https://github.com/petersuncj-wq/Sonify>

## 7. 许可

- 第三方组件与音源：见 `第三方许可/`
- 版权与使用范围：见 `COPYRIGHT.md`
- 第三方汇总：见 `THIRD_PARTY.md`

---

*Sonify · 让世界唱起来 · Techathon 2026*
