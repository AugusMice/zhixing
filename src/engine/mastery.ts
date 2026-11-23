import type { Attempt, KnowledgePoint, KpStat, Question } from '../types';
import { DAY_MS } from '../lib/format';

/** 21 天半衰期：三周前的一次作答，权重只有今天的一半 */
export const MASTERY_HALF_LIFE_DAYS = 21;
/** Beta 先验：α=2, β=2，样本少时向 50% 收缩，避免一题定生死 */
const PRIOR_ALPHA = 2;
const PRIOR_BETA = 2;

export function computeKpStats(
  kps: KnowledgePoint[],
  questions: Question[],
  attempts: Attempt[],
  now: number = Date.now(),
): Map<string, KpStat> {
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const acc = new Map<
    string,
    {
      weight: number;
      weightedCorrect: number;
      attempts: number;
      correct: number;
      lastAt: number | null;
      questionCount: number;
      attemptedQuestions: Set<string>;
    }
  >();

  for (const kp of kps) {
    acc.set(kp.id, {
      weight: 0,
      weightedCorrect: 0,
      attempts: 0,
      correct: 0,
      lastAt: null,
      questionCount: 0,
      attemptedQuestions: new Set(),
    });
  }

  for (const q of questions) {
    for (const kpId of q.kpIds) {
      const a = acc.get(kpId);
      if (a) a.questionCount += 1;
    }
  }

  for (const attempt of attempts) {
    const q = questionById.get(attempt.qid);
    if (!q) continue;
    const ageDays = Math.max(0, (now - attempt.ts) / DAY_MS);
    const recency = Math.pow(0.5, ageDays / MASTERY_HALF_LIFE_DAYS);
    const difficultyWeight = 0.7 + 0.15 * q.difficulty;
    const weight = recency * difficultyWeight;

    for (const kpId of q.kpIds) {
      const a = acc.get(kpId);
      if (!a) continue;
      a.weight += weight;
      if (attempt.correct) a.weightedCorrect += weight;
      a.attempts += 1;
      if (attempt.correct) a.correct += 1;
      a.lastAt = Math.max(a.lastAt ?? 0, attempt.ts);
      a.attemptedQuestions.add(q.id);
    }
  }

  const out = new Map<string, KpStat>();
  for (const [kpId, a] of acc) {
    const mastery =
      a.attempts === 0
        ? null
        : (a.weightedCorrect + PRIOR_ALPHA) / (a.weight + PRIOR_ALPHA + PRIOR_BETA);
    out.set(kpId, {
      kpId,
      attempts: a.attempts,
      correct: a.correct,
      mastery,
      lastAt: a.lastAt,
      questionCount: a.questionCount,
      attemptedQuestions: a.attemptedQuestions.size,
    });
  }
  return out;
}

export function computeSubjectMastery(
  subjectId: string,
  kps: KnowledgePoint[],
  stats: Map<string, KpStat>,
): number | null {
  const values = kps
    .filter((k) => k.subjectId === subjectId)
    .map((k) => stats.get(k.id)?.mastery)
    .filter((m): m is number => m != null);
  if (values.length === 0) return null;
  return values.reduce((s, m) => s + m, 0) / values.length;
}

export type MasteryTone = 'none' | 'weak' | 'shaky' | 'ok' | 'good' | 'mastered';

export function masteryBand(mastery: number | null): {
  label: string;
  tone: MasteryTone;
  short: string;
} {
  if (mastery == null) return { label: '未探索', tone: 'none', short: '—' };
  if (mastery < 0.35) return { label: '薄弱', tone: 'weak', short: '弱' };
  if (mastery < 0.55) return { label: '待巩固', tone: 'shaky', short: '待' };
  if (mastery < 0.75) return { label: '一般', tone: 'ok', short: '中' };
  if (mastery < 0.9) return { label: '熟练', tone: 'good', short: '熟' };
  return { label: '精通', tone: 'mastered', short: '精' };
}

export function weakKps(
  kps: KnowledgePoint[],
  stats: Map<string, KpStat>,
  limit = 8,
): KnowledgePoint[] {
  return kps
    .filter((k) => {
      const m = stats.get(k.id)?.mastery;
      return m != null && m < 0.65;
    })
    .sort((a, b) => (stats.get(a.id)?.mastery ?? 1) - (stats.get(b.id)?.mastery ?? 1))
    .slice(0, limit);
}

export function coverage(
  kps: KnowledgePoint[],
  stats: Map<string, KpStat>,
): { attempted: number; total: number; ratio: number } {
  const total = kps.length;
  const attempted = kps.filter((k) => (stats.get(k.id)?.attempts ?? 0) > 0).length;
  return { attempted, total, ratio: total === 0 ? 0 : attempted / total };
}

/** 已掌握的知识点数量（mastery >= 0.7） */
export function masteredCount(stats: Map<string, KpStat>): number {
  let n = 0;
  for (const s of stats.values()) if ((s.mastery ?? 0) >= 0.7) n++;
  return n;
}
