import { createStore, del, get, set } from 'idb-keyval';
import type { Paper, PaperQuestion } from './index';

export interface PaperExamSession {
  id: string;
  paperId: string;
  startedAt: number;
  endsAt: number;
  durationMinutes: number;
  status: 'doing' | 'submitted';
  answers: Record<string, string>;
  /** 综合题整题自评得分：questionId -> 得分 */
  selfScores?: Record<string, number>;
  /** 是否已写入学习数据（attempts/cards/wrong） */
  applied?: boolean;
  submittedAt?: number;
  score?: number;
  maxScore?: number;
  correctCount?: number;
  questionCount?: number;
}

const store = createStore('zhixing-db', 'kv');
const keyOf = (paperId: string) => `paper-exam:${paperId}`;

export function choiceQuestions(questions: PaperQuestion[]): PaperQuestion[] {
  return questions.filter((question) => question.type === 'single');
}

export function isChoiceQuestion(question: PaperQuestion): boolean {
  return question.type === 'single';
}

export function makePaperExam(
  paper: Paper,
  questions: PaperQuestion[],
  durationMinutes = 30,
): PaperExamSession {
  const now = Date.now();
  return {
    id: `pex-${paper.id}-${now}-${Math.random().toString(36).slice(2, 6)}`,
    paperId: paper.id,
    startedAt: now,
    endsAt: now + durationMinutes * 60_000,
    durationMinutes,
    status: 'doing',
    answers: {},
    maxScore: questions.reduce((sum, question) => sum + question.score, 0),
    questionCount: questions.length,
  };
}

export async function loadPaperExam(paperId: string): Promise<PaperExamSession | null> {
  try {
    return (await get<PaperExamSession>(keyOf(paperId), store)) ?? null;
  } catch {
    return null;
  }
}

export async function savePaperExam(session: PaperExamSession): Promise<void> {
  try {
    await set(keyOf(session.paperId), session, store);
  } catch {
    // IndexedDB 不可用时仍允许本次作答，只是不能续考。
  }
}

export async function clearPaperExam(paperId: string): Promise<void> {
  try {
    await del(keyOf(paperId), store);
  } catch {
    // ignore
  }
}

export function officialChoiceAnswer(
  question: PaperQuestion,
  answerKey?: string[],
): string {
  return answerKey?.[question.number - 1] ?? question.answer ?? '';
}

export function gradePaperExam(
  session: PaperExamSession,
  questions: PaperQuestion[],
  answerKey?: string[],
): PaperExamSession {
  let score = 0;
  let correctCount = 0;
  for (const question of questions) {
    if (question.type !== 'single') continue;
    if (session.answers[question.id] === officialChoiceAnswer(question, answerKey)) {
      score += question.score;
      correctCount += 1;
    }
  }
  return {
    ...session,
    status: 'submitted',
    submittedAt: Date.now(),
    score,
    maxScore: questions.reduce((sum, question) => sum + question.score, 0),
    correctCount,
    questionCount: questions.length,
  };
}

export function remainingMs(session: PaperExamSession, now = Date.now()): number {
  return Math.max(0, session.endsAt - now);
}

export function formatRemaining(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
