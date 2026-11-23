from pathlib import Path
from PIL import Image, ImageDraw
root=Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
src=Image.open(root/'answer'/'answer-p01.png').convert('RGB')
bounds={'q15':(120,740,2860,1310),'q16':(120,1300,2860,1935),'q17':(120,1925,2860,2460),'q18':(120,2450,2860,3800)}
for qid,box in bounds.items():
    d=root/'questions'/qid; d.mkdir(parents=True,exist_ok=True)
    src.crop(box).save(d/'answer.png',optimize=True); print(qid,box)
# choice answer table
src.crop((500,350,2500,720)).save(root/'questions'/'choice-answers.png',optimize=True)
# contact
thumbs=[]
for qid in bounds:
    im=Image.open(root/'questions'/qid/'answer.png'); im.thumbnail((520,360)); thumbs.append((qid,im))
W=1080; H=sum(t.height+30 for _,t in thumbs)+20
sheet=Image.new('RGB',(W,H),'white'); dr=ImageDraw.Draw(sheet); y=10
for qid,t in thumbs:
    dr.text((10,y),qid,fill='red'); sheet.paste(t,(80,y)); y+=t.height+30
sheet.save(root/'work'/'q15-q18-answers-contact.png')
