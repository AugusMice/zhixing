import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppState';
import { TEXTS } from '../content/texts';
import { navigate, goBack } from '../lib/router';
import { PageHeader, EmptyState, DifficultyDots } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { plainText, truncate } from '../lib/text';
import { typeLabel } from '../lib/answers';
import { Icon } from '../components/Icon';
import type { TextItem } from '../types';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把名句在原文里高亮出来 */
function highlightFamous(line: string, famous: string[]): ReactNode {
  const hits = famous
    .map((f) => f.trim())
    .filter((f) => f.length > 1 && line.includes(f))
    .sort((a, b) => b.length - a.length);
  if (hits.length === 0) return line;
  const re = new RegExp(`(${hits.map(escapeRegExp).join('|')})`, 'g');
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(
      <mark key={`m${key++}`} className="text-famous">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export function TextDetail({ textId }: { textId: string }) {
  const { questions, data, update, startQueue, toast } = useApp();
  const text: TextItem | undefined = TEXTS.byId.get(textId);
  const [showTranslation, setShowTranslation] = useState(false);
  const [masked, setMasked] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const enabled = !(data.settings.disabledTexts ?? []).includes(textId);

  const setEnabled = (next: boolean) => {
    update((prev) => {
      const current = new Set(prev.settings.disabledTexts ?? []);
      if (next) current.delete(textId);
      else current.add(textId);
      return {
        ...prev,
        settings: { ...prev.settings, disabledTexts: [...current] },
      };
    });
    toast(next ? '已加入默写题库' : '已从默写题库移出');
  };

  const related = useMemo(
    () => questions.filter((q) => q.textId === textId),
    [questions, textId],
  );
  const doneCount = related.filter((q) => data.cards[q.id]).length;

  if (!text) {
    return (
      <div className="view">
        <PageHeader title="未找到篇目" back={() => goBack('/texts')} />
        <EmptyState
          icon="book"
          title="这一篇不在栏目里"
          desc={`textId: ${textId}`}
          action={
            <button className="btn btn--primary" onClick={() => navigate('/texts')}>
              返回栏目
            </button>
          }
        />
      </div>
    );
  }

  const practice = () => {
    if (related.length === 0) {
      toast('本篇暂未配题');
      return;
    }
    startQueue(`${text.title} · 默写`, related.map((q) => q.id));
  };

  return (
    <div className="view text-view">
      <PageHeader
        title={text.title}
        subtitle={[text.author, text.dynasty, text.source].filter(Boolean).join(' · ')}
        back={() => goBack('/texts')}
        right={
          <button className="icon-btn" onClick={practice} aria-label="练本篇题目">
            <Icon name="play" />
          </button>
        }
      />

      <div className="text-hero">
        <div className="text-hero-tags">
          <span className="text-tag text-tag--genre">{text.genre}</span>
          {text.excerpt ? <span className="text-tag">节选</span> : null}
          {text.themes?.map((t) => (
            <span key={t} className="text-tag text-tag--soft">
              {t}
            </span>
          ))}
        </div>
        <div className="text-hero-stats">
          <span>{related.length} 道题</span>
          <span>已练 {doneCount}</span>
          <button
            className={`text-toggle ${enabled ? 'is-on' : ''}`}
            aria-pressed={enabled}
            onClick={() => setEnabled(!enabled)}
          >
            <span className="text-toggle-dot" />
            {enabled ? '已启用' : '已停用'}
          </button>
        </div>
        <button className="btn btn--primary btn--block" onClick={practice}>
          <Icon name="play" /> 练本篇 {Math.min(related.length, 10)} 题
        </button>
      </div>

      <section className="text-section">
        <div className="text-section-head">
          <h2>原文</h2>
          <div className="text-section-actions">
            <button
              className={`chip ${masked ? 'is-active' : ''}`}
              onClick={() => {
                setMasked((v) => !v);
                setRevealed(new Set());
              }}
            >
              {masked ? '显示全文' : '背诵遮罩'}
            </button>
            {text.translation?.length ? (
              <button
                className={`chip ${showTranslation ? 'is-active' : ''}`}
                onClick={() => setShowTranslation((v) => !v)}
              >
                译文
              </button>
            ) : null}
          </div>
        </div>
        <div className={`text-body ${masked ? 'is-masked' : ''}`}>
          {text.paragraphs.map((line, i) => (
            <p
              key={i}
              className={`text-line ${masked && !revealed.has(i) ? 'is-hidden' : ''}`}
              onClick={() => {
                if (!masked) return;
                setRevealed((prev) => new Set(prev).add(i));
              }}
            >
              {masked ? line : highlightFamous(line, text.famousLines ?? [])}
            </p>
          ))}
        </div>
        {showTranslation && text.translation?.length ? (
          <div className="text-translation">
            {text.translation.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : null}
      </section>

      {text.famousLines?.length ? (
        <section className="text-section">
          <div className="text-section-head">
            <h2>名句</h2>
            <span className="text-hint">{text.famousLines.length} 句</span>
          </div>
          <ul className="text-famous-list">
            {text.famousLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {text.notes?.length ? (
        <section className="text-section">
          <div className="text-section-head">
            <h2>注释</h2>
            <span className="text-hint">{text.notes.length} 条</span>
          </div>
          <dl className="text-notes">
            {text.notes.map((n) => (
              <div key={n.term} className="text-note">
                <dt>{n.term}</dt>
                <dd>{n.gloss}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {text.hardChars?.length ? (
        <section className="text-section">
          <div className="text-section-head">
            <h2>易错字</h2>
          </div>
          <ul className="text-hardchars">
            {text.hardChars.map((h) => (
              <li key={h.text}>
                <b>{h.text}</b>
                <span>{h.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="text-section">
        <div className="text-section-head">
          <h2>赏析</h2>
        </div>
        <div className="text-appreciation">
          <Markdown source={text.appreciation} />
        </div>
      </section>

      {text.examNote ? (
        <aside className="text-exam-note">
          <Icon name="target" />
          <div>
            <strong>高考提示</strong>
            <p>{text.examNote}</p>
          </div>
        </aside>
      ) : null}

      <section className="text-section">
        <div className="text-section-head">
          <h2>本篇题目</h2>
          <span className="text-hint">{related.length} 题</span>
        </div>
        {related.length === 0 ? (
          <p className="text-hint">这一篇还没有配题。</p>
        ) : (
          <ul className="text-question-list">
            {related.map((q) => {
              const touched = Boolean(data.cards[q.id]);
              const recites: Record<string, string> = {
                direct: '直接默写',
                context: '理解性默写',
                word: '字词',
                culture: '常识手法',
                appreciation: '鉴赏',
              };
              return (
                <li key={q.id}>
                  <button
                    className="text-question"
                    onClick={() => startQueue(`${text.title} · 单题`, [q.id])}
                  >
                    <div className="text-question-top">
                      <span className="text-question-type">
                        {q.recite ? recites[q.recite] ?? typeLabel(q.type) : typeLabel(q.type)}
                      </span>
                      <DifficultyDots value={q.difficulty} />
                      {touched ? <span className="text-done">已练</span> : null}
                    </div>
                    <p className="text-question-stem">{truncate(plainText(q.stem, 100), 100)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}