import type { Difficulty, Option, Question, ShortQuestion, SingleQuestion } from '../types';
import { PAPERS, assetUrl, paperQuestions, type Paper, type PaperQuestion } from './index';
import { officialChoiceAnswer } from './exam';

const LETTERS = ['A', 'B', 'C', 'D'];

function difficultyOf(pq: PaperQuestion): Difficulty {
  const value = pq.difficulty ?? 3;
  const clamped = Math.min(5, Math.max(1, Math.round(value)));
  return clamped as Difficulty;
}

/**
 * 把图片版真题转换成学习系统认识的 Question。
 * 选择题：选项文字留空，界面上只显示 A/B/C/D（题干图里已有选项内容）。
 * 综合题：没有采分点文本，交给成绩页的「整题自评」打分。
 */
export function paperQuestionToQuestion(
  pq: PaperQuestion,
  paper: Paper,
): Question | null {
  const stem = `![第 ${pq.number} 题题干](${assetUrl(pq.stemImage)})`;
  const explanation = pq.analysisImage
    ? `![第 ${pq.number} 题解析](${assetUrl(pq.analysisImage)})`
    : undefined;
  const base = {
    id: pq.id,
    subjectId: paper.subjectId,
    kpIds: pq.kpIds ?? [],
    difficulty: difficultyOf(pq),
    source: `${paper.shortTitle} · 第 ${pq.number} 题`,
    tags: pq.tags,
    stem,
    explanation,
  };

  if (pq.type === 'single') {
    const answer = officialChoiceAnswer(pq, paper.choiceAnswerKey);
    if (!answer) return null;
    const options: Option[] = LETTERS.map((key) => ({ key, text: '' }));
    const question: SingleQuestion = { ...base, type: 'single', options, answer };
    return question;
  }

  if (pq.type === 'short') {
    const question: ShortQuestion = {
      ...base,
      type: 'short',
      rubric: [],
      maxScore: pq.score,
      reference: explanation,
    };
    return question;
  }

  return null;
}

/** 所有真题转换后的题目，模块加载时算一次 */
export const PAPER_QUESTIONS: Question[] = PAPERS.flatMap((paper) =>
  paperQuestions(paper)
    .map((pq) => paperQuestionToQuestion(pq, paper))
    .filter((question): question is Question => question !== null),
);

export const PAPER_QUESTIONS_BY_ID = new Map(PAPER_QUESTIONS.map((q) => [q.id, q]));
