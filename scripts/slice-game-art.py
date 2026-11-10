"""Deterministic slices of the user-approved design; never export dynamic text."""
from pathlib import Path
from collections import deque
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parents[1]
source = Image.open(root / 'docs/主界面设计概念/04-融合版主界面.png').convert('RGBA')
# Coordinates refer to the 887 x 1774 design canvas.
source = source.resize((887, 1774), Image.Resampling.LANCZOS)
out = root / 'public/art/game'
out.mkdir(parents=True, exist_ok=True)

def crop(name, box):
    source.crop(box).save(out / (name + '.png'))

crop('portrait', (17, 235, 224, 473))
crop('ink', (0, 1656, 270, 1774))
crop('paper', (403, 119, 538, 130))
crop('red', (29, 1245, 57, 1284))
# Standalone icons have true alpha; never keep a rectangular paper background.
def cutout(name, box, points):
    art = source.crop(box)
    mask = Image.new('L', art.size)
    ImageDraw.Draw(mask).polygon([(x-box[0],y-box[1]) for x,y in points], fill=255)
    art.putalpha(mask)
    # Flood only edge-connected warm paper, preserving enclosed highlights.
    # This removes scraps around curved icon edges that a polygon alone misses.
    pixels=art.load()
    queue=deque((x,y) for y in range(art.height) for x in range(art.width) if pixels[x,y][3]==0)
    seen=set(queue)
    while queue:
        x,y=queue.popleft()
        for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if not (0<=nx<art.width and 0<=ny<art.height) or (nx,ny) in seen:
                continue
            seen.add((nx,ny))
            r,g,b,a=pixels[nx,ny]
            if r>135 and g>115 and b>80 and r>b*1.06 and abs(r-g)<55 and g>=b:
                pixels[nx,ny]=(0,0,0,0)
                queue.append((nx,ny))
    clean = Image.new('RGBA', art.size)
    clean.alpha_composite(art)
    clean.save(out / (name+'.png'))

cutout('drink', (47,1343,115,1455), [(64,1347),(96,1347),(98,1366),(107,1377),(109,1442),(104,1451),(62,1451),(56,1446),(56,1379),(64,1367)])
cutout('ice', (237,1349,331,1453), [(279,1357),(289,1357),(291,1362),(301,1359),(314,1365),(310,1376),(298,1382),(307,1392),(328,1431),(328,1439),(314,1446),(268,1450),(244,1441),(241,1431),(257,1404),(276,1384),(276,1377),(280,1375),(276,1365)])
crop('flame', (797, 548, 853, 610))

# The stationary follow-through character is a separate transparent cutout.
box = (74, 788, 270, 1145)
sprite = source.crop(box)
points = [(239,790),(262,794),(267,805),(259,818),(252,817),(248,805),(239,803),
 (227,830),(214,853),(192,877),(185,909),(179,930),(173,945),(175,976),(168,1015),
 (165,1020),(152,1045),(142,1071),(132,1097),(139,1119),(159,1132),(157,1142),
 (136,1144),(115,1134),(97,1126),(78,1115),(77,1103),(87,1091),(93,1065),
 (106,1020),(102,1007),(112,978),(119,949),(118,938),(125,917),(132,901),
 (140,884),(142,869),(132,853),(135,835),(146,823),(164,818),(171,812),
 (171,819),(183,816),(187,825),(194,831),(196,847),(191,862),(188,867),
 (198,853),(207,830),(220,802),(229,794)]
mask = Image.new('L', sprite.size)
ImageDraw.Draw(mask).polygon([(x-box[0], y-box[1]) for x,y in points], fill=255)
sprite.putalpha(mask)
sprite.save(out / 'shooter.png')

# Static button lettering is explicitly permitted. No live numbers in this crop.
button = source.crop((281,1447,606,1745))
mask = Image.new('L',button.size)
ImageDraw.Draw(mask).ellipse((8,6,316,294),fill=255)
button.putalpha(mask)
button.save(out / 'shoot-button.png')

# Keep the ENTIRE approved dock, including original jagged edges, double borders,
# icon lettering and uninterrupted ink background. Only inventory numbers are
# removed and redrawn by DOM. Clean paper is sampled from the same design.
dock = source.crop((0,1332,887,1774))
paper = source.crop((115,1609,180,1620))
for box in [(129,1404,188,1443),(340,1404,401,1443)]:
    x0,y0,x1,y1=box
    patch = paper.resize((x1-x0+8,y1-y0+8),Image.Resampling.LANCZOS)
    feather = Image.new('L',patch.size)
    ImageDraw.Draw(feather).rectangle((2,2,patch.width-3,patch.height-3),fill=255)
    feather=feather.filter(ImageFilter.GaussianBlur(1))
    dock.paste(patch,(x0-4,y0-1332-4),feather)
dock.save(out/'dock-controls.png')

# Original distressed frame, with every probability label/value removed.
frame=source.crop((15,1206,872,1310))
frame_mask=Image.new('L',frame.size,255)
ImageDraw.Draw(frame_mask).polygon([(32,13),(819,13),(842,34),(842,71),(819,91),(32,91),(16,75),(16,32)],fill=0)
frame.putalpha(frame_mask)
clean_frame=Image.new('RGBA',frame.size)
clean_frame.alpha_composite(frame)
clean_frame.save(out/'probability-frame.png')
crop('probability-grain',(53,1225,80,1250))
print('Saved game slices:', ', '.join(p.name for p in out.iterdir()))
