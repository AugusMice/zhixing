import { useMemo, useState } from 'react';
import { useApp } from '../state/AppState';
import { computeSubjectMastery, masteryBand } from '../engine/mastery';
import { cardStage } from '../engine/srs';
import { toggleFavorite } from '../engine/store';
import { pct } from '../lib/format';
import { plainText } from '../lib/text';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';
import {
  DifficultyDots,
  EmptyState,
  MasteryBadge,
  Meter,
  PageHeader,
  Ring,
  SectionHead,
  StatTile,
} from '../components/ui';
import type { KnowledgePoint, QuestionType } from '../types';
import { TEXTS } from '../content/texts';

const TYPE_FILTERS: Array<{ key: 'all' | QuestionType; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'single', label: '单选' },
  { key: 'multiple', label: '多选' },
  { key: 'judge', label: '判断' },
  { key: 'fill', label: '填空' },
  { key: 'short', label: '大题' },
];

function orderKps(kps: KnowledgePoint[]): KnowledgePoint[] {
  const byId = new Map(kps.map((k) => [k.id, k]));
  const out: KnowledgePoint[] = [];
  const seen = new Set<string>();
  const visit = (kp: KnowledgePoint) => {
    if (seen.has(kp.id)) return;
    seen.add(kp.id);
    for (const p of kp.parents) {
      const parent = byId.get(p);
      if (parent) visit(parent);
    }
    out.push(kp);
  };
  for (const kp of kps) visit(kp);
  return out;
}

