import type { Option, Question } from '../types';

/** 答题时提交的结构，JSON 可序列化，便于存档与回放 */
export type AnswerPayload =
  | { type: 'single'; selected: string[] }
  | { type: 'multiple'; selected: string[] }
  | { type: 'judge'; value: boolean }
  | { type: 'fill'; values: string[] }
  | { type: 'short'; checked: number[]; score?: number };

export function normalizeText(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeCompact(s: string): string {
  return normalizeText(s).replace(/\s+/g, '');
}

/** 填空题比对：忽略大小写、全半角与空格差异，accept 中任意一个命中即算对 */
export function blankMatches(input: string, accept: string[]): boolean {
  if (!input || !input.trim()) return false;
  const normal = normalizeText(input);
  const compact = normalizeCompact(input);
  return accept.some((a) => normalizeText(a) === normal || normalizeCompact(a) === compact);
}

export interface Evaluation {
  correct: boolean;
  score?: number;
  maxScore?: number;
}

export function evaluateAnswer(q: Question, payload: AnswerPayload): Evaluation {
  switch (q.type) {
    case 'single':
      if (payload.type !== 'single') return { correct: false };
      return { correct: payload.selected.length === 1 && payload.selected[0] === q.answer };

    case 'multiple': {
      if (payload.type !== 'multiple') return { correct: false };
      const expected = new Set(q.answer);
      const got = new Set(payload.selected);
      const ok = expected.size === got.size && [...expected].every((k) => got.has(k));
      return { correct: ok };
    }

    case 'judge':
      if (payload.type !== 'judge') return { correct: false };
      return { correct: payload.value === q.answer };

    case 'fill': {
      if (payload.type !== 'fill') return { correct: false };
      const ok = q.blanks.every((b, i) => blankMatches(payload.values[i] ?? '', b.accept));
      return { correct: ok };
    }

    case 'short': {
      if (payload.type !== 'short') return { correct: false };
      const maxScore = q.maxScore ?? q.rubric.reduce((s, r) => s + r.score, 0);
      const score =
        typeof payload.score === 'number'
          ? Math.min(maxScore, Math.max(0, payload.score))
          : q.rubric.reduce((s, r, i) => s + (payload.checked.includes(i) ? r.score : 0), 0);
      return { correct: score >= maxScore * 0.6, score, maxScore };
    }
  }
}

export function isAnswerComplete(q: Question, payload: AnswerPayload | null): boolean {
  if (!payload) return false;
  switch (q.type) {
    case 'single':
    case 'multiple':
      return payload.type === q.type && payload.selected.length > 0;
    case 'judge':
      return payload.type === 'judge';
    case 'fill':
      return payload.type === 'fill' && payload.values.every((v) => v.trim().length > 0);
    case 'short':
      return (
        payload.type === 'short' &&
        (q.rubric.length > 0 || typeof payload.score === 'number')
      );
  }
}

function optionText(options: Option[], key: string): string {
  return options.find((o) => o.key === key)?.text ?? key;
}

/** 正确答案的 Markdown 展示（可含公式） */
export function correctAnswerMarkdown(q: Question): string {
  switch (q.type) {
    case 'single':
      return `${q.answer}. ${optionText(q.options, q.answer)}`;
    case 'multiple':
      return q.answer
        .slice()
        .sort()
        .map((k) => `${k}. ${optionText(q.options, k)}`)
        .join('　');
    case 'judge':
      return q.answer ? '正确' : '错误';
    case 'fill':
      return q.blanks
        .map((b, i) => (q.blanks.length > 1 ? `第 ${i + 1} 空：${b.accept[0]}` : b.accept[0]))
        .join('；');
    case 'short': {
      const max = q.maxScore ?? q.rubric.reduce((s, r) => s + r.score, 0);
      return `按采分点自评，满分 ${max} 分`;
    }
  }
}

/** 用户作答的 Markdown 展示 */
export function userAnswerMarkdown(q: Question, payload: AnswerPayload | null): string {
  if (!payload) return '未作答';
  switch (q.type) {
    case 'single':
      if (payload.type !== 'single') return '未作答';
      return payload.selected
        .map((k) => `${k}. ${optionText(q.options, k)}`)
        .join('　');
    case 'multiple':
      if (payload.type !== 'multiple') return '未作答';
      return payload.selected
        .slice()
        .sort()
        .map((k) => `${k}. ${optionText(q.options, k)}`)
        .join('　');
    case 'judge':
      if (payload.type !== 'judge') return '未作答';
      return payload.value ? '正确' : '错误';
    case 'fill':
      if (payload.type !== 'fill') return '未作答';
      return payload.values
        .map((v, i) => (q.blanks.length > 1 ? `第 ${i + 1} 空：${v || '（空）'}` : v || '（空）'))
        .join('；');
    case 'short':
      if (payload.type !== 'short') return '未作答';
      if (typeof payload.score === 'number') return `自评得分：${payload.score} 分`;
      return `自评得分：${payload.checked.reduce((s, i) => s + (q.rubric[i]?.score ?? 0), 0)} 分`;
  }
}

export function typeLabel(type: Question['type']): string {
  return {
    single: '单选',
    multiple: '多选',
    judge: '判断',
    fill: '填空',
    short: '大题',
  }[type];
}
