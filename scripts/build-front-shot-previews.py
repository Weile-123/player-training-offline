"""Five front-facing comic GIFs. Animation assembly only; imagegen artwork.
Ballistic screen-space trajectories + perspective sizing; no game state changes.
"""
from pathlib import Path
import math,json,sys,shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/previews/front-shot-v1'
W,H,TOP=720,540,42
FPS=30
RELEASE=.22
FLIGHT=1.12
CONTACT=RELEASE+FLIGHT
BOUNCE=.55
RIM=(360,112)
START_Y=500
G=1400
clean=Image.open(OUT/'court-clean.png').convert('RGBA').resize((W,H),Image.Resampling.LANCZOS)
original=Image.open(ROOT/'docs/主界面设计概念/06-正面第一视角投篮.png').convert('RGBA').resize((W,H),Image.Resampling.LANCZOS)
ball=Image.open(OUT/'ball-source.png').convert('RGBA')
ball=ball.crop(ball.getchannel('A').getbbox())
ball.save(OUT/'ball.png')
particles=Image.open(ROOT/'public/previews/frame-animation-v2/splash.png').convert('RGBA')
font=ImageFont.truetype('C:/Windows/Fonts/msyhbd.ttc',22)
small=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',13)

# Isolate original ink/cream net using the edited clean plate, not a cream
# rectangle. Net front layer is skipped for an approaching foreground ball.
NET_BOX=(316,112,405,183)
before=np.array(original.crop(NET_BOX));after=np.array(clean.crop(NET_BOX))
delta=np.abs(before[:,:,:3].astype('int16')-after[:,:,:3].astype('int16')).max(axis=2)
yy,xx=np.mgrid[:71,:89]
half=42-22*np.clip(yy/68,0,1)
inside=(np.abs(xx-44)<=half)&(yy>=6)&(yy<=68)
cream=(before[:,:,0]>160)&(before[:,:,1]>150)&(before[:,:,2]>105)
ink=before[:,:,:3].max(axis=2)<100
white=inside&(delta>20)&cream
# Dark outlines belong to a rope only when adjacent to a cream strand.
# A plain dark support pole must never become foreground net occlusion.
near_rope=np.array(Image.fromarray((white*255).astype('uint8')).filter(ImageFilter.MaxFilter(3)))>0
mask=white|(inside&ink&near_rope)
before[:,:,3]=np.where(mask,255,0).astype('uint8')
net=Image.fromarray(before)
net.save(OUT/'net.png')
rim_front=Image.new('RGBA',(W,H))
for y in range(112,125):
 for x in range(317,404):
  r,g,b,a=clean.getpixel((x,y))
  if (r>100 and g<125 and b<95) or max(r,g,b)<100:rim_front.putpixel((x,y),(r,g,b,a))
rim_front.save(OUT/'rim-front.png')
green=np.array(net).copy()
green_strands=(green[:,:,0]>160)&(green[:,:,1]>150)&(green[:,:,2]>105)&(green[:,:,3]>0)
green[green_strands,:3]=[55,239,113]
Image.fromarray(green).save(OUT/'net-green.png')

def descend(dt):
 """Integrate net resistance then free fall at a fixed 480Hz timestep."""
 return drop_samples[min(len(drop_samples)-1,round(dt*480))]

drop_samples=[]
y=112.0;velocity=300.0
for step in range(960):
 drop_samples.append(y)
 velocity+=780/480
 if y<190:velocity*=math.exp(-2.8/480)
 y+=velocity/480

