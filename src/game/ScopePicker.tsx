import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgePoint, Subject } from '../types';
import { Icon } from '../components/Icon';

/* ============================================================
 * 战斗出题范围选择器
 * 三级结构：科目 → 板块(group) → 知识点(kp)
 *   - 点科目：整科全选 / 全不选
 *   - 点板块：整块全选 / 全不选
 *   - 点知识点：单选切换
 *   - 子项被点满时，父级自动显示为全选；父级全选后取消一个子项，
 *     父级立刻降级为「部分选中」。全部由 Set 推导，不需要额外状态。
 * ============================================================ */

export interface ScopePickerProps {
  subjects: Subject[];
  kps: KnowledgePoint[];
  picked: Set<string>;
  onChange: (next: Set<string>) => void;
  /** 每个知识点有多少道可出战的题 */
  countByKp: Map<string, number>;
}

interface GroupBlock {
  name: string;
  kps: KnowledgePoint[];
}

export function ScopePicker({ subjects, kps, picked, onChange, countByKp }: ScopePickerProps) {
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());

  const bySubject = useMemo(() => {
    const map = new Map<string, { groups: GroupBlock[]; all: KnowledgePoint[] }>();
    for (const subject of subjects) {
      const own = kps.filter((kp) => kp.subjectId === subject.id);
      const blocks = new Map<string, KnowledgePoint[]>();
      for (const kp of own) {
        const name = kp.group ?? '其他';
        const arr = blocks.get(name) ?? [];
        arr.push(kp);
        blocks.set(name, arr);
      }
      map.set(subject.id, {
        groups: [...blocks.entries()].map(([name, list]) => ({ name, kps: list })),
        all: own,
      });
    }
    return map;
  }, [subjects, kps]);

  /* 首次展开时，把「已选中知识点的科目」直接展开；一个都没选就展开第一个科目，
   * 免得进来只看到一排折叠的科目标题，还要多点一次才知道能细化到知识点。 */
  const initedRef = useRef(false);
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    const open = new Set<string>();
    for (const subject of subjects) {
      const own = kps.filter((kp) => kp.subjectId === subject.id);
      if (own.length === 0) continue;
      if (own.some((kp) => picked.has(kp.id))) open.add(subject.id);
    }
    if (open.size === 0) {
      const first = subjects.find((subject) =>
        kps.some((kp) => kp.subjectId === subject.id),
      );
      if (first) open.add(first.id);
    }
    if (open.size > 0) setOpenSubjects(open);
  }, [subjects, kps, picked]);

  const toggleMany = (ids: string[], select: boolean) => {
    const next = new Set(picked);
    for (const id of ids) {
      if (select) next.add(id);
      else next.delete(id);
    }
    onChange(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleExpanded = (subjectId: string) => {
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  return (
    <div className="bt-scope">
      {subjects.map((subject) => {
        const entry = bySubject.get(subject.id);
        if (!entry || entry.all.length === 0) return null;
        const ids = entry.all.map((kp) => kp.id);
        const selected = ids.filter((id) => picked.has(id)).length;
        const state = selected === 0 ? 'none' : selected === ids.length ? 'all' : 'some';
        const open = openSubjects.has(subject.id);
        const questions = entry.all.reduce((sum, kp) => sum + (countByKp.get(kp.id) ?? 0), 0);

        return (
          <div key={subject.id} className={`bt-scope-subject is-${state}`}>
            <div className="bt-scope-head">
              <button
                className="bt-scope-check"
                aria-label={state === 'all' ? `取消${subject.name}` : `全选${subject.name}`}
                aria-pressed={state === 'all'}
                onClick={() => toggleMany(ids, state !== 'all')}
              >
                <span className="bt-scope-box">
                  {state === 'all' ? (
                    <Icon name="check" size={12} />
                  ) : state === 'some' ? (
                    <i className="bt-scope-dash" />
                  ) : null}
                </span>
                <span
                  className="bt-scope-orb"
                  style={{ background: subject.color, boxShadow: `0 0 10px ${subject.color}` }}
                />
                <span className="bt-scope-name">{subject.name}</span>
                <span className="bt-scope-meta">
                  {selected > 0 ? `${selected}/${ids.length} 知识点` : `${ids.length} 知识点`}
                  <em>{questions} 题</em>
                </span>
              </button>
              <button
                className={`bt-scope-expand ${open ? 'is-open' : ''}`}
                onClick={() => toggleExpanded(subject.id)}
                aria-label={open ? '收起知识点' : '展开知识点'}
                aria-expanded={open}
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>

            {open && (
              <div className="bt-scope-body">
                {entry.groups.map((group) => {
                  const gids = group.kps.map((kp) => kp.id);
                  const gsel = gids.filter((id) => picked.has(id)).length;
                  const gstate = gsel === 0 ? 'none' : gsel === gids.length ? 'all' : 'some';
                  return (
                    <div key={group.name} className={`bt-scope-group is-${gstate}`}>
                      <button
                        className="bt-scope-group-head"
                        onClick={() => toggleMany(gids, gstate !== 'all')}
                        aria-pressed={gstate === 'all'}
                      >
                        <span className="bt-scope-box bt-scope-box--sm">
                          {gstate === 'all' ? (
                            <Icon name="check" size={10} />
                          ) : gstate === 'some' ? (
                            <i className="bt-scope-dash" />
                          ) : null}
                        </span>
                        <span className="bt-scope-group-name">{group.name}</span>
                        <span className="bt-scope-group-count">
                          {gstate === 'some' ? `${gsel}/${gids.length}` : gids.length}
                        </span>
                      </button>
                      <div className="bt-scope-kps">
                        {group.kps.map((kp) => {
                          const on = picked.has(kp.id);
                          const n = countByKp.get(kp.id) ?? 0;
                          return (
                            <button
                              key={kp.id}
                              className={`bt-scope-kp ${on ? 'is-on' : ''} ${n === 0 ? 'is-empty' : ''}`}
                              onClick={() => toggleOne(kp.id)}
                              aria-pressed={on}
                              title={n === 0 ? '这个知识点暂时没有可出战的文本题' : `${n} 题`}
                            >
                              {kp.name}
                              <em>{n}</em>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
