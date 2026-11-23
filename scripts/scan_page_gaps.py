from pathlib import Path
from PIL import Image
import numpy as np

root = Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
for p in sorted((root/'paper').glob('*.png')):
    im = Image.open(p).convert('L')
    a = np.asarray(im)
    h, w = a.shape
    # ink pixels, exclude very light background and watermark-ish gray
    ink = (a < 150).sum(axis=1) / w
    body = int(h*0.05), int(h*0.93)
    quiet = ink < 0.004
    runs = []
    start = None
    for y in range(body[0], body[1]):
        if quiet[y] and start is None:
            start = y
        elif not quiet[y] and start is not None:
            if y-start >= 12: runs.append((start, y-1, y-start))
            start = None
    if start is not None and body[1]-start >= 12: runs.append((start, body[1]-1, body[1]-start))
    print(p.name, im.size, 'gaps:', [(s,e) for s,e,_ in runs])