def state(kind,t):
 # (x,y,radius,alpha,draw_net_in_front)
 if kind in ('minor','severe'):
  if t<RELEASE:return (360,START_Y,125,1,False)
  dt=t-RELEASE
  if kind=='minor':
   vy=-580;g=850;apex=-vy/g
   x=360+50*dt+135*max(0,dt-.3)
   y=500+vy*dt+.5*g*dt*dt
   radius=125/(1+1.8*dt);ground=520-radius
   apex_y=500-vy*vy/(2*g)
  else:
   # A short preparation lift, followed by a slip before any real shot.
   if dt<.18:return (360,500-500*dt,125-25*dt/.18,1,False)
   dt-=.18;vy=-50;g=900;apex=-vy/g
   x=360-120*dt;y=410+vy*dt+.5*g*dt*dt
   radius=100/(1+.7*dt);ground=535-radius;apex_y=410-vy*vy/(2*g)
  progress=max(0,min(1,(y-apex_y)/(ground-apex_y))) if dt>=apex else 0
  return (x,min(y,ground),radius,(1-progress)**1.15,False)
 impact_x=393 if kind=='hold' else 360
 # Center of the back rim: the ball's lower edge touches the rim at y=105.
 impact_y=112 if kind=='great' else 85 if kind=='success' else 103
 if t<RELEASE:return (360,START_Y,125,1,False)
 if t<CONTACT:
  dt=t-RELEASE;s=dt/FLIGHT
  vy=(impact_y-START_Y-.5*G*FLIGHT**2)/FLIGHT
  # Small aim deviation appears late, leaving the initial launch shared.
  x=360+(impact_x-360)*s*s
  y=START_Y+vy*dt+.5*G*dt*dt
  radius=125/(1+5.25*s)
  return (x,y,radius,1,kind=='great' and s>.94)
 dt=t-CONTACT
 if kind=='hold':
  vy=-210;g=1050
  apex=-vy/g;apex_y=103+vy*apex+.5*g*apex*apex
  x=393+145*dt;y=103+vy*dt+.5*g*dt*dt
  radius=20+4*min(1,dt)
  ground=455-radius
  progress=max(0,min(1,(y-apex_y)/(ground-apex_y))) if dt>=apex else 0
  alpha=(1-progress)**1.15
  return (x,min(y,ground),radius,alpha,False)
 if kind=='success' and dt<BOUNCE:
  vy=(112-85-.5*1000*BOUNCE**2)/BOUNCE
  return (360,85+vy*dt+.5*1000*dt*dt,20,1,False)
 entry=CONTACT+(BOUNCE if kind=='success' else 0)
 y=descend(t-entry)
 ground=410
 progress=max(0,min(1,(y-112)/(ground-112)))
 alpha=max(0,1-progress**1.25)
 # A small remaining forward movement after net release; no floor bounce.
 return (360,min(y,ground),20,alpha,True)

def net_parameters(kind,t):
 if kind not in ('great','success'):return 71,0
 entry=CONTACT+(BOUNCE if kind=='success' else 0)
 dt=t-entry
 pull=0 if dt<0 or kind=='hold' else math.sin(min(1,dt/.22)*math.pi/2)*math.exp(-max(0,dt-.22)*9)
 settle=0 if dt<.22 or kind=='hold' else .055*math.sin((dt-.22)*26)*math.exp(-(dt-.22)*8)
 height=round(71*(1+.27*pull+settle))
 return height,0

def net_frame(kind,t):
 height,strength=net_parameters(kind,t)
 image=np.array(net).copy()
 white=(image[:,:,0]>160)&(image[:,:,1]>150)&(image[:,:,2]>105)&(image[:,:,3]>0)
 image[white,:3]=(image[white,:3]*(1-strength)+np.array([55,239,113])*strength).astype('uint8')
 return Image.fromarray(image).resize((89,height),Image.Resampling.BICUBIC)

TITLES={'great':'大成功 · 空心入网','success':'成功 · 中央弹筐入网','hold':'维持 · 弹筐而出','minor':'轻伤 · 出手失力','severe':'重伤 · 脱手失衡'}
COLORS={'great':'#76e7a0','success':'#ead6a2','hold':'#a9c2d9','minor':'#e7a266','severe':'#e36b57'}

