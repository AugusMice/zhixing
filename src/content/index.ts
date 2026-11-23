import subjectsJson from '../../content/subjects.json';
import type { Difficulty, KnowledgePoint, Question, Subject, TextReciteKind } from '../types';

const RECITE_KINDS: TextReciteKind[] = ['direct', 'context', 'word', 'culture', 'appreciation'];

/* 题目与知识点都按科目拆分，新增文件会被自动发现；构建时静态打包，手机端无额外请求。 */
const questionModules = import.meta.glob('../../content/questions/*.json', {
  eager: true,
  import: 'default',
});
const knowledgeModules = import.meta.glob('../../content/knowledge/*.json', {
  eager: true,
  import: 'default',
});

export interface ContentBundle {
  subjects: Subject[];
  kps: KnowledgePoint[];
  questions: Question[];
  subjectsById: Map<string, Subject>;
  kpsById: Map<string, KnowledgePoint>;
  questionsById: Map<string, Question>;
  questionsBySubject: Map<string, Question[]>;
  kpsBySubject: Map<string, KnowledgePoint[]>;
  questionCountByKp: Map<string, number>;
  errors: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function validateSubject(raw: unknown, i: number): Subject | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.name) || !isStr(raw.color)) return null;
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color,
    order: typeof raw.order === 'number' ? raw.order : i,
  };
}

function validateKp(raw: unknown): KnowledgePoint | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.subjectId) || !isStr(raw.name)) return null;
  if (!Array.isArray(raw.parents) || !raw.parents.every((p) => typeof p === 'string')) return null;
  const pos =
    Array.isArray(raw.pos) && raw.pos.length === 2 && raw.pos.every((n) => typeof n === 'number')
      ? ([raw.pos[0], raw.pos[1]] as [number, number])
      : undefined;
  const level = (v: unknown): Difficulty | undefined => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    const n = Math.round(v);
    return n >= 1 && n <= 5 ? (n as Difficulty) : undefined;
  };
  const related =
    Array.isArray(raw.related) && raw.related.every((r) => typeof r === 'string')
      ? (raw.related as string[])
      : undefined;
  return {
    id: raw.id,
    subjectId: raw.subjectId,
    name: raw.name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    group: isStr(raw.group) ? raw.group : undefined,
    parents: raw.parents as string[],
    examFrequency: level(raw.examFrequency),
    importance: level(raw.importance),
    difficulty: level(raw.difficulty),
    related,
    pos,
  };
}

function checkOptions(raw: unknown): raw is { key: string; text: string }[] {
  if (!Array.isArray(raw) || raw.length < 2) return false;
  const keys = new Set<string>();
  for (const o of raw) {
    if (!isObj(o) || !isStr(o.key) || typeof o.text !== 'string') return false;
    if (keys.has(o.key)) return false;
    keys.add(o.key);
  }
  return true;
}

