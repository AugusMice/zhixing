import json
from pathlib import Path

kps = json.loads(Path('content/knowledge/chemistry.json').read_text(encoding='utf-8'))
lines = []
for k in kps:
    lines.append(f"{k['id']} | {k.get('group', '')} | {k['name']}")
Path('work/chem-kps.txt').write_text('\n'.join(lines), encoding='utf-8')
print('ok', len(kps))
