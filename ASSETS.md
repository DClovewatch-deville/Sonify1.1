# 运行所需资源（未入库）

本仓库是**源码评审包**。为保证克隆速度与评审体验，以下资源刻意不提交（合计约 7.9 GB）。补齐后即可运行完整离线版。

| 资源 | 目标路径 | 约大小 | 用途 | 获取方式 |
|---|---|---:|---|---|
| SoundFont 音源 | `photo/experiment/dist/soundfonts/FluidR3Mono_GM.sf3` | 22.6 MB | 离线渲染 WAV / MIDI | 完整交付包；或下载 FluidR3Mono GM |
| 用户任务与生成音频 | `photo/intake/runtime/` | 1.49 GB | 41 个作品、分轨 WAV、MIDI、几何数据 | 完整交付包 |
| 展览图像与音频 | `photo/intake/web/museum/` | 4.95 GB | 声音画册、千古长卷、在线发现缓存 | 完整交付包 |
| Photo 便携依赖 | `photo/experiment/vendor/`、`photo/intake/vendor/` | 144 MB | OpenCV / NumPy 便携依赖 | 完整交付包 |
| Paint 资源 | `paint/modules/fourier/` | 209 MB | Fourier 页面、音源与模型 | 完整交付包 |
| 便携运行时 | `portable/` | — | 免安装 Python（如有） | 完整交付包 |

> 以上路径均相对于本仓库根目录；完整交付包目录名为 `Sonify-最终整合版!!!-20261018`。

---

## 最小可运行集（只看核心链路）

如果只想验证「上传 → 几何 → 编曲 → 播放」，至少补齐：

1. `photo/experiment/dist/soundfonts/FluidR3Mono_GM.sf3`（22.6 MB）
2. `photo/experiment/vendor/`、`photo/intake/vendor/`（144 MB，或自行 `pip install` 依赖）
3. 一个可用的豆包 Seedream 密钥（或使用 OpenCV 回退）

然后：

```bash
pip install -r photo/requirements-share.txt
python start_sonify.py --port 8895
```

---

## 为什么不上传

- GitHub 单文件限制 100 MB，单仓库建议 < 5 GB；本包资源合计约 7.9 GB。
- 生成音轨与展览图像属于**运行产物 / 素材**，不是源码；放入仓库会让评审 clone 变慢。
- 音源与模型有各自的许可证，随源码分发需单独确认；本仓库只保留 `第三方许可/` 中的许可证文本。

---

## 校验

补齐资源后，可运行：

```bash
python verify_package.py
```

核对 `CORE_MANIFEST.json` 中的核心文件哈希；`verification/` 目录保留了最终整合版的验收记录与来源。
