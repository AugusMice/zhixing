from pathlib import Path
from PIL import Image, ImageDraw
root = Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
paper = root / 'paper'; out = root / 'questions'
jobs = {
 'q08': ('paper-p02.png', (110, 230, 2460, 675)),
 'q09': ('paper-p02.png', (110, 675, 2460, 1888)),
 'q10': ('paper-p02.png', (110, 1888, 2460, 2447)),
 'q11': ('paper-p02.png', (110, 2447, 2460, 3360)),
 'q12': ('paper-p03.png', (120, 270, 2860, 1019)),
 'q13': ('paper-p03.png', (120, 1019, 2860, 2408)),
 'q14': ('paper-p03.png', (120, 2408, 2860, 3940)),
}
for qid, (fn, box) in jobs.items():
    d = out / qid; d.mkdir(parents=True, exist_ok=True)
    Image.open(paper / fn).convert('RGB').crop(box).save(d / 'stem.png', optimize=True)
    print(qid, fn, box, (box[2]-box[0], box[3]-box[1]))

thumbs=[]
for qid in jobs:
    im=Image.open(out/qid/'stem.png'); im.thumbnail((520,420)); thumbs.append((qid,im))
W=1080; H=sum(t.height+30 for _,t in thumbs)+20
sheet=Image.new('RGB',(W,H),'white'); dr=ImageDraw.Draw(sheet); y=10
for qid,t in thumbs:
    dr.text((10,y),qid,fill='red'); sheet.paste(t,(80,y)); y+=t.height+30
sheet.save(root/'work'/'q08-q14-contact.png')
