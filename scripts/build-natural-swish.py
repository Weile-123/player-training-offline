"""Preview-only cel animation: generated art + ballistic ball + spring net.
No game or save state changes. Frames are assembled, not painted by this script.
"""
from pathlib import Path
import json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/previews/great-natural-v3'
V1=ROOT/'public/previews/frame-animation-v1'
V2=ROOT/'public/previews/frame-animation-v2'
W,H,TOP=640,360,48
FPS=30
DT=1/480
RELEASE=.55
FLIGHT=.95
ENTRY=RELEASE+FLIGHT
GRAVITY=650.0
RIM=(522.0,114.0)
RADIUS=13.5
FLOOR=324-RADIUS
SCALE=.36
FOOT_X,FOOT_Y=145,325
TAKEOFF,LAND=.43,.95
sheet=Image.open(OUT/'poses-source.png').convert('RGBA')
court=Image.open(OUT/'court-no-net.png').convert('RGBA').resize((W,H),Image.Resampling.LANCZOS)
original=Image.open(V1/'court-source.png').convert('RGBA').resize((W,H),Image.Resampling.LANCZOS)
font=ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',22)
small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',13)
ball_source=Image.open(V1/'ball.png').convert('RGBA').resize((27,27),Image.Resampling.LANCZOS)
splash_source=Image.open(V2/'splash.png').convert('RGBA')

pose_times=[0,.15,.31,.43,.55,.66,.82,.95,1.12,1.35]
anchors=[(160,500),(465,500),(757,500),(1030,500),(1325,500),
         (153,1004),(470,1004),(762,1004),(1050,1004),(1360,1004)]
hand_centers=[(239,275),(570,273),(818,100),(1126,7),(1470,-4)]
poses=[]
for i,(ax,ay) in enumerate(anchors):
 col,row=i%5,i//5
 box=(round(col*sheet.width/5),row*512,round((col+1)*sheet.width/5),(row+1)*512)
 piece=sheet.crop(box)
 # Keep a common ground anchor instead of resizing each bounding box to equal height.
 cropped=piece.getchannel('A').getbbox()
 im=piece.crop(cropped)
 image=im.resize((round(im.width*SCALE),round(im.height*SCALE)),Image.Resampling.LANCZOS)
 offset=((box[0]+cropped[0]-ax)*SCALE,(box[1]+cropped[1]-ay)*SCALE)
 poses.append((image,offset))
 im.save(OUT/f'pose-{i:02}.png')

between=Image.open(OUT/'inbetweens-source.png').convert('RGBA')
extra_anchors=[(230,830),(665,830),(1090,830),(1510,830)]
extra_hands=[(375,457),(828,335),(1220,220),(1630,55)]
for i,(ax,ay) in enumerate(extra_anchors):
 box=(i*448,0,(i+1)*448,896)
 piece=between.crop(box)
 bounds=piece.getchannel('A').getbbox()
 im=piece.crop(bounds)
 image=im.resize((round(im.width*.22),round(im.height*.22)),Image.Resampling.LANCZOS)
 offset=((box[0]+bounds[0]-ax)*.22,(bounds[1]-ay)*.22)
 poses.append((image,offset))
 im.save(OUT/f'pose-{10+i:02}.png')
sequence=[(0,0),(.13,1),(.18,10),(.23,11),(.28,12),(.34,2),(.40,13),(.47,3),
          (.55,4),(.66,5),(.82,6),(.95,7),(1.12,8),(1.35,9)]

def pose_at(t):
 return next(i for time,i in reversed(sequence) if time<=t)

def jump(t):
 if not TAKEOFF<t<LAND:return 0.0
 tau=t-TAKEOFF
 return .5*1300*tau*((LAND-TAKEOFF)-tau)

def drift(t):
 return 7*min(1,max(0,(t-TAKEOFF)/(LAND-TAKEOFF)))

