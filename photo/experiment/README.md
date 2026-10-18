# Sonify Blueprint Score — 形状优先实验

首页现为 Blueprint；旧版稀疏规则实验保存在 `dist/lab.html`。
先运行 `run.py` 生成骨架，再运行 `blueprint.py` 生成完整空间图形谱，最后运行 `test_pipeline.py`。

## Blueprint 展示顺序

1. 首页选择豆包线稿2，观察完全由符号组成的建筑；谱面未叠加原始图片。
2. 点击“播放生长过程”，观察 8 秒的视觉扫描；这段动画没有配乐。
3. 切换“骨架采样点 / 音符图形谱”，展示点到符号的变化。
4. 点击谱面符号，回查左侧来源路径、坐标、时间和 MIDI 音高。
5. 导出 SVG 查看独立矢量谱，或导出几何 MIDI。SVG 导出固定完整谱与底纹，不跟随显示开关。

### 当前能力边界

六张输入均已生成完整空间采样结果。图形谱保留图像位置，不按传统五线谱音高位置排版。符号还比较密集，尚未达到参考艺术曲谱的疏密、连线与留白设计；几何 MIDI 为密集映射，同音重叠可能因播放器处理而截断，不能当成完成的艺术编曲。屋顶、窗户等语义单元识别仍未实现。以下内容记录旧版规则实验。

入口：`dist/index.html`，可直接双击离线查看，也可通过本地 HTTP 服务打开。

## 本机执行

一键启动（推荐）：双击 `experiment/serve.cmd`，或运行
`powershell -ExecutionPolicy Bypass -File experiment\serve.ps1`
（自动找 Python、自动找空闲端口、自动打开浏览器，指向 `studio.html`）。

局域网 / Tailscale 访问：脚本默认监听 `0.0.0.0:8777`，因此同网段或 Tailscale
内的其他设备可用 `http://<本机局域网IP或Tailscale IP>:8777/studio.html` 打开
（本机 Tailscale IP 可用 `tailscale ip -4` 查看；`*.ts.net` 名称只有在配置了
MagicDNS/`tailscale serve` 时才可用）。只想本机访问时传 `-Bind 127.0.0.1`。

安全说明：该服务**只读、仅静态文件**（`experiment/dist`），无上传/写接口、无账户。
绑定 `0.0.0.0` 会让本机所有网卡可访问；如需收紧，请只绑定 Tailscale IP
（`-Bind <tailscale-ip>`）或在防火墙限定来源网段。

手动启动：

```powershell
$pythonExe = 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $pythonExe .\run.py
& $pythonExe .\blueprint.py
& $pythonExe .\test_pipeline.py
& $pythonExe -m http.server 8766 --bind 127.0.0.1 --directory dist
```

当前 OpenCV 安装在实验目录的 vendor 中，未改动 MusicPaint。其他电脑建议建立独立虚拟环境，再 `pip install -r requirements.txt`。

## 90 秒演示顺序

1. 选择豆包线稿2，切换输入、二值化、骨架、筛选路径，说明这些结果由实际图像计算。
2. 选择 p001，查看高亮路径和其对应的 8 个音符；具体路径 ID 仅适用于当前产物版本。
3. 播放全部规则，观察图片路径和 Piano Roll 播放线。
4. 切换“关闭轮廓旋律”，听剩余低音与重复动机；切换回全部规则。
5. 切换本地线稿，同一算法重新对应其预计算产物。说明这是预先运行真实算法的结果浏览器，不是现场在线生成器。
6. 下载 MIDI 或 JSON，展示音符的 source、source_point、rule 字段。

## 已实现与边界

- 已实现六张线稿批量处理、骨架路径追踪、几何方向分类、长度筛选、重复候选分组。
- 已实现规则驱动音符、来源数据、MIDI/WAV 输出、输入阶段对照、选中联动与规则消融。
- 从两份 Word 提取图片作为参考，未确认与线稿的一一配对，不进行保真度结论。
- 一般路径标签 curve 不保证数学上是曲线，也包括斜线；没有屋顶、窗户的语义分类。
- 重复组只检查方向、长度和位置，尚未校验透视和等间距，可能误分组。
- 没有连接豆包/Qwen、没有上传生成接口、没有标准五线谱、色彩分析、自动深度或完整艺术编曲。
- 当前音色是简单合成波，不能用作最终音质评价；试听重点是规则可辨别性。
- 程序忽略边缘 8 像素；线稿1/2 中 y=74%–84%、x=15%–83% 区域为明确人工字幕屏蔽，会同时漏掉其中的部分真实结构。
- 当前未进行区域语义加权、路径跨交点合并或人工校正 UI；主屋顶可能仍分裂为多个路径。

## 下一轮改进依据

先在结果中人工确认屋顶、窗户、支撑各一组，评价漏检与误检；改进路径跨交点续接和重复阵列规则。当前数量统计只说明处理规模，不能作为识别准确率。
