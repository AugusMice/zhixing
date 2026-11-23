import json
from pathlib import Path

root = Path(r'C:\Users\lenovo\Documents\deepseek-harness\default-workspace\真题库试验\重庆市2026年高考化学')
answers = ['A','C','B','A','B','A','B','A','B','C','D','C','D','B']
scores = [3]*14 + [14,15,14,15]
types = ['single']*14 + ['short']*4
stem_boxes = {
 1:(120,1125,2860,1430),2:(120,1430,2860,1830),3:(120,1830,2860,2142),4:(120,2142,2860,2478),
 5:(120,2478,2860,2897),6:(120,2897,2860,3231),7:(120,3231,2860,3940),
 8:(110,230,2460,675),9:(110,675,2460,1888),10:(110,1888,2460,2447),11:(110,2447,2460,3360),
 12:(120,270,2860,1019),13:(120,1019,2860,2408),14:(120,2408,2860,3940),
 15:(110,300,2460,3370),16:(110,220,2460,3370),17:(120,300,2860,3940),18:(110,190,2460,3380),
}
analysis_pages = {1:9,2:9,3:9,4:9,5:9,6:'9-10',7:10,8:10,9:10,10:10,11:'10-11',12:11,13:11,14:11,15:'11-12',16:12,17:12,18:13}
paper_pages = {1:1,2:1,3:1,4:1,5:1,6:1,7:1,8:2,9:2,10:2,11:2,12:3,13:3,14:3,15:4,16:5,17:6,18:7}
questions = []
for n in range(1,19):
    qid = f'cq2026-chem-q{n:02d}'
    q = {
        'id': qid,
        'number': n,
        'section': '选择题' if n <= 14 else '综合题',
        'type': types[n-1],
        'score': scores[n-1],
        'paperPage': f'paper/paper-p{paper_pages[n]:02d}.png',
        'stem': f'questions/q{n:02d}/stem.png',
        'analysis': f'questions/q{n:02d}/analysis.png',
        'analysisPage': analysis_pages[n],
        'stemBox': stem_boxes[n],
        'answerKind': 'official',
        'reviewStatus': 'crop-draft',
    }
    if n <= 14:
        q['answer'] = answers[n-1]
        q['answerImage'] = 'questions/choice-answers.png'
    else:
        q['answer'] = None
        q['answerImage'] = f'questions/q{n:02d}/answer.png'
    questions.append(q)

manifest = {
    'id': 'cq-2026-chem',
    'title': '重庆市2026年普通高等学校招生统一考试 化学',
    'region': '重庆',
    'year': 2026,
    'subject': 'chemistry',
    'subjectName': '化学',
    'totalScore': 100,
    'durationMinutes': 75,
    'source': {
        'publisher': '山城学术圈',
        'type': '公众号整理版',
        'note': '原图由用户提供；本目录只做个人备考结构化，不对外分发。',
        'sourceDir': 'source/',
        'originalFiles': [f'{i}.png' for i in range(1,14)],
    },
    'pages': {
        'paper': [f'paper/paper-p{i:02d}.png' for i in range(1,8)],
        'answer': ['answer/answer-p01.png'],
        'analysis': [f'analysis/analysis-p{i:02d}.png' for i in range(1,6)],
    },
    'questions': questions,
    'notes': [
        '选择题答案为第8页答案表；综合题答案在第8页，解析在9-13页。',
        'stem/answer/analysis 均为图片裁切，保留公式、结构式和流程图。',
        'q06、q11、q15 的解析跨页，analysis.png 为上下拼接。',
        'q18 解析从第13页中部开始，需人工复核是否缺少开头。',
    ],
}
(root/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('written', root/'manifest.json')
