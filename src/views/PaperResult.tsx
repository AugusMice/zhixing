import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Ring, Sheet } from '../components/ui';
import { navigate } from '../lib/router';
import {
  assetUrl,
  getPaper,
  paperQuestions,
  type Paper,
  type PaperQuestion,
} from '../papers';
import {
  choiceQuestions,
  clearPaperExam,
  loadPaperExam,
  officialChoiceAnswer,
  savePaperExam,
  type PaperExamSession,
} from '../papers/exam';
import { applyPaperQuestion, applyPaperSession, buildShortResult } from '../papers/sync';
import { addPaperReport } from '../papers/reports';
import { useApp } from '../state/AppState';
import { PaperImage } from './PaperPreview';

function ResultRow({
  paper,
  question,
  picked,
}: {
  paper: Paper;
  question: PaperQuestion;
  picked?: string;
}) {
  const [stemOpen, setStemOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const official = officialChoiceAnswer(question, paper.choiceAnswerKey);
  const correct = picked === official;
  const answerMismatch = Boolean(question.answer && official && question.answer !== official);

  const submitReport = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    await addPaperReport({
      paperId: paper.id,
      questionId: question.id,
      number: question.number,
      message: message.trim(),
    });
    setSending(false);
    setSent(true);
  };

  return (
    <article className={`exam-result-row ${correct ? 'is-correct' : 'is-wrong'}`}>
      <div className="exam-result-row-main">
        <span className="exam-result-no">{question.number}</span>
        <button type="button" className="exam-report-trigger" onClick={() => setReportOpen(true)}>
          报错
        </button>
        <div className="exam-result-q">
          <strong>第 {question.number} 题 · {question.score} 分</strong>
          <span>
            你的答案：{picked || '未作答'} · 正确答案：{official || '—'}
          </span>
        </div>
        <span className={`exam-result-badge ${correct ? 'is-correct' : 'is-wrong'}`}>
          {correct ? '正确' : picked ? '错误' : '未答'}
        </span>
      </div>

      <div className="exam-result-tools">
        <details className="exam-result-detail">
          <summary>看答案解析</summary>
          <PaperImage
            src={assetUrl(question.analysisImage)}
            alt={`第 ${question.number} 题解析`}
          />
        </details>
        <button type="button" className="exam-result-link" onClick={() => setStemOpen(true)}>
          <Icon name="book" size={13} /> 看原题
        </button>
      </div>

      <Sheet open={stemOpen} onClose={() => setStemOpen(false)} title={`第 ${question.number} 题 · 原题`}>
        <PaperImage src={assetUrl(question.stemImage)} alt={`第 ${question.number} 题题干`} />
      </Sheet>

      <Sheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`报告第 ${question.number} 题`}
        footer={
          sent ? (
            <button type="button" className="btn btn--primary btn--block" onClick={() => setReportOpen(false)}>
              知道了
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={!message.trim() || sending}
              onClick={() => void submitReport()}
            >
              {sending ? '正在提交…' : '提交问题'}
            </button>
          )
        }
      >
        {sent ? (
          <div className="exam-report-done">
            <p>已记录这道题的问题，会进入本地复核队列。</p>
            <p className="exam-report-note">
              当前判分以官方答案表为准{answerMismatch ? '；检测到题库答案与答案表不一致，已标记。' : '。'}
            </p>
          </div>
        ) : (
          <>
            <p className="exam-report-hint">
              答案或解析哪里有问题？写清楚你的判断，提交后会记录在本地。
            </p>
            {answerMismatch && (
              <p className="exam-report-warn">
                自动核对：题库答案 {question.answer}，官方答案表 {official}。
              </p>
            )}
            <textarea
              className="exam-report-input"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="例如：这题选错误项，D 才是错误项，题库答案标成了 B。"
              rows={5}
            />
          </>
        )}
      </Sheet>
    </article>
  );
}

function SelfGradeCard({
  paper,
  question,
  savedScore,
  onSave,
}: {
  paper: Paper;
  question: PaperQuestion;
  savedScore?: number;
  onSave: (score: number) => void;
}) {
  const [score, setScore] = useState(savedScore ?? Math.round(question.score * 0.5));
  const [answerOpen, setAnswerOpen] = useState(false);
  const [stemOpen, setStemOpen] = useState(false);
  const saved = typeof savedScore === 'number';

  return (
    <article className="self-grade-card">
      <header className="self-grade-head">
        <span className="exam-result-no">{question.number}</span>
        <div className="self-grade-title">
          <strong>第 {question.number} 题 · {question.score} 分</strong>
          <span>{saved ? `已记入 ${savedScore} 分` : '对照答案，给自己打分'}</span>
        </div>
        <button type="button" className="exam-result-link" onClick={() => setStemOpen(true)}>
          <Icon name="book" size={13} /> 原题
        </button>
        <button type="button" className="exam-result-link" onClick={() => setAnswerOpen(true)}>
          答案
        </button>
      </header>

      <div className="self-grade-body">
        <input
          className="self-grade-range"
          type="range"
          min={0}
          max={question.score}
          step={1}
          value={score}
          onChange={(event) => setScore(Number(event.target.value))}
          aria-label={`第 ${question.number} 题自评得分`}
        />
        <span className="self-grade-value">
          {score} <em>/ {question.score}</em>
        </span>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => onSave(score)}
        >
          {saved ? '重新记入' : '记入'}
        </button>
      </div>

      <Sheet open={stemOpen} onClose={() => setStemOpen(false)} title={`第 ${question.number} 题 · 原题`}>
        <PaperImage src={assetUrl(question.stemImage)} alt={`第 ${question.number} 题题干`} />
      </Sheet>
      <Sheet open={answerOpen} onClose={() => setAnswerOpen(false)} title={`第 ${question.number} 题 · 答案与解析`}>
        {question.answerImage && (
          <PaperImage src={assetUrl(question.answerImage)} alt={`第 ${question.number} 题答案`} />
        )}
        {question.analysisImage && (
          <PaperImage src={assetUrl(question.analysisImage)} alt={`第 ${question.number} 题解析`} />
        )}
      </Sheet>
    </article>
  );
}

