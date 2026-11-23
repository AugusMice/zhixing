import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppState';
import {
  advance,
  currentQid,
  finishNow,
  recordAnswer as recordSessionAnswer,
  summarize,
} from '../engine/session';
import { applyAnswer, setSession as persistSession } from '../engine/store';
import { emitGameEvent } from '../engine/game';
import {
  evaluateAnswer,
  isAnswerComplete,
  correctAnswerMarkdown,
  userAnswerMarkdown,
  typeLabel,
  type AnswerPayload,
} from '../lib/answers';
import { plainText } from '../lib/text';
import { formatClock, formatDuration, pct } from '../lib/format';
import { navigate } from '../lib/router';
import type { Question, SessionAnswer, SessionState } from '../types';
import { Markdown } from '../components/Markdown';
import { PaperImage } from './PaperPreview';
import { AnswerInput } from '../components/AnswerInput';
import { Icon } from '../components/Icon';
import {
  DifficultyDots,
  EmptyState,
  MasteryBadge,
  PageHeader,
  Ring,
  SectionHead,
  Sheet,
  StatTile,
  SubjectTag,
} from '../components/ui';

function emptyPayload(q: Question): AnswerPayload {
  switch (q.type) {
    case 'single':
      return { type: 'single', selected: [] };
    case 'multiple':
      return { type: 'multiple', selected: [] };
    case 'judge':
      // 故意取反，保证「不会」按答错处理
      return { type: 'judge', value: !q.answer };
    case 'fill':
      return { type: 'fill', values: q.blanks.map(() => '') };
    case 'short':
      return { type: 'short', checked: [] };
  }
}

