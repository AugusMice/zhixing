from pathlib import Path

p = Path('package.json')
t = p.read_text(encoding='utf-8').replace('"version": "0.3.0"', '"version": "0.5.0"')
p.write_text(t, encoding='utf-8')

s = Path('src/views/Settings.tsx')
c = s.read_text(encoding='utf-8').replace('v0.3</span>', 'v0.5</span>')
s.write_text(c, encoding='utf-8')

w = Path('public/sw.js')
c = w.read_text(encoding='utf-8').replace('zhixing-v26', 'zhixing-v27')
w.write_text(c, encoding='utf-8')

print('bumped')
