import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/ui';
import { navigate } from '../lib/router';
import {
  assetUrl,
  getPaper,
  paperQuestions,
  type Paper,
  type PaperQuestion,
} from '../papers';

export function PaperImage({
  src,
  alt,
  small,
}: {
  src: string;
  alt: string;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ id: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  const clampZoom = (value: number) => Math.min(6, Math.max(0.5, value));
  const defaultZoom = () => (window.innerWidth >= 900 ? 1 : 1.8);

  const distanceOf = (points: { x: number; y: number }[]) =>
    Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

  const resetView = () => {
    setZoom(defaultZoom());
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (!open) return;
    setZoom(defaultZoom());
    setPan({ x: 0, y: 0 });
    pointers.current.clear();
    drag.current = null;
    pinch.current = null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      setZoom((value) => clampZoom(value * factor));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [open]);

  return (
    <>
      <div className={`paper-image-card ${small ? 'paper-image-card--small' : ''}`}>
        <button
          type="button"
          className="paper-image-open"
          onClick={() => setOpen(true)}
          aria-label={`放大查看${alt}`}
        >
          <img src={src} alt={alt} loading="lazy" decoding="async" />
        </button>
      </div>
      {open &&
        createPortal(
          <div className="paper-lightbox" role="dialog" aria-label={alt} aria-modal="true">
            <div className="paper-lightbox-bar">
              <button
                type="button"
                onClick={() => setZoom((value) => clampZoom(value - 0.3))}
                aria-label="缩小"
              >
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((value) => clampZoom(value + 0.3))}
                aria-label="放大"
              >
                +
              </button>
              <button
                type="button"
                className="paper-lightbox-fit"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                适应宽度
              </button>
              <button type="button" className="paper-lightbox-fit" onClick={resetView}>
                重置
              </button>
            </div>
            <button
              type="button"
              className="paper-lightbox-close"
              onClick={() => setOpen(false)}
              aria-label="关闭大图"
            >
              <Icon name="close" />
            </button>
            <div
              ref={stageRef}
              className="paper-lightbox-stage"
              onDoubleClick={resetView}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pointers.current.size === 1) {
                  drag.current = {
                    id: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    panX: pan.x,
                    panY: pan.y,
                  };
                }
                if (pointers.current.size === 2) {
                  const points = [...pointers.current.values()];
                  pinch.current = { distance: distanceOf(points), zoom };
                  drag.current = null;
                }
              }}
              onPointerMove={(event) => {
                const point = pointers.current.get(event.pointerId);
                if (!point) return;
                point.x = event.clientX;
                point.y = event.clientY;
                if (pointers.current.size >= 2 && pinch.current) {
                  const points = [...pointers.current.values()];
                  const distance = distanceOf(points);
                  setZoom(clampZoom(pinch.current.zoom * (distance / Math.max(1, pinch.current.distance))));
                  return;
                }
                if (drag.current?.id === event.pointerId) {
                  setPan({
                    x: drag.current.panX + event.clientX - drag.current.x,
                    y: drag.current.panY + event.clientY - drag.current.y,
                  });
                }
              }}
              onPointerUp={(event) => {
                pointers.current.delete(event.pointerId);
                if (pointers.current.size < 2) pinch.current = null;
                if (pointers.current.size === 0) {
                  drag.current = null;
                } else if (pointers.current.size === 1) {
                  const [id, point] = [...pointers.current.entries()][0];
                  drag.current = { id, x: point.x, y: point.y, panX: pan.x, panY: pan.y };
                }
              }}
              onPointerCancel={(event) => {
                pointers.current.delete(event.pointerId);
                if (pointers.current.size === 0) drag.current = null;
              }}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                style={{
                  transform: `translate(0, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function QuestionNav({
  paper,
  current,
  onPick,
}: {
  paper: Paper;
  current: PaperQuestion;
  onPick: (id: string) => void;
}) {
  return (
    <aside className="paper-nav" aria-label="题目列表">
      {paper.sections.map((section) => (
        <div className="paper-nav-section" key={section.id}>
          <div className="paper-nav-title">
            <span>{section.title}</span>
            <em>{section.score} 分</em>
          </div>
          <div className="paper-nav-grid">
            {section.questionIds.map((id) => {
              const question = paperQuestions(paper).find((q) => q.id === id);
              if (!question) return null;
              return (
                <button
                  key={id}
                  type="button"
                  className={`paper-nav-dot ${question.id === current.id ? 'is-active' : ''}`}
                  onClick={() => onPick(id)}
                  aria-label={`第 ${question.number} 题`}
                >
                  {question.number}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

export function PaperPreview({ paperId }: { paperId: string }) {
  const paper = getPaper(paperId);
  const questions = useMemo(() => (paper ? paperQuestions(paper) : []), [paper]);
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const question = questions[index];

  useEffect(() => {
    setShowAnswer(false);
    setShowAnalysis(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [index]);

  useEffect(() => {
    if (!question) return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((i) => Math.min(questions.length - 1, i + 1));
      } else if (event.key.toLowerCase() === 'a') {
        setShowAnswer((v) => !v);
      } else if (event.key.toLowerCase() === 's') {
        setShowAnalysis((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, questions.length]);

  if (!paper) {
    return (
      <div className="view">
        <PageHeader title="试卷" back={() => navigate('/subjects')} />
        <div className="empty">
          <h3>没有找到这套卷子</h3>
          <p>它可能还没有被整理进题库。</p>
          <button className="btn btn--primary" onClick={() => navigate('/subjects')}>
            返回科目
          </button>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="view">
        <PageHeader title={paper.shortTitle} back={() => navigate('/subjects')} />
        <div className="empty">
          <h3>这套卷子还没有题目</h3>
          <p>先录入至少一道题，再来预览。</p>
        </div>
      </div>
    );
  }

  const pick = (id: string) => {
    const next = questions.findIndex((item) => item.id === id);
    if (next >= 0) setIndex(next);
  };

  const go = (delta: number) => {
    setIndex((i) => Math.max(0, Math.min(questions.length - 1, i + delta)));
  };

  return (
    <div className="view paper-view">
      <PageHeader
        title={paper.shortTitle}
        subtitle={`${paper.region} · ${paper.year} · 图片题干版`}
        back={() => navigate('/subjects')}
        right={<span className="paper-progress">{index + 1} / {questions.length}</span>}
      />

      <div className="paper-intro">
        <div>
          <span className="paper-kicker">
            <Icon name="book" size={13} /> 真题预览
          </span>
          <h2>{paper.title}</h2>
          <p>
            满分 {paper.score} · 建议 {paper.durationMinutes} 分钟 · 来源：{paper.source.publisher}
          </p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/subjects')}>
          返回科目
        </button>
      </div>

      <section className="paper-exam-entry">
        <div className="paper-exam-entry-copy">
          <span className="paper-kicker">
            <Icon name="target" size={13} /> 选择题模拟
          </span>
          <h3>1–14 题 · 42 分 · 30 分钟</h3>
          <p>闭卷作答，交卷后自动判分；支持断点续考。</p>
        </div>
        <button
          type="button"
          className="btn btn--primary paper-exam-entry-btn"
          onClick={() => navigate(`/paper/${paper.id}/take`)}
        >
          {questions.some((item) => item.type === 'single') ? '开始答题' : '暂无选择题'}
          <Icon name="chevron-right" size={14} />
        </button>
      </section>

      <div className="paper-layout">
        <QuestionNav paper={paper} current={question} onPick={pick} />

        <main className="paper-main">
          <div className="paper-question-bar">
            <div>
              <span className="paper-question-no">第 {question.number} 题</span>
              <span className="paper-question-meta">
                {question.section} · {question.type === 'single' ? '单选' : '综合'} · {question.score} 分
              </span>
            </div>
            {question.reviewStatus === 'needs-review' && (
              <span className="paper-review-flag">裁切待复核</span>
            )}
          </div>

          <div className="paper-pager paper-pager--top">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={index === 0}
              onClick={() => go(-1)}
            >
              <Icon name="arrow-left" size={14} /> 上一题
            </button>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={index === questions.length - 1}
              onClick={() => go(1)}
            >
              下一题 <Icon name="chevron-right" size={14} />
            </button>
          </div>

          <PaperImage
            src={assetUrl(question.stemImage)}
            alt={`第 ${question.number} 题题干`}
          />

          <div className="paper-actions">
            <button
              type="button"
              className={`btn btn--sm ${showAnswer ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setShowAnswer((v) => !v)}
            >
              <Icon name="check" size={14} /> {showAnswer ? '收起答案' : '看答案'}
            </button>
            <button
              type="button"
              className={`btn btn--sm ${showAnalysis ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => setShowAnalysis((v) => !v)}
            >
              <Icon name="book" size={14} /> {showAnalysis ? '收起解析' : '看解析'}
            </button>
            <span className="paper-shortcuts">← → 切题 · A 答案 · S 解析</span>
          </div>

          {showAnswer && (
            <section className="paper-reveal">
              <div className="paper-reveal-head">
                <h3>答案</h3>
                <span className="paper-answer-kind">官方答案</span>
              </div>
              {question.answer ? (
                <div className="paper-choice-answer">{question.answer}</div>
              ) : (
                <p className="paper-reveal-hint">综合题答案见下方第 8 页裁图；当前先保留原答案与评分细则。</p>
              )}
              {question.answerImage && (
                <PaperImage
                  src={assetUrl(question.answerImage)}
                  alt={`第 ${question.number} 题答案`}
                  small
                />
              )}
            </section>
          )}

          {showAnalysis && (
            <section className="paper-reveal">
              <div className="paper-reveal-head">
                <h3>解析</h3>
                <span className="paper-answer-kind">{question.analysisPage} 页</span>
              </div>
              <PaperImage
                src={assetUrl(question.analysisImage)}
                alt={`第 ${question.number} 题解析`}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