def hand(i,t):
 if i>=10:
  x,y=extra_hands[i-10];ax,ay=extra_anchors[i-10];scale=.22
 else:
  x,y=hand_centers[i];ax,ay=anchors[i];scale=SCALE
 return (FOOT_X+(x-ax)*scale+drift(t),FOOT_Y+(y-ay)*scale-jump(t))

START=hand(4,RELEASE)
VX=(RIM[0]-START[0])/FLIGHT
VY=(RIM[1]-START[1]-.5*GRAVITY*FLIGHT**2)/FLIGHT
assert VY<0 and VY+GRAVITY*FLIGHT>0
assert abs(START[0]+VX*FLIGHT-RIM[0])<1e-8
assert abs(START[1]+VY*FLIGHT+.5*GRAVITY*FLIGHT**2-RIM[1])<1e-8

# Resolve the entire post-entry motion using a small fixed timestep, so net
# drag and the floor impulse change velocity, never teleport the basketball.
post=[]
x,y=RIM;vx,vy=VX,VY+GRAVITY*FLIGHT
net_exit=None;bounce_times=[]
for step in range(math.ceil((3.3-ENTRY)/DT)+2):
 t=step*DT
 post.append((x,y,vx,vy))
 if y<167 and net_exit is None:
  vx*=math.exp(-18*DT)
  vy*=math.exp(-2.1*DT)
 elif net_exit is None:net_exit=t
 vy+=GRAVITY*DT
 x+=vx*DT;y+=vy*DT
 if y>FLOOR:
  y=FLOOR-(y-FLOOR)
  vy=-abs(vy)*.58;vx*=.84
  bounce_times.append(ENTRY+t)

def basketball(t):
 if t<RELEASE:
  return hand(pose_at(t),t)
 if t<=ENTRY:
  tau=t-RELEASE
  return START[0]+VX*tau,START[1]+VY*tau+.5*GRAVITY*tau*tau
 index=min(len(post)-1,round((t-ENTRY)/DT))
 return post[index][:2]

# Extract ink + cream net strands from the approved artwork. Everything behind
# it now comes from the clean plate, so stretching leaves no old net underneath.
net=Image.new('RGBA',(56,47))
for yy in range(47):
 y=113+yy
 half=27-13*yy/47
 for xx in range(56):
  x=494+xx
  r,g,b,a=original.getpixel((x,y))
  if y>=118 and abs(x-522)<=half+2 and ((r>155 and g>145 and b>105) or max(r,g,b)<85):
   net.putpixel((xx,yy),(r,g,b,a))
net.save(OUT/'net-source.png')
front=Image.new('RGBA',(W,H))
for y in range(114,120):
 for x in range(495,548):
  r,g,b,a=original.getpixel((x,y))
  if (r>100 and g<110 and b<80) or max(r,g,b)<90:
   front.putpixel((x,y),(r,g,b,a))

def animated_net(t):
 tau=t-ENTRY
 pull=0 if tau<0 else math.sin(min(tau/.19,1)*math.pi/2)*math.exp(-max(0,tau-.19)*10)
 rebound=0 if tau<.19 else .07*math.sin((tau-.19)*25)*math.exp(-(tau-.19)*8)
 stretch=1+.32*pull+rebound
 sway=17*pull
 green=0 if tau<0 else min(1,tau/.055)*min(1,max(0,(.65-tau)/.25))
 art=np.array(net).copy()
 strands=(art[:,:,0]>155)&(art[:,:,1]>145)&(art[:,:,2]>105)&(art[:,:,3]>0)
 tint=np.array([55,239,113])
 art[strands,:3]=(art[strands,:3]*(1-green)+tint*green).astype('uint8')
 im=Image.fromarray(art).resize((56,round(47*stretch)),Image.Resampling.BICUBIC)
 layer=Image.new('RGBA',(90,im.height))
 for row in range(im.height):
  shift=round(sway*(row/max(1,im.height-1))**1.6)
  layer.alpha_composite(im.crop((0,row,56,row+1)),(shift,row))
 return layer

