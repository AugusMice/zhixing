"""为 2026 重庆化学卷标注 kpIds 与难度。

依据：Windows.Media.Ocr 对 qNN-stem.png 的离线识别结果（work/ocr-all.txt），
人工对照 content/knowledge/chemistry.json 的 56 个知识点做映射。
不修改题干、答案、解析等真题内容，只补充知识点与难度元数据。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAPER_DIR = ROOT / 'content' / 'papers' / 'cq-2026-chem'
KPS = {k['id'] for k in json.loads((ROOT / 'content' / 'knowledge' / 'chemistry.json').read_text(encoding='utf-8'))}

# 题号 -> (难度, 知识点, 判定依据摘要)
MAPPING = {
    1: (2, ['chem-polymer', 'chem-organic-basic'], '医用高分子材料辨析（聚醚醚酮）'),
    2: (2, ['chem-chemical-bond', 'chem-atomic-structure'], '电子式书写、核素中子数'),
    3: (3, ['chem-periodic-law', 'chem-chemical-bond'], '第一电离能/原子半径/电负性/键长比较'),
    4: (3, ['chem-ions'], '盐溶液中离子共存'),
    5: (3, ['chem-basic', 'chem-redox'], 'Na2O2/KHCO3/FeCl3 性质与氧化性'),
    6: (3, ['chem-molecular-structure', 'chem-chemical-bond'], '键角、VSEPR、键能、分子极性'),
    7: (3, ['chem-lab-safety', 'chem-qualitative', 'chem-separation', 'chem-quantitative'], '试剂存放/鉴别/除杂/滴定误差'),
    8: (4, ['chem-organic-reaction', 'chem-organic-basic'], '加聚、水解、手性碳、C-N 键变化'),
    9: (4, ['chem-gas-prep', 'chem-experiment-design', 'chem-lab-safety'], 'YCl3 制备装置、NH3 制硝酸、尾气处理'),
    10: (5, ['chem-crystal'], '晶胞结构、配位数、空位与电导'),
    11: (5, ['chem-ion-concentration', 'chem-water-ionization'], '配离子体系 pH 与离子浓度关系'),
    12: (4, ['chem-periodic-table', 'chem-periodic-law', 'chem-atomic-structure'], '元素推断：电子排布、周期表、焰色'),
    13: (5, ['chem-electrolysis', 'chem-electrode-equation'], '双电解池捕获 CO2、电极反应与电子转移'),
    14: (5, ['chem-equilibrium', 'chem-equilibrium-calc', 'chem-equilibrium-shift'], 'NH4I 分解平衡、分压与平衡常数'),
    15: (5, ['chem-process-basic', 'chem-process-leach', 'chem-redox', 'chem-precipitation'], '金精矿焙烧-浸金-置换流程'),
    16: (5, ['chem-experiment-design', 'chem-quantitative', 'chem-separation', 'chem-lab-safety'], '稀土配合物制备、过滤洗涤、产率'),
    17: (5, ['chem-equilibrium-calc', 'chem-equilibrium-image', 'chem-electrolysis', 'chem-quantitative'], 'SiHCl3 氢还原平衡与熔盐电解'),
    18: (5, ['chem-organic-synthesis', 'chem-isomer', 'chem-organic-reaction'], '有机合成路线、同分异构、逆合成'),
}


def main() -> None:
    missing = set()
    for number, (difficulty, kp_ids, _reason) in MAPPING.items():
        path = PAPER_DIR / f'q{number:02d}.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        for kp in kp_ids:
            if kp not in KPS:
                missing.add(kp)
        data['kpIds'] = kp_ids
        data['difficulty'] = difficulty
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if missing:
        raise SystemExit(f'未知知识点: {sorted(missing)}')
    print(f'已标注 {len(MAPPING)} 题')


if __name__ == '__main__':
    main()
