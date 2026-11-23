import type { SessionAnswer, SessionConfig, SessionMode, SessionState } from '../types';
import { uid } from '../lib/format';

export function createSession(
  mode: SessionMode,
  config: SessionConfig,
  queue: string[],
  now: number = Date.now(),
): SessionState {
  return {
    id: uid(),
    mode,
    startedAt: now,
    config,
    queue,
    index: 0,
    answers: {},
    requeued: {},
  };
}

export function isFinished(s: SessionState): boolean {
  return s.finishedAt != null;
}

export function currentQid(s: SessionState): string | undefined {
  if (s.finishedAt != null) return undefined;
  return s.queue[s.index];
}

export interface SessionProgress {
  current: number;
  total: number;
  answered: number;
  finished: boolean;
}

export function progressOf(s: SessionState): SessionProgress {
  return {
    current: Math.min(s.index + 1, s.queue.length),
    total: s.queue.length,
    answered: Object.keys(s.answers).length,
    finished: s.finishedAt != null,
  };
}

/**
 * 记录当前题的作答结果。
 * 即时反馈模式下，答错的题会插入到 3 题之后重练一次（每题最多重排一次）。
 */
export function recordAnswer(
  s: SessionState,
  result: SessionAnswer,
  now: number = Date.now(),
): SessionState {
  const qid = s.queue[s.index];
  if (!qid || s.finishedAt != null) return s;

  const answers: Record<string, SessionAnswer> = { ...s.answers, [qid]: result };
  let queue = s.queue;
  const requeued = { ...s.requeued };

  if (s.config.reveal === 'immediate' && !result.correct && (requeued[qid] ?? 0) < 1) {
    requeued[qid] = (requeued[qid] ?? 0) + 1;
    const insertAt = Math.min(s.index + 4, s.queue.length);
    queue = [...s.queue.slice(0, insertAt), qid, ...s.queue.slice(insertAt)];
  }

  void now;
  return { ...s, answers, queue, requeued };
}

export function advance(s: SessionState, now: number = Date.now()): SessionState {
  if (s.finishedAt != null) return s;
  const next = s.index + 1;
  if (next >= s.queue.length) {
    return { ...s, index: s.queue.length, finishedAt: now };
  }
  return { ...s, index: next };
}

export function finishNow(s: SessionState, now: number = Date.now()): SessionState {
  if (s.finishedAt != null) return s;
  return { ...s, finishedAt: now, index: Math.min(s.index, s.queue.length) };
}

export interface SessionSummary {
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  elapsedMs: number;
}

export function summarize(s: SessionState, now: number = Date.now()): SessionSummary {
  const values = Object.values(s.answers);
  const answered = values.length;
  const correct = values.filter((a) => a.correct).length;
  return {
    total: s.queue.length,
    answered,
    correct,
    accuracy: answered === 0 ? 0 : correct / answered,
    elapsedMs: Math.max(0, (s.finishedAt ?? now) - s.startedAt),
  };
}
