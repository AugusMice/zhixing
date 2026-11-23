from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root=Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
out=root/'work'; out.mkdir(exist_ok=True)
for name in ['paper-p01.png','paper-p02.png','paper-p03.png']:
    im=Image.open(root/'paper'/name).convert('RGB')
    d=ImageDraw.Draw(im)
    w,h=im.size
    for y in range(0,h,100):
        color=(255,0,0) if y%500==0 else (255,180,180)
        d.line([(0,y),(w,y)],fill=color,width=2 if y%500==0 else 1)
        if y%200==0:
            d.text((10,y+4),str(y),fill=(255,0,0))
    im.save(out/name.replace('paper-','grid-'))
    print(name, im.size)
