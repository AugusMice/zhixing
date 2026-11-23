import { useApp } from '../state/AppState';
import { computeSubjectMastery } from '../engine/mastery';
import { subjectAccuracy } from '../engine/stats';
import { pct } from '../lib/format';
import { navigate } from '../lib/router';
import { Icon } from '../components/Icon';
import { PageHeader, Ring, StatTile } from '../components/ui';
import { PAPERS, paperQuestions } from '../papers';
import type { Subject } from '../types';

export function Subjects() {
  const { content, data, questions, kpStats, startSession, toast } = useApp();
  const firstPaper = PAPERS[0];
  const accuracy = subjectAccuracy(data.attempts, questions);
  const dueBySubject = new Map<string, number>();
  for (const card of Object.values(data.cards)) {
    if (card.due > Date.now()) continue;
    const q = content.questionsById.get(card.qid);
    if (!q) continue;
    dueBySubject.set(q.subjectId, (dueBySubject.get(q.subjectId) ?? 0) + 1);
  }

  const totalDue = Array.from(dueBySubject.values()).reduce((s, n) => s + n, 0);

  const startSubject = (subject: Subject) => {
    const total = content.questionsBySubject.get(subject.id)?.length ?? 0;
    const ok = startSession('subject', {
      label: `${subject.name} · 练习`,
      subjectId: subject.id,
      count: Math.min(10, total),
      reveal: 'immediate',
    });
    if (!ok) toast('这个科目还没有题目');
  };

  return (
    <div className="view">
      <PageHeader
        title="科目"
        subtitle="题库、知识点与星图"
        right={<span className="quiet">{content.questions.length} 题</span>}
      />

      <div className="overview-strip">
        <StatTile label="知识点" value={content.kps.length} sub={`覆盖 ${content.subjects.length} 个科目`} />
        <StatTile label="待复习" value={totalDue} sub="跨科目到期卡片" tone={totalDue > 0 ? 'warn' : undefined} />
        <StatTile
          label="题库"
          value={content.questions.length}
          sub={`${data.favorites.length} 道收藏`}
        />
      </div>

      <section className="card total-map-card" onClick={() => navigate('/star')}>
        <div className="total-map-visual" aria-hidden="true">
          <span className="total-map-core" />
          {content.subjects.map((s, i) => (
            <i
              key={s.id}
              style={{
                background: s.color,
                transform: `rotate(${(i / content.subjects.length) * 360}deg) translateX(34px)`,
              }}
            />
          ))}
        </div>
        <div className="total-map-copy">
          <span className="exam-eyebrow">
            <Icon name="star" size={13} /> 知识总星图
          </span>
          <h2>{content.kps.length} 颗星球，一张总图</h2>
          <p>六科知识总览：固定树状看结构，原子图看实时引力下的联系。</p>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={() => navigate('/star')}>
          进入总图 <Icon name="chevron-right" size={14} />
        </button>
      </section>

      {firstPaper && (
        <section className="card paper-entry-card">
          <div className="paper-entry-visual" aria-hidden="true">
            <span>2026</span>
            <em>CH</em>
          </div>
          <div className="paper-entry-copy">
            <span className="exam-eyebrow">
              <Icon name="book" size={13} /> 真题库 · 试验卷
            </span>
            <h2>{firstPaper.shortTitle}</h2>
            <p>
              {paperQuestions(firstPaper).length} 道题，图片题干版。可看卷面、限时做选择题，成绩会计入复习队列。
            </p>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => navigate(`/paper/${firstPaper.id}`)}
          >
            打开预览 <Icon name="chevron-right" size={14} />
          </button>
        </section>
      )}

      <section className="card exam-card">
        <div className="exam-copy">
          <span className="exam-eyebrow">
            <Icon name="timer" size={13} /> 模拟组卷
          </span>
          <h2>综合测验</h2>
          <p>跨科目轮流抽题，交卷后统一看答案，用来检验整张卷子的节奏。</p>
        </div>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => {
            const ok = startSession('exam', {
              label: '综合测验',
              subjectIds: content.subjects.map((s) => s.id),
              count: Math.min(20, content.questions.length),
              reveal: 'end',
              timeLimitMin: 30,
            });
            if (!ok) toast('题库还是空的');
          }}
        >
          <Icon name="play" size={14} filled /> 开始组卷
        </button>
        <div className="exam-meta">
          <span>{Math.min(20, content.questions.length)} 题</span>
          <span>建议 30 分钟</span>
          <span>交卷前不显示答案</span>
        </div>
      </section>

      <div className="hub-grid">
        <button type="button" className="card hub-card" onClick={() => navigate('/texts')}>
          <span className="hub-icon">
            <Icon name="book" size={18} />
          </span>
          <span className="hub-title">古诗文栏目</span>
          <span className="hub-desc">必背篇目的原文、注释、译文与赏析，默写题从原文抽句考</span>
        </button>
        <button type="button" className="card hub-card" onClick={() => navigate('/paper-import')}>
          <span className="hub-icon">
            <Icon name="upload" size={18} />
          </span>
          <span className="hub-title">录入真题</span>
          <span className="hub-desc">按题号裁好图片，向导里填答案与知识点，导出即可入库</span>
        </button>
        <button type="button" className="card hub-card" onClick={() => navigate('/battle')}>
          <span className="hub-icon">
            <Icon name="target" size={18} />
          </span>
          <span className="hub-title">星域战斗</span>
          <span className="hub-desc">答对即命中，用薄弱知识点打穿敌方舰队</span>
        </button>
      </div>

      <div className="subject-list">
        {content.subjects.map((subject) => {
          const mastery = computeSubjectMastery(subject.id, content.kps, kpStats);
          const kps = content.kpsBySubject.get(subject.id) ?? [];
          const qs = content.questionsBySubject.get(subject.id) ?? [];
          const due = dueBySubject.get(subject.id) ?? 0;
          const acc = accuracy.get(subject.id);
          return (
            <section
              key={subject.id}
              className="card subject-block"
              style={{ ['--subject' as string]: subject.color }}
            >
              <div className="subject-block-head">
                <div className="subject-block-title">
                  <span className="subject-orb" />
                  <div>
                    <h2>{subject.name}</h2>
                    <p>
                      {kps.length} 个知识点 · {qs.length} 道题
                    </p>
                  </div>
                </div>
                <Ring value={mastery} size={54} color={subject.color} />
              </div>

              <div className="subject-block-meta">
                <span className={due > 0 ? 'is-due' : ''}>
                  <Icon name="timer" size={14} /> {due > 0 ? `${due} 张到期` : '暂无到期'}
                </span>
                <span>
                  <Icon name="target" size={14} /> 正确率 {pct(acc?.accuracy ?? null)}
                </span>
              </div>

              <div className="subject-block-actions">
                <button className="btn btn--primary btn--sm" onClick={() => startSubject(subject)}>
                  <Icon name="play" size={14} filled /> 练习 {Math.min(10, qs.length)} 题
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigate(`/subject/${subject.id}`)}
                >
                  进入科目
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => navigate(`/star?subject=${subject.id}`)}
                >
                  <Icon name="star" size={14} /> 星图
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