function validateQuestion(raw: unknown): { q: Question | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { q: null, errors: ['题目不是对象'] };
  const id = isStr(raw.id) ? raw.id : '(缺少 id)';
  const type = raw.type;
  const commonOk =
    isStr(raw.id) &&
    isStr(raw.subjectId) &&
    isStrArr(raw.kpIds) &&
    raw.kpIds.length > 0 &&
    isStr(raw.stem) &&
    typeof raw.difficulty === 'number' &&
    raw.difficulty >= 1 &&
    raw.difficulty <= 5;

  if (!commonOk) return { q: null, errors: [`${id}: 缺少必填字段（id/subjectId/kpIds/stem/difficulty）`] };
  if (!['single', 'multiple', 'judge', 'fill', 'short'].includes(String(type))) {
    return { q: null, errors: [`${id}: 未知题型 ${String(type)}`] };
  }

  const base = {
    id: raw.id as string,
    subjectId: raw.subjectId as string,
    kpIds: raw.kpIds as string[],
    stem: raw.stem as string,
    difficulty: Math.round(raw.difficulty as number) as 1 | 2 | 3 | 4 | 5,
    explanation: typeof raw.explanation === 'string' ? raw.explanation : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags.filter((t) => typeof t === 'string') as string[]) : undefined,
    textId: isStr(raw.textId) ? raw.textId : undefined,
    quote: isStr(raw.quote) ? raw.quote : undefined,
    recite:
      isStr(raw.recite) && RECITE_KINDS.includes(raw.recite as TextReciteKind)
        ? (raw.recite as TextReciteKind)
        : undefined,
  };

  if (type === 'single') {
    if (!checkOptions(raw.options)) return { q: null, errors: [`${id}: 单选题 options 非法`] };
    if (!isStr(raw.answer)) return { q: null, errors: [`${id}: 单选题缺少 answer`] };
    if (!raw.options.some((o) => o.key === raw.answer)) {
      return { q: null, errors: [`${id}: answer 不在选项中`] };
    }
    return { q: { ...base, type: 'single', options: raw.options, answer: raw.answer }, errors };
  }

  if (type === 'multiple') {
    if (!checkOptions(raw.options)) return { q: null, errors: [`${id}: 多选题 options 非法`] };
    if (!isStrArr(raw.answer) || raw.answer.length === 0) {
      return { q: null, errors: [`${id}: 多选题 answer 必须是非空数组`] };
    }
    const keys = new Set(raw.options.map((o) => o.key));
    if (!raw.answer.every((k) => keys.has(k))) {
      return { q: null, errors: [`${id}: answer 含不在选项中的 key`] };
    }
    return {
      q: { ...base, type: 'multiple', options: raw.options, answer: Array.from(new Set(raw.answer)) },
      errors,
    };
  }

  if (type === 'judge') {
    if (typeof raw.answer !== 'boolean') return { q: null, errors: [`${id}: 判断题 answer 必须是布尔值`] };
    return { q: { ...base, type: 'judge', answer: raw.answer }, errors };
  }

  if (type === 'fill') {
    if (!Array.isArray(raw.blanks) || raw.blanks.length === 0) {
      return { q: null, errors: [`${id}: 填空题 blanks 不能为空`] };
    }
    const blanks: { accept: string[]; hint?: string }[] = [];
    for (const b of raw.blanks) {
      if (!isObj(b) || !isStrArr(b.accept) || b.accept.length === 0) {
        return { q: null, errors: [`${id}: 每个空都需要非空的 accept 数组`] };
      }
      blanks.push({ accept: b.accept, hint: typeof b.hint === 'string' ? b.hint : undefined });
    }
    return { q: { ...base, type: 'fill', blanks }, errors };
  }

  // short
  if (!Array.isArray(raw.rubric) || raw.rubric.length === 0) {
    return { q: null, errors: [`${id}: 大题 rubric 不能为空`] };
  }
  const rubric: { text: string; score: number }[] = [];
  for (const r of raw.rubric) {
    if (!isObj(r) || !isStr(r.text) || typeof r.score !== 'number' || r.score <= 0) {
      return { q: null, errors: [`${id}: rubric 每项需要 text 和正数 score`] };
    }
    rubric.push({ text: r.text, score: r.score });
  }
  return {
    q: {
      ...base,
      type: 'short',
      rubric,
      reference: typeof raw.reference === 'string' ? raw.reference : undefined,
      maxScore: typeof raw.maxScore === 'number' ? raw.maxScore : undefined,
    },
    errors,
  };
}

