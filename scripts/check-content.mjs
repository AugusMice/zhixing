import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const subjects = read('content/subjects.json');
const subjectIds = new Set(subjects.map((s) => s.id));
const requiredLegacy = {
  math: ['math-func', 'math-domain', 'math-derivative', 'math-prob'],
  physics: ['phy-kinematics', 'phy-newton', 'phy-circular', 'phy-action'],
  chemistry: ['chem-basic', 'chem-electrolyte', 'chem-formula'],
  english: ['eng-grammar', 'eng-participle', 'eng-tense', 'eng-agreement'],
  chinese: ['chn-poetry', 'chn-idiom', 'chn-rhetoric'],
};

const files = readdirSync(join(root, 'content/knowledge')).filter((f) => f.endsWith('.json'));
const byId = new Map();
const errors = [];
const stats = {};
const groups = {};

for (const file of files) {
  const subjectId = file.replace(/\.json$/, '');
  const nodes = read(`content/knowledge/${file}`);
  if (!Array.isArray(nodes)) {
    errors.push(`${file}: 顶层不是数组`);
    continue;
  }
  if (!subjectIds.has(subjectId)) errors.push(`${file}: 科目 ${subjectId} 未在 subjects.json 中`);
  const groupNames = new Set();
  stats[subjectId] = nodes.length;
  for (const node of nodes) {
    if (!node.id || !node.name) errors.push(`${file}: 有空 id/name`);
    if (node.subjectId !== subjectId) errors.push(`${node.id}: subjectId 不匹配`);
    if (byId.has(node.id)) errors.push(`重复 id: ${node.id}`);
    byId.set(node.id, node);
    if (!Array.isArray(node.parents)) errors.push(`${node.id}: parents 不是数组`);
    if (!Array.isArray(node.related)) errors.push(`${node.id}: related 不是数组`);
    if (!node.description || node.description.trim().length < 8)
      errors.push(`${node.id}: description 过短`);
    for (const k of ['examFrequency', 'importance', 'difficulty']) {
      if (!Number.isInteger(node[k]) || node[k] < 1 || node[k] > 5)
        errors.push(`${node.id}: ${k}=${node[k]} 不在 1~5`);
    }
    if (node.parents.includes(node.id)) errors.push(`${node.id}: 自引用`);
    if (node.related?.includes(node.id)) errors.push(`${node.id}: related 自引用`);
    if (node.group) groupNames.add(node.group);
  }
  groups[subjectId] = groupNames.size;
}

for (const node of byId.values()) {
  for (const p of node.parents) if (!byId.has(p)) errors.push(`${node.id}: 前置不存在 ${p}`);
  for (const r of node.related ?? []) if (!byId.has(r)) errors.push(`${node.id}: 相关不存在 ${r}`);
}

// 环检测（parents 图）
const state = new Map();
const visit = (id, trail = []) => {
  if (state.get(id) === 1) {
    errors.push(`环: ${[...trail, id].join(' -> ')}`);
    return;
  }
  if (state.get(id) === 2) return;
  state.set(id, 1);
  for (const p of byId.get(id)?.parents ?? []) visit(p, [...trail, id]);
  state.set(id, 2);
};
for (const id of byId.keys()) visit(id);

for (const [subject, ids] of Object.entries(requiredLegacy)) {
  for (const id of ids) if (!byId.has(id)) errors.push(`缺少 legacy id: ${id} (${subject})`);
}

let questionCount = 0;
for (const file of readdirSync(join(root, 'content/questions')).filter((f) => f.endsWith('.json'))) {
  const qs = read(`content/questions/${file}`);
  questionCount += qs.length;
  for (const q of qs) {
    if (!subjectIds.has(q.subjectId)) errors.push(`${q.id}: 科目不存在`);
    for (const kp of q.kpIds ?? []) if (!byId.has(kp)) errors.push(`${q.id}: 知识点不存在 ${kp}`);
  }
}

// ---- 真题卷 ----
const papersDir = join(root, 'content/papers');
let paperCount = 0;
let paperQuestionCount = 0;
let papers = [];
try {
  papers = readdirSync(papersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
} catch {
  papers = [];
}

for (const paperId of papers) {
  const paper = read(`content/papers/${paperId}/paper.json`);
  paperCount += 1;
  if (paper.id !== paperId) errors.push(`${paperId}: paper.id 与目录名不一致`);
  if (!subjectIds.has(paper.subjectId)) errors.push(`${paperId}: 科目不存在 ${paper.subjectId}`);

  const qs = [];
  for (const file of readdirSync(join(papersDir, paperId)).filter((f) => /^q\d+\.json$/.test(f))) {
    qs.push(read(`content/papers/${paperId}/${file}`));
  }
  qs.sort((a, b) => a.number - b.number);
  paperQuestionCount += qs.length;

  const listed = new Set(paper.sections.flatMap((section) => section.questionIds));
  const scoreSum = qs.reduce((sum, q) => sum + (q.score ?? 0), 0);
  if (scoreSum !== paper.score) errors.push(`${paperId}: 题目分值合计 ${scoreSum} ≠ 总分 ${paper.score}`);

  const expected = qs.length ? qs.length : 0;
  if (expected && paper.sections.reduce((n, s) => n + s.questionIds.length, 0) !== expected)
    errors.push(`${paperId}: sections 题目数与 q*.json 数量不一致`);

  qs.forEach((q, index) => {
    const tag = `${paperId}/${q.id ?? index}`;
    if (q.number !== index + 1) errors.push(`${tag}: 题号不连续`);
    if (!listed.has(q.id)) errors.push(`${tag}: 未出现在 paper.sections`);
    for (const kp of q.kpIds ?? []) if (!byId.has(kp)) errors.push(`${tag}: 知识点不存在 ${kp}`);
    if (!q.stemImage) errors.push(`${tag}: 缺题干图`);
    for (const key of ['stemImage', 'analysisImage', 'answerImage']) {
      const value = q[key];
      if (!value) continue;
      try {
        readFileSync(join(root, 'public', value));
      } catch {
        errors.push(`${tag}: 图片不存在 public/${value}`);
      }
    }
    if (q.type === 'single') {
      if (!/^[A-D]$/.test(q.answer ?? '')) errors.push(`${tag}: 单选答案非法 "${q.answer}"`);
      const key = paper.choiceAnswerKey?.[q.number - 1];
      if (key && q.answer && key !== q.answer)
        errors.push(`${tag}: 答案 ${q.answer} 与答案表 ${key} 不一致`);
    }
    if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5)
      errors.push(`${tag}: difficulty 不在 1~5`);
  });
}

console.log('科目:', subjects.map((s) => `${s.id}:${s.name}`).join(' '));
console.log('知识节点:', stats, '总计', byId.size);
console.log('板块数:', groups);
console.log('题目:', questionCount);
console.log('真题卷:', paperCount, '卷 /', paperQuestionCount, '题');
console.log(errors.length ? `错误 ${errors.length}:\n${errors.join('\n')}` : '校验通过');
process.exitCode = errors.length ? 1 : 0;
