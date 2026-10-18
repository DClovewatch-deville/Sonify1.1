# Progressive Revelation · Geometry Music 1.2

## 本轮范围
依据 0323.docx，保留原有 36 秒四阶段生长视觉，重做 Progressive 编曲。Soul / Blueprint 的作曲与交互未在本轮改动。

## 实际映射
- 用全图分类后的真实路径计算轴向线占比、斜线占比、弯曲度、重复结构占比与密度；这是视觉组织规则，不是物体语义识别。
- 在 Soul 主旋律候选中挑选主要真实轮廓，按弧长采样 4/6/8 个点；轮廓高度映射调内级数。每个主题音保留 source / parent_note_id / source_point / contour_point。
- 竖向结构占比较高采用 vertical 组织及 D 调中心；斜向占比高采用 angular 及 F 调中心；其他采用 flow 及 C 调中心。
- 重复结构影响呼应脉冲，竖向结构影响低音进入时间；几何密度影响东方自然的呼应密度。结构特征与风格共同决定主题长度、节奏与配器。
- 四种风格：东方自然（五声音阶、开放五度）、西洋小型交响（七声音阶、模仿呼应与 ii/V）、独奏钢琴（分解和声、三声部）、弦乐叙事（连奏、和声节奏拉长与弦乐回应）。这些是四种规则编曲，不是四种独立 AI 模型。
- 有已验证原图时，真实亮度微调力度，饱和度微调连奏长度；没有原图的样本不从伪彩回归图提取 Color DNA。色彩尚未决定调式、曲式或情绪语义。
- 24 秒主题回归，32 秒属功能、34 秒主音落地；最多 6 个同时发声音符，36 秒收束。不同图片仍共享这一宏观时长模板。

## 展示与交互
- 主题来源轮廓进入首阶段优先展示；宽幅作品保留从右至左顺序。
- 新增窄型同步音符轨：当前音符高亮、时间游标、风格与主题提示，点击轨道可以定位时间。
- 主轮廓可作乐句级点击定位；这不是全图任意像素都直接发声，背景纹理仍由原先章节展开。
- 切换风格同步切换音频 stem、MIDI、音符轨和几何发光数据。
- 保留现有原图回归；由线稿着色的回归图仍明确为 colorized_from_lineart。

## 交付文件与复现
- progressive_arrangement.py / progressive_features.py：规则引擎。
- build_progressive_arrangement.py：重建现有 6 个样本 × 4 种风格的音频、MIDI、JSON；不重建 Soul。
- build_progressive_diversity.py：重建四类图片试听测试页所需素材。
- dist/progressive-diversity.html：16 组风格试听；传统建筑、教堂来自现有作品；现代抽象结构与山水来自上传测试图，用 Canny 边缘作跨图测试，没有加入主选择器。
- progressive_arrangement_v11_reference.py：本轮改写前参考代码，保留。
- 旧 progressive-review.html 视频不是本轮实时录制，请以 studio.html 和 progressive-diversity.html 最新音频为准。

## 验证
- test_progressive_arrangement.py：5 项通过；核对真实主题采样点、确定性生成、主题回归、调中心、并发上限、音频时长/峰值/连续性，以及跨图像主题和风格脉冲差异。
- test_studio.py：10 项通过（规则调性断言更新为相对调中心）；test_progressive_revelation.cjs：51 项通过。
- 浏览器实际点击自然/钢琴/弦乐、开始播放、暂停、章节跳转、放大展演；无捕获到的页面 error。
- 音频检查含实际 WAV 信号与事件，不能替代人类对配器平衡和审美的试听判断。当前为 GM SoundFont，不是专业录音级采样；36 秒模板与阈值分类仍有局限。
