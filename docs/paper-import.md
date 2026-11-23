# 录入一套新真题

知星是纯前端应用，题库以 JSON 文件的形式**打包进构建产物**。所以「加一套卷子」的本质是：
把图片和 JSON 放进仓库 → 重新构建 → 部署。应用内不能凭空变出新内容，这一点向导也会明确提示。

## 两条路

| | 适合 | 需要什么 |
|---|---|---|
| **向导**（科目 → 录入真题） | 手上只有 PDF / 图片，想边填边看 | 浏览器；导出 JSON 后仍需放回仓库 |
| **手动**（本文件后半） | 已经熟悉结构，想批量处理 | 编辑器 + 脚本 |

---

## 一、准备素材

1. 把原卷转成图片（PDF 可以直接截长图，或按页导出）。
2. **按题裁图**：每道题一张 `qNN-stem.png`，解析一张 `qNN-analysis.png`，综合题再加 `qNN-answer.png`。
3. 文件名固定为两位题号：`q01-stem.png`、`q01-analysis.png`…顺序错了会错位。
4. 图片放在 `public/papers/<paperId>/`，构建后可通过 `/papers/<paperId>/q01-stem.png` 访问。

> 裁图时宁可多留一点边距，也不要切掉题号或选项；小题之间的分隔线可以保留。

## 二、确定答案

- 选择题：以**官方答案表**为准，不要从解析正文里推断（解析里的「B 正确」可能是在讲某个选项的错误原因）。
- 把 14 个选择题答案按题号顺序写成一个数组，放进 `paper.json` 的 `choiceAnswerKey`。判分优先用它，`qNN.json` 里的 `answer` 只作为冗余备份。
- 综合题：`answer` 留空，答案与解析都靠图片。

## 三、写 JSON

### `paper.json`

```json
{
  "id": "cq-2026-chem",
  "title": "重庆市2026年普通高等学校招生统一考试 化学",
  "shortTitle": "2026 重庆化学",
  "subjectId": "chemistry",
  "subjectName": "化学",
  "region": "重庆",
  "year": 2026,
  "score": 100,
  "durationMinutes": 75,
  "source": { "publisher": "…", "type": "公众号整理版", "note": "仅本地使用" },
  "assetBase": "papers/cq-2026-chem",
  "choiceAnswerKey": ["A", "C", "B", "…"],
  "sections": [
    { "id": "choice", "title": "一、选择题", "hint": "共 14 小题，每小题 3 分", "score": 42, "questionIds": ["cq2026-chem-q01"] },
    { "id": "integrated", "title": "二、综合题", "hint": "共 4 小题，共 58 分", "score": 58, "questionIds": ["cq2026-chem-q15"] }
  ]
}
```

### `qNN.json`

```json
{
  "id": "cq2026-chem-q01",
  "paperId": "cq-2026-chem",
  "number": 1,
  "section": "选择题",
  "type": "single",
  "score": 3,
  "stemImage": "papers/cq-2026-chem/q01-stem.png",
  "analysisImage": "papers/cq-2026-chem/q01-analysis.png",
  "answerKind": "official",
  "answer": "A",
  "answerImage": "",
  "kpIds": ["chem-polymer", "chem-organic-basic"],
  "difficulty": 2,
  "tags": ["重庆", "2026", "化学"],
  "reviewStatus": "crop-ok"
}
```

- `type`：`single`（选择题）或 `short`（综合题）。
- `kpIds`：**决定这套卷子的成绩能不能反映到知识星图上**。留空也能做题，但掌握度不会更新。知识点 id 见 `content/knowledge/chemistry.json`。
- `difficulty`：1~5，影响 SRS 的评分与每日计划的优先级。

## 四、校验

```bash
npm run check:content
```

会检查：题号连续、分值合计等于总分、选择题答案与 `choiceAnswerKey` 一致、`kpIds` 存在、图片文件真实存在、`difficulty` 在 1~5。

## 五、构建与部署

```bash
npm run check
npm run build
```

把 `dist/` 传到静态托管（或本地 `npm run preview` 先看）。手机端刷新后，科目页会出现新的真题入口。

## 六、让题目进入学习系统

`src/papers/adapt.ts` 会自动把每道题转换成学习系统的 `Question`：

- 题干 → `![第 N 题题干](图片地址)`
- 选择题选项 → 只保留 A/B/C/D（选项内容在题干图里）
- 综合题 → 无采分点，作答时按整题自评

所以**不需要额外注册**，交卷后成绩会自动写入 attempts / cards / wrong。

## 常见问题

**图片太大加载慢？**
裁图时把宽度控制在 1400px 左右，PNG 转 JPEG 或 WebP 可显著减小体积（注意 `assetBase` 与文件名后缀要一致）。

**想加第二套卷子？**
复制 `content/papers/cq-2026-chem` 为 `content/papers/<新 id>`，改 `paper.json` 的 `id`、`subjectId`、题号与 `kpIds`，图片放进 `public/papers/<新 id>/`。`src/papers/index.ts` 会自动发现新目录。

**题目答案发现错了？**
改 `qNN.json` 的 `answer` 与 `paper.json` 的 `choiceAnswerKey`，然后 `npm run check:content` 确认两者一致。成绩页的「报错」按钮只是本地记录，不会自动改题。
