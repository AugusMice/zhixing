/**
 * 知识点题库覆盖度报告
 *
 * 用法：
 *   node scripts/check-kp-coverage.mjs            # 打印报告
 *   node scripts/check-kp-coverage.mjs --strict   # 有知识点题量 < 3 时退出码 1
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const KNOW_DIR = join(ROOT, 'content', 'knowledge');
const QUES_DIR = join(ROOT, 'content', 'questions');
const strict = process.argv.includes('--strict');
const MIN_PER_KP = 3;

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const subjects = readJson(join(ROOT, 'content', 'subjects.json'));
const kps = [];
for (const f of readdirSync(KNOW_DIR).filter((f) => f.endsWith('.json'))) {
  const arr = readJson(join(KNOW_DIR, f));
  if (Array.isArray(arr)) kps.push(...arr);
}

const counts = new Map();
const typeCounts = new Map();
const bySource = new Map();
let questionTotal = 0;
const seen = new Set();
const dupes = [];

for (const f of readdirSync(QUES_DIR).filter((f) => f.endsWith('.json'))) {
  const arr = readJson(join(QUES_DIR, f));
  if (!Array.isArray(arr)) continue;
  for (const q of arr) {
    if (!q || typeof q.id !== 'string') continue;
    if (seen.has(q.id)) dupes.push(q.id);
    seen.add(q.id);
    questionTotal += 1;
    const src = q.source ?? '未标注';
    bySource.set(src, (bySource.get(src) ?? 0) + 1);
    for (const kpId of q.kpIds ?? []) {
      counts.set(kpId, (counts.get(kpId) ?? 0) + 1);
      const key = `${kpId}|${q.type}`;
      typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
    }
  }
}

const bySubject = new Map();
for (const kp of kps) {
  if (!bySubject.has(kp.subjectId)) bySubject.set(kp.subjectId, []);
  bySubject.get(kp.subjectId).push(kp);
}

let gaps = 0;
console.log(`知识点 ${kps.length} 个 / 题目 ${questionTotal} 道\n`);
console.log('科目      知识点  有题  覆盖   平均题量  0题  1~2题');
for (const s of subjects) {
  const list = bySubject.get(s.id) ?? [];
  if (!list.length) continue;
  const got = list.filter((kp) => (counts.get(kp.id) ?? 0) > 0).length;
  const sum = list.reduce((a, kp) => a + (counts.get(kp.id) ?? 0), 0);
  const zero = list.filter((kp) => (counts.get(kp.id) ?? 0) === 0).length;
  const thin = list.filter((kp) => {
    const c = counts.get(kp.id) ?? 0;
    return c > 0 && c < MIN_PER_KP;
  }).length;
  gaps += zero + thin;
  const cov = ((got / list.length) * 100).toFixed(0);
  console.log(
    `${s.name.padEnd(6, '　')}  ${String(list.length).padStart(5)}  ${String(got).padStart(4)}  ${cov.padStart(4)}%  ${(sum / list.length).toFixed(1).padStart(8)}  ${String(zero).padStart(4)}  ${String(thin).padStart(5)}`,
  );
}

const lacking = kps
  .map((kp) => ({ kp, n: counts.get(kp.id) ?? 0 }))
  .filter((x) => x.n < MIN_PER_KP)
  .sort((a, b) => a.n - b.n);

if (lacking.length) {
  console.log(`\n题量不足（< ${MIN_PER_KP}）的知识点 ${lacking.length} 个：`);
  for (const { kp, n } of lacking.slice(0, 40)) {
    console.log(`  ${String(n).padStart(2)}  ${kp.id}  ${kp.subjectId}/${kp.group ?? '-'}  ${kp.name}`);
  }
  if (lacking.length > 40) console.log(`  …… 其余 ${lacking.length - 40} 个省略`);
}

if (dupes.length) {
  console.log(`\n重复题目 id ${dupes.length} 个：${[...new Set(dupes)].slice(0, 10).join(', ')}`);
}

console.log('\n来源分布：');
for (const [src, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(5)}  ${src}`);
}

const missingKpIds = [...counts.keys()].filter((id) => !kps.some((kp) => kp.id === id));
if (missingKpIds.length) console.log(`\n题目引用了不存在的知识点：${missingKpIds.slice(0, 10).join(', ')}`);

if (strict && (lacking.length || dupes.length || missingKpIds.length)) {
  console.log(`\n[strict] 不通过：缺口 ${lacking.length}，重复 ${dupes.length}，悬空引用 ${missingKpIds.length}`);
  process.exit(1);
}
console.log('\n覆盖度报告完成');
