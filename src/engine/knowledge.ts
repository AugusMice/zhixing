import type { KnowledgePoint, Question, Attempt, KpStat } from '../types';
import { clamp } from '../lib/format';

export type KnowledgeColorMode = 'mastery' | 'strength' | 'weakness' | 'exam' | 'weight';

export interface KpMetric {
  mastery: number | null;
  attempts: number;
  questionCount: number;
  /** 题库中关联的题目数量（当前题库可能很少） */
  examCount: number;
  /** 归一化 0~1 的考频信号：有题时按题量，无题时退回考纲先验 */
  exam: number;
  /** 归一化 0~1 的重难信号 */
  weight: number;
  /** 归一化 0~1 的优势信号（掌握度高于 0.6） */
  strength: number;
  /** 归一化 0~1 的劣势信号（掌握度低于 0.6） */
  weakness: number;
}

export function computeKpMetrics(
  kps: KnowledgePoint[],
  questions: Question[],
  attempts: Attempt[],
  kpStats: Map<string, KpStat>,
): Map<string, KpMetric> {
  const qCount = new Map<string, number>();
  const qById = new Map(questions.map((q) => [q.id, q]));
  for (const q of questions) {
    for (const kpId of q.kpIds) qCount.set(kpId, (qCount.get(kpId) ?? 0) + 1);
  }

  const attemptCount = new Map<string, number>();
  for (const a of attempts) {
    const q = qById.get(a.qid);
    if (!q) continue;
    for (const kpId of q.kpIds) attemptCount.set(kpId, (attemptCount.get(kpId) ?? 0) + 1);
  }

  let maxExam = 1;
  let maxWeight = 1;
  for (const kp of kps) {
    const count = qCount.get(kp.id) ?? 0;
    const prior = kp.examFrequency ?? 1;
    maxExam = Math.max(maxExam, count > 0 ? count : prior * 0.55);
    maxWeight = Math.max(
      maxWeight,
      (kp.importance ?? 3) * 0.58 + (kp.difficulty ?? 3) * 0.42,
    );
  }

  const out = new Map<string, KpMetric>();
  for (const kp of kps) {
    const stat = kpStats.get(kp.id);
    const mastery = stat?.mastery ?? null;
    const count = qCount.get(kp.id) ?? 0;
    const prior = kp.examFrequency ?? 1;
    const examRaw = count > 0 ? count : prior * 0.55;
    const weightRaw = (kp.importance ?? 3) * 0.58 + (kp.difficulty ?? 3) * 0.42;
    out.set(kp.id, {
      mastery,
      attempts: attemptCount.get(kp.id) ?? stat?.attempts ?? 0,
      questionCount: count,
      examCount: count,
      exam: clamp(examRaw / maxExam, 0, 1),
      weight: clamp(weightRaw / maxWeight, 0, 1),
      strength: mastery == null ? 0 : clamp((mastery - 0.6) / 0.4, 0, 1),
      weakness: mastery == null ? 0 : clamp((0.6 - mastery) / 0.6, 0, 1),
    });
  }
  return out;
}

export function metricValue(metric: KpMetric, mode: KnowledgeColorMode): number {
  switch (mode) {
    case 'mastery':
      return metric.mastery ?? 0;
    case 'strength':
      return metric.strength;
    case 'weakness':
      return metric.weakness;
    case 'exam':
      return metric.exam;
    case 'weight':
      return metric.weight;
  }
}

export function metricApplicable(metric: KpMetric, mode: KnowledgeColorMode): boolean {
  if (mode === 'strength') return metric.mastery != null && metric.mastery >= 0.6;
  if (mode === 'weakness') return metric.mastery != null && metric.mastery < 0.6;
  if (mode === 'mastery') return metric.mastery != null;
  return true;
}
