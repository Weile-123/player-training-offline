"""Assemble imagegen sprite poses into discrete GIF previews (no game changes).

Only crops, placement and GIF encoding are used; artwork comes from imagegen.
"""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'public/previews/frame-animation-v1'
OUT = ROOT / 'public/previews/frame-animation-v2'
FPS = 24
BALL_WIDTH = 27
W, H, TOP = 640, 360, 52
sheet = Image.open(SOURCE / 'sprites-clean.png').convert('RGBA')
court = Image.open(SOURCE / 'court-source.png').convert('RGBA').resize((W,H), Image.Resampling.LANCZOS)
font = ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc', 23)
small = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 13)
boxes = {
 'ready':(80,75,330,620), 'shoot':(440,0,760,620),
 'stand':(870,75,1080,620), 'hurt':(1230,175,1515,620),
 'fall':(0,655,390,990), 'down':(395,810,825,985),
 'ball':(870,710,1105,949), 'splash':(1165,630,1535,1008),
}
sprites = {}
for name,box in boxes.items():
 im=sheet.crop(box)
 bbox=im.getchannel('A').getbbox()
 assert bbox, name
 sprites[name]=im.crop(bbox)
 sprites[name].save(OUT/(name+'.png'))

water=Image.open(OUT/'splash-source.png').convert('RGBA')
sprites['splash']=water.crop(water.getchannel('A').getbbox())
sprites['splash'].save(OUT/'splash.png')

def resized(im, *, height=None, width=None):
 scale=height/im.height if height else width/im.width
 return im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)

# Foreground white net and front lip are reused from the static background.
# The moving basketball passes behind these parts of the same fixed hoop.
net=Image.new('RGBA',(W,H))
green_net=Image.new('RGBA',(W,H))
for y in range(113,158):
 for x in range(497,545):
  r,g,b,a=court.getpixel((x,y))
  if (r>165 and g>155 and b>115) or (113<=y<=117 and 500<=x<=542 and (r<65 or (r>110 and g<100))):
   net.putpixel((x,y),(r,g,b,a))
   if y>=118 and r>165 and g>155 and b>115:
    green_net.putpixel((x,y),(57,239,111,a))

common=[(183,176),(207,146),(250,103),(312,74),(375,65),(433,74),(477,89)]
paths={
 'severe':common[:4]+[(340,110),(358,160),(370,218),(380,286),(387,318),(398,293),(408,307),(417,322)],
 'minor':common+[(501,110),(479,93),(451,118),(425,168),(403,230),(389,305)],
 'hold':common+[(501,110),(483,88),(459,99),(435,137),(415,186),(398,249),(385,315)],
 'success':common+[(501,110),(510,91),(520,99),(522,119),(522,141),(522,170),(522,217),(522,278)],
 'great':common+[(506,100),(522,117),(522,140),(522,168),(522,207),(522,261),(522,317)],
}
meta={
 'severe':('重伤 · 倒地','#ec6152','落地失衡 → 跌坐 → 侧身倒地'),
 'minor':('轻伤 · 扶膝','#efa45c','落地踉跄 → 扶膝 → 红色疼痛符号'),
 'hold':('维持 · 弹筐而出','#b9c9db','碰到篮筐 → 向外弹出'),
 'success':('成功 · 弹筐入网','#8dcba4','篮筐轻弹一下 → 落入篮网'),
 'great':('大成功 · 空心入网','#54ee8c','入网时篮网变绿 + 简约绿色溅射'),
}

