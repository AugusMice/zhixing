import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/ui';
import { navigate } from '../lib/router';
import { assetUrl, getPaper, paperQuestions } from '../papers';
import {
  choiceQuestions,
  formatRemaining,
  gradePaperExam,
  loadPaperExam,
  makePaperExam,
  remainingMs,
  savePaperExam,
  type PaperExamSession,
} from '../papers/exam';
import { applyPaperSession } from '../papers/sync';
import { useApp } from '../state/AppState';
import { PaperImage } from './PaperPreview';

const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
const CHOICE_EXAM_MINUTES = 30;

export function PaperExam({ paperId }: { paperId: string }) {
  const { data, update, toast } = useApp();
  const dataRef = useRef(data);
  dataRef.current = data;

  const paper = getPaper(paperId);
  const questions = useMemo(
    () => (paper ? choiceQuestions(paperQuestions(paper)) : []),
    [paper],
  );

  const [session, setSession] = useState<PaperExamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const sessionRef = useRef<PaperExamSession | null>(null);
  const finishingRef = useRef(false);
  sessionRef.current = session;

  useEffect(() => {
    if (!paper) {
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      const stored = await loadPaperExam(paper.id);
      if (!alive) return;
      if (stored && stored.status === 'submitted') {
        navigate(`/paper/${paper.id}/result`, true);
        return;
      }
      if (stored && stored.endsAt > Date.now()) {
        setSession(stored);
        setRemaining(remainingMs(stored));
        setLoading(false);
        return;
      }
      if (stored) {
        const graded = gradePaperExam(stored, questions, paper.choiceAnswerKey);
        await savePaperExam(graded);
        if (!alive) return;
        navigate(`/paper/${paper.id}/result`, true);
        return;
      }
      const fresh = makePaperExam(paper, questions, CHOICE_EXAM_MINUTES);
      await savePaperExam(fresh);
      if (!alive) return;
      setSession(fresh);
      setRemaining(remainingMs(fresh));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [paper, questions]);

  useEffect(() => {
    if (session?.status === 'doing') void savePaperExam(session);
  }, [session]);

  const finish = async () => {
    const current = sessionRef.current;
    if (!current || current.status !== 'doing' || finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    const graded = gradePaperExam(current, questions, paper?.choiceAnswerKey);
    if (paper) {
      const { data: synced, summary } = applyPaperSession(dataRef.current, paper, graded);
      graded.applied = true;
      update(() => synced);
      if (summary.recorded > 0) {
        toast(`已计入学习记录：${summary.recorded} 题，答对 ${summary.correct} 题`);
      }
    }
    await savePaperExam(graded);
    if (paper) navigate(`/paper/${paper.id}/result`, true);
  };

  useEffect(() => {
    if (!session || session.status !== 'doing') return;
    const tick = () => {
      const left = remainingMs(session);
      setRemaining(left);
      if (left <= 0) void finish();
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.endsAt, session?.status]);

  const current = questions[index];

  const select = (key: string) => {
    if (!current || session?.status !== 'doing') return;
    setSession((value) =>
      value
        ? { ...value, answers: { ...value.answers, [current.id]: key } }
        : value,
    );
  };

  const go = (delta: number) => {
    if (!questions.length) return;
    if (delta > 0 && index === questions.length - 1) {
      setConfirmOpen(true);
      return;
    }
    setIndex((value) => Math.max(0, Math.min(questions.length - 1, value + delta)));
  };

  useEffect(() => {
    if (!session || session.status !== 'doing' || confirmOpen || sheetOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      } else if (/^[1-4]$/.test(event.key)) {
        event.preventDefault();
        select(OPTION_KEYS[Number(event.key) - 1]);
      } else if (/^[a-dA-D]$/.test(event.key)) {
        event.preventDefault();
        select(event.key.toUpperCase());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, index, confirmOpen, sheetOpen, questions.length]);

  if (!paper) {
    return (
      <div className="view exam-view">
        <div className="empty">
          <h3>没有找到这套卷子</h3>
          <button className="btn btn--primary" onClick={() => navigate('/subjects')}>
            返回科目
          </button>
        </div>
      </div>
    );
  }

  if (loading || !session || !current) {
    return (
      <div className="view exam-view exam-loading">
        <div className="splash-mark" />
        <p>正在准备答题卡…</p>
      </div>
    );
  }

  const answeredCount = Object.keys(session.answers).length;
  const selected = session.answers[current.id];

  return (
    <div className="view exam-view">
      <header className="exam-top">
        <button
          type="button"
          className="exam-back"
          onClick={() => navigate(`/paper/${paper.id}`)}
          aria-label="返回试卷预览"
        >
          <Icon name="arrow-left" size={18} />
        </button>
        <div className="exam-title">
          <strong>选择题模拟</strong>
          <span>{paper.shortTitle} · {questions.length} 题 · 满分 {session.maxScore ?? 42}</span>
        </div>
        <div className={`exam-clock ${remaining < 5 * 60_000 ? 'is-warn' : ''}`}>
          <Icon name="timer" size={15} />
          {formatRemaining(remaining)}
        </div>
        <button type="button" className="btn btn--primary btn--sm exam-submit" onClick={() => setConfirmOpen(true)}>
          交卷
        </button>
      </header>

      <main className="exam-main">
        <div className="exam-q-head">
          <span className="exam-q-no">第 {current.number} 题</span>
          <span className="exam-q-meta">
            {current.section} · 单选 · {current.score} 分
          </span>
          <span className="exam-progress">{index + 1} / {questions.length}</span>
        </div>

        <PaperImage src={assetUrl(current.stemImage)} alt={`第 ${current.number} 题题干`} />

        <div className="exam-options" role="group" aria-label="选择答案">
          {OPTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`exam-option ${selected === key ? 'is-selected' : ''}`}
              onClick={() => select(key)}
              aria-pressed={selected === key}
            >
              <span>{key}</span>
              <em>{['A', 'B', 'C', 'D'].includes(key) ? `选项 ${key}` : ''}</em>
            </button>
          ))}
        </div>

        <div className="exam-actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={index === 0}
            onClick={() => go(-1)}
          >
            <Icon name="arrow-left" size={14} /> 上一题
          </button>
          <button
            type="button"
            className="btn btn--ghost exam-sheet-btn"
            onClick={() => setSheetOpen(true)}
          >
            <Icon name="grid" size={14} /> 答题卡 {answeredCount}/{questions.length}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => go(1)}>
            {index === questions.length - 1 ? '交卷' : '下一题'}
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      </main>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="答题卡">
        <div className="exam-sheet-grid">
          {questions.map((question, questionIndex) => (
            <button
              key={question.id}
              type="button"
              className={`exam-sheet-cell ${session.answers[question.id] ? 'is-answered' : ''} ${questionIndex === index ? 'is-current' : ''}`}
              onClick={() => {
                setIndex(questionIndex);
                setSheetOpen(false);
              }}
            >
              {question.number}
            </button>
          ))}
        </div>
        <div className="exam-sheet-legend">
          <span><i className="is-answered" /> 已答</span>
          <span><i /> 未答</span>
          <span><i className="is-current" /> 当前题</span>
        </div>
      </Sheet>

      <Sheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="确认交卷"
        footer={
          <div className="exam-confirm-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmOpen(false)}>
              继续答题
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={finishing}
              onClick={() => void finish()}
            >
              {finishing ? '正在交卷…' : '确认交卷'}
            </button>
          </div>
        }
      >
        <p className="exam-confirm-text">
          还有 <strong>{questions.length - answeredCount}</strong> 题未作答。交卷后将立即判分，不能修改答案。
        </p>
      </Sheet>
    </div>
  );
}
