# 题库格式

题库是仓库里的普通 JSON，构建时由 `src/content/index.ts` 读取并校验。改完内容重新构建即可，不需要数据库。

```text
content/
  subjects.json
  knowledge/
    math.json
    physics.json
    chemistry.json
    politics.json
    english.json
    chinese.json
  questions/
    math.json
    physics.json
    ...
```

`content/questions/` 与 `content/knowledge/` 下的**每个 `.json` 文件**都会自动被发现；文件名随意，但建议一科一个文件。文件内容必须是数组。

知识点按科目拆文件，是为了让一科的知识树可以单独维护、单独替换；六科之间只有 `related` 跨科引用会连边，星图默认只画同科航道。

所有 `id` 一旦有作答记录就不要再改：进度、错题本和掌握度都按 id 关联。

---

## 科目：`content/subjects.json`

```json
[
  { "id": "math", "name": "数学", "color": "#6ea8fe", "order": 0 },
  { "id": "physics", "name": "物理", "color": "#5ee0c0", "order": 1 }
]
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 稳定标识，建议短英文 |
| `name` | 是 | 显示名 |
| `color` | 是 | 十六进制颜色，用于星球和标签 |
| `order` | 否 | 排序，越小越靠前；缺省按数组顺序 |

---

## 知识点：`content/knowledge/<subject>.json`

```json
[
  {
    "id": "math-func",
    "subjectId": "math",
    "name": "函数基础",
    "group": "函数与导数",
    "description": "函数的概念、定义域、值域与表示方法。支持 Markdown 和 $x^2$。",
    "parents": [],
    "related": [],
    "examFrequency": 5,
    "importance": 5,
    "difficulty": 3
  },
  {
    "id": "math-domain",
    "subjectId": "math",
    "name": "函数定义域",
    "group": "函数与导数",
    "description": "分母不为零、偶次根号内非负、对数真数为正。",
    "parents": ["math-func"],
    "related": ["math-derivative"],
    "examFrequency": 4,
    "importance": 4,
    "difficulty": 2
  }
]
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 稳定标识 |
| `subjectId` | 是 | 必须存在于 `subjects.json` |
| `name` | 是 | 星球名 |
| `group` | 否 | 知识板块，如「函数与导数」「电磁学」；星图先按板块分组，缺省放入「未分组」 |
| `description` | 否 | 理论速览，Markdown；建议写 2~6 句，含核心概念/公式/易错点 |
| `parents` | 是 | 前置知识点 id 数组；没有就写 `[]`。可多个父节点，形成 DAG |
| `related` | 否 | 相关但非前置的知识点 id 数组，在网状图里画虚线；用于跨章节、跨模块联系 |
| `examFrequency` | 否 | 高考考频，1~5（5=几乎年年考）。用于「考频」着色 |
| `importance` | 否 | 重要程度，1~5。与 `difficulty` 合成「重难」着色 |
| `difficulty` | 否 | 学习难度，1~5 |
| `pos` | 否 | `[x, y]`，预留给手工坐标；当前布局不使用 |

### 板块（group）

- 一科建议 6~10 个板块；板块名要能一眼看出教材/考纲的大块，如「函数与导数」「化学反应原理」「哲学与文化」。
- 板块是星图的第二层：星系总览 → 板块总览 → 板块内知识树。板块不要超过 12 个，否则总览会拥挤。
- 板块名一旦定下就尽量稳定，用户的学习记录按知识点 id 关联，不按板块名。

### 前置关系的规则

- `parents` 必须指向已存在的知识点；跨科目引用会通过校验，但星图只画同科航道。
- **不要成环**。内容加载时会检测并打印循环依赖；有环的数据会导致星图布局退化。
- 每日新题会循序渐进：前置知识点还没做题、或掌握度低于 0.4 时，后继知识点的新题会暂缓（已有题仍可单独练）。
- 每个知识点至少配 1 道题，否则星图里是一颗空星球，也无法进入练习。
- `related` 不会影响解锁，只影响网状图的连线；不要把所有关系都塞进 `related`，只连真正有迁移价值的点。

---

## 题目通用字段

每道题都是一个对象，按 `type` 决定额外字段。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 全局唯一，如 `math-001` |
| `subjectId` | 是 | 必须与所关联知识点同科 |
| `kpIds` | 是 | 非空数组，关联 1~3 个知识点；掌握度会分别累计 |
| `type` | 是 | `single` / `multiple` / `judge` / `fill` / `short` |
| `difficulty` | 是 | 1~5 的整数 |
| `stem` | 是 | 题干，Markdown + LaTeX |
| `explanation` | 否 | 解析，答错时默认展开 |
| `source` | 否 | 来源，如「2023 全国甲卷」「示例题」 |
| `tags` | 否 | 字符串数组，预留给筛选 |

### 文本与公式

- 使用 Markdown；行内公式 `$...$`，独立公式 `$$...$$`。
- 公式由 KaTeX 渲染。JSON 里的反斜杠要写两次：`"$\\sqrt{2-x}$"`。
- 题干里的填空位置建议用 `____` 或「（　）」。
- 选项文本也可以是公式。

