/**
 * 古诗文栏目与「抽句默写题」校验。
 *
 * 目的：把「原文准确性」变成可执行的检查，而不是靠人眼。
 *   - 篇目字段齐全、id 唯一、genre 合法
 *   - famousLines / notes[].term 必须能在正文里找到（比对前去掉空白与标点）
 *   - translation 条数与 paragraphs 一致
 *   - 题目 textId 必须指向存在的篇目
 *   - 默写题（recite=direct/context）的 accept[0] 必须是正文里的连续片段
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const GENRES = new Set(['诗', '词', '曲', '文', '赋', '辞']);
const errors = [];
const warnings = [];

/** 比对用归一化：去掉空白与全部标点符号，避免「，」与「。」造成的假不匹配 */
const norm = (s) => String(s).replace(/[\s\u3000\p{P}\p{S}]/gu, '');

/* ---------------- 1. 篇目 ---------------- */
const textDir = join(root, 'content/texts');
let files = [];
try {
  files = readdirSync(textDir).filter((f) => f.endsWith('.json'));
} catch {
  console.error('没有 content/texts 目录');
  process.exit(1);
}

const texts = [];
const seen = new Set();
for (const file of files) {
  const pack = read(`content/texts/${file}`);
  if (!Array.isArray(pack)) {
    errors.push(`${file}: 顶层不是数组`);
    continue;
  }
  for (const t of pack) {
    const where = `${file} / ${t?.id ?? '?'}`;
    if (!t?.id) {
      errors.push(`${where}: 缺少 id`);
      continue;
    }
    if (seen.has(t.id)) errors.push(`${where}: id 重复`);
    seen.add(t.id);
    if (!t.title) errors.push(`${where}: 缺少 title`);
    if (!GENRES.has(t.genre)) errors.push(`${where}: genre 非法「${t.genre}」`);
    if (!Array.isArray(t.paragraphs) || t.paragraphs.length === 0) {
      errors.push(`${where}: paragraphs 为空`);
      continue;
    }
    const body = t.paragraphs.join('\n');
    const flat = norm(body);
    if (flat.length < 12) errors.push(`${where}: 正文过短（${flat.length} 字）`);

    if (!Array.isArray(t.famousLines) || t.famousLines.length === 0) {
      warnings.push(`${where}: 没有名句`);
    }
    for (const line of t.famousLines ?? []) {
      if (!flat.includes(norm(line))) {
        errors.push(`${where}: 名句不在原文中「${line}」`);
      }
    }
    if (!Array.isArray(t.notes) || t.notes.length < 5) {
      warnings.push(`${where}: 注释偏少（${t.notes?.length ?? 0} 条）`);
    }
    for (const note of t.notes ?? []) {
      if (!note?.term || !note?.gloss) {
        errors.push(`${where}: 注释条目缺少 term/gloss`);
        continue;
      }
      if (!flat.includes(norm(note.term))) {
        errors.push(`${where}: 注释词不在原文中「${note.term}」`);
      }
    }
    if (Array.isArray(t.translation) && t.translation.length > 0) {
      if (t.translation.length !== t.paragraphs.length) {
        warnings.push(
          `${where}: 译文 ${t.translation.length} 段 != 原文 ${t.paragraphs.length} 段`,
        );
      }
    }
    if (!t.appreciation || t.appreciation.trim().length < 40) {
      errors.push(`${where}: 赏析过短`);
    }
    texts.push({ ...t, _flat: flat });
  }
}

/* ---------------- 2. 题目 ---------------- */
const qDir = join(root, 'content/questions');
const qFiles = readdirSync(qDir).filter((f) => f.endsWith('.json'));
const byTextId = new Map(texts.map((t) => [t.id, t]));
const textQuestions = [];
const qIds = new Set();

for (const file of qFiles) {
  const pack = read(`content/questions/${file}`);
  if (!Array.isArray(pack)) {
    errors.push(`${file}: 顶层不是数组`);
    continue;
  }
  for (const q of pack) {
    if (qIds.has(q.id)) errors.push(`题目 id 重复: ${q.id}`);
    qIds.add(q.id);
    if (!q.textId) continue;
    textQuestions.push({ ...q, _file: file });
    const t = byTextId.get(q.textId);
    if (!t) {
      errors.push(`${q.id}: textId 指向不存在的篇目「${q.textId}」`);
      continue;
    }
    if (q.subjectId !== 'chinese') errors.push(`${q.id}: 古诗文题 subjectId 应为 chinese`);
    if (q.recite === 'direct' || q.recite === 'context') {
      if (q.type !== 'fill') {
        errors.push(`${q.id}: 默写题应为 fill，实际 ${q.type}`);
      } else {
        const accepts = q.blanks?.flatMap((b) => b.accept ?? []) ?? [];
        if (accepts.length === 0) errors.push(`${q.id}: 默写题没有 accept`);
        accepts.forEach((a, i) => {
          const n = norm(a);
          if (n.length < 2) {
            errors.push(`${q.id}: accept 过短「${a}」`);
            return;
          }
          if (t._flat.includes(n)) return;
          // 第一个答案必须是正文原句；后面的可以是异文
          if (i === 0) errors.push(`${q.id}: accept 不在《${t.title}》原文中「${a}」`);
          else warnings.push(`${q.id}: 异文接受项「${a}」（正文作异体字，可保留）`);
        });
      }
    }
    if (q.quote) {
      if (!t._flat.includes(norm(q.quote))) {
        warnings.push(`${q.id}: quote 与原文不完全一致「${q.quote}」`);
      }
    }
  }
}

/* ---------------- 3. 统计 ---------------- */
const perText = new Map();
for (const q of textQuestions) {
  perText.set(q.textId, (perText.get(q.textId) ?? 0) + 1);
}
const empty = texts.filter((t) => !perText.has(t.id));
if (empty.length > 0) {
  warnings.push(`没有配题的篇目 ${empty.length} 篇：${empty.map((t) => t.title).join('、')}`);
}

const genreCount = {};
for (const t of texts) genreCount[t.genre] = (genreCount[t.genre] ?? 0) + 1;

console.log(
  `古诗文: ${texts.length} 篇（` +
    Object.entries(genreCount)
      .map(([g, n]) => `${g}${n}`)
      .join(' / ') +
    `），抽句题 ${textQuestions.length} 道`,
);

for (const w of warnings) console.warn('  · 提示 ' + w);
if (errors.length > 0) {
  console.error(`\n发现 ${errors.length} 个错误：`);
  for (const e of errors) console.error('  x ' + e);
  process.exit(1);
}
console.log('古诗文校验通过');
