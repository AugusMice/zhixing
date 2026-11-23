import type { AppData, Question, SessionAnswer } from '../types';
import { applyAnswer } from '../engine/store';
import { paperQuestions, type Paper, type PaperQuestion } from './index';
import { officialChoiceAnswer, type PaperExamSession } from './exam';
import { paperQuestionToQuestion } from './adapt';

export interface PaperSyncSummary {
  recorded: number;
  correct: number;
  xp: number;
  coins: number;
  wrongAdded: number;
}

export interface PaperSyncResult {
  data: AppData;
  summary: PaperSyncSummary;
}

const MIN_ELAPSED = 4_000;
const MAX_ELAPSED = 6 * 60_000;

export function emptySummary(): PaperSyncSummary {
  return { recorded: 0, correct: 0, xp: 0, coins: 0, wrongAdded: 0 };
}

/** 平均分配每题用时；真题只记录总用时，无法还原单题耗时 */
function estimateElapsed(session: PaperExamSession, count: number): number {
  const total = Math.max(0, (session.submittedAt ?? Date.now()) - session.startedAt);
  const per = Math.round(total / Math.max(1, count));
  return Math.min(MAX_ELAPSED, Math.max(MIN_ELAPSED, per));
}

/** 单题写入：attempts、cards（SRS 排程）、wrong（错题本） */
export function applyPaperQuestion(
  data: AppData,
  paper: Paper,
  pq: PaperQuestion,
  result: SessionAnswer,
  sessionId: string,
): PaperSyncResult {
  const question = paperQuestionToQuestion(pq, paper);
  const summary = emptySummary();
  if (!question) return { data, summary };

  const hadWrong = Boolean(data.wrong[question.id]);
  const outcome = applyAnswer(data, question, result, { mode: 'paper', sessionId });
  summary.recorded = 1;
  if (result.correct) summary.correct = 1;
  summary.xp = outcome.xp;
  summary.coins = outcome.coins;
  summary.wrongAdded = !hadWrong && Boolean(outcome.data.wrong[question.id]) ? 1 : 0;
  return { data: outcome.data, summary };
}

/**
 * 把一次真题作答写进学习数据。
 * 只记录真正作答过的题；未作答不视为错误，避免污染掌握度。
 */
export function applyPaperSession(
  data: AppData,
  paper: Paper,
  session: PaperExamSession,
): PaperSyncResult {
  const questions = paperQuestions(paper);
  const answered = questions.filter((question) => {
    if (question.type === 'single') return Boolean(session.answers[question.id]);
    return typeof session.selfScores?.[question.id] === 'number';
  });

  const elapsedMs = estimateElapsed(session, answered.length);
  const total = emptySummary();
  let next = data;

  for (const pq of answered) {
    const question = paperQuestionToQuestion(pq, paper);
    if (!question) continue;
    const result = buildResult(question, pq, session, paper, elapsedMs);
    if (!result) continue;
    const step = applyPaperQuestion(next, paper, pq, result, session.id);
    next = step.data;
    total.recorded += step.summary.recorded;
    total.correct += step.summary.correct;
    total.xp += step.summary.xp;
    total.coins += step.summary.coins;
    total.wrongAdded += step.summary.wrongAdded;
  }

  return { data: next, summary: total };
}

export function buildChoiceResult(
  pq: PaperQuestion,
  paper: Paper,
  picked: string,
  elapsedMs: number,
): SessionAnswer {
  const official = officialChoiceAnswer(pq, paper.choiceAnswerKey);
  return {
    correct: picked === official,
    elapsedMs,
    answer: { type: 'single', selected: [picked] },
  };
}

function buildResult(
  question: Question,
  pq: PaperQuestion,
  session: PaperExamSession,
  paper: Paper,
  elapsedMs: number,
): SessionAnswer | null {
  if (question.type === 'single') {
    const picked = session.answers[pq.id];
    if (!picked) return null;
    return buildChoiceResult(pq, paper, picked, elapsedMs);
  }

  if (question.type === 'short') {
    const score = session.selfScores?.[pq.id];
    if (typeof score !== 'number') return null;
    return buildShortResult(pq, score, elapsedMs);
  }

  return null;
}

export function buildShortResult(
  pq: PaperQuestion,
  score: number,
  elapsedMs: number,
): SessionAnswer {
  const maxScore = pq.score;
  return {
    correct: maxScore > 0 ? score / maxScore >= 0.6 : false,
    score,
    maxScore,
    elapsedMs,
    answer: { type: 'short', checked: [] },
  };
}