def draw_frame(t):
 scene=court.copy()
 index=pose_at(t)
 actor,offset=poses[index]
 scene.alpha_composite(actor,(round(FOOT_X+drift(t)+offset[0]),round(FOOT_Y-jump(t)+offset[1])))
 bx,by=basketball(t)
 # Backspin starts at release and continues after the net, with no size changes.
 spin=max(0,t-RELEASE)*-420
 ball=ball_source.rotate(spin,resample=Image.Resampling.BICUBIC,expand=True)
 scene.alpha_composite(ball,(round(bx-ball.width/2),round(by-ball.height/2)))
 scene.alpha_composite(animated_net(t),(494,113))
 scene.alpha_composite(front)
 tau=t-ENTRY
 if .04<tau<.29:
  u=(tau-.04)/.25
  width=round(48+40*u)
  splash=splash_source.resize((width,round(width*splash_source.height/splash_source.width)),Image.Resampling.LANCZOS)
  splash.putalpha(splash.getchannel('A').point(lambda a:round(a*(1-u))))
  scene.alpha_composite(splash,(round(522-width/2),round(143-splash.height/2+8*u)))
 result=Image.new('RGB',(W,H+TOP+27),'#08131e')
 result.paste(scene,(0,TOP))
 draw=ImageDraw.Draw(result)
 draw.text((17,9),'大成功 · 自然投篮',font=font,fill='#78eaa3')
 draw.text((469,17),'美漫动作预览 · V3',font=small,fill='#d0c4ae')
 draw.text((17,H+TOP+5),'蓄力 → 起跳随挥 → 空心入网 → 篮网回弹',font=small,fill='#d4c7ad')
 return result

frames=[draw_frame(i/FPS) for i in range(97)]
durations=[round((i+1)*100/FPS)*10-round(i*100/FPS)*10 for i in range(len(frames))]
durations[0]+=150;durations[-1]+=500
# Use one palette and GIF delta rectangles; the stationary background is shared.
samples=Image.new('RGB',(W,(H+TOP+27)*12))
for j,i in enumerate([0,5,9,13,16,20,26,32,44,47,51,70]):samples.paste(frames[i],(0,j*(H+TOP+27)))
palette=samples.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
indexed[0].save(OUT/'great.gif',save_all=True,append_images=indexed[1:],duration=durations,loop=0,disposal=1,optimize=True)
frames[47].save(OUT/'poster.png')
frame_dir=OUT/'frames';frame_dir.mkdir(exist_ok=True)
for i,im in enumerate(frames):im.save(frame_dir/f'{i:03}.png')
contact=Image.new('RGB',(1280,654),'#08131e')
for j,i in enumerate([0,5,9,13,16,20,26,32,44,47,51,70]):contact.paste(frames[i].resize((320,218)),((j%4)*320,(j//4)*218))
contact.save(OUT/'contact-sheet.jpg',quality=94)
gif=Image.open(OUT/'great.gif');total=0
for i in range(gif.n_frames):gif.seek(i);total+=gif.info['duration']
assert total==sum(durations) and gif.info['loop']==0 and gif.n_frames>=85
assert net_exit is not None and bounce_times
assert all(basketball(i/FPS)[1]>=RADIUS for i in range(len(frames)))
manifest={'fps':FPS,'renderedFrames':len(frames),'gifFrames':gif.n_frames,'durationMs':total,'size':[W,H+TOP+27],
 'release':RELEASE,'rimEntry':ENTRY,'netExit':ENTRY+net_exit,'floorBounces':bounce_times,
 'gravityPixelsPerSecondSquared':GRAVITY,'launchVelocity':[VX,VY],'releasePosition':START,
 'poseSequence':sequence,'ballDiameter':27,'fileBytes':(OUT/'great.gif').stat().st_size}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest,indent=2))