---

## 单选题

```json
{
  "id": "math-001",
  "subjectId": "math",
  "kpIds": ["math-domain"],
  "type": "single",
  "difficulty": 1,
  "stem": "函数 $f(x)=\\sqrt{2-x}$ 的定义域是（　）",
  "options": [
    { "key": "A", "text": "$(-\\infty,2]$" },
    { "key": "B", "text": "$(-\\infty,2)$" }
  ],
  "answer": "A",
  "explanation": "偶次根号内非负。",
  "source": "示例题"
}
```

- `options` 至少 2 项，`key` 不能重复。
- `answer` 必须是某个选项的 `key`。

## 多选题

```json
{
  "id": "chem-002",
  "subjectId": "chemistry",
  "kpIds": ["chem-basic"],
  "type": "multiple",
  "difficulty": 2,
  "stem": "下列说法正确的是（　）",
  "options": [
    { "key": "A", "text": "……" },
    { "key": "B", "text": "……" },
    { "key": "C", "text": "……" }
  ],
  "answer": ["A", "C"]
}
```

- `answer` 是非空数组；必须**完全选全**才算对，少选/多选都判错。

## 判断题

```json
{
  "id": "chem-003",
  "subjectId": "chemistry",
  "kpIds": ["chem-basic"],
  "type": "judge",
  "difficulty": 1,
  "stem": "由同种元素组成的物质一定是纯净物。",
  "answer": false,
  "explanation": "同种元素可以组成不同单质，如 O₂ 与 O₃ 混合。"
}
```

- `answer` 必须是布尔值，不是字符串。

## 填空题

```json
{
  "id": "math-002",
  "subjectId": "math",
  "kpIds": ["math-func"],
  "type": "fill",
  "difficulty": 1,
  "stem": "已知 $f(x)=x^2-2x+3$，则 $f(1)=$ ____。",
  "blanks": [
    { "accept": ["2"], "hint": "代入 x=1" }
  ]
}
```

- `blanks` 按顺序对应题干中的空。
- 每个空至少一个可接受答案；建议把常见等价写法都列进去，如 `["2", "2.0", "二"]`。
- 判定会做 NFKC 归一化（全角/半角）、压缩空白、忽略大小写，并额外忽略空格差异；不会做语义判断。
- 多个空必须全部命中。

## 大题

```json
{
  "id": "math-004",
  "subjectId": "math",
  "kpIds": ["math-derivative"],
  "type": "short",
  "difficulty": 3,
  "stem": "求函数 $f(x)=x^3-3x^2+2$ 的单调递减区间，并写出求解过程。",
  "rubric": [
    { "text": "求出导数 $f'(x)=3x^2-6x$", "score": 2 },
    { "text": "令 $f'(x)<0$，解得 $0<x<2$", "score": 3 },
    { "text": "结论：单调递减区间为 $(0,2)$", "score": 2 }
  ],
  "reference": "$f'(x)=3x(x-2)$，令 $f'(x)<0$ 得 $0<x<2$。",
  "explanation": "注意单调区间不要写成并集。",
  "maxScore": 7
}
```

- 用户对照参考解析，勾选自己实际拿到的采分点，系统按 `rubric` 求和。
- 得分率达到 **60%** 视为答对；`maxScore` 缺省为各采分点之和。
- 采分点要写成**可判断是否做到**的短句，不要写「过程完整」这种模糊项。
- 建议每题 3~6 个采分点，单点 1~3 分。

---

## 校验与排错

内容在应用启动时校验，非法项会被丢弃，其余内容照常加载。错误打印在浏览器控制台：

```text
[知星] 题库内容有问题：
题目 math-001 引用了不存在的知识点：math-domain
```

常见原因：

- `id` 重复（科目、知识点、题目各自全局唯一）。
- `subjectId` 不存在。
- 题目 `kpIds` 为空，或引用了不存在的知识点。
- 题目的知识点属于另一个科目。
- 单选 `answer` 不在选项里；多选 `answer` 为空或含不存在的 key。
- 填空 `blanks` 为空，或某个空没有 `accept`。
- 大题 `rubric` 为空，或分数不是正数。
- 知识点 `parents` 指向不存在的 id，或形成环。

改完后运行 `npm run check`（类型）和 `npm run build`（构建）；内容错误不会让构建失败，但会在运行时被丢弃，**发布前一定打开控制台确认没有 `[知星]` 报错**。

---

## 录入建议

1. **先搭骨架，再灌题**：先把一科拆成 8~20 个知识点，想清楚前置关系，再往里填题。
2. **一题最多关联 3 个知识点**：关联太多会让掌握度归因失焦。
3. **难度按真实体感标**：1 = 送分，3 = 常规高考中档，5 = 压轴。SRS 和每日计划会用到它。
4. **解析写「为什么错」**：只写正确答案对复习帮助有限。
5. **大题先写评分细则再写题**：评分细则写不出来，说明这道题不适合自动判分。
6. **真题优先**：来源写清楚（年份/卷别/题号），方便回溯；注意版权，个人备考使用。
---

