import type { CardState } from '../types';
import { DAY_MS, clamp, hashString } from '../lib/format';

export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
/** 答错后 10 分钟重新出现，优先在本次学习内解决 */
export const AGAIN_DELAY_MS = 10 * 60 * 1000;

export function newCard(qid: string, now: number = Date.now()): CardState {
  return {
    qid,
    ease: 2.5,
    interval: 0,
    reps: 0,
    lapses: 0,
    due: now,
    introducedAt: now,
  };
}

function fuzzInterval(interval: number, qid: string, reps: number): number {
  if (interval <= 2) return interval;
  const h = hashString(`${qid}:${reps}`);
  const factor = 0.95 + (h % 11) / 100; // 0.95 ~ 1.05
  return Math.max(1, Math.round(interval * factor));
}

/**
 * SM-2 变体。
 * grade: 1 忘记 / 3 困难 / 4 良好 / 5 轻松
 */
export function reviewCard(card: CardState, grade: number, now: number = Date.now()): CardState {
  const g = clamp(Math.round(grade), 1, 5);

  if (g < 3) {
    return {
      ...card,
      reps: 0,
      interval: 0,
      lapses: card.lapses + 1,
      ease: clamp(card.ease - 0.2, MIN_EASE, MAX_EASE),
      due: now + AGAIN_DELAY_MS,
      lastReview: now,
      lastGrade: g,
    };
  }

  const easeDelta = 0.1 - (5 - g) * (0.08 + (5 - g) * 0.02);
  const ease = clamp(card.ease + easeDelta, MIN_EASE, MAX_EASE);

  let interval: number;
  if (card.reps === 0) interval = 1;
  else if (card.reps === 1) interval = 6;
  else interval = Math.max(1, Math.round(card.interval * (g === 3 ? 1.2 : ease)));
  interval = fuzzInterval(interval, card.qid, card.reps);

  return {
    ...card,
    ease,
    interval,
    reps: card.reps + 1,
    due: now + interval * DAY_MS,
    lastReview: now,
    lastGrade: g,
  };
}

export function gradeFromResult(
  correct: boolean,
  elapsedMs: number,
  score?: number,
  maxScore?: number,
): number {
  if (!correct) return 1;
  if (score != null && maxScore) {
    const ratio = score / maxScore;
    if (ratio < 0.8) return 3;
  }
  if (elapsedMs >= 120_000) return 3;
  if (elapsedMs <= 15_000) return 5;
  return 4;
}

export function isDue(card: CardState, now: number = Date.now()): boolean {
  return card.due <= now;
}

/** 卡片状态的人类可读描述 */
export function cardStage(card: CardState | undefined): {
  label: string;
  tone: 'new' | 'learning' | 'young' | 'mature';
} {
  if (!card) return { label: '新题', tone: 'new' };
  if (card.interval === 0) return { label: '学习中', tone: 'learning' };
  if (card.interval < 21) return { label: `${card.interval} 天间隔`, tone: 'young' };
  return { label: `${card.interval} 天间隔`, tone: 'mature' };
}

export interface ForecastDay {
  key: string;
  due: number;
  newCount: number;
}

/** 未来若干天的复习负载预测（不含新题） */
export function forecast(cards: Record<string, CardState>, days: number, now = Date.now()): ForecastDay[] {
  const out: ForecastDay[] = [];
  for (let i = 0; i < days; i++) {
    const start = now + i * DAY_MS;
    const end = start + DAY_MS;
    let due = 0;
    for (const c of Object.values(cards)) {
      if (c.due >= start && c.due < end) due++;
    }
    out.push({ key: String(i), due, newCount: 0 });
  }
  return out;
}
