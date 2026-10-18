"""Inline the isolated source; existing services serve this without restart."""
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent
page=ROOT/'web/scroll.html'
text=page.read_text(encoding='utf8')
text=re.sub(r'<script>.*?</script>',lambda _: '<script>\n'+(ROOT/'scroll_player.js').read_text(encoding='utf8')+'\n</script>',text,flags=re.S)
text=text.replace('音乐由这一局部画面的真实轮廓，经 Sonify 现有几何解析与音乐规则生成，以真实乐器音色预先渲染。展卷进度跟随音频时间；尚未建立人物、船只与逐音符的空间对应。描亮轮廓可按上方按钮开关。',
    '此卷使用独立的空间乐谱：从右向左读取真实轮廓顶点，横向位置决定起音，纵向高度决定五声音级，线条走向与长度决定叙事音级与时值。Blueprint 保留直接映射，Soul Symphony 加入轮廓走向与笛子呼应；两者均未套用 Photo 的固定和声与段落。打开“看见声音来源”可查看当前音符、来源路径与计算值。')
needle='<p><a id="evidence-link"'
if 'id="sample-credits"' not in text:
    text=text.replace(needle,'<p id="sample-credits" class="sample-credit">古筝：Pufermufin 实录，sparklecatta-lang 切片整理，CC0。笛子：Hypnotriod 单音采样，CC0。采用公开预览衍生的采样，做音高重采样与包络处理；本曲音符由画面生成。<br><a href="https://freesound.org/people/Pufermufin/sounds/396868/" target="_blank" rel="noopener">古筝原始录音 ↗</a> · <a href="https://github.com/sparklecatta-lang/XSXB-Band-Samples" target="_blank" rel="noopener">古筝切片库 ↗</a> · <a href="https://freesound.org/people/Hypnotriod/sounds/384954/" target="_blank" rel="noopener">笛子采样 ↗</a><br>这是当代数字诠释，不宣称复原宋代演奏。MIDI 导出保留音符，但外部播放器需另加载对应民族乐器采样。</p>'+needle)
page.write_text(text,encoding='utf8')
print('Published isolated Scroll player')
