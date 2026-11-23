import { useMemo } from 'react';
import { useApp } from '../state/AppState';
import {
  masteryBand,
  weakKps,
} from '../engine/mastery';
import {
  attemptTotals,
  computeStreak,
  history,
  subjectAccuracy,
} from '../engine/stats';
import { typeLabel } from '../lib/answers';
import { percent, pct, relativeTime, weekdayCN } from '../lib/format';
import { plainText } from '../lib/text';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';
import {
  MasteryBadge,
  Meter,
  PageHeader,
  SectionHead,
  StatTile,
} from '../components/ui';

const BAND_TONES: Record<string, string> = {
  未探索: 'none',
  薄弱: 'weak',
  待巩固: 'shaky',
  一般: 'ok',
  熟练: 'good',
  精通: 'mastered',
};

export function Stats() {
  const { data, content, questions, kpStats } = useApp();
  const totals = attemptTotals(data.attempts);
  const streak = computeStreak(data.dailyLog);
  const accuracyBySubject = subjectAccuracy(data.attempts, questions);
  const days = history(data, 14);
  const maxDay = Math.max(1, ...days.map((d) => d.entry?.count ?? 0));
  const total14 = days.reduce((s, d) => s + (d.entry?.count ?? 0), 0);
  const weak = weakKps(content.kps, kpStats, 6);

  const bands = useMemo(() => {
    const order = ['未探索', '薄弱', '待巩固', '一般', '熟练', '精通'];
    const map = new Map(order.map((label) => [label, 0]));
    for (const kp of content.kps) {
      const label = masteryBand(kpStats.get(kp.id)?.mastery ?? null).label;
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return order.map((label) => ({
      label,
      count: map.get(label) ?? 0,
      tone: BAND_TONES[label] ?? 'none',
    }));
  }, [content.kps, kpStats]);

  const explored = content.kps.filter((kp) => (kpStats.get(kp.id)?.attempts ?? 0) > 0).length;
  const recent = data.attempts.slice(-8).reverse();

  return (
    <div className="view">
      <PageHeader title="统计" subtitle="数据只存在这台设备" />

      <div className="overview-strip overview-strip--four">
        <StatTile label="累计答题" value={totals.count} sub={`${totals.correct} 道正确`} />
        <StatTile label="正确率" value={pct(totals.accuracy)} sub="全部作答" />
        <StatTile label="连续学习" value={`${streak} 天`} sub="今天没学不算断" tone={streak > 0 ? 'ok' : undefined} />
        <StatTile label="覆盖知识点" value={`${explored}/${content.kps.length}`} sub="做过至少一道题" />
      </div>

      <section className="card chart-card">
        <div className="chart-head">
          <div>
            <h2>近 14 天</h2>
            <p>柱高是该日答题量，浅色部分为正确率</p>
          </div>
          <span className="chart-total">{total14} 题</span>
        </div>
        <div className="day-bars">
          {days.map((day, i) => {
            const entry = day.entry;
            const count = entry?.count ?? 0;
            const h = count === 0 ? 2 : Math.max(8, (count / maxDay) * 100);
            const acc = count > 0 ? (entry?.correct ?? 0) / count : 0;
            return (
              <div className="day-col" key={day.key}>
                <div className="day-bar-wrap" title={`${day.key} · ${count} 题 · 正确率 ${percent(acc)}`}>
                  <span
                    className={`day-bar ${count === 0 ? 'is-empty' : ''}`}
                    style={{ height: `${h}%` }}
                  />
                  {count > 0 && (
                    <span className="day-bar-acc" style={{ height: `${h * acc}%` }} />
                  )}
                </div>
                <span className="day-label">
                  {i % 2 === 0 ? weekdayCN(new Date(`${day.key}T00:00:00`).getTime()) : ''}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="block">
        <SectionHead title="科目正确率" hint="按全部作答统计，不等同于掌握度" />
        <div className="card accuracy-list">
          {content.subjects.map((subject) => {
            const acc = accuracyBySubject.get(subject.id);
            return (
              <div key={subject.id} className="accuracy-row">
                <span className="accuracy-name">
                  <i className="subject-dot" style={{ ['--subject' as string]: subject.color }} />
                  {subject.name}
                </span>
                <Meter
                  value={acc?.accuracy ?? null}
                  tone="accent"
                  height={5}
                  className="accuracy-meter"
                />
                <span className="accuracy-value">
                  {acc ? `${pct(acc.accuracy)} · ${acc.count} 题` : '未开始'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="block">
        <SectionHead title="掌握度分布" hint="掌握度 ≥ 60% 的星球会被点亮" />
        <div className="card">
          <div className="stack-bar" role="img" aria-label="掌握度分布">
            {bands.map((b) =>
              b.count > 0 ? (
                <span
                  key={b.label}
                  className={`stack-seg tone-${b.tone}`}
                  style={{ flex: b.count }}
                  title={`${b.label} ${b.count}`}
                />
              ) : null,
            )}
          </div>
          <div className="legend-grid">
            {bands.map((b) => (
              <div key={b.label} className="legend-item">
                <i className={`legend-swatch tone-${b.tone}`} />
                <span>{b.label}</span>
                <strong>{b.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {weak.length > 0 && (
        <section className="block">
          <SectionHead
            title="最该补的洞"
            hint="掌握度最低的知识点"
            action={
              <button className="text-btn" onClick={() => navigate('/star')}>
                星图 <Icon name="chevron-right" size={14} />
              </button>
            }
          />
          <div className="list">
            {weak.map((kp) => {
              const stat = kpStats.get(kp.id);
              return (
                <div
                  key={kp.id}
                  className="row kp-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/kp/${kp.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/kp/${kp.id}`);
                  }}
                >
                  <div className="kp-row-main">
                    <div className="kp-row-title">
                      <span
                        className="subject-dot"
                        style={{
                          ['--subject' as string]:
                            content.subjectsById.get(kp.subjectId)?.color ?? 'var(--accent)',
                        }}
                      />
                      <strong>{kp.name}</strong>
                      <MasteryBadge mastery={stat?.mastery ?? null} />
                    </div>
                    <Meter value={stat?.mastery ?? null} tone="weak" height={4} />
                  </div>
                  <Icon name="chevron-right" size={16} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="block">
        <SectionHead title="最近作答" hint="最新的 8 次" />
        {recent.length === 0 ? (
          <p className="quiet">还没有作答记录。</p>
        ) : (
          <div className="q-list">
            {recent.map((a) => {
              const q = questions.find((item) => item.id === a.qid);
              if (!q) return null;
              return (
                <div key={a.id} className="q-row">
                  <span className={`review-index tone-${a.correct ? 'ok' : 'bad'}`}>
                    <Icon name={a.correct ? 'check' : 'x'} size={13} />
                  </span>
                  <div className="q-row-main">
                    <div className="q-row-meta">
                      <span className="q-type">{typeLabel(q.type)}</span>
                      <span className="quiet small">{relativeTime(a.ts)}</span>
                    </div>
                    <p className="q-row-stem">{plainText(q.stem, 90)}</p>
                  </div>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => q.kpIds[0] && navigate(`/kp/${q.kpIds[0]}`)}
                  >
                    理论
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