## 古诗文栏目：`content/texts/<batch>.json`

语文的高考必背古诗文单独成栏，题库从原文里抽句考。一个文件放一批篇目：

```json
[
  {
    "id": "chn-t-lanting",
    "subjectId": "chinese",
    "title": "兰亭集序",
    "author": "王羲之",
    "dynasty": "东晋",
    "genre": "文",
    "source": "人教版必修下册",
    "excerpt": "节选全文",
    "paragraphs": ["永和九年，岁在癸丑……", "……信可乐也。"],
    "notes": [{ "term": "癸丑", "gloss": "干支纪年，指永和九年。" }],
    "translation": ["第一段译文……", "第二段译文……"],
    "appreciation": "Markdown，写清结构、手法、主旨与常考角度。",
    "famousLines": ["仰观宇宙之大，俯察品类之盛。"],
    "hardChars": [{ "text": "禊", "note": "xì，祓禊，古代水边祭祀。" }],
    "themes": ["人生无常", "文人雅集"],
    "examNote": "常考情境默写；「趣舍万殊」的「趣」通「取」。"
  }
]
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 全局唯一，建议 `chn-t-<拼音>` |
| `genre` | 是 | `诗` `词` `曲` `文` `赋` `辞` |
| `paragraphs` | 是 | 原文分段，每段一个字符串，不带 Markdown |
| `notes` | 是 | 词语注释，**`term` 必须出现在正文里**（词牌名、曲牌名不要放这里，写进 `examNote`） |
| `translation` | 否 | 译文，**段数必须等于 `paragraphs`** |
| `appreciation` | 是 | 赏析，至少 40 字 |
| `famousLines` | 是 | 名句，**必须是正文原句**，详情页会自动高亮 |
| `hardChars` | 否 | 易错字，`note` 写读音与释义 |
| `examNote` | 否 | 高考提示：常考方式、异文、版本差异 |

### 抽句题

题目在 `content/questions/` 里，用 `textId` 指回篇目，用 `recite` 标考法：

```json
{
  "id": "q-chn-t-lanting-1",
  "type": "fill",
  "subjectId": "chinese",
  "kpIds": ["chn-poetry"],
  "textId": "chn-t-lanting",
  "recite": "direct",
  "quote": "仰观宇宙之大，____",
  "stem": "《兰亭集序》中「仰观宇宙之大，____」的下一句是：",
  "blanks": [{ "accept": ["俯察品类之盛"], "hint": "填五个字" }],
  "difficulty": 2,
  "source": "自编练习",
  "explanation": "「俯察」对「仰观」，一上一下。"
}
```

- `recite`：`direct` 直接默写、`context` 情境默写、`word` 字词辨析、`culture` 文化常识、`appreciation` 赏析。
- 默写题必须是 `fill`，且 `blanks[0].accept[0]` **必须能在正文里逐字找到**；其他版本的异文放在 `accept` 后面几项（校验器只对第一项报错，其余给提示）。
- 篇目列表页（`/texts`）按体裁分组，详情页（`/text/<id>`）有背诵遮罩、名句高亮、注释、易错字与本篇题目。

### 校验

```bash
npm run check:texts
```

会检查：id 唯一、`genre` 合法、正文非空、`notes[].term` 与 `famousLines` 在正文中、`translation` 段数对齐、题目 `textId` 存在、默写题 `accept[0]` 在正文中。有 error 退出码为 1。

---

## 题库覆盖度

```bash
node scripts/check-kp-coverage.mjs          # 打印每个科目的覆盖情况
node scripts/check-kp-coverage.mjs --strict # 有知识点少于 3 题时退出码 1
```

看「0 题」「1~2 题」两列就知道还该补哪里。新加的题库文件放 `content/questions/*.json` 会被自动加载，文件名随意，`id` 必须唯一。

当前状态（v0.6）：335 个知识点全部有题，共 1839 道，平均 4.8 题/知识点。

```text
科目      知识点  有题  覆盖   平均题量  0题  1~2题
数学　　　　     58    58   100%       4.8     0      0
物理　　　　     56    56   100%       4.8     0      0
化学　　　　     56    56   100%       4.9     0      0
政治　　　　     67    67   100%       4.9     0      0
英语　　　　     48    48   100%       4.7     0      0
语文　　　　     50    50   100%      16.3     0      0
```

语文题量偏高是因为古诗文 380 道抽句题都落在语文的知识点上。批量生成用的规范在 `work/kp-question-spec.md`（每知识点 4 题 + 每板块 2 道大题、`id` 用 `q-<kpId>-<n>`、`source` 统一写「自编练习」）。

> **注意**：`gen-*.json` 里的题都是模型按教材结构生成的，没有逐题人工核对。抽查发现过「多选答案写成字符串而非数组」这类结构错误（脚本能抓），但**答案本身的正确性只能人工校对**。建议按科目分批过一遍，改完跑 `npm run check:content`。