def frame(kind,index,xy):
 title,color,description=meta[kind]
 result=Image.new('RGBA',(W,H+TOP+29),'#08131e')
 result.alpha_composite(court,(0,TOP))
 pose='ready' if index<0.67 else 'shoot' if index<5 else 'stand'
 if kind=='severe' and index>=4:pose='fall' if index<6 else 'down'
 if kind=='minor' and index>=5:pose='hurt'
 height={'ready':151,'shoot':174,'stand':151,'hurt':120,'fall':103,'down':47}[pose]
 actor=resized(sprites[pose],height=height)
 bottom=round(325-13*max(0,1-abs(index-2.2)/2.8)) if pose=='shoot' else 325
 center=153 if pose not in ('down','fall') else 154
 result.alpha_composite(actor,(center-actor.width//2,TOP+bottom-actor.height))
 ball=resized(sprites['ball'],width=BALL_WIDTH)
 result.alpha_composite(ball,(round(xy[0]-ball.width/2),round(TOP+xy[1]-ball.height/2)))
 result.alpha_composite(net,(0,TOP))
 if kind=='great' and 7.7<=index<11:
  # Begin when the ball crosses the rim; tint only net strings, not the rim.
  strength=min(1,(index-7.7)/.3,(11-index)/.5)
  tint=green_net.copy()
  tint.putalpha(tint.getchannel('A').point(lambda a:round(a*max(0,strength))))
  result.alpha_composite(tint,(0,TOP))
 if kind=='great' and 8<=index<10.5:
  progress=(index-8)/2.5
  splash=resized(sprites['splash'],width=round(52+40*progress))
  splash.putalpha(splash.getchannel('A').point(lambda a:round(a*(1-progress))))
  result.alpha_composite(splash,(522-splash.width//2,TOP+144-splash.height//2))
 draw=ImageDraw.Draw(result)
 draw.rectangle((0,TOP-3,W,TOP-1),fill=color)
 draw.text((18,9),title,font=font,fill=color)
 draw.text((W-170,19),'美漫 · 24fps · 第二版',font=small,fill='#c5bda9')
 draw.text((18,H+TOP+6),description,font=small,fill='#ded1b9')
 return result.convert('RGB')

report={}
contacts=[]
for kind,path in paths.items():
 timeline=[]
 for i in range(len(path)-1):
  for step in range(3):
   t=step/3
   xy=tuple(path[i][axis]*(1-t)+path[i+1][axis]*t for axis in (0,1))
   timeline.append((i+t,xy))
 timeline.append((len(path)-1,path[-1]))
 frames=[frame(kind,t,xy) for t,xy in timeline]
 # GIF delays are multiples of 10ms: distribute 40/50ms to average 24fps.
 durations=[round((i+1)*100/FPS)*10-round(i*100/FPS)*10 for i in range(len(frames))]
 durations[0]=260
 durations[-1]=850
 # A shared palette across all frames avoids GIF color flicker.
 palette_source=Image.new('RGB',(W,(H+TOP+29)*len(frames)))
 for i,im in enumerate(frames):palette_source.paste(im,(0,i*im.height))
 palette=palette_source.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
 indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
 indexed[0].save(OUT/(kind+'.gif'),save_all=True,append_images=indexed[1:],duration=durations,loop=0,disposal=2,optimize=False)
 frames[-1].save(OUT/(kind+'-poster.png'))
 frame_dir=OUT/'frames'/kind
 frame_dir.mkdir(parents=True,exist_ok=True)
 for i,im in enumerate(frames):im.save(frame_dir/f'{i:02}.png')
 check=Image.open(OUT/(kind+'.gif'))
 assert check.n_frames==len(frames) and check.size==(640,441) and check.info['loop']==0
 total=0
 for i in range(check.n_frames):
  check.seek(i)
  total+=check.info['duration']
 assert total==sum(durations)
 report[kind]={'frames':len(frames),'targetFps':FPS,'ballWidth':BALL_WIDTH,'durationMs':total,'width':640,'height':441,'bytes':(OUT/(kind+'.gif')).stat().st_size}
 # Outcome contact sheet, four late keyframes per result.
 start=4 if kind in ('severe','minor') else 7
 selected=[start*3,(start+1)*3,min((start+3)*3,len(frames)-1),len(frames)-1]
 contacts.append([frames[i].resize((320,220)) for i in selected])
contact=Image.new('RGB',(1280,1100),'#08131e')
for row,ims in enumerate(contacts):
 for col,im in enumerate(ims):contact.paste(im,(col*320,row*220))
contact.save(OUT/'contact-sheet.jpg',quality=92)
(OUT/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
