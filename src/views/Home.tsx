import { useApp } from '../state/AppState';
import { computeSubjectMastery, weakKps } from '../engine/mastery';
import { computeStreak, history } from '../engine/stats';
import { computeCivilization } from '../engine/game';
import { planDaily } from '../engine/planner';
import { progressOf } from '../engine/session';
import {
  dateKey,
  formatDate,
  greeting,
  pct,
  percent,
  weekdayCN,
} from '../lib/format';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';
import {
  MasteryBadge,
  Meter,
  SectionHead,
  StatTile,
} from '../components/ui';

export function Home() {
  const { data, content, questions, kpStats, planCtx, startSession, toast } = useApp();
  const now = Date.now();
  const plan = planDaily(planCtx);
  const today = data.dailyLog[dateKey(now)];
  const streak = computeStreak(data.dailyLog, now);
  const civ = computeCivilization(data, questions, kpStats);
  const weak = weakKps(content.kps, kpStats, 4);
  const week = history(data, 7, now);
  const weekMax = Math.max(1, ...week.map((d) => d.entry?.count ?? 0));
  const weekTotal = week.reduce((s, d) => s + (d.entry?.count ?? 0), 0);

  const dueBySubject = new Map<string, number>();
  for (const card of Object.values(data.cards)) {
    if (card.due > now) continue;
    const q = content.questionsById.get(card.qid);
    if (!q) continue;
    dueBySubject.set(q.subjectId, (dueBySubject.get(q.subjectId) ?? 0) + 1);
  }

  const hasPlan = plan.dueTotal > 0 || plan.fresh.length > 0;
  const estimatedMin = hasPlan
    ? Math.max(1, Math.round(plan.dueTotal * 0.8 + plan.fresh.length * 1.7))
    : 0;

  const startDaily = () => {
    const ok = startSession('daily', {
      label: '今日学习',
      count: 0,
      reveal: 'immediate',
    });
    if (!ok) toast('今天没有待学内容，去科目里自由练习吧');
  };

  const practiceKp = (kpId: string, name: string) => {
    const ok = startSession('kp', {
      label: name,
      kpId,
      count: 5,
      reveal: 'immediate',
    });
    if (!ok) toast('这个知识点还没有题目');
  };

  const activeSession = data.session && !data.session.finishedAt ? data.session : null;

  return (
    <div className="view">
      <header className="home-head">
        <div>
          <p className="eyebrow">
            {greeting(now)} · {formatDate(now)} 周{weekdayCN(now)}
          </p>
          <h1 className="brand">
            知星<span className="brand-dot" />
          </h1>
        </div>
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="设置">
          <Icon name="sliders" />
        </button>
      </header>

      <section className="hero card">
        <div className="hero-glow" />
        <div className="hero-top">
          <span className="chip">
            <Icon name="target" size={14} /> 今日任务
          </span>
          {streak > 0 && (
            <span className="chip chip--flame">
              <Icon name="flame" size={14} /> 连续 {streak} 天
            </span>
          )}
        </div>

        <div className="hero-nums">
          <div>
            <b>{plan.dueTotal}</b>
            <span>待复习</span>
          </div>
          <div>
            <b>{plan.fresh.length}</b>
            <span>今日新题</span>
          </div>
          <div>
            <b>{estimatedMin}</b>
            <span>预计分钟</span>
          </div>
        </div>

        <button
          className="btn btn--primary btn--lg hero-btn"
          onClick={startDaily}
          disabled={!hasPlan}
        >
          <Icon name="play" size={18} filled />
          {hasPlan ? '开始今日学习' : '今日任务已完成'}
        </button>

        <p className="hero-note">
          {!hasPlan
            ? '今天没有待复习和新题了。去科目里自由练习，或明天再来。'
            : today
              ? `今天已答 ${today.count} 题 · 正确率 ${percent(today.count ? today.correct / today.count : 0)}`
              : '今天还没开始。先做一组小题，把节奏找回来。'}
        </p>
      </section>

      {activeSession && (
        <button className="resume card" onClick={() => navigate('/session')}>
          <span className="resume-icon">
            <Icon name="timer" />
          </span>
          <span className="resume-main">
            <strong>继续上次学习</strong>
            <span>
              {activeSession.config.label} · 已完成{' '}
              {Object.keys(activeSession.answers).length}/{activeSession.queue.length}
            </span>
            <Meter
              value={
                progressOf(activeSession).total === 0
                  ? 0
                  : progressOf(activeSession).answered / progressOf(activeSession).total
              }
              height={4}
            />
          </span>
          <Icon name="chevron-right" />
        </button>
      )}

      <section className="civ card">
        <div className="civ-top">
          <div className="civ-title">
            <span className="civ-mark">
              <Icon name="sparkles" size={16} />
            </span>
            <div>
              <strong>文明档案</strong>
              <span>游戏层预览 · 学习即建设</span>
            </div>
          </div>
          <span className="civ-level">Lv.{civ.level}</span>
        </div>

        <div className="civ-bar">
          <Meter value={civ.levelNeed === 0 ? 0 : civ.levelInto / civ.levelNeed} height={7} />
          <span className="civ-bar-label">
            {civ.levelInto} / {civ.levelNeed} XP
          </span>
        </div>

        <div className="civ-stats">
          <StatTile label="点亮星球" value={`${civ.litSystems}/${civ.totalSystems}`} sub="掌握度 ≥ 60%" />
          <StatTile label="舰队战力" value={civ.fleetPower} sub="由学习经验转化" />
          <StatTile label="累计答题" value={civ.totalAnswered} sub={`正确率 ${pct(civ.accuracy)}`} />
        </div>
      </section>

      {weak.length > 0 && (
        <section className="block">
          <SectionHead
            title="薄弱知识点"
            hint="按掌握度排序，优先补洞"
            action={
              <button className="text-btn" onClick={() => navigate('/star')}>
                看星图 <Icon name="chevron-right" size={14} />
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
                    <Meter
                      value={stat?.mastery ?? null}
                      tone={stat?.mastery != null && stat.mastery < 0.55 ? 'weak' : 'accent'}
                      height={4}
                    />
                  </div>
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      practiceKp(kp.id, kp.name);
                    }}
                  >
                    练
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="block">
        <SectionHead
          title="科目"
          hint="每个科目是一张独立星图"
          action={
            <button className="text-btn" onClick={() => navigate('/subjects')}>
              全部 <Icon name="chevron-right" size={14} />
            </button>
          }
        />
        <div className="subject-scroll">
          {content.subjects.map((subject) => {
            const mastery = computeSubjectMastery(subject.id, content.kps, kpStats);
            const kpCount = content.kpsBySubject.get(subject.id)?.length ?? 0;
            const due = dueBySubject.get(subject.id) ?? 0;
            return (
              <button
                key={subject.id}
                className="subject-card"
                style={{ ['--subject' as string]: subject.color }}
                onClick={() => navigate(`/subject/${subject.id}`)}
              >
                <div className="subject-card-top">
                  <span className="subject-name">{subject.name}</span>
                  <span className="subject-pct">{pct(mastery)}</span>
                </div>
                <Meter value={mastery} tone="accent" height={5} />
                <div className="subject-card-meta">
                  <span>{kpCount} 个知识点</span>
                  <span className={due > 0 ? 'is-due' : ''}>
                    {due > 0 ? `${due} 张到期` : '无到期'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="week card">
        <div className="week-head">
          <span>最近 7 天</span>
          <span>{weekTotal} 题</span>
        </div>
        <div className="week-bars">
          {week.map((day) => {
            const count = day.entry?.count ?? 0;
            const h = count === 0 ? 3 : Math.max(8, (count / weekMax) * 100);
            return (
              <div className="week-col" key={day.key}>
                <div className="week-bar-wrap">
                  <div
                    className={`week-bar ${count === 0 ? 'is-empty' : ''}`}
                    style={{ height: `${h}%` }}
                    title={`${day.key} · ${count} 题`}
                  />
                </div>
                <span>{weekdayCN(new Date(`${day.key}T00:00:00`).getTime())}</span>
              </div>
            );
          })}
        </div>
      </section>

      <p className="footnote">保持每天一小步，星图会自己亮起来。</p>
    </div>
  );
}
