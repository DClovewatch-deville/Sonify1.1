"""One source for seasonal music and visual direction; BPM values are design references."""
SEASON_RULES=[
 dict(id='spring',label='春 · 生发',brightness=1.04,saturation=1.08,tint=[204,235,183],blend=.08,register=2,density=.8,legato=.78,phrase_bars=[0,4,8,12,14],pulse=[1,3],ornaments=True,reference_bpm=[88,98],character='轻盈短句 · 上行装饰 · 拨弦呼应',effect='petal',particles=20,light='#d3efaf',speed=.7,space=.25),
 dict(id='summer',label='夏 · 朗照',brightness=1.05,saturation=1.10,tint=[255,230,170],blend=.05,register=4,density=1.15,legato=.95,phrase_bars=[0,2,4,6,8,10,12,14],pulse=[0,.75,1.5,2.25,3,3.5],ornaments=True,reference_bpm=[100,112],character='连贯流动 · 密集呼应 · 饱满和声',effect='beam',particles=26,light='#fff0b9',speed=1.1,space=.15),
 dict(id='autumn',label='秋 · 流金',brightness=.97,saturation=1.0,tint=[225,137,55],blend=.16,register=-1,density=.8,legato=1.25,phrase_bars=[0,4,8,12,14],pulse=[1,3],ornaments=False,reference_bpm=[78,90],character='中音回落 · 舒展时值 · 温润余韵',effect='leaf',particles=24,light='#e3ae5e',speed=.75,space=.4),
 dict(id='winter',label='冬 · 静听',brightness=.97,saturation=.80,tint=[88,119,158],blend=.14,register=-4,density=.55,legato=1.65,phrase_bars=[0,8,12],pulse=[2],ornaments=False,reference_bpm=[60,74],character='稀疏主题 · 延音留白 · 深远空间',effect='snow',particles=32,light='#c5def0',speed=.45,space=.65),
]
