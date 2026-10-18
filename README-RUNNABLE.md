# Sonify · 可运行精简版（v1.0）

## ⚡ 先看这里：安装与启动（3 步）

> **下载 → 解压 → 进目录 → 装依赖 → 启动。**
> zip 约 **303 MB**，解压后约 **574 MB**。

### 第 1 步：解压并进入目录

把 `Sonify-Runnable-20261018.zip` 解压，然后在 **PowerShell** 里执行：

```powershell
cd "D:\你解压的位置\Sonify-Runnable-20261018"
```

> 必须进入这个目录：`requirements.txt` 和 `start_sonify.py` 都在这里。

### 第 2 步：安装依赖（只需一次）

```powershell
py -3.12 -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

> 国内网络建议保留 `-i` 镜像。已确认 `opencv-contrib-python-headless==5.0.0.93` 在 PyPI 可安装。

### 第 3 步：启动

```powershell
py -3.12 start_sonify.py --port 8895
```

看到控制台打印：

```
SONIFY 最终整合版!!!
主页: http://127.0.0.1:8895/
```

就打开：

# http://127.0.0.1:8895/

> - 如果 8895 被占用，脚本会自动换端口，**以控制台打印的“主页”为准**。
> - 停止服务：在 PowerShell 里按 **Ctrl + C**。
> - 首次启动 Windows 可能弹防火墙提示，允许本地访问即可。

### 常见问题

| 问题 | 解决 |
|---|---|
| `py` 不是命令 | 先 `python --version` 确认是 3.12，然后把所有 `py -3.12` 换成 `python` |
| `pip` 很慢 / 超时 | 保留清华镜像 `-i https://pypi.tuna.tsinghua.edu.cn/simple`，或换手机热点 |
| 8895 被占用 | 看控制台实际打印的端口，或改用 `--port 8905` |
| 上传照片没反应 | 配置自己的豆包 Key，或在结构处理方式里选 OpenCV 回退 |
| 页面能开但没声音 | 先点页面里的播放按钮（浏览器要求一次用户点击才允许音频） |

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

## 3. 页面入口

- 三模式：`/showcase/studio.html`
- 长卷：`/scroll?work=qingming`（或 qianli / fuchun）
- 上传：`/capture`
- Paint：`/paint`
- 接待：`/host`
- 社区：`/community`

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
