import type {
  AppData,
  CardState,
  KnowledgePoint,
  KpStat,
  Question,
  SessionConfig,
  SessionMode,
  Settings,
  WrongEntry,
} from '../types';
import { dateKey, shuffle } from '../lib/format';
import { isDue } from './srs';

export interface PlanContext {
  questions: Question[];
  questionsById: Map<string, Question>;
  kps: KnowledgePoint[];
  kpsById: Map<string, KnowledgePoint>;
  questionCountByKp: Map<string, number>;
  cards: Record<string, CardState>;
  kpStats: Map<string, KpStat>;
  settings: Settings;
  now: number;
}

/** 题目关联知识点的平均掌握度；没接触过的点按 0.3 处理，优先介绍 */
function weaknessOf(q: Question, ctx: PlanContext): number {
  if (q.kpIds.length === 0) return 0.5;
  let sum = 0;
  for (const kpId of q.kpIds) sum += ctx.kpStats.get(kpId)?.mastery ?? 0.3;
  return sum / q.kpIds.length;
}

function byWeakness(a: Question, b: Question, ctx: PlanContext): number {
  return weaknessOf(a, ctx) - weaknessOf(b, ctx) || a.difficulty - b.difficulty || a.id.localeCompare(b.id);
}

/** 前置知识点有题且尚未达到 0.4 掌握度时，暂不介绍后继知识点 */
export function isKpUnlocked(kpId: string, ctx: PlanContext): boolean {
  const kp = ctx.kpsById.get(kpId);
  if (!kp) return false;
  for (const parentId of kp.parents) {
    // 前置点本身没有题，永远无法被评估，不能拿它卡住后继
    if ((ctx.questionCountByKp.get(parentId) ?? 0) === 0) continue;
    const st = ctx.kpStats.get(parentId);
    if (!st || st.attempts === 0) return false;
    if ((st.mastery ?? 0) < 0.4) return false;
  }
  return true;
}

export function dueQuestions(ctx: PlanContext): Question[] {
  return ctx.questions
    .filter((q) => {
      const c = ctx.cards[q.id];
      return c != null && isDue(c, ctx.now);
    })
    .sort((a, b) => {
      const ca = ctx.cards[a.id];
      const cb = ctx.cards[b.id];
      return (ca?.due ?? 0) - (cb?.due ?? 0) || a.id.localeCompare(b.id);
    });
}

export function freshQuestions(
  ctx: PlanContext,
  opts: { subjectId?: string; kpId?: string; gate?: boolean } = {},
): Question[] {
  const { subjectId, kpId, gate = true } = opts;
  return ctx.questions
    .filter((q) => {
      if (ctx.cards[q.id]) return false;
      if (subjectId && q.subjectId !== subjectId) return false;
      if (kpId && !q.kpIds.includes(kpId)) return false;
      if (gate && !q.kpIds.every((k) => isKpUnlocked(k, ctx))) return false;
      return true;
    })
    .sort((a, b) => byWeakness(a, b, ctx));
}

/** 按科目轮转，避免一次学习全是同一科 */
export function interleaveBySubject(questions: Question[]): Question[] {
  const groups = new Map<string, Question[]>();
  for (const q of questions) {
    const arr = groups.get(q.subjectId) ?? [];
    arr.push(q);
    groups.set(q.subjectId, arr);
  }
  const out: Question[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const group of groups.values()) {
      const next = group.shift();
      if (next) {
        out.push(next);
        added = true;
      }
    }
  }
  return out;
}

export interface DailyPlan {
  due: Question[];
  fresh: Question[];
  dueTotal: number;
  newTotal: number;
}

export function planDaily(ctx: PlanContext): DailyPlan {
  const allDue = dueQuestions(ctx);
  const due = allDue.slice(0, Math.max(0, ctx.settings.dailyReview));

  const introducedToday = Object.values(ctx.cards).filter(
    (c) => dateKey(c.introducedAt) === dateKey(ctx.now),
  ).length;
  const newSlots = Math.max(0, ctx.settings.dailyNew - introducedToday);
  const gated = interleaveBySubject(freshQuestions(ctx));
  // 前置未达标的知识点默认不进每日计划；只有在「解锁的题不够今天的量」时才兜底补，
  // 否则整套题库会让每日新题卡死在少数根节点上。
  let allFresh = gated;
  if (gated.length < newSlots) {
    const taken = new Set(gated.map((q) => q.id));
    const extra = interleaveBySubject(freshQuestions(ctx, { gate: false })).filter(
      (q) => !taken.has(q.id),
    );
    allFresh = [...gated, ...extra];
  }
  const fresh = allFresh.slice(0, newSlots);

  return { due, fresh, dueTotal: allDue.length, newTotal: allFresh.length };
}

