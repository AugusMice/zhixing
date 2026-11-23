import { useApp } from '../state/AppState';
import { cardStage } from '../engine/srs';
import { masteryBand } from '../engine/mastery';
import { pct } from '../lib/format';
import { plainText } from '../lib/text';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import {
  DifficultyDots,
  EmptyState,
  MasteryBadge,
  Meter,
  PageHeader,
  Ring,
  SectionHead,
  StatTile,
  SubjectTag,
} from '../components/ui';

export function KpDetail({ kpId }: { kpId: string }) {
  const { data, content, questions, kpStats, startSession, startQueue, toast } = useApp();
  const kp = content.kpsById.get(kpId);

  if (!kp) {
    return (
      <div className="view">
        <PageHeader title="知识点" back={() => navigate('/subjects')} />
        <EmptyState title="没有这个知识点" desc="可能是链接过期，或者内容还没加载。" />
      </div>
    );
  }

  const subject = content.subjectsById.get(kp.subjectId);
  const stat = kpStats.get(kp.id);
  const band = masteryBand(stat?.mastery ?? null);
  const related = questions.filter((q) => q.kpIds.includes(kp.id));
  const parents = kp.parents
    .map((id) => content.kpsById.get(id))
    .filter((k): k is NonNullable<typeof k> => k != null);
  const children = content.kps.filter((k) => k.parents.includes(kp.id));
  const due = related.filter((q) => {
    const c = data.cards[q.id];
    return c != null && c.due <= Date.now();
  }).length;

  const practice = () => {
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
        title={kp.name}
        subtitle={subject ? `${subject.name} · ${related.length} 道题` : undefined}
        back={() => navigate(`/subject/${kp.subjectId}`)}
        right={
          <button
            className="icon-btn"
            onClick={() => navigate(`/star?subject=${kp.subjectId}&focus=${kp.id}`)}
            aria-label="在星图中查看"
          >
            <Icon name="star" />
          </button>
        }
      />

      <section className="card kp-hero">
        <div className="kp-hero-top">
          <div className="kp-hero-copy">
            <div className="kp-hero-tags">
              <SubjectTag subject={subject} size="sm" />
              <MasteryBadge mastery={stat?.mastery ?? null} />
            </div>
            <h2 className="kp-hero-title">{kp.name}</h2>
            <p className="kp-hero-desc">
              {related.length === 0
                ? '这个知识点还没有配题，可以先看理论。'
                : stat?.attempts
                  ? `已作答 ${stat.attempts} 次，正确率 ${pct(stat.attempts ? stat.correct / stat.attempts : null)}。保持到期复习，记忆会更牢。`
                  : '还没有开始。先做一道题，星图会记录你的第一次接触。'}
            </p>
            <div className="kp-hero-actions">
              <button className="btn btn--primary" onClick={practice}>
                <Icon name="play" size={16} filled /> 练习这个知识点
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => navigate(`/star?subject=${kp.subjectId}&focus=${kp.id}`)}
              >
                <Icon name="star" size={16} /> 星图
              </button>
            </div>
          </div>
          <Ring value={stat?.mastery ?? null} size={92} stroke={7} color={subject?.color ?? 'var(--accent)'} label={band.label} />
        </div>

        <div className="kp-hero-stats">
          <StatTile label="掌握度" value={pct(stat?.mastery ?? null)} sub={band.label} />
          <StatTile label="作答次数" value={stat?.attempts ?? 0} sub={`做过 ${stat?.attemptedQuestions ?? 0}/${related.length} 题`} />
          <StatTile label="到期复习" value={due} tone={due > 0 ? 'warn' : undefined} sub="按 SRS 排程" />
        </div>
      </section>

      {kp.description && (
        <section className="block">
          <SectionHead title="理论速览" hint="来自内容库的 Markdown / 公式" />
          <div className="card prose">
            <Markdown source={kp.description} />
          </div>
        </section>
      )}

      {(parents.length > 0 || children.length > 0) && (
        <section className="block">
          <SectionHead title="知识航道" hint="从哪来，往哪去" />
          <div className="card link-panel">
            {parents.length > 0 && (
              <div className="link-group">
                <span className="link-label">前置</span>
                <div className="chip-row">
                  {parents.map((p) => (
                    <button key={p.id} className="chip" onClick={() => navigate(`/kp/${p.id}`)}>
                      <Icon name="arrow-left" size={12} /> {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {children.length > 0 && (
              <div className="link-group">
                <span className="link-label">后继</span>
                <div className="chip-row">
                  {children.map((p) => (
                    <button key={p.id} className="chip" onClick={() => navigate(`/kp/${p.id}`)}>
                      {p.name} <Icon name="chevron-right" size={12} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="block">
        <SectionHead
          title="相关题目"
          hint={`${related.length} 道 · 按掌握度与到期排序`}
          action={
            <button className="text-btn" onClick={practice}>
              随机 5 题
            </button>
          }
        />
        {related.length === 0 ? (
          <EmptyState
            icon="book"
            title="还没有配题"
            desc="可以先去读书或补充内容库，再回来练习。"
          />
        ) : (
          <div className="q-list">
            {related.map((q) => {
              const card = data.cards[q.id];
              const stage = cardStage(card);
              return (
                <div key={q.id} className="q-row">
                  <div className="q-row-main">
                    <div className="q-row-meta">
                      <span className="q-type">
                        {q.type === 'short'
                          ? '大题'
                          : q.type === 'fill'
                            ? '填空'
                            : q.type === 'judge'
                              ? '判断'
                              : q.type === 'multiple'
                                ? '多选'
                                : '单选'}
                      </span>
                      <DifficultyDots value={q.difficulty} />
                      <span className={`q-stage tone-${stage.tone}`}>{stage.label}</span>
                    </div>
                    <p className="q-row-stem">{plainText(q.stem, 110)}</p>
                  </div>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => {
                      const ok = startQueue(`单题 · ${kp.name}`, [q.id]);
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
      </section>

      <section className="block">
        <SectionHead title="掌握度" hint="最近 21 天加权，越近的作答权重越高" />
        <div className="card">
          <Meter value={stat?.mastery ?? null} height={8} />
          <p className="quiet small" style={{ marginTop: 10 }}>
            掌握度按「题目难度 × 时间衰减」累计，并做了贝叶斯平滑；刚接触时会偏保守。
          </p>
        </div>
      </section>
    </div>
  );
}
