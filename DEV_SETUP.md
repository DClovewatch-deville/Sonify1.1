# 开发者上手（远程协作）

> 目标：让朋友 clone 仓库后，用最少的下载量把 Sonify 跑起来继续开发。
> 仓库只放**源码 + 文档**；大资源走 GitHub Release 或网盘。

---

## 1. Clone

```bash
git clone https://github.com/petersuncj-wq/Sonify.git
cd Sonify
```

仓库约 **6 MB**，克隆很快。

---

## 2. 环境

- Python **3.12**
- Windows 10/11（当前主开发环境）
- Chrome / Edge

```bash
pip install -r photo/requirements-share.txt
```

---

## 3. 资源怎么放

完整资源约 **7.9 GB**，不建议进 Git。按需下载后放到下面的位置（相对仓库根目录）：

| 资源 | 目标路径 | 约大小 | 是否必需 |
|---|---|---:|---|
| SoundFont | `photo/experiment/dist/soundfonts/FluidR3Mono_GM.sf3` | 22.6 MB | ✅ 渲染必需 |
| 一个示例作品 | `photo/intake/runtime/<job-id>/` | 20–50 MB | ✅ 建议 |
| 一个长卷作品 | `photo/intake/web/museum/scroll/` 对应 work | ~24 MB | 可选 |
| 展览全量媒体 | `photo/intake/web/museum/` | 4.95 GB | 可选（Lab 全量） |
| Photo 依赖 | `photo/experiment/vendor/`、`photo/intake/vendor/` | 144 MB | ✅ 建议 |
| 生成音频全量 | `photo/intake/runtime/` | 1.49 GB | 可选 |

### 最小开发包（约 200 MB）

- 源码（仓库）
- SoundFont（22.6 MB）
- `photo/experiment/vendor/` + `photo/intake/vendor/`（144 MB）
- 一个示例作品 + 一个长卷作品（~50 MB）

> 足够跑通「三模式 + 长卷 + 角色改派」的核心开发；社区/全量画册需要更多媒体。

### 完整演示包（7.9 GB）

从团队网盘/移动硬盘获取，解压后覆盖到仓库根目录即可。目录结构与仓库一致，不会覆盖源码。

---

## 4. 启动

```bash
python start_sonify.py --port 8895
```

- 主入口：<http://127.0.0.1:8895/>
- 接待台：<http://127.0.0.1:8895/host>
- 自检：`python start_sonify.py --check`

---

## 5. 豆包 Seedream（可选）

照片 → 线稿默认调用豆包。需要自己的火山方舟密钥：

1. 复制 `photo/intake/ark.env.example` → `photo/intake/ark.local.env`
2. 填入 `ARK_API_KEY=...`
3. 在 `photo/intake/config.local.json` 配置 `ark_model`

`ark.local.env` 已被 `.gitignore` 忽略，不会进仓库。没有密钥时可用 OpenCV 回退。

> 注意：如果你的机器开了全局代理/TUN，方舟的大响应可能被截断。当前 `server.py` 已对 `ark.cn-beijing.volces.com` 绕过代理；如仍失败，检查代理设置。

---

## 6. 目录速览

```
photo/intake/       上传、社区、Lab、长卷、角色改派、HTTP 服务
photo/experiment/   几何提取、Blueprint / Soul / Progressive、Color DNA、四时共鸣
paint/modules/      MusicPaint、Fourier
verification/       验收与来源记录
```

关键文档：

- `PRODUCT.md` — 产品介绍与架构
- `ASSETS.md` — 资源清单与大小
- `THIRD_PARTY.md` — 第三方许可
- `photo/intake/README.md`、`photo/experiment/README.md`

---

## 7. 不要做的事

- ❌ 不要把 `*.wav`、`*.sf3`、`*.onnx`、`photo/intake/runtime/`、`photo/*/vendor/` 提交进 Git
- ❌ 不要把 7.9 GB 完整包塞进仓库（GitHub 会警告，clone 会非常慢）
- ✅ 大资源用 GitHub Release（单文件 < 2 GB）或网盘；在 `ASSETS.md` 里放链接

---

*Sonify · 让世界唱起来 · Techathon 2026*