/** 到期优先，其余按薄弱程度排序 */
function orderDueFirst(pool: Question[], ctx: PlanContext): Question[] {
  const due: Question[] = [];
  const rest: Question[] = [];
  for (const q of pool) {
    const c = ctx.cards[q.id];
    if (c && isDue(c, ctx.now)) due.push(q);
    else rest.push(q);
  }
  due.sort((a, b) => (ctx.cards[a.id]?.due ?? 0) - (ctx.cards[b.id]?.due ?? 0));
  rest.sort((a, b) => byWeakness(a, b, ctx));
  return [...due, ...rest];
}

export function pickForSubject(subjectId: string, count: number, ctx: PlanContext): Question[] {
  return orderDueFirst(
    ctx.questions.filter((q) => q.subjectId === subjectId),
    ctx,
  ).slice(0, Math.max(0, count));
}

export function pickForKp(kpId: string, count: number, ctx: PlanContext): Question[] {
  return orderDueFirst(
    ctx.questions.filter((q) => q.kpIds.includes(kpId)),
    ctx,
  ).slice(0, Math.max(0, count));
}

export function pickWrong(
  wrong: Record<string, WrongEntry>,
  count: number,
  ctx: PlanContext,
): Question[] {
  return Object.values(wrong)
    .filter((w) => w.streak < 2)
    .sort((a, b) => a.lastAt - b.lastAt)
    .map((w) => ctx.questionsById.get(w.qid))
    .filter((q): q is Question => q != null)
    .slice(0, Math.max(0, count));
}

export function pickFavorites(favorites: string[], count: number, ctx: PlanContext): Question[] {
  return shuffle(
    favorites.map((id) => ctx.questionsById.get(id)).filter((q): q is Question => q != null),
  ).slice(0, Math.max(0, count));
}

export function pickRandom(subjectIds: string[], count: number, ctx: PlanContext): Question[] {
  const set = new Set(subjectIds);
  const pool = set.size === 0 ? ctx.questions : ctx.questions.filter((q) => set.has(q.subjectId));
  return shuffle(pool).slice(0, Math.max(0, count));
}

/** 组卷：各科轮流取题，尽量覆盖不同知识点 */
export function pickExam(subjectIds: string[], count: number, ctx: PlanContext): Question[] {
  const ids =
    subjectIds.length > 0
      ? subjectIds
      : Array.from(new Set(ctx.questions.map((q) => q.subjectId)));
  const groups = ids.map((id) => shuffle(ctx.questions.filter((q) => q.subjectId === id)));
  const out: Question[] = [];
  let guard = 0;
  while (out.length < count && groups.some((g) => g.length > 0) && guard++ < count * 10) {
    for (const group of groups) {
      if (out.length >= count) break;
      const next = group.shift();
      if (next) out.push(next);
    }
  }
  return out;
}

export interface BuiltSession {
  questions: Question[];
  config: SessionConfig;
}

/** 把「模式 + 配置」翻译成实际题目队列；没有可用题目时返回 null */
export function buildSession(
  mode: SessionMode,
  config: SessionConfig,
  ctx: PlanContext,
  data: Pick<AppData, 'wrong' | 'favorites'>,
): BuiltSession | null {
  let questions: Question[] = [];
  switch (mode) {
    case 'daily': {
      const plan = planDaily(ctx);
      questions = [...plan.due, ...plan.fresh];
      break;
    }
    case 'subject':
      questions = config.subjectId ? pickForSubject(config.subjectId, config.count, ctx) : [];
      break;
    case 'kp':
      questions = config.kpId ? pickForKp(config.kpId, config.count, ctx) : [];
      break;
    case 'wrong':
      questions = pickWrong(data.wrong, config.count, ctx);
      break;
    case 'favorite':
      questions = pickFavorites(data.favorites, config.count, ctx);
      break;
    case 'random':
      questions = pickRandom(config.subjectIds ?? [], config.count, ctx);
      break;
    case 'exam':
      questions = pickExam(config.subjectIds ?? [], config.count, ctx);
      break;
  }
  if (questions.length === 0) return null;
  return {
    questions,
    config: { ...config, count: questions.length },
  };
}
