import json
from pathlib import Path

root = Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
manifest = json.loads((root/'manifest.json').read_text(encoding='utf-8'))
out = Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\content\papers\cq-2026-chem')
out.mkdir(parents=True, exist_ok=True)
base = 'papers/cq-2026-chem'

paper_questions = []
for q in manifest['questions']:
    n = q['number']
    stem = f"{base}/q{n:02d}-stem.png"
    analysis = f"{base}/q{n:02d}-analysis.png"
    item = {
        'id': q['id'],
        'paperId': 'cq-2026-chem',
        'number': n,
        'section': q['section'],
        'type': q['type'],
        'score': q['score'],
        'stemImage': stem,
        'analysisImage': analysis,
        'answerKind': 'official',
        'sourcePage': q['paperPage'],
        'analysisPage': q['analysisPage'],
        'reviewStatus': 'crop-ok' if n not in (6, 11, 15, 17, 18) else 'needs-review',
        'tags': ['重庆', '2026', '化学'],
        'kpIds': [],
    }
    if n <= 14:
        item['answer'] = q['answer']
        item['answerImage'] = f'{base}/choice-answers.png'
    else:
        item['answer'] = None
        item['answerImage'] = f'{base}/q{n:02d}-answer.png'
    (out/f'q{n:02d}.json').write_text(json.dumps(item, ensure_ascii=False, indent=2), encoding='utf-8')
    paper_questions.append(item)

paper = {
    'id': 'cq-2026-chem',
    'title': '重庆市2026年普通高等学校招生统一考试 化学',
    'shortTitle': '2026 重庆化学',
    'subjectId': 'chemistry',
    'subjectName': '化学',
    'region': '重庆',
    'year': 2026,
    'score': 100,
    'durationMinutes': 75,
    'source': {
        'publisher': '山城学术圈',
        'type': '公众号整理版',
        'note': '用户提供的个人备考材料；仅本地使用，不对外分发。',
    },
    'assetBase': base,
    'sections': [
        {
            'id': 'choice',
            'title': '一、选择题',
            'hint': '共 14 小题，每小题 3 分，共 42 分。',
            'score': 42,
            'questionIds': [q['id'] for q in paper_questions if q['number'] <= 14],
        },
        {
            'id': 'comprehensive',
            'title': '二、综合题',
            'hint': '共 4 小题，共 58 分。',
            'score': 58,
            'questionIds': [q['id'] for q in paper_questions if q['number'] >= 15],
        },
    ],
    'questionIds': [q['id'] for q in paper_questions],
    'reviewStatus': 'draft',
    'notes': [
        '当前为图片题干版：题干、答案、解析均使用裁切图，保证公式和结构式不丢失。',
        '选择题答案来自第 8 页答案表；综合题答案为第 8 页对应题块。',
        'q06、q11、q15、q17 的解析为跨页拼接，需要清理拼接处页眉。',
        'q18 解析从第 13 页中部开始，需复核开头。',
    ],
}
(out/'paper.json').write_text(json.dumps(paper, ensure_ascii=False, indent=2), encoding='utf-8')
print('wrote', len(paper_questions), 'questions to', out)