export function SessionView() {
  const { data, content, questionsById, planCtx, update, startSession, toast } = useApp();
  const session = data.session;
  const qid = session ? currentQid(session) : undefined;
  const question = qid ? questionsById.get(qid) : undefined;

  const [payload, setPayload] = useState<AnswerPayload | null>(null);
  const [feedback, setFeedback] = useState<SessionAnswer | null>(null);
  const [theoryKpId, setTheoryKpId] = useState<string | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const startedAtRef = useRef(Date.now());
  const emittedRef = useRef<string | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const enterRef = useRef<(() => void) | null>(null);
  const feedbackRef = useRef(false);

  // 切题时重置；刷新页面时若当前题已作答，则恢复作答与反馈，避免重复记录
  useEffect(() => {
    const key = `${session?.id ?? ''}:${qid ?? ''}`;
    if (lastKeyRef.current === null) {
      lastKeyRef.current = key;
      const answered = session && qid ? session.answers[qid] : undefined;
      if (answered) {
        setPayload((answered.answer as AnswerPayload | undefined) ?? null);
        setFeedback(answered);
        startedAtRef.current = Date.now() - answered.elapsedMs;
        return;
      }
    } else if (lastKeyRef.current === key) {
      return;
    } else {
      lastKeyRef.current = key;
    }
    setPayload(null);
    setFeedback(null);
    setTheoryKpId(null);
    startedAtRef.current = Date.now();
  }, [qid, session, session?.id]);

  useEffect(() => {
    if (!session || session.finishedAt) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.finishedAt]);

  const limitMs = session?.config.timeLimitMin
    ? session.config.timeLimitMin * 60_000
    : null;
  const remaining = limitMs != null && session ? session.startedAt + limitMs - tick : null;

  // 限时到点自动交卷
  useEffect(() => {
    if (!session || session.finishedAt || remaining == null || remaining > 0) return;
    update((d) => {
      if (!d.session || d.session.id !== session.id || d.session.finishedAt) return d;
      return persistSession(d, finishNow(d.session));
    });
    toast('时间到，已自动交卷');
  }, [remaining, session, update, toast]);

  // 会话结束事件（游戏层接口）
  useEffect(() => {
    if (!session?.finishedAt || emittedRef.current === session.id) return;
    emittedRef.current = session.id;
    const sum = summarize(session);
    emitGameEvent('session:complete', {
      sessionId: session.id,
      mode: session.mode,
      answered: sum.answered,
      correct: sum.correct,
      accuracy: sum.accuracy,
    });
  }, [session]);

  // 自动下一题（仅即时反馈且答对时）
  useEffect(() => {
    if (!data.settings.autoNext || !feedback?.correct || !session || session.finishedAt) return;
    const timer = window.setTimeout(() => {
      update((d) => {
        if (!d.session || d.session.id !== session.id || d.session.finishedAt) return d;
        return persistSession(d, advance(d.session));
      });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [feedback, data.settings.autoNext, session, update]);

  // Enter 快捷提交；进入反馈后交给「下一题」按钮，避免重复前进
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (feedbackRef.current) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      const action = enterRef.current;
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  enterRef.current = null;

  if (!session) {
    return (
      <div className="view">
        <PageHeader title="学习" subtitle="还没有进行中的学习" back={() => navigate('/')} />
        <EmptyState
          icon="play"
          title="现在开始一组"
          desc="今日任务会自动混合到期复习和新题。"
          action={
            <button
              className="btn btn--primary"
              onClick={() => {
                const ok = startSession('daily', {
                  label: '今日学习',
                  count: 20,
                  reveal: 'immediate',
                });
                if (!ok) toast('题库为空，先去添加内容吧');
              }}
            >
              开始今日学习
            </button>
          }
        />
      </div>
    );
  }

  if (session.finishedAt) return <SessionSummary session={session} />;

  const total = session.queue.length;
  const position = Math.min(session.index + 1, total);
  const elapsed = Math.max(0, tick - startedAtRef.current);

  if (!question) {
    return (
      <div className="view">
        <PageHeader title={session.config.label} back={() => navigate('/')} />
        <EmptyState
          title="题目不存在"
          desc="可能是内容更新后题目被移除了。"
          action={
            <button
              className="btn btn--primary"
              onClick={() =>
                update((d) => {
                  if (!d.session) return d;
                  return persistSession(d, advance(d.session));
                })
              }
            >
              跳过这题
            </button>
          }
        />
      </div>
    );
  }

  const immediate = session.config.reveal === 'immediate';
  const canSubmit = isAnswerComplete(question, payload);

  const commit = (forcedPayload?: AnswerPayload) => {
    if (!session || !question || feedback) return;
    const finalPayload = forcedPayload ?? payload;
    if (!finalPayload) return;
    if (!forcedPayload && !isAnswerComplete(question, finalPayload)) return;

    const evaluation = evaluateAnswer(question, finalPayload);
    const answer: SessionAnswer = {
      ...evaluation,
      elapsedMs: Math.max(1000, Date.now() - startedAtRef.current),
      answer: finalPayload,
    };
    const outcome = applyAnswer(data, question, answer, {
      mode: session.mode,
      sessionId: session.id,
    });
    let next = recordSessionAnswer(session, answer);
    if (!immediate) next = advance(next);
    update(() => persistSession(outcome.data, next));

    emitGameEvent('answer', {
      qid: question.id,
      correct: answer.correct,
      grade: outcome.grade,
      xp: outcome.xp,
      coins: outcome.coins,
    });

    if (immediate) {
      setFeedback(answer);
    }
  };

  const giveUp = () => {
    if (!immediate) return;
    commit(emptyPayload(question));
  };

  const goNext = () => {
    update((d) => {
      if (!d.session || d.session.id !== session.id) return d;
      return persistSession(d, advance(d.session));
    });
  };

  feedbackRef.current = feedback != null;
  enterRef.current = feedback ? goNext : canSubmit ? commit : null;

  const kpList = question.kpIds
    .map((id) => content.kpsById.get(id))
    .filter((kp): kp is NonNullable<typeof kp> => kp != null);
  const theoryKp = theoryKpId ? content.kpsById.get(theoryKpId) : undefined;
  const subject = content.subjectsById.get(question.subjectId);
  const score =
    feedback?.score != null && feedback.maxScore != null
      ? `${feedback.score} / ${feedback.maxScore}`
      : null;

  return (
    <div className="session-view">
      <header className="session-head">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="退出学习">
          <Icon name="close" />
        </button>
        <div className="session-progress">
          <div className="session-progress-top">
            <span className="session-label">{session.config.label}</span>
            <span className="quiet small">
              {position} / {total}
            </span>
          </div>
          <div className="session-bar">
            <span style={{ width: `${(session.index / Math.max(1, total)) * 100}%` }} />
          </div>
        </div>
        <div className={`session-clock ${remaining != null && remaining < 60_000 ? 'is-urgent' : ''}`}>
          <Icon name="timer" size={15} />
          {remaining != null ? formatClock(remaining) : formatClock(elapsed)}
        </div>
      </header>

      <main className="session-main">
        <form
          className="q-card card"
          onSubmit={(e) => {
            e.preventDefault();
            if (feedback) goNext();
            else commit();
          }}
        >
          <div className="q-card-head">
            <div className="q-card-tags">
              <SubjectTag subject={subject} size="sm" />
              <span className="q-type">{typeLabel(question.type)}</span>
              <DifficultyDots value={question.difficulty} />
              {question.source && <span className="q-source">{question.source}</span>}
            </div>
            <span className="q-index">第 {position} 题</span>
          </div>

          {kpList.length > 0 && (
            <div className="kp-chip-row">
              <span className="kp-chip-label">关联知识点</span>
              {kpList.map((kp) => (
                <button
                  type="button"
                  key={kp.id}
                  className="chip chip--kp"
                  style={{ ['--subject' as string]: subject?.color }}
                  onClick={() => setTheoryKpId(kp.id)}
                >
                  <Icon name="book" size={12} /> {kp.name}
                </button>
              ))}
            </div>
          )}

          <div
            className="q-stem"
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.tagName === 'IMG') {
                setZoomSrc((target as HTMLImageElement).src);
              }
            }}
          >
            <Markdown source={question.stem} />
          </div>

          <AnswerInput
            question={question}
            payload={payload}
            onChange={setPayload}
            revealed={feedback != null}
          />

          {feedback && (
            <div className={`feedback ${feedback.correct ? 'is-ok' : 'is-bad'}`}>
              <div className="feedback-head">
                <span className="feedback-icon">
                  <Icon name={feedback.correct ? 'check' : 'x'} size={20} />
                </span>
                <div>
                  <strong>{feedback.correct ? '回答正确' : '这题没答对'}</strong>
                  <p>
                    {question.type === 'short' && score
                      ? `自评 ${score} 分 · ${feedback.correct ? '达到及格线' : '未达到 60%'}`
                      : feedback.correct
                        ? `用时 ${formatDuration(feedback.elapsedMs)}`
                        : immediate
                          ? '稍后会再出现一次；错题连对两次会自动移出错题本。'
                          : `用时 ${formatDuration(feedback.elapsedMs)}`}
                  </p>
                </div>
              </div>

              {question.type !== 'short' && (
                <div className="feedback-block">
                  <span className="feedback-label">正确答案</span>
                  <div className="feedback-answer">
                    <Markdown source={correctAnswerMarkdown(question)} />
                  </div>
                </div>
              )}

              {question.type === 'short' && (
                <div className="feedback-block">
                  <span className="feedback-label">采分点</span>
                  <ul className="rubric-review">
                    {question.rubric.map((r, i) => (
                      <li key={i} className={payload?.type === 'short' && payload.checked.includes(i) ? 'is-on' : ''}>
                        <Markdown source={r.text} inline />
                        <em>{r.score} 分</em>
                      </li>
                    ))}
                  </ul>
                  {question.reference && (
                    <details className="reference">
                      <summary>参考答案</summary>
                      <Markdown source={question.reference} />
                    </details>
                  )}
                </div>
              )}

              {question.explanation && (
                <details className="explain" open={!feedback.correct}>
                  <summary>解析</summary>
                  <Markdown source={question.explanation} />
                </details>
              )}

              {kpList.length > 0 && (
                <div className="feedback-kps">
                  <span className="feedback-label">回到理论</span>
                  {kpList.map((kp) => (
                    <button
                      type="button"
                      key={kp.id}
                      className="chip"
                      onClick={() => setTheoryKpId(kp.id)}
                    >
                      {kp.name} <Icon name="chevron-right" size={12} />
                    </button>
                  ))}
                </div>
              )}

              {question.textId && (
                <div className="feedback-kps">
                  <span className="feedback-label">古诗文</span>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => navigate(`/text/${question.textId}`)}
                  >
                    查看原文与赏析 <Icon name="chevron-right" size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="q-card-foot">
            <span className="q-foot-hint">
              {feedback
                ? feedback.correct
                  ? '保持节奏'
                  : '看一眼解析再继续'
                : canSubmit
                  ? '按 Enter 提交'
                  : '选好答案后提交'}
            </span>
            <div className="q-foot-actions">
              {!feedback && immediate && (
                <button type="button" className="text-btn quiet" onClick={giveUp}>
                  不会，看答案
                </button>
              )}
              {feedback ? (
                <button type="submit" className="btn btn--primary">
                  {session.index + 1 >= total ? '查看结果' : '下一题'}
                  <Icon name="chevron-right" size={16} />
                </button>
              ) : (
                <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
                  提交
                  <Icon name="check" size={16} />
                </button>
              )}
            </div>
          </div>
        </form>
      </main>

      <Sheet
        open={theoryKp != null}
        onClose={() => setTheoryKpId(null)}
        title={theoryKp ? theoryKp.name : '理论知识'}
        footer={
          theoryKp && (
            <div className="sheet-actions">
              <button
                className="btn btn--primary"
                onClick={() => {
                  const id = theoryKp.id;
                  setTheoryKpId(null);
                  navigate(`/kp/${id}`);
                }}
              >
                打开知识点
              </button>
            </div>
          )
        }
      >
        {theoryKp ? (
          <div className="prose">
            <div className="theory-meta">
              <MasteryBadge mastery={planCtx.kpStats.get(theoryKp.id)?.mastery ?? null} />
              <span className="quiet small">
                {planCtx.questionCountByKp.get(theoryKp.id) ?? 0} 道相关题
              </span>
            </div>
            {theoryKp.description ? (
              <Markdown source={theoryKp.description} />
            ) : (
              <p className="quiet">这个知识点还没有补充理论说明。</p>
            )}
            {theoryKp.parents.length > 0 && (
              <div className="theory-links">
                <span className="feedback-label">前置</span>
                {theoryKp.parents.map((id) => {
                  const kp = content.kpsById.get(id);
                  return kp ? (
                    <button key={id} className="chip" onClick={() => setTheoryKpId(kp.id)}>
                      {kp.name}
                    </button>
                  ) : null;
                })}
              </div>
            )}
          </div>
        ) : null}
      </Sheet>

      <Sheet open={zoomSrc != null} onClose={() => setZoomSrc(null)} title="题目大图">
        {zoomSrc && <PaperImage src={zoomSrc} alt="题目大图" />}
        <p className="quiet small">双指缩放或拖动查看细节，点右上角关闭。</p>
      </Sheet>
    </div>
  );
}

function SessionSummary({ session }: { session: SessionState }) {
  const { data, content, questionsById, startSession, toast } = useApp();
  const sum = summarize(session);
  const uniqueIds = useMemo(() => Array.from(new Set(session.queue)), [session.queue]);
  const answered = uniqueIds.filter((id) => session.answers[id]).length;
  const accuracy = answered === 0 ? 0 : sum.correct / answered;
  const wrongCount = uniqueIds.filter((id) => session.answers[id] && !session.answers[id].correct).length;

  const [reviewId, setReviewId] = useState<string | null>(null);
  const reviewQ = reviewId ? questionsById.get(reviewId) : undefined;
  const reviewAnswer = reviewId ? session.answers[reviewId] : undefined;
  const reviewSubject = reviewQ ? content.subjectsById.get(reviewQ.subjectId) : undefined;

  const review = () =>
    startSession('wrong', {
      label: '错题重练',
      count: 10,
      reveal: 'immediate',
    }) || toast('错题本是空的');

  return (
    <div className="view session-summary">
      <PageHeader
        title="本组完成"
        subtitle={session.config.label}
        back={() => navigate('/')}
        right={<span className="quiet small">{formatDuration(sum.elapsedMs)}</span>}
      />

      <section className="card summary-hero">
        <Ring
          value={accuracy}
          size={96}
          stroke={8}
          label={pct(accuracy)}
          sub="正确率"
          color={accuracy >= 0.8 ? 'var(--ok)' : accuracy >= 0.5 ? 'var(--warn)' : 'var(--bad)'}
        />
        <div className="summary-copy">
          <h2>
            {accuracy >= 0.8
              ? '这一组很稳'
              : accuracy >= 0.5
                ? '有进展，也有漏洞'
                : '先把薄弱点捞出来'}
          </h2>
          <p>
            答对 {sum.correct} / {answered} 题
            {wrongCount > 0 ? `，${wrongCount} 道题已进错题本。` : '，没有新增错题。'}
          </p>
          <div className="summary-actions">
            <button className="btn btn--primary" onClick={() => navigate('/')}>
              返回首页
            </button>
            {wrongCount > 0 && (
              <button className="btn btn--ghost" onClick={review}>
                重练错题
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="overview-strip">
        <StatTile label="作答" value={answered} sub={`共 ${uniqueIds.length} 题`} />
        <StatTile label="答对" value={sum.correct} tone="ok" />
        <StatTile label="用时" value={formatDuration(sum.elapsedMs)} />
      </div>

      <section className="block">
        <SectionHead title="逐题回顾" hint="点「回顾」看答案与解析" />
        <div className="q-list">
          {uniqueIds.map((id, i) => {
            const q = questionsById.get(id);
            if (!q) return null;
            const a = session.answers[id];
            const state = !a ? 'skip' : a.correct ? 'ok' : 'bad';
            return (
              <div key={id} className="q-row">
                <span className={`review-index tone-${state}`}>{i + 1}</span>
                <div className="q-row-main">
                  <div className="q-row-meta">
                    <span className="q-type">{typeLabel(q.type)}</span>
                    <span className={`q-stage tone-${state}`}>
                      {state === 'ok' ? '正确' : state === 'bad' ? '错误' : '未作答'}
                    </span>
                    {a?.score != null && a.maxScore != null && (
                      <span className="quiet small">
                        {a.score}/{a.maxScore} 分
                      </span>
                    )}
                  </div>
                  <p className="q-row-stem">{plainText(q.stem, 82)}</p>
                </div>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setReviewId(q.id)}
                >
                  回顾
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <Sheet
        open={!!reviewQ}
        onClose={() => setReviewId(null)}
        title="题目回顾"
        footer={
          <div className="sheet-actions">
            {reviewQ && reviewQ.kpIds[0] && (
              <button
                className="btn btn--ghost"
                onClick={() => navigate(`/kp/${reviewQ.kpIds[0]}`)}
              >
                查看理论
              </button>
            )}
            <button className="btn btn--primary" onClick={() => setReviewId(null)}>
              关闭
            </button>
          </div>
        }
      >
        {reviewQ && (
          <div className="review-sheet">
            <div className="review-meta">
              {reviewSubject && <SubjectTag subject={reviewSubject} size="sm" />}
              <span className="q-type">{typeLabel(reviewQ.type)}</span>
              {reviewAnswer && (
                <span className={reviewAnswer.correct ? 'tone-ok' : 'tone-bad'}>
                  {reviewAnswer.correct ? '答对' : '答错'}
                </span>
              )}
            </div>
            <Markdown source={reviewQ.stem} />
            {reviewAnswer?.answer != null && (
              <div className="review-block">
                <span className="feedback-label">你的作答</span>
                <Markdown
                  source={userAnswerMarkdown(reviewQ, reviewAnswer.answer as AnswerPayload)}
                />
              </div>
            )}
            <div className="review-block">
              <span className="feedback-label">正确答案</span>
              <Markdown source={correctAnswerMarkdown(reviewQ)} />
            </div>
            {reviewQ.type === 'short' && (
              <div className="review-block">
                <span className="feedback-label">采分点</span>
                <ul className="rubric-review">
                  {reviewQ.rubric.map((r, i) => (
                    <li key={i}>
                      <Markdown source={r.text} inline />
                      <em>{r.score} 分</em>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {reviewQ.explanation && (
              <div className="review-block">
                <span className="feedback-label">解析</span>
                <Markdown source={reviewQ.explanation} />
              </div>
            )}
          </div>
        )}
      </Sheet>

      <p className="summary-foot quiet small">
        数据只存在这台设备的浏览器里。想换设备，去设置页导出存档。
      </p>
    </div>
  );
}
