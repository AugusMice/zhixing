import json
from pathlib import Path

base = Path('content/papers/cq-2026-chem')
answers = {8: 'C', 9: 'D', 10: 'D', 11: 'C'}
for path in sorted(base.glob('q*.json')):
    data = json.loads(path.read_text(encoding='utf-8'))
    number = data.get('number')
    data['section'] = '选择题' if number <= 14 else '综合题'
    data['tags'] = ['重庆', '2026', '化学']
    if number in answers:
        data['answer'] = answers[number]
    if number <= 14:
        data['answerImage'] = ''
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('fixed all question json')
