from pathlib import Path
from PIL import Image
root = Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
paper = root / 'paper'
out = root / 'questions'
# page 1 boundaries (original pixels), based on question-number scan
bounds = {
    'q01': (120, 1125, 2860, 1430),
    'q02': (120, 1430, 2860, 1830),
    'q03': (120, 1830, 2860, 2142),
    'q04': (120, 2142, 2860, 2478),
    'q05': (120, 2478, 2860, 2897),
    'q06': (120, 2897, 2860, 3231),
    'q07': (120, 3231, 2860, 3940),
}
im = Image.open(paper / 'paper-p01.png').convert('RGB')
for qid, box in bounds.items():
    d = out / qid
    d.mkdir(parents=True, exist_ok=True)
    im.crop(box).save(d / 'stem.png', optimize=True)
    print(qid, box, (box[2]-box[0], box[3]-box[1]))

# contact sheet, scaled down for quick inspection
thumbs = []
for qid in bounds:
    imq = Image.open(out / qid / 'stem.png')
    imq.thumbnail((520, 400))
    thumbs.append((qid, imq))
W = 1080
H = sum(t.height + 30 for _, t in thumbs) + 20
sheet = Image.new('RGB', (W, H), 'white')
from PIL import ImageDraw
draw = ImageDraw.Draw(sheet)
y = 10
for qid, t in thumbs:
    draw.text((10, y), qid, fill='red')
    sheet.paste(t, (80, y))
    y += t.height + 30
sheet.save(root / 'work' / 'q01-q07-contact.png')
