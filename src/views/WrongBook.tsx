import { useMemo, useState } from 'react';
import { useApp } from '../state/AppState';
import { removeWrong } from '../engine/store';
import { typeLabel } from '../lib/answers';
import { relativeTime } from '../lib/format';
import { plainText } from '../lib/text';
import { navigate } from '../lib/router';
import type { Question, WrongEntry } from '../types';
import { Icon } from '../components/Icon';
import {
  EmptyState,
  PageHeader,
  SectionHead,
  StatTile,
  SubjectTag,
} from '../components/ui';

export function WrongBook() {
  const { data, content, questionsById, startSession, startQueue, update, toast } = useApp();
  const [filter, setFilter] = useState('all');

  const entries = useMemo(() => {
    const list: { entry: WrongEntry; question: Question }[] = [];
    for (const entry of Object.values(data.wrong)) {
      const question = questionsById.get(entry.qid);
      if (question) list.push({ entry, question });
    }
    return list.sort((a, b) => b.entry.lastAt - a.entry.lastAt);
  }, [data.wrong, questionsById]);

  const visible = filter === 'all' ? entries : entries.filter((e) => e.question.subjectId === filter);
  const subjectCounts = new Map<string, number>();
  for (const e of entries) {
    subjectCounts.set(e.question.subjectId, (subjectCounts.get(e.question.subjectId) ?? 0) + 1);
  }
  const nearGraduate = entries.filter((e) => e.entry.streak === 1).length;

  const practiceAll = () => {
    const ok = startSession('wrong', {
      label: '错题重练',
      count: 10,
      reveal: 'immediate',
    });
    if (!ok) toast('错题本是空的');
  };

  return (
    <div className="view">
      <PageHeader
        title="错题本"
        subtitle="连续答对两次，自动移出"
        right={
          entries.length > 0 ? (
            <button className="icon-btn" onClick={practiceAll} aria-label="重练错题">
              <Icon name="play" />
            </button>
          ) : undefined
        }
      />

      <div className="overview-strip">
        <StatTile label="待消灭" value={entries.length} sub="道错题" tone={entries.length > 0 ? 'warn' : undefined} />
        <StatTile label="只差一次" value={nearGraduate} sub="连对 1 次" />
        <StatTile label="涉及科目" value={subjectCounts.size} sub="按科目筛选" />
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon="check"
          title="错题本是空的"
          desc="答错的题会自动进来；连续答对两次就毕业。"
          action={
            <button className="btn btn--primary" onClick={() => navigate('/subjects')}>
              去练习
            </button>
          }
        />
      ) : (
        <>
          <div className="filter-row">
            <button
              className={`chip ${filter === 'all' ? 'is-on' : ''}`}
              onClick={() => setFilter('all')}
            >
              全部 {entries.length}
            </button>
            {content.subjects.map((s) => {
              const count = subjectCounts.get(s.id) ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={s.id}
                  className={`chip ${filter === s.id ? 'is-on' : ''}`}
                  style={{ ['--subject' as string]: s.color }}
                  onClick={() => setFilter(s.id)}
                >
                  <i className="subject-dot" /> {s.name} {count}
                </button>
              );
            })}
          </div>

          <section className="block">
            <SectionHead
              title={filter === 'all' ? '全部错题' : '本科错题'}
              hint="点「重做」单练，答对两次后自动移除"
              action={
                <button className="text-btn" onClick={practiceAll}>
                  重练 10 题
                </button>
              }
            />
            <div className="wrong-list">
              {visible.map(({ entry, question }) => {
                const subject = content.subjectsById.get(question.subjectId);
                return (
                  <div key={entry.qid} className="wrong-card card">
                    <div className="wrong-card-head">
                      <div className="wrong-card-tags">
                        <SubjectTag subject={subject} size="sm" />
                        <span className="q-type">{typeLabel(question.type)}</span>
                      </div>
                      <button
                        className="icon-btn icon-btn--sm"
                        aria-label="移出错题本"
                        onClick={() => update((d) => removeWrong(d, entry.qid))}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                    <p className="wrong-card-stem">{plainText(question.stem, 120)}</p>
                    <div className="wrong-card-meta">
                      <span className="wrong-count">错 {entry.count} 次</span>
                      <span className="wrong-streak">
                        连对
                        <i className={entry.streak >= 1 ? 'on' : ''} />
                        <i className={entry.streak >= 2 ? 'on' : ''} />
                      </span>
                      <span className="quiet small">{relativeTime(entry.lastAt)}</span>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          const ok = startQueue(`错题 · ${subject?.name ?? ''}`, [entry.qid]);
                          if (!ok) toast('题目已不存在');
                        }}
                      >
                        重做
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {visible.length === 0 && (
              <EmptyState title="这个科目没有错题" desc="换一个筛选看看。" />
            )}
          </section>
        </>
      )}
    </div>
  );
}
