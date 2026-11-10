"""Separate reusable frame, paper and approved Curry art from the design."""
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]
image=Image.open(root/'docs/主界面设计概念/05-模板主导球员面板.png').convert('RGBA')
out=root/'public/art/game'
w,h=image.size
def box(a,b,c,d):return (round(w*a),round(h*b),round(w*c),round(h*d))
image.crop(box(0,0,.299,1)).save(out/'template-curry.png')
image.crop(box(.72,.60,.74,.63)).save(out/'template-paper.png')
# The outer ink/cream edge contains no data. Clear the entire interior, including
# the portrait; all remaining identity, tier, position, rating and stats are DOM.
mask=Image.new('L',image.size,255)
ImageDraw.Draw(mask).rectangle(box(.018,.086,.98,.93),fill=0)
# Artwork reaches the lower left edge, so this edge uses paper instead of skin.
ImageDraw.Draw(mask).rectangle(box(0,.7,.31,1),fill=0)
image.putalpha(mask)
frame=Image.new('RGBA',image.size)
frame.alpha_composite(image)
frame.save(out/'template-frame.png')
print('Prepared template panel art',w,h)