def presentation(kind,t):
 """Shared vector accents/camera metadata for GIF and browser renderers."""
 strokes=[];camera={'x':0,'y':0,'angle':0,'zoom':1};label=None;vignette=0
 def line(points,color,width,alpha):
  strokes.append({'points':points,'color':color,'width':width,'alpha':alpha})
 if kind=='great':
  dt=t-CONTACT-.18
  if 0<dt<.46:
   u=dt/.46;alpha=min(1,u/.15)*(1-u)**.7
   rx=38+44*u;ry=10+12*u
   for start,end in [(12,110),(145,218),(250,320)]:
    points=[[360+rx*math.cos(math.radians(a)),185+ry*math.sin(math.radians(a))] for a in range(start,end+1,4)]
    line(points,'#10251d',7,alpha);line(points,'#55ff98',3,alpha)
   for angle in (22,70,125,170,220,310):
    a=math.radians(angle);distance=36+65*u
    points=[[360+math.cos(a)*r,185+math.sin(a)*r*.52] for r in (distance,distance+8*(1-u))]
    line(points,'#c0ffd6',3,alpha)
 if kind=='success' and 0<t-CONTACT<.16:
  alpha=1-(t-CONTACT)/.16
  for x,dx in [(341,-9),(379,9)]:line([[x,101],[x+dx,94]],'#f2d9a7',3,alpha)
 if kind in ('minor','severe'):
  dt=t-(.52 if kind=='minor' else .4)
  if dt>=0:
   severe=kind=='severe'
   strength=math.exp(-dt*(7 if severe else 10))
   camera={'x':math.sin(dt*45)*(5 if severe else 3)*strength,
    'y':-28*math.sin(min(1,dt/.7)*math.pi) if severe and dt<.7 else 2*math.sin(dt*38)*strength,
    'angle':-2.4*math.sin(min(1,dt/.8)*math.pi) if severe and dt<.8 else 0,
    'zoom':1+(.065 if severe else .012)*max(0,1-dt/.85)}
   # Crop enough overscan to avoid exposing black corners while tilting.
   camera['zoom']=max(camera['zoom'],1+2*abs(camera['x'])/W+2*abs(camera['y'])/H+abs(math.radians(camera['angle']))*W/H)
   if dt>=(.85 if severe else .4):camera={'x':0,'y':0,'angle':0,'zoom':1}
   if severe:
    vignette=min(1,dt/.09)*max(0,min(1,(2.8-dt)/.7))*.88
    if dt<.75:
     impact=min(1,dt/.04)*max(0,1-dt/.75)
     for side in (-1,1):
      for j in range(5):
       x=360+side*(340-j*13);y=90+j*88
       points=[[x,y],[x-side*(58+(j%2)*25),y+32],[x-side*(43+(j%2)*19),y+49]]
       line(points,'#080b10',26,impact);line(points,'#9f241f',13,impact)
   if dt<.45:
    alpha=min(1,dt/.045)*(1-dt/.45)
    for side in (-1,1):
     for j in range(3):
      x=360+side*(260+j*14);y=210+j*43
      line([[x,y],[x-side*(27+j*6),y+19]],'#b84b35' if severe else '#d79a62',7 if severe else 4,alpha)
   if .12<dt<2.65:
    label={'text':'重伤 · 训练终止' if severe else '轻伤 · 仍可继续训练',
     'color':'#e36b57' if severe else '#e7b379','alpha':min(1,(dt-.12)/.15,(2.65-dt)/.3)}
 return {'strokes':strokes,'camera':camera,'label':label,'vignette':vignette}

def apply_presentation(image,p):
 c=p['camera'];a=math.radians(c['angle']);z=c['zoom']
 if z!=1 or c['x'] or c['y'] or a:
  # Inverse of Canvas translate(center + offset), rotate, scale, translate(-center).
  co=math.cos(a)/z;si=math.sin(a)/z;cx=360+c['x'];cy=270+c['y']
  image=image.transform((W,H),Image.Transform.AFFINE,(co,si,360-co*cx-si*cy,-si,co,270+si*cx-co*cy),Image.Resampling.BICUBIC)
 if p['vignette']:
  yy,xx=np.mgrid[:H,:W]
  distance=np.sqrt(((xx-W/2)/(W/2))**2+((yy-H/2)/(H/2))**2)
  shade=np.zeros((H,W,4),dtype='uint8');shade[:,:,:3]=[16,3,5]
  shade[:,:,3]=(np.clip((distance-.38)/.72,0,1)*p['vignette']*255).astype('uint8')
  image.alpha_composite(Image.fromarray(shade))
 for stroke in p['strokes']:
  layer=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(layer)
  color=stroke['color'];rgb=tuple(int(color[i:i+2],16) for i in (1,3,5))
  draw.line([tuple(pt) for pt in stroke['points']],fill=(*rgb,round(255*stroke['alpha'])),width=stroke['width'],joint='curve')
  image.alpha_composite(layer)
 if p['label']:
  label=p['label'];layer=Image.new('RGBA',(W,H));draw=ImageDraw.Draw(layer)
  draw.polygon([(206,437),(521,437),(514,482),(199,482)],fill='#101a20',outline=label['color'])
  draw.text((360,459),label['text'],font=font,fill=label['color'],anchor='mm')
  layer.putalpha(layer.getchannel('A').point(lambda a:round(a*label['alpha'])))
  image.alpha_composite(layer)
 return image

def frame(kind,t):
 image=clean.copy()
 x,y,radius,alpha,occluded=state(kind,t)
 net_image=net_frame(kind,t)
 def draw_net():
  image.alpha_composite(net_image,(316,112));image.alpha_composite(rim_front)
 if not occluded:draw_net()
 if alpha>0:
  diameter=round(2*radius)
  art=ball.resize((diameter,diameter),Image.Resampling.LANCZOS)
  art=art.rotate(-max(0,t-RELEASE)*110,resample=Image.Resampling.BICUBIC,expand=True)
  art.putalpha(art.getchannel('A').point(lambda a:round(a*alpha)))
  image.alpha_composite(art,(round(x-art.width/2),round(y-art.height/2)))
 if occluded:draw_net()
 image=apply_presentation(image,presentation(kind,t))
 result=Image.new('RGB',(W,H+TOP+26),'#08131e')
 result.paste(image,(0,TOP))
 draw=ImageDraw.Draw(result)
 draw.text((16,7),TITLES[kind],font=font,fill=COLORS[kind])
 draw.text((W-166,15),'正面投篮 · 30fps',font=small,fill='#c9bda4')
 draw.text((16,TOP+H+4),'下落渐隐 · 到达地面时完全消失',font=small,fill='#cfbea1')
 return result

