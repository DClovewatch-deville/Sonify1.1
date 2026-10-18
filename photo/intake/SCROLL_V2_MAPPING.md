# 卷轴专用乐谱与来源映射

2026 年 10 月 17 日。此版本替代首版通用 Photo 编曲，保留已验证的卷轴视觉与素材。

## 已查明的首版缺口

首版输入确实是虹桥裁片，使用了该图真实路径，并未复制 Photo 的现成音频。但它复用了 `progressive_arrangement.arrange(..., nature)` 的固定段落、和声与音色，且没有启用多路径身份主题。首版轮廓按钮只是静态显示长路径，并未按正在发声的音符更新。旧版通过的“source ID 存在”检查不足以证明音符与当前视窗对应，也不足以排除编曲趋同。

## 当前实现

`scroll_score.py` 为此卷独立作谱，不导入 Photo 的段落和和声模板。它按 24 个连续横向窗口，从右向左选取真实路径顶点；相邻窗口的音高、时间间距与线条长度来自各自画面。

- 起音为 `1.2 + (1-x) × 45` 秒，x 是原图归一化横向位置。
- Blueprint 的音高来自顶点高度在 D 宫五声音阶中的索引。
- Soul Symphony 在高度映射上加入该顶点真实切线方向的一级变化，并让另一条纵向位置不同的轮廓由笛子呼应。
- 时值由实际路径长度与声部决定；为避免同一声部相互遮挡，会缩短至下一音前。每个事件保留最终时值、计算参数及实际采样来源。
- 每个音符均保存路径 ID、顶点索引、真实坐标、起音、时值、音高、民族乐器和采样文件哈希。
- 音乐长 48 秒。当前 Soul 为 95 个音符、66 条不同路径；Blueprint 为 71 个音符、48 条路径。

`scroll_player.js` 是播放器源码，通过 `publish_scroll_player.py` 内联发布到独立页面。画卷相机跟随同一条横向读取线，视窗边缘做裁界；因此极右与极左附近相机可能短暂停留，期间来源高光继续随音符移动。默认关闭“看见声音来源”，打开后仅描亮当前音符及释放尾音对应的路径，提供暂停定格、定位小全景、具体公式与乐谱 JSON。两种乐谱切换保持时间和播放/暂停状态。

## 实际使用的音源与许可

- 古筝：Pufermufin 的真实拨弦录音，Freesound 396868，CC0。采用 sparklecatta-lang / XSXB-Band-Samples 的单音切片；固定仓库提交、逐文件 SHA256、原始音高、微调值均在 samples.json。
- 笛子：Hypnotriod 的单音录音，Freesound 384954，CC0；采用公开预览版本。
- 均在本地做音高重采样、速度包络和释放包络，再渲染为 WAV。曲子不是现成民乐录音拼接，也没有使用 GM 音源冒充古筝或笛子。
- 采样来自公开预览衍生素材，有压缩、力度和奏法数量的限制。当前未接入二胡，没有宣称复原宋代演奏。MIDI 只保留音符，外部播放要加载相应采样。

来源：

- https://freesound.org/people/Pufermufin/sounds/396868/
- https://github.com/sparklecatta-lang/XSXB-Band-Samples
- https://freesound.org/people/Hypnotriod/sounds/384954/

## 构建与验证

先运行 `fetch_scroll_samples.py` 获取采样数据。解码依赖 soundfile、cffi、pycparser 安装在本任务专用 `scroll-work/vendor`，未修改 Photo 依赖。运行 `build_scroll_v2.py` 即可从已保存的真实几何重新生成乐谱与声音；`build_scroll.py` 也已转到新发布入口，避免再次发布首版模板声音。运行 `publish_scroll_player.py` 更新页面内联代码。均为静态资源更新，无需重启接待服务。

`test_scroll.py`、`test_museum_transport.py`、`test_museum_extensions.py` 共 12 项通过。新增检查逐点坐标、真实起音公式、实际音阶索引、音源许可与目标音高，并验证改变几何会改变相对音程和起音序列，超出文件哈希不同这一弱证据。

浏览器实测了播放高光、暂停定格、24 秒跳转、两版切换保留时间及暂停状态、实际音频 URL、源路径节点、全屏及无控制台错误。截图为 `scroll-work/scroll-v2-mapping.png`。

Lab 的同期改动由原 MusicLab 对话完成，本轮已查验默认关闭的来源高光与 Photo 探究链接，并通过其 12 页来源/音频一致性检查。额外审计确认当前 12 页默认肖像的相对音程序列无完全相同项，但仍不能把这等同于听感审美验收。