function buildContent(): ContentBundle {
  const errors: string[] = [];

  const subjects: Subject[] = [];
  const subjectIds = new Set<string>();
  (Array.isArray(subjectsJson) ? subjectsJson : []).forEach((raw, i) => {
    const s = validateSubject(raw, i);
    if (!s) {
      errors.push(`subjects.json 第 ${i + 1} 项非法`);
      return;
    }
    if (subjectIds.has(s.id)) {
      errors.push(`科目 id 重复：${s.id}`);
      return;
    }
    subjectIds.add(s.id);
    subjects.push(s);
  });
  subjects.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const kps: KnowledgePoint[] = [];
  const kpIds = new Set<string>();
  const rawKps: { path: string; raw: unknown }[] = [];
  for (const [path, mod] of Object.entries(knowledgeModules)) {
    if (Array.isArray(mod)) {
      for (const raw of mod) rawKps.push({ path, raw });
    } else {
      errors.push(`知识点文件格式错误（应为数组）：${path}`);
    }
  }
  rawKps.forEach(({ path, raw }, i) => {
    const kp = validateKp(raw);
    if (!kp) {
      errors.push(`${path} 第 ${i + 1} 项非法`);
      return;
    }
    if (kpIds.has(kp.id)) {
      errors.push(`知识点 id 重复：${kp.id}`);
      return;
    }
    if (!subjectIds.has(kp.subjectId)) {
      errors.push(`知识点 ${kp.id} 的 subjectId 不存在：${kp.subjectId}`);
      return;
    }
    if (kp.parents.includes(kp.id) || kp.related?.includes(kp.id)) {
      errors.push(`知识点 ${kp.id} 不能依赖或关联自身`);
      return;
    }
    kpIds.add(kp.id);
    kps.push(kp);
  });

  const kpsById = new Map(kps.map((k) => [k.id, k]));
  for (const kp of kps) {
    for (const p of kp.parents) {
      if (!kpsById.has(p)) errors.push(`知识点 ${kp.id} 的前置 ${p} 不存在`);
    }
    for (const r of kp.related ?? []) {
      if (!kpsById.has(r)) errors.push(`知识点 ${kp.id} 的关联 ${r} 不存在`);
    }
  }

  // 循环依赖检测（parent 边）
  const visitState = new Map<string, 0 | 1 | 2>();
  const dfs = (id: string, stack: string[]) => {
    const st = visitState.get(id) ?? 0;
    if (st === 1) {
      errors.push(`知识点存在循环依赖：${[...stack, id].join(' → ')}`);
      return;
    }
    if (st === 2) return;
    visitState.set(id, 1);
    for (const p of kpsById.get(id)?.parents ?? []) {
      if (kpsById.has(p)) dfs(p, [...stack, id]);
    }
    visitState.set(id, 2);
  };
  for (const kp of kps) dfs(kp.id, []);

  const rawQuestions: unknown[] = [];
  for (const [path, mod] of Object.entries(questionModules)) {
    if (Array.isArray(mod)) rawQuestions.push(...mod);
    else errors.push(`题目文件格式错误（应为数组）：${path}`);
  }

  const questions: Question[] = [];
  const questionIds = new Set<string>();
  for (const raw of rawQuestions) {
    const { q, errors: qErrors } = validateQuestion(raw);
    errors.push(...qErrors);
    if (!q) continue;
    if (questionIds.has(q.id)) {
      errors.push(`题目 id 重复：${q.id}`);
      continue;
    }
    if (!subjectIds.has(q.subjectId)) {
      errors.push(`题目 ${q.id} 的 subjectId 不存在：${q.subjectId}`);
      continue;
    }
    const badKp = q.kpIds.find((k) => !kpsById.has(k));
    if (badKp) {
      errors.push(`题目 ${q.id} 引用了不存在的知识点：${badKp}`);
      continue;
    }
    if (q.kpIds.some((k) => kpsById.get(k)?.subjectId !== q.subjectId)) {
      errors.push(`题目 ${q.id} 的知识点与 subjectId 不一致`);
    }
    questionIds.add(q.id);
    questions.push(q);
  }

  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const questionsBySubject = new Map<string, Question[]>();
  const kpsBySubject = new Map<string, KnowledgePoint[]>();
  for (const s of subjects) {
    questionsBySubject.set(s.id, []);
    kpsBySubject.set(s.id, []);
  }
  for (const q of questions) questionsBySubject.get(q.subjectId)?.push(q);
  for (const kp of kps) kpsBySubject.get(kp.subjectId)?.push(kp);

  const questionCountByKp = new Map<string, number>();
  for (const q of questions) {
    for (const k of q.kpIds) questionCountByKp.set(k, (questionCountByKp.get(k) ?? 0) + 1);
  }

  return {
    subjects,
    kps,
    questions,
    subjectsById,
    kpsById,
    questionsById,
    questionsBySubject,
    kpsBySubject,
    questionCountByKp,
    errors,
  };
}

export const CONTENT: ContentBundle = buildContent();

if (CONTENT.errors.length > 0) {
  console.error('[知星] 题库内容有问题：\n' + CONTENT.errors.join('\n'));
}
