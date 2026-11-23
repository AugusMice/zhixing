import { useEffect, useRef } from 'react';
import type { Question } from '../types';
import type { AnswerPayload } from '../lib/answers';
import { blankMatches } from '../lib/answers';
import { Markdown } from './Markdown';
import { Icon } from './Icon';

interface Props {
  question: Question;
  payload: AnswerPayload | null;
  onChange: (payload: AnswerPayload) => void;
  /** 已提交的结果；null 表示还在作答 */
  revealed: boolean;
}

export function AnswerInput({ question, payload, onChange, revealed }: Props) {
  const firstInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (question.type === 'fill') firstInput.current?.focus();
  }, [question.id, question.type]);

  if (question.type === 'single') {
    const selected = payload?.type === 'single' ? payload.selected : [];
    const keysOnly = question.options.every((opt) => !opt.text.trim());
    return (
      <div
        className={`option-list ${keysOnly ? 'option-list--keys' : ''}`}
        role="radiogroup"
        aria-label="选项"
      >
        {question.options.map((opt) => {
          const chosen = selected.includes(opt.key);
          const isAnswer = question.answer === opt.key;
          const tone = revealed ? (isAnswer ? 'is-correct' : chosen ? 'is-wrong' : '') : '';
          return (
            <button
              key={opt.key}
              type="button"
              className={`option ${chosen ? 'is-chosen' : ''} ${tone}`}
              role="radio"
              aria-checked={chosen}
              disabled={revealed}
              onClick={() => onChange({ type: 'single', selected: [opt.key] })}
            >
              <span className="option-key">{opt.key}</span>
              <span className="option-text">
                <Markdown source={opt.text} inline />
              </span>
              {revealed && isAnswer && <Icon name="check" size={16} className="option-mark" />}
              {revealed && chosen && !isAnswer && <Icon name="x" size={16} className="option-mark" />}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === 'multiple') {
    const selected = payload?.type === 'multiple' ? payload.selected : [];
    const toggle = (key: string) => {
      const next = selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key];
      onChange({ type: 'multiple', selected: next });
    };
    return (
      <div className="option-list" role="group" aria-label="多选项">
        <p className="answer-tip">多选题：选全才对，少选或多选都算错。</p>
        {question.options.map((opt) => {
          const chosen = selected.includes(opt.key);
          const isAnswer = question.answer.includes(opt.key);
          const tone = revealed ? (isAnswer ? 'is-correct' : chosen ? 'is-wrong' : '') : '';
          return (
            <button
              key={opt.key}
              type="button"
              className={`option ${chosen ? 'is-chosen' : ''} ${tone}`}
              aria-pressed={chosen}
              disabled={revealed}
              onClick={() => toggle(opt.key)}
            >
              <span className="option-key">{opt.key}</span>
              <span className="option-text">
                <Markdown source={opt.text} inline />
              </span>
              {revealed && isAnswer && <Icon name="check" size={16} className="option-mark" />}
              {revealed && chosen && !isAnswer && <Icon name="x" size={16} className="option-mark" />}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === 'judge') {
    const value = payload?.type === 'judge' ? payload.value : null;
    return (
      <div className="judge-row" role="radiogroup" aria-label="判断">
        {[
          { value: true, label: '正确' },
          { value: false, label: '错误' },
        ].map((item) => {
          const chosen = value === item.value;
          const isAnswer = question.answer === item.value;
          const tone = revealed ? (isAnswer ? 'is-correct' : chosen ? 'is-wrong' : '') : '';
          return (
            <button
              key={item.label}
              type="button"
              className={`judge-btn ${chosen ? 'is-chosen' : ''} ${tone}`}
              disabled={revealed}
              aria-pressed={chosen}
              onClick={() => onChange({ type: 'judge', value: item.value })}
            >
              <Icon name={item.value ? 'check' : 'x'} size={20} />
              {item.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === 'fill') {
    const values = payload?.type === 'fill' ? payload.values : [];
    return (
      <div className="fill-list">
        {question.blanks.map((blank, i) => {
          const value = values[i] ?? '';
          const ok = revealed && blankMatches(value, blank.accept);
          return (
            <label key={i} className={`fill-field ${revealed ? (ok ? 'is-correct' : 'is-wrong') : ''}`}>
              {question.blanks.length > 1 && <span className="fill-index">第 {i + 1} 空</span>}
              <input
                ref={i === 0 ? firstInput : undefined}
                value={value}
                disabled={revealed}
                placeholder={blank.hint ? blank.hint : '输入答案'}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => {
                  const next = [...values];
                  while (next.length < question.blanks.length) next.push('');
                  next[i] = e.target.value;
                  onChange({ type: 'fill', values: next });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !revealed) {
                    e.preventDefault();
                    const form = e.currentTarget.closest('form');
                    form?.requestSubmit();
                  }
                }}
              />
              {revealed && <span className="fill-mark">{ok ? '✓' : '✕'}</span>}
            </label>
          );
        })}
        <p className="answer-tip">忽略大小写、全半角与空格差异；多个可接受答案命中一个即可。</p>
      </div>
    );
  }

  // 大题：采分点自评
  const checked = payload?.type === 'short' ? payload.checked : [];
  const maxScore = question.maxScore ?? question.rubric.reduce((s, r) => s + r.score, 0);

  // 没有采分点文本（图片版真题）：整题打分
  if (question.rubric.length === 0) {
    const current = payload?.type === 'short' && typeof payload.score === 'number'
      ? payload.score
      : Math.round(maxScore * 0.5);
    return (
      <div className="self-score-block">
        <p className="answer-tip">
          对照参考解析，数一数你踩到几个给分点，给出本题得分。诚实一点，掌握度才准。
        </p>
        <div className="self-score-row">
          <input
            type="range"
            min={0}
            max={maxScore}
            step={1}
            value={current}
            disabled={revealed}
            aria-label="本题自评得分"
            onChange={(event) =>
              onChange({ type: 'short', checked: [], score: Number(event.target.value) })
            }
          />
          <span className="self-score-value">
            {current} <em>/ {maxScore}</em>
          </span>
        </div>
      </div>
    );
  }

  const score = question.rubric.reduce(
    (s, r, i) => s + (checked.includes(i) ? r.score : 0),
    0,
  );
  return (
    <div className="rubric-list">
      <p className="answer-tip">
        对照参考解析，勾选你实际拿到的采分点。自评 <strong>{score}</strong> / {maxScore} 分。
        诚实一点，掌握度才准。
      </p>
      {question.rubric.map((item, i) => {
        const on = checked.includes(i);
        return (
          <label key={i} className={`rubric-item ${on ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              disabled={revealed}
              onChange={() => {
                const next = on ? checked.filter((n) => n !== i) : [...checked, i];
                onChange({ type: 'short', checked: next });
              }}
            />
            <span className="rubric-check">{on ? <Icon name="check" size={14} /> : null}</span>
            <span className="rubric-text">
              <Markdown source={item.text} inline />
            </span>
            <span className="rubric-score">{item.score} 分</span>
          </label>
        );
      })}
    </div>
  );
}