export function PaperResult({ paperId }: { paperId: string }) {
  const { data, update, toast } = useApp();
  const dataRef = useRef(data);
  dataRef.current = data;

  const paper = getPaper(paperId);
  const allQuestions = useMemo(() => (paper ? paperQuestions(paper) : []), [paper]);
  const questions = useMemo(() => choiceQuestions(allQuestions), [allQuestions]);
  const shortQuestions = useMemo(
    () => allQuestions.filter((question) => question.type === 'short'),
    [allQuestions],
  );

  const [session, setSession] = useState<PaperExamSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!paper) {
        setLoading(false);
        return;
      }
      let stored = await loadPaperExam(paper.id);
      if (!alive) return;
      if (!stored || stored.status !== 'submitted') {
        navigate(`/paper/${paper.id}/take`, true);
        return;
      }
      // 兜底：交卷时如果没写进学习数据（例如中途刷新），这里补一次
      if (!stored.applied) {
        const { data: synced } = applyPaperSession(dataRef.current, paper, stored);
        stored = { ...stored, applied: true };
        update(() => synced);
        await savePaperExam(stored);
        if (!alive) return;
      }
      setSession(stored);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [paper, update]);

  const saveSelfScore = (question: PaperQuestion, score: number) => {
    if (!paper || !session) return;
    const next: PaperExamSession = {
      ...session,
      selfScores: { ...(session.selfScores ?? {}), [question.id]: score },
      applied: true,
    };
    const elapsed = Math.min(6 * 60_000, Math.max(60_000, question.score * 60_000));
    const { data: synced } = applyPaperQuestion(
      dataRef.current,
      paper,
      question,
      buildShortResult(question, score, elapsed),
      next.id,
    );
    update(() => synced);
    void savePaperExam(next);
    setSession(next);
    toast(`第 ${question.number} 题已记入 ${score} 分`);
  };

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

  if (loading || !session) {
    return (
      <div className="view exam-view exam-loading">
        <div className="splash-mark" />
        <p>正在整理成绩…</p>
      </div>
    );
  }

  const maxScore = session.maxScore ?? questions.reduce((sum, question) => sum + question.score, 0);
  const score = session.score ?? 0;
  const rate = maxScore ? score / maxScore : 0;
  const usedSeconds = Math.min(
    (session.durationMinutes ?? 30) * 60,
    Math.max(0, Math.round(((session.submittedAt ?? Date.now()) - session.startedAt) / 1000)),
  );
  const usedText = `${Math.floor(usedSeconds / 60)} 分 ${usedSeconds % 60} 秒`;
  const selfTotal = shortQuestions.reduce(
    (sum, question) => sum + (session.selfScores?.[question.id] ?? 0),
    0,
  );
  const selfSaved = shortQuestions.filter(
    (question) => typeof session.selfScores?.[question.id] === 'number',
  ).length;

  return (
    <div className="view exam-view exam-result-view">
      <header className="exam-result-head">
        <button type="button" className="exam-back" onClick={() => navigate(`/paper/${paper.id}`)}>
          <Icon name="arrow-left" size={18} />
        </button>
        <div>
          <span className="exam-result-kicker">选择题模拟 · 已交卷</span>
          <h1>{paper.shortTitle}</h1>
        </div>
      </header>

      <section className="exam-score-card">
        <Ring value={rate} size={124} stroke={10} label={`${score}`} sub={`/ ${maxScore}`} />
        <div className="exam-score-copy">
          <strong>{rate >= 0.9 ? '这一套很稳。' : rate >= 0.7 ? '基础不错，继续补洞。' : '先把错题弄懂，再刷新纪录。'}</strong>
          <p>
            答对 {session.correctCount ?? 0} / {session.questionCount ?? questions.length} 题 ·
            用时 {usedText}
          </p>
          <p className="exam-result-synced">
            <Icon name="check" size={13} /> 已计入学习记录（复习队列、错题本、掌握度）
          </p>
          <div className="exam-score-actions">
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={() => {
                void clearPaperExam(paper.id).then(() => navigate(`/paper/${paper.id}/take`));
              }}
            >
              再考一次
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(`/paper/${paper.id}`)}>
              返回预览
            </button>
          </div>
        </div>
      </section>

      <section className="exam-result-list">
        <div className="section-head">
          <h2>逐题回顾</h2>
          <span>选择题自动判分</span>
        </div>
        {questions.map((question) => (
          <ResultRow
            key={question.id}
            paper={paper}
            question={question}
            picked={session.answers[question.id]}
          />
        ))}
      </section>

      {shortQuestions.length > 0 && (
        <section className="exam-result-list">
          <div className="section-head">
            <h2>综合题自评</h2>
            <span>
              {selfSaved > 0 ? `已记入 ${selfSaved} 题 · ${selfTotal} 分` : '对照答案，按踩到的给分点打分'}
            </span>
          </div>
          {shortQuestions.map((question) => (
            <SelfGradeCard
              key={question.id}
              paper={paper}
              question={question}
              savedScore={session.selfScores?.[question.id]}
              onSave={(value) => saveSelfScore(question, value)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
