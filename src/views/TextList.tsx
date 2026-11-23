import { useMemo, useState } from 'react';
import { useApp } from '../state/AppState';
import { TEXTS } from '../content/texts';
import { navigate, goBack } from '../lib/router';
import { PageHeader, EmptyState } from '../components/ui';
import { Icon } from '../components/Icon';
import type { TextGenre, TextItem } from '../types';

const GENRE_ORDER: TextGenre[] = ['诗', '词', '曲', '文', '赋', '辞'];

export function TextList() {
  const { questions, data, update, startQueue, toast } = useApp();
  const [keyword, setKeyword] = useState('');
  const [genre, setGenre] = useState<TextGenre | 'all'>('all');
  const [onlyEnabled, setOnlyEnabled] = useState(false);

  const disabled = useMemo(
    () => new Set(data.settings.disabledTexts ?? []),
    [data.settings.disabledTexts],
  );

  const setEnabled = (textId: string, enabled: boolean) => {
    update((prev) => {
      const current = new Set(prev.settings.disabledTexts ?? []);
      if (enabled) current.delete(textId);
      else current.add(textId);
      return {
        ...prev,
        settings: { ...prev.settings, disabledTexts: [...current] },
      };
    });
  };

  const setAllEnabled = (enabled: boolean) => {
    update((prev) => ({
      ...prev,
      settings: { ...prev.settings, disabledTexts: enabled ? [] : TEXTS.texts.map((t) => t.id) },
    }));
    toast(enabled ? '已启用全部篇目' : '已停用全部篇目');
  };

  const countByText = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions) {
      if (!q.textId) continue;
      map.set(q.textId, (map.get(q.textId) ?? 0) + 1);
    }
    return map;
  }, [questions]);

  const touchedByText = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions) {
      if (!q.textId || !data.cards[q.id]) continue;
      map.set(q.textId, (map.get(q.textId) ?? 0) + 1);
    }
    return map;
  }, [questions, data.cards]);

  const texts = TEXTS.texts;
  const enabledCount = texts.length - disabled.size;
  const totalQuestions = useMemo(
    () => questions.filter((q) => q.textId).length,
    [questions],
  );

  /** 默写专项只从「已启用」的篇目抽题 */
  const drillIds = useMemo(
    () =>
      questions
        .filter(
          (q) =>
            q.textId &&
            !disabled.has(q.textId) &&
            q.type === 'fill' &&
            (q.recite === 'direct' || q.recite === 'context'),
        )
        .map((q) => q.id),
    [questions, disabled],
  );

  const startDrill = () => {
    if (!drillIds.length) {
      toast('已启用的篇目里还没有默写题');
      return;
    }
    const pool = [...drillIds];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const ok = startQueue(`默写专项 · ${Math.min(20, pool.length)} 题`, pool.slice(0, 20), 'random');
    if (!ok) toast('题目不存在');
  };

  /** 一键练习所有启用篇目的抽句题 */
  const startEnabledPractice = () => {
    const ids = questions
      .filter((q) => q.textId && !disabled.has(q.textId))
      .map((q) => q.id);
    if (!ids.length) {
      toast('没有可练习的篇目');
      return;
    }
    const pool = [...ids];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    startQueue(`古诗文 · ${Math.min(20, pool.length)} 题`, pool.slice(0, 20), 'random');
  };

  const list = useMemo(() => {
    const kw = keyword.trim();
    return texts
      .filter((t) => (genre === 'all' ? true : t.genre === genre))
      .filter((t) => (onlyEnabled ? !disabled.has(t.id) : true))
      .filter((t) => {
        if (!kw) return true;
        const blob = `${t.title}${t.author ?? ''}${t.dynasty ?? ''}${t.source ?? ''}${(t.famousLines ?? []).join('')}`;
        return blob.includes(kw);
      })
      .sort((a, b) => {
        const ga = GENRE_ORDER.indexOf(a.genre);
        const gb = GENRE_ORDER.indexOf(b.genre);
        if (ga !== gb) return ga - gb;
        return (a.dynasty ?? '').localeCompare(b.dynasty ?? '');
      });
  }, [texts, keyword, genre, onlyEnabled, disabled]);

  const grouped = useMemo(() => {
    const map = new Map<TextGenre, TextItem[]>();
    for (const t of list) {
      const arr = map.get(t.genre) ?? [];
      arr.push(t);
      map.set(t.genre, arr);
    }
    return map;
  }, [list]);

  return (
    <div className="view text-view">
      <PageHeader
        title="古诗文栏目"
        subtitle={`${texts.length} 篇 · ${totalQuestions} 题 · 启用 ${enabledCount} 篇`}
        back={() => goBack('/subjects')}
      />

      <div className="text-drill">
        <div className="text-drill-main">
          <strong>默写专项</strong>
          <p>
            {drillIds.length} 道从原文抽句的默写题，只在已启用的 {enabledCount} 篇里抽，随机 20 道一组。
          </p>
          <div className="text-drill-actions">
            <button
              className="btn btn--primary btn--sm"
              onClick={startDrill}
              disabled={drillIds.length === 0}
            >
              开始默写
            </button>
            <button className="btn btn--ghost btn--sm" onClick={startEnabledPractice}>
              练启用篇目
            </button>
          </div>
        </div>
      </div>

      <div className="text-toolbar">
        <input
          className="text-search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜篇名、作者、名句"
          inputMode="search"
        />
        <div className="text-enable-bar">
          <span>
            启用 <b>{enabledCount}</b> / {texts.length}
          </span>
          <div className="text-enable-actions">
            <button
              className={`chip ${onlyEnabled ? 'is-active' : ''}`}
              onClick={() => setOnlyEnabled((v) => !v)}
            >
              只看启用
            </button>
            <button className="chip" onClick={() => setAllEnabled(true)}>
              全启用
            </button>
            <button className="chip" onClick={() => setAllEnabled(false)}>
              全停用
            </button>
          </div>
        </div>
        <div className="chips">
          <button
            className={`chip ${genre === 'all' ? 'is-active' : ''}`}
            onClick={() => setGenre('all')}
          >
            全部 {texts.length}
          </button>
          {GENRE_ORDER.map((g) => {
            const n = texts.filter((t) => t.genre === g).length;
            if (!n) return null;
            return (
              <button
                key={g}
                className={`chip ${genre === g ? 'is-active' : ''}`}
                onClick={() => setGenre(g)}
              >
                {g} {n}
              </button>
            );
          })}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon="book"
          title="没有匹配的篇目"
          desc="换个关键词，或切回「全部」"
        />
      ) : (
        GENRE_ORDER.filter((g) => grouped.has(g)).map((g) => (
          <section key={g} className="text-group">
            <h2 className="text-group-title">
              {g}
              <span>{grouped.get(g)!.length}</span>
            </h2>
            <div className="text-cards">
              {grouped.get(g)!.map((t) => {
                const total = countByText.get(t.id) ?? 0;
                const done = touchedByText.get(t.id) ?? 0;
                const on = !disabled.has(t.id);
                return (
                  <article
                    key={t.id}
                    className={`text-card ${on ? '' : 'is-off'}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/text/${t.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/text/${t.id}`);
                    }}
                  >
                    <div className="text-card-head">
                      <h3>{t.title}</h3>
                      <div className="text-card-tags">
                        {t.excerpt ? <span className="text-tag">节选</span> : null}
                        <button
                          className={`text-toggle ${on ? 'is-on' : ''}`}
                          aria-pressed={on}
                          aria-label={on ? '停用这篇' : '启用这篇'}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEnabled(t.id, !on);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <span className="text-toggle-dot" />
                          {on ? '已启用' : '已停用'}
                        </button>
                      </div>
                    </div>
                    <p className="text-meta">
                      {[t.author, t.dynasty, t.source].filter(Boolean).join(' · ')}
                    </p>
                    {t.famousLines?.[0] ? (
                      <p className="text-quote">{t.famousLines[0]}</p>
                    ) : null}
                    <footer className="text-card-foot">
                      <span>
                        {total} 题
                        {done > 0 ? ` · 已练 ${done}` : ''}
                      </span>
                      <span className="text-go">
                        <Icon name="chevron-right" size={13} />
                      </span>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