export function SubjectDetail({ subjectId }: { subjectId: string }) {
  const { data, content, kpStats, planCtx, startSession, startQueue, update, toast } = useApp();
  const subject = content.subjectsById.get(subjectId);
  const [qQuery, setQQuery] = useState('');
  const [qType, setQType] = useState<'all' | QuestionType>('all');
  const [qLimit, setQLimit] = useState(30);

  if (!subject) {
    return (
      <div className="view">
        <PageHeader title="科目" back={() => navigate('/subjects')} />
        <EmptyState title="没有这个科目" desc="可能是链接过期，或者内容还没加载。" />
      </div>
    );
  }

  const kps = orderKps(content.kpsBySubject.get(subject.id) ?? []);
  const questions = content.questionsBySubject.get(subject.id) ?? [];
  const mastery = computeSubjectMastery(subject.id, content.kps, kpStats);
  const attempted = questions.filter((q) => data.cards[q.id]).length;
  const due = questions.filter((q) => {
    const c = data.cards[q.id];
    return c != null && c.due <= Date.now();
  }).length;
  const exploredKps = kps.filter((kp) => (kpStats.get(kp.id)?.attempts ?? 0) > 0).length;

  const kw = qQuery.trim();
  const filteredQs = questions.filter((q) => {
    if (qType !== 'all' && q.type !== qType) return false;
    if (!kw) return true;
    return (
      q.stem.includes(kw) ||
      (q.source ?? '').includes(kw) ||
      (q.tags ?? []).some((tag) => tag.includes(kw))
    );
  });
  const shownQs = filteredQs.slice(0, qLimit);
  const grouped = new Map<string, KnowledgePoint[]>();
  for (const kp of kps) {
    const key = kp.group ?? '未分组';
    const list = grouped.get(key);
    if (list) list.push(kp);
    else grouped.set(key, [kp]);
  }
  const groups = [...grouped.entries()].map(([name, items]) => {
    const attempts = items.filter((kp) => (kpStats.get(kp.id)?.attempts ?? 0) > 0).length;
    const values = items
      .map((kp) => kpStats.get(kp.id)?.mastery)
      .filter((v): v is number => v != null);
    const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return { name, items, attempts, avg };
  });

  const startSubject = () => {
    const ok = startSession('subject', {
      label: `${subject.name} · 练习`,
      subjectId: subject.id,
      count: Math.min(10, questions.length),
      reveal: 'immediate',
    });
    if (!ok) toast('这个科目还没有题目');
  };

  const practiceKp = (kp: KnowledgePoint) => {
    const ok = startSession('kp', {
      label: kp.name,
      kpId: kp.id,
      count: 5,
      reveal: 'immediate',
    });
    if (!ok) toast('这个知识点还没有题目');
  };

  return (
    <div className="view">
      <PageHeader
        title={subject.name}
        subtitle={`${kps.length} 个知识点 · ${questions.length} 道题`}
        back={() => navigate('/subjects')}
        right={
          <button
            className="icon-btn"
            onClick={() => navigate(`/star?subject=${subject.id}`)}
            aria-label="打开星图"
          >
            <Icon name="star" />
          </button>
        }
      />

      {subject.id === 'chinese' && TEXTS.texts.length > 0 ? (
        <button className="subject-texts-entry" onClick={() => navigate('/texts')}>
          <Icon name="book" size={18} />
          <span>
            古诗文栏目
            <em>{TEXTS.texts.length} 篇必背原文 · 注释 · 赏析 · 抽句默写</em>
          </span>
          <Icon name="chevron-right" size={18} />
        </button>
      ) : null}

      <section
        className="card subject-hero"
        style={{ ['--subject' as string]: subject.color }}
      >
        <div className="subject-hero-main">
          <div>
            <span className="eyebrow">本科掌握度</span>
            <div className="subject-hero-score">
              <MasteryBadge mastery={mastery} />
            </div>
            <p className="subject-hero-note">
              {mastery == null
                ? '还没有开始。先做几道题，星图会亮起来。'
                : mastery < 0.55
                  ? '基础还不稳，建议从薄弱知识点逐点突破。'
                  : '保持节奏，用到期复习维持记忆。'}
            </p>
          </div>
          <Ring
            value={mastery}
            size={84}
            stroke={7}
            color={subject.color}
            label={pct(mastery)}
            sub="掌握"
          />
        </div>
        <div className="subject-hero-stats">
          <StatTile label="已探索知识点" value={`${exploredKps}/${kps.length}`} />
          <StatTile label="做过的题" value={`${attempted}/${questions.length}`} />
          <StatTile label="到期复习" value={due} tone={due > 0 ? 'warn' : undefined} />
        </div>
        <div className="subject-hero-actions">
          <button className="btn btn--primary" onClick={startSubject}>
            <Icon name="play" size={16} filled /> 开始练习
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => navigate(`/star?subject=${subject.id}`)}
          >
            <Icon name="star" size={16} /> 星图
          </button>
        </div>
      </section>

      <section className="block">
        <SectionHead title="知识板块" hint="先从大板块进入，再逐颗点亮小知识点" />
        <div className="kp-groups">
          {groups.map((group, groupIdx) => (
            <details key={group.name} className="kp-group" open={groupIdx === 0}>
              <summary className="kp-group-head">
                <div>
                  <strong>{group.name}</strong>
                  <span>
                    {group.items.length} 个知识点 · 已探索 {group.attempts}
                  </span>
                </div>
                <div className="kp-group-score">
                  <MasteryBadge mastery={group.avg} />
                  <Icon name="chevron-right" size={16} />
                </div>
              </summary>
              <div className="kp-list kp-list--group">
                {group.items.map((kp, idx) => {
                  const stat = kpStats.get(kp.id);
                  const band = masteryBand(stat?.mastery ?? null);
                  const qCount = planCtx.questionCountByKp.get(kp.id) ?? 0;
                  return (
                    <div
                      key={kp.id}
                      className="kp-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/kp/${kp.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/kp/${kp.id}`);
                      }}
                    >
                      <span className={`kp-index tone-${band.tone}`}>{idx + 1}</span>
                      <div className="kp-item-main">
                        <div className="kp-item-title">
                          <strong>{kp.name}</strong>
                          <MasteryBadge mastery={stat?.mastery ?? null} />
                        </div>
                        <p className="kp-item-desc">
                          {kp.description ? plainText(kp.description, 52) : '暂无说明'}
                        </p>
                        <div className="kp-item-meta">
                          <span>{qCount} 道题</span>
                          {stat?.attempts ? (
                            <span>已答 {stat.attempts} 次</span>
                          ) : (
                            <span>未探索</span>
                          )}
                          <Meter value={stat?.mastery ?? null} height={4} />
                        </div>
                      </div>
                      <button
                        className="btn btn--ghost btn--sm"
                        disabled={qCount === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          practiceKp(kp);
                        }}
                      >
                        练
                      </button>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="block">
        <SectionHead
          title="题库"
          hint={`共 ${questions.length} 道 · 点「做」单练一题`}
          action={
            <button className="text-btn" onClick={startSubject}>
              随机 {Math.min(10, questions.length)} 题
            </button>
          }
        />
        <div className="q-toolbar">
          <div className="q-search">
            <Icon name="search" size={16} />
            <input
              value={qQuery}
              onChange={(e) => {
                setQQuery(e.target.value);
                setQLimit(30);
              }}
              placeholder="搜索题干、来源或标签"
              inputMode="search"
            />
            {qQuery ? (
              <button className="icon-btn" onClick={() => setQQuery('')} aria-label="清除">
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
          <div className="chips chips--scroll">
            {TYPE_FILTERS.map((t) => (
              <button
                key={t.key}
                className={`chip ${qType === t.key ? 'is-on' : ''}`}
                onClick={() => {
                  setQType(t.key);
                  setQLimit(30);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {shownQs.length === 0 ? (
          <EmptyState title="没有匹配的题目" desc="换个关键词或题型试试。" />
        ) : (
          <div className="q-list">
            {shownQs.map((q) => {
            const card = data.cards[q.id];
            const stage = cardStage(card);
            const fav = data.favorites.includes(q.id);
            return (
              <div key={q.id} className="q-row">
                <div className="q-row-main">
                  <div className="q-row-meta">
                    <span className="q-type">{q.type === 'short' ? '大题' : q.type === 'fill' ? '填空' : q.type === 'judge' ? '判断' : q.type === 'multiple' ? '多选' : '单选'}</span>
                    <DifficultyDots value={q.difficulty} />
                    <span className={`q-stage tone-${stage.tone}`}>{stage.label}</span>
                  </div>
                  <p className="q-row-stem">{plainText(q.stem, 110)}</p>
                </div>
                <button
                  className={`icon-btn ${fav ? 'is-fav' : ''}`}
                  onClick={() => update((d) => toggleFavorite(d, q.id))}
                  aria-label={fav ? '取消收藏' : '收藏'}
                >
                  <Icon name="star" size={18} filled={fav} />
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    const ok = startQueue(`单题 · ${subject.name}`, [q.id]);
                    if (!ok) toast('题目不存在');
                  }}
                >
                  做
                </button>
              </div>
            );
          })}
          </div>
        )}
        {filteredQs.length > shownQs.length ? (
          <button className="btn btn--ghost btn--block" onClick={() => setQLimit((n) => n + 50)}>
            再显示 {Math.min(50, filteredQs.length - shownQs.length)} 道（剩余{' '}
            {filteredQs.length - shownQs.length}）
          </button>
        ) : null}
      </section>
    </div>
  );
}
