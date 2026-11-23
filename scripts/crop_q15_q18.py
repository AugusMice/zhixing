from pathlib import Path
from PIL import Image, ImageDraw
root = Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
paper = root/'paper'; out = root/'questions'
jobs = {
 'q15': ('paper-p04.png', (110, 300, 2460, 3370)),
 'q16': ('paper-p05.png', (110, 300, 2460, 3370)),
 'q17': ('paper-p06.png', (120, 300, 2860, 3940)),
 'q18': ('paper-p07.png', (110, 280, 2460, 3380)),
}
for qid,(fn,box) in jobs.items():
    d=out/qid; d.mkdir(parents=True,exist_ok=True)
    Image.open(paper/fn).convert('RGB').crop(box).save(d/'stem.png',optimize=True)
    print(qid,fn,box)
thumbs=[]
for qid in jobs:
    im=Image.open(out/qid/'stem.png'); im.thumbnail((520,500)); thumbs.append((qid,im))
W=1080; H=sum(t.height+30 for _,t in thumbs)+20
sheet=Image.new('RGB',(W,H),'white'); dr=ImageDraw.Draw(sheet); y=10
for qid,t in thumbs:
    dr.text((10,y),qid,fill='red'); sheet.paste(t,(80,y)); y+=t.height+30
sheet.save(root/'work'/'q15-q18-contact.png')
