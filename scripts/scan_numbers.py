from pathlib import Path
from PIL import Image
import numpy as np
root=Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
for name in ['paper-p01.png','paper-p02.png','paper-p03.png']:
    im=Image.open(root/'paper'/name).convert('L'); a=np.asarray(im); h,w=a.shape
    x0,x1=int(w*0.055),int(w*0.090)
    band=(a[:,x0:x1] < 110).sum(axis=1)
    rows=band>3
    groups=[]; s=None
    for y,v in enumerate(rows):
        if v and s is None: s=y
        elif not v and s is not None:
            if y-s>=10: groups.append((s,y-1,y-s))
            s=None
    if s is not None: groups.append((s,h-1,h-s))
    print(name, im.size, 'xband',x0,x1)
    print([(s,e) for s,e,d in groups if e>300 and s<3600])