def export_player_data():
 data={'width':W,'height':H,'fps':FPS,'durationMs':3930,'outcomes':{}}
 for kind in TITLES:
  timeline=[];end_ms=0
  for i in range(103):
   t=i/FPS
   duration=round((i+1)*100/FPS)*10-round(i*100/FPS)*10+(500 if i==102 else 0)
   end_ms+=duration
   x,y,radius,alpha,occluded=state(kind,t)
   height,green=net_parameters(kind,t)
   timeline.append({'endMs':end_ms,'x':x,'y':y,'radius':radius,'alpha':alpha,
    'occluded':occluded,'rotation':-max(0,t-RELEASE)*110,'netHeight':height,'netGreen':green,'particles':None,
    **presentation(kind,t)})
  assert end_ms==data['durationMs']
  data['outcomes'][kind]={'title':TITLES[kind],'color':COLORS[kind],'frames':timeline}
 (OUT/'player-data.json').write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')

export_player_data()
# Game runtime uses the same renderer and timeline as the approved preview.
runtime=ROOT/'public/art/shot';runtime.mkdir(parents=True,exist_ok=True)
for name in ('court-clean.png','ball.png','net.png','rim-front.png','player-data.json'):
 shutil.copyfile(OUT/name,runtime/name)
shutil.copyfile(OUT/'player-core.mjs',ROOT/'src/presentation/shotRenderer.js')
if '--layers-only' in sys.argv:
 print('Exported player-data.json, rim-front.png and net-green.png')
 raise SystemExit(0)

report={};contact=Image.new('RGB',(1440,304*len(TITLES)),'#08131e')
for row,kind in enumerate(TITLES):
 times=[i/FPS for i in range(103)]
 frames=[frame(kind,t) for t in times]
 durations=[round((i+1)*100/FPS)*10-round(i*100/FPS)*10 for i in range(len(frames))]
 durations[-1]+=500
 samples=Image.new('RGB',(W,(H+TOP+26)*10))
 sample_indices=[0,10,20,30,39,43,48,53,62,80]
 for j,i in enumerate(sample_indices):samples.paste(frames[i],(0,j*(H+TOP+26)))
 palette=samples.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
 indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
 indexed[0].save(OUT/(kind+'.gif'),save_all=True,append_images=indexed[1:],duration=durations,loop=0,disposal=1,optimize=True)
 entry=CONTACT+(BOUNCE if kind=='success' else 0)
 poster_time=.75 if kind in ('minor','severe') else entry+.32
 frames[round(poster_time*FPS)].save(OUT/(kind+'-poster.png'))
 frame_dir=OUT/'frames'/kind;frame_dir.mkdir(parents=True,exist_ok=True)
 for i,im in enumerate(frames):im.save(frame_dir/f'{i:03}.png')
 # Contact sheet: result impact, result after contact, falling, empty ending.
 selected=[16,23,34,len(frames)-1] if kind in ('minor','severe') else [round(CONTACT*FPS),round((CONTACT+.32)*FPS),round((entry+.55)*FPS),len(frames)-1]
 for col,i in enumerate(selected):contact.paste(frames[i].resize((360,304)),(col*360,row*304))
 gif=Image.open(OUT/(kind+'.gif'));total=0
 assert gif.info['loop']==0 and gif.size==(720,608)
 for i in range(gif.n_frames):gif.seek(i);total+=gif.info['duration']
 assert total==sum(durations)
 states=[state(kind,t) for t in times]
 assert states[-1][3]==0 and abs(states[-1][1]+states[-1][2]-({'minor':520,'severe':535,'hold':455}.get(kind,430)))<1e-6
 # Once fading starts, opacity must monotonically decrease and stay zero.
 fading=next(i for i,s in enumerate(states) if s[3]<1)
 assert all(states[i+1][3]<=states[i][3]+1e-8 for i in range(fading,len(states)-1))
 # Near-camera flight must not be hidden by the distant hoop/net.
 assert not state(kind,RELEASE+.3)[4]
 report[kind]={'fps':FPS,'renderedFrames':len(frames),'gifFrames':gif.n_frames,'durationMs':total,
  'contact':CONTACT if kind not in ('minor','severe') else None,'netEntry':entry if kind in ('great','success') else None,
  'fadeStart':times[fading],'fullyInvisible':next(t for t,s in zip(times,states) if s[3]==0),
  'finalOpacity':states[-1][3],'bytes':(OUT/(kind+'.gif')).stat().st_size}
contact.save(OUT/'contact-sheet.jpg',quality=94)
(OUT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
