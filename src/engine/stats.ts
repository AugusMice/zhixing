import type { AppData, Attempt, CardState, DailyEntry, Question } from '../types';
import { dateKey, lastNDays } from '../lib/format';

export function getDaily(data: AppData, key: string = dateKey()): DailyEntry | null {
  return data.dailyLog[key] ?? null;
}

export function computeStreak(dailyLog: Record<string, DailyEntry>, now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  // 今天还没学，不算断签；从昨天开始数
  if (!dailyLog[dateKey(d.getTime())]?.count) {
    d.setDate(d.getDate() - 1);
  }
  let streak = 0;
  while (dailyLog[dateKey(d.getTime())]?.count) {
    streak++;
    d.setDate(d.getDate() - 1);
    if (streak > 10_000) break;
  }
  return streak;
}

export function attemptTotals(attempts: Attempt[]): {
  count: number;
  correct: number;
  accuracy: number;
  totalMs: number;
} {
  const count = attempts.length;
  const correct = attempts.reduce((s, a) => s + (a.correct ? 1 : 0), 0);
  const totalMs = attempts.reduce((s, a) => s + (a.elapsedMs || 0), 0);
  return { count, correct, accuracy: count === 0 ? 0 : correct / count, totalMs };
}

export function dueCards(cards: Record<string, CardState>, now = Date.now()): CardState[] {
  return Object.values(cards)
    .filter((c) => c.due <= now)
    .sort((a, b) => a.due - b.due);
}

export function introducedToday(cards: Record<string, CardState>, now = Date.now()): number {
  const key = dateKey(now);
  return Object.values(cards).filter((c) => dateKey(c.introducedAt) === key).length;
}

export interface HistoryDay {
  key: string;
  entry: DailyEntry | null;
}

export function history(data: AppData, days: number, now = Date.now()): HistoryDay[] {
  return lastNDays(days, now).map((key) => ({
    key,
    entry: data.dailyLog[key] ?? null,
  }));
}

export function subjectAccuracy(
  attempts: Attempt[],
  questions: Question[],
): Map<string, { count: number; correct: number; accuracy: number }> {
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const map = new Map<string, { count: number; correct: number; accuracy: number }>();
  for (const a of attempts) {
    const q = qmap.get(a.qid);
    if (!q) continue;
    const cur = map.get(q.subjectId) ?? { count: 0, correct: 0, accuracy: 0 };
    cur.count += 1;
    if (a.correct) cur.correct += 1;
    cur.accuracy = cur.count === 0 ? 0 : cur.correct / cur.count;
    map.set(q.subjectId, cur);
  }
  return map;
}

/** 最近 n 次作答的正确率，用于看状态趋势 */
export function recentAccuracy(attempts: Attempt[], n = 20): number | null {
  if (attempts.length === 0) return null;
  const recent = attempts.slice(-n);
  return recent.reduce((s, a) => s + (a.correct ? 1 : 0), 0) / recent.length;
}

export function unansweredCount(total: number, cards: Record<string, CardState>): number {
  return Math.max(0, total - Object.keys(cards).length);
}
