from pathlib import Path
from PIL import Image
root=Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
A=root/'analysis'; out=root/'questions'
def load(n): return Image.open(A/n).convert('RGB')
p9,p10,p11,p12,p13=[load(f'analysis-p{i:02d}.png') for i in range(1,6)]
W=2860-120
def crop(im, y0,y1,x0=120,x1=2860): return im.crop((x0,y0,x1,y1))
def stack(parts):
    h=sum(p.height for p in parts); c=Image.new('RGB',(parts[0].width,h),'white'); y=0
    for p in parts: c.paste(p,(0,y)); y+=p.height
    return c
jobs={}
for i,(y0,y1) in enumerate([(540,915),(915,1364),(1364,1842),(1842,2447),(2447,3069)],1):
    jobs[f'q{i:02d}']=crop(p9,y0,y1)
jobs['q06']=stack([crop(p9,3069,p9.height),crop(p10,0,480)])
jobs['q07']=crop(p10,480,1078); jobs['q08']=crop(p10,1078,1712); jobs['q09']=crop(p10,1712,2320); jobs['q10']=crop(p10,2320,3037)
jobs['q11']=stack([crop(p10,3037,p10.height),crop(p11,0,510)])
jobs['q12']=crop(p11,510,895); jobs['q13']=crop(p11,895,1822); jobs['q14']=crop(p11,1822,2943)
jobs['q15']=stack([crop(p11,2943,p11.height),crop(p12,0,905)])
jobs['q16']=crop(p12,905,2360); jobs['q17']=crop(p12,2360,p12.height)
jobs['q18']=crop(p13,300,3600,x0=110,x1=2460)
for qid,im in jobs.items():
    d=out/qid; d.mkdir(parents=True,exist_ok=True); im.save(d/'analysis.png',optimize=True); print(qid,im.size)
