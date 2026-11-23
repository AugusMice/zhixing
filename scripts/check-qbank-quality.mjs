/**
 * 题库质量体检
 *
 * 用法：node scripts/check-qbank-quality.mjs [--strict]
 * 只读，不改内容。发现问题按文件汇总，方便让生成代理返工。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const QUES_DIR = join(ROOT, 'content', 'questions');
const KNOW_DIR = join(ROOT, 'content', 'knowledge');
const strict = process.argv.includes('--strict');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const kpIds = new Set();
for (const f of readdirSync(KNOW_DIR).filter((x) => x.endsWith('.json'))) {
  const arr = readJson(join(KNOW_DIR, f));
  if (Array.isArray(arr)) for (const kp of arr) kpIds.add(kp.id);
}

const files = readdirSync(QUES_DIR).filter((f) => f.endsWith('.json'));
const stems = new Map();
const problems = [];
let total = 0;
let typeStats = { single: 0, multiple: 0, judge: 0, fill: 0, short: 0 };

const issue = (file, qid, msg) => problems.push({ file, qid, msg });

for (const f of files) {
  const arr = readJson(join(QUES_DIR, f));
  if (!Array.isArray(arr)) continue;
  for (const q of arr) {
    if (!q || typeof q.id !== 'string') continue;
    total += 1;
    typeStats[q.type] = (typeStats[q.type] ?? 0) + 1;

    // 泛化题干（如“下列说法正确的是”）在不同选项下不算重复，因此键里带上选项/填空特征。
    const optKey = (q.options ?? []).map((o) => String(o.text ?? '').replace(/\s+/g, '')).join('|');
    const blankKey = (q.blanks ?? []).map((b) => (b.accept ?? []).join('/')).join('|');
    const stemKey = `${String(q.stem ?? '').replace(/\s+/g, '')}#${optKey}#${blankKey}#${(q.rubric ?? [])
      .map((r) => r.text)
      .join('/')}`;
    if (stems.has(stemKey)) issue(f, q.id, `题干与 ${stems.get(stemKey)} 重复`);
    else stems.set(stemKey, q.id);

    if (!Array.isArray(q.kpIds) || q.kpIds.length === 0) issue(f, q.id, '没有 kpIds');
    else {
      const bad = q.kpIds.filter((id) => !kpIds.has(id));
      if (bad.length) issue(f, q.id, `kpIds 悬空：${bad.join(',')}`);
    }

    if (!(q.difficulty >= 1 && q.difficulty <= 5)) issue(f, q.id, `difficulty 异常 ${q.difficulty}`);
    if (typeof q.explanation !== 'string' || q.explanation.trim().length < 4) {
      issue(f, q.id, '缺少解析');
    }
    if (String(q.stem ?? '').trim().length < 6) issue(f, q.id, '题干过短');

    if (q.type === 'single') {
      const opts = q.options ?? [];
      if (opts.length < 3) issue(f, q.id, `选项只有 ${opts.length} 个`);
      const texts = opts.map((o) => String(o.text ?? '').trim());
      if (new Set(texts).size !== texts.length) issue(f, q.id, '选项文本重复');
      if (texts.some((t) => t.length === 0)) issue(f, q.id, '有空选项');
      if (!opts.some((o) => o.key === q.answer)) issue(f, q.id, 'answer 不在选项里');
      if (texts.some((t) => /以上都|均正确|都对/.test(t))) issue(f, q.id, '用了「以上都对」式凑数选项');
    }

    if (q.type === 'multiple') {
      if (!Array.isArray(q.answer) || q.answer.length < 2) issue(f, q.id, '多选答案少于 2 项');
    }

    if (q.type === 'fill') {
      const blanks = q.blanks ?? [];
      if (!blanks.length) issue(f, q.id, '填空没有空');
      for (const [i, b] of blanks.entries()) {
        if (!Array.isArray(b.accept) || !b.accept.length) issue(f, q.id, `第 ${i + 1} 空没有 accept`);
        else if (String(b.accept[0]).trim().length === 0) issue(f, q.id, `第 ${i + 1} 空答案为空`);
      }
      if (!String(q.stem ?? '').includes('____') && !String(q.stem ?? '').includes('___')) {
        issue(f, q.id, '填空题干里没有空格标记 ____');
      }
    }

    if (q.type === 'short') {
      const rubric = q.rubric ?? [];
      if (!rubric.length) issue(f, q.id, '大题没有采分点');
      const sum = rubric.reduce((a, r) => a + (r.score ?? 0), 0);
      if (q.maxScore != null && Math.abs(sum - q.maxScore) > 0.01) {
        issue(f, q.id, `采分点合计 ${sum} ≠ maxScore ${q.maxScore}`);
      }
      if (q.maxScore == null && sum === 0) issue(f, q.id, '大题没有分值');
    }
  }
}

const byFile = new Map();
for (const p of problems) {
  if (!byFile.has(p.file)) byFile.set(p.file, []);
  byFile.get(p.file).push(p);
}

console.log(`题目 ${total} 道（单选 ${typeStats.single} / 多选 ${typeStats.multiple} / 判断 ${typeStats.judge} / 填空 ${typeStats.fill} / 大题 ${typeStats.short}）`);
console.log(`问题 ${problems.length} 处，涉及 ${byFile.size} 个文件\n`);

for (const [file, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${file}  ${list.length} 处`);
  for (const p of list.slice(0, 6)) console.log(`  · ${p.qid}: ${p.msg}`);
  if (list.length > 6) console.log(`  …… 其余 ${list.length - 6} 处省略`);
}

if (strict && problems.length) {
  console.log('\n[strict] 质量体检不通过');
  process.exit(1);
}
console.log('\n质量体检完成');
