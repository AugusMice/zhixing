import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppState';
import {
  anchorPositions,
  layoutAllKnowledge,
  layoutKnowledgeGraph,
  type GraphBlock,
  type GraphEdge,
  type GraphNode,
} from '../lib/knowledgeGraph';
import { computeKpMetrics, metricApplicable, metricValue, type KnowledgeColorMode, type KpMetric } from '../engine/knowledge';
import { computeSubjectMastery } from '../engine/mastery';
import { pct } from '../lib/format';
import { DEFAULT_GIANT_NAMES, loadGiantNames, saveGiantNames, loadGiantPhrases, saveGiantPhrases, DEFAULT_GIANT_PHRASES, type GiantPhraseKind } from '../lib/giantNames';
import { navigate, goBack } from '../lib/router';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { MasteryBadge, SubjectTag, Sheet } from '../components/ui';
import {
  DEFAULT_FORCES,
  DEFAULT_MOTES,
  ForceGraphCanvas,
  type ForceGraphHandle,
  type ForceSettings,
  type MoteSettings,
  type GiantEvent,
} from '../components/ForceGraphCanvas';

type LayoutMode = 'tree' | 'net';

const COLOR_LABEL: Record<KnowledgeColorMode, string> = {
  mastery: '掌握',
  strength: '优势',
  weakness: '劣势',
  exam: '考频',
  weight: '重难',
};

const COLOR_HEX: Record<KnowledgeColorMode, string> = {
  mastery: '#6ea8fe',
  strength: '#34d399',
  weakness: '#fb7185',
  exam: '#fbbf24',
  weight: '#a78bfa',
};

const FORCE_STORAGE = 'zhixing.graph.forces';
const MOTE_STORAGE = 'zhixing.mote.settings';

const FORCE_FIELDS: {
  key: keyof ForceSettings;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: 'center', label: '向心力', hint: '把节点拉向中心', min: 0, max: 2, step: 0.01 },
  { key: 'repel', label: '斥力', hint: '节点互相推开', min: 0, max: 100, step: 0.5 },
  { key: 'link', label: '连杆力', hint: '有联系的节点拉近', min: 0, max: 5, step: 0.01 },
  { key: 'distance', label: '连杆距离', hint: '有联系节点的目标距离', min: 20, max: 1200, step: 5 },
];

const MOTE_FIELDS: {
  key: 'count' | 'attract' | 'repel' | 'center' | 'bond';
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}[] = [
  { key: 'count', label: '游离元素数量', hint: '背景中漂浮的元素颗数', min: 0, max: 160, step: 1 },
  { key: 'attract', label: '相互引力', hint: '元素之间靠近的力度', min: 0, max: 10, step: 0.1 },
  { key: 'repel', label: '短距斥力', hint: '靠太近时的推开力度', min: 0, max: 10, step: 0.1 },
  { key: 'center', label: '向心引力', hint: '把逃逸元素拉回视野中心', min: 0, max: 3, step: 0.01 },
  { key: 'bond', label: '成键距离', hint: '小于该距离的两个元素会连成键', min: 2, max: 200, step: 1 },
];

function loadForces(): ForceSettings {
  try {
    const raw = localStorage.getItem(FORCE_STORAGE);
    if (!raw) return DEFAULT_FORCES;
    const value = JSON.parse(raw) as Partial<ForceSettings>;
    return {
      center: Number.isFinite(value.center) ? Math.min(50, Math.max(0, value.center!)) : DEFAULT_FORCES.center,
      repel: Number.isFinite(value.repel) ? Math.min(20000, Math.max(0, value.repel!)) : DEFAULT_FORCES.repel,
      link: Number.isFinite(value.link) ? Math.min(100, Math.max(0, value.link!)) : DEFAULT_FORCES.link,
      distance: Number.isFinite(value.distance)
        ? Math.min(20000, Math.max(1, value.distance!))
        : DEFAULT_FORCES.distance,
    };
  } catch {
    return DEFAULT_FORCES;
  }
}

function loadMotes(): MoteSettings {
  try {
    const raw = localStorage.getItem(MOTE_STORAGE);
    if (!raw) return DEFAULT_MOTES;
    const value = JSON.parse(raw) as Partial<MoteSettings>;
    const n = (v: unknown, fallback: number, min: number, max: number) =>
      Number.isFinite(v) ? Math.min(max, Math.max(min, Number(v))) : fallback;
    const lifeMin = n(value.lifeMin, DEFAULT_MOTES.lifeMin, 1, 86400);
    const lifeMax = Math.max(lifeMin + 10, n(value.lifeMax, DEFAULT_MOTES.lifeMax, 1, 86400));
    return {
      count: Math.round(n(value.count, DEFAULT_MOTES.count, 0, 2000)),
      attract: n(value.attract, DEFAULT_MOTES.attract, 0, 1000),
      repel: n(value.repel, DEFAULT_MOTES.repel, 0, 1000),
      center: n(value.center, DEFAULT_MOTES.center, 0, 100),
      bond: n(value.bond, DEFAULT_MOTES.bond, 1, 2000),
      lifeMin,
      lifeMax: Math.min(86400, lifeMax),
    };
  } catch {
    return DEFAULT_MOTES;
  }
}

function shortGroup(name: string | null): string {
  if (!name) return '全部板块';
  return name
    .replace(/^选择性必修\s*\d+\s*/, '')
    .replace(/^必修\s*\d+\s*/, '')
    .replace(/^《/, '')
    .replace(/》$/, '');
}

export function StarMapView({
  initialSubjectId,
  focusId,
}: {
  initialSubjectId?: string;
  focusId?: string;
}) {
  const { content, data, kpStats, planCtx, startSession, toast } = useApp();
  const [subjectId, setSubjectId] = useState<string>(
    initialSubjectId && content.subjectsById.has(initialSubjectId) ? initialSubjectId : 'all',
  );
  const [groupId, setGroupId] = useState<string | null>(() => {
    if (!initialSubjectId || initialSubjectId === 'all') return null;
    const kp = focusId ? content.kpsById.get(focusId) : undefined;
    return kp && kp.subjectId === initialSubjectId ? (kp.group ?? null) : null;
  });
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('net');
  const [colorMode, setColorMode] = useState<KnowledgeColorMode>('mastery');
  const [selectedId, setSelectedId] = useState<string | null>(
    focusId && content.kpsById.has(focusId) ? focusId : null,
  );
  const [query, setQuery] = useState('');
  const [forces, setForces] = useState<ForceSettings>(loadForces);
  const [motes, setMotes] = useState<MoteSettings>(loadMotes);
  const [forceOpen, setForceOpen] = useState(false);
  const [giantNames, setGiantNames] = useState<string[]>(loadGiantNames);
  const [giantInput, setGiantInput] = useState('');
  const [bornLines, setBornLines] = useState<string[]>(() => loadGiantPhrases('born'));
  const [growLines, setGrowLines] = useState<string[]>(() => loadGiantPhrases('grow'));
  const [devourLines, setDevourLines] = useState<string[]>(() => loadGiantPhrases('devour'));
  const [dieLines, setDieLines] = useState<string[]>(() => loadGiantPhrases('die'));
  const [feed, setFeed] = useState<{ id: number; text: string; kind: string }[]>([]);
  const feedId = useRef(0);
  const feedTimers = useRef<number[]>([]);
  const graphRef = useRef<ForceGraphHandle>(null);

  useEffect(() => {
    saveGiantNames(giantNames);
  }, [giantNames]);

  useEffect(() => {
    saveGiantPhrases('born', bornLines);
  }, [bornLines]);

  useEffect(() => {
    saveGiantPhrases('grow', growLines);
  }, [growLines]);

  useEffect(() => {
    saveGiantPhrases('devour', devourLines);
  }, [devourLines]);

  useEffect(() => {
    saveGiantPhrases('die', dieLines);
  }, [dieLines]);

  useEffect(() => () => {
    for (const timer of feedTimers.current) window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FORCE_STORAGE, JSON.stringify(forces));
    } catch {
      // localStorage 不可用时只用当前会话内的参数。
    }
  }, [forces]);

  useEffect(() => {
    try {
      localStorage.setItem(MOTE_STORAGE, JSON.stringify(motes));
    } catch {
      // localStorage 不可用时只用当前会话内的参数。
    }
  }, [motes]);

  const patchForces = (patch: Partial<ForceSettings>) =>
    setForces((current) => ({ ...current, ...patch }));

  const patchMotes = (patch: Partial<MoteSettings>) =>
    setMotes((current) => {
      const next = { ...current, ...patch };
      if (patch.count != null) next.count = Math.round(Math.max(0, next.count));
      if (!Number.isFinite(next.lifeMin)) next.lifeMin = current.lifeMin;
      if (!Number.isFinite(next.lifeMax)) next.lifeMax = current.lifeMax;
      next.lifeMin = Math.max(1, Math.min(86400, next.lifeMin));
      next.lifeMax = Math.max(1, Math.min(86400, next.lifeMax));
      if (next.lifeMin > next.lifeMax - 10) {
        if (patch.lifeMin != null) next.lifeMax = Math.min(86400, next.lifeMin + 10);
        else next.lifeMin = Math.max(1, next.lifeMax - 10);
      }
      return next;
    });

  const addGiantName = () => {
    const name = giantInput.trim().slice(0, 12);
    if (!name) return;
    setGiantNames((current) => (current.includes(name) ? current : [...current, name].slice(0, 24)));
    setGiantInput('');
  };

  const removeGiantName = (name: string) => {
    setGiantNames((current) => (current.length <= 1 ? current : current.filter((x) => x !== name)));
  };

  const pushFeed = (event: GiantEvent) => {
    const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)] ?? '';
    let text = '';
    if (event.kind === 'born') text = `${event.name} ${pick(bornLines)}`;
    else if (event.kind === 'grow') text = `${event.name} ${pick(growLines)}`;
    else if (event.kind === 'die') text = `${event.name} ${pick(dieLines)}`;
    else text = `${event.name} ${pick(devourLines)} ${event.other ?? ''}`.trim();
    const id = ++feedId.current;
    setFeed((current) => [...current.slice(-3), { id, text, kind: event.kind }]);
    const timer = window.setTimeout(() => {
      setFeed((current) => current.filter((item) => item.id !== id));
      feedTimers.current = feedTimers.current.filter((t) => t !== timer);
    }, 5600);
    feedTimers.current.push(timer);
  };

  const all = subjectId === 'all';
  const subject = all ? undefined : content.subjectsById.get(subjectId);
  const isAllKps = all;

  const dueByKp = useMemo(() => {
    const map = new Map<string, number>();
    const now = Date.now();
    for (const q of planCtx.questions) {
      const card = data.cards[q.id];
      if (!card || card.due > now) continue;
      for (const kpId of q.kpIds) map.set(kpId, (map.get(kpId) ?? 0) + 1);
    }
    return map;
  }, [planCtx.questions, data.cards]);

  const subjectKps = all ? [] : (content.kpsBySubject.get(subjectId) ?? []);
  const groupNames = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const kp of subjectKps) {
      const name = kp.group ?? '未分组';
      if (seen.has(name)) continue;
      seen.add(name);
      order.push(name);
    }
    return order;
  }, [subjectKps]);

  const scopeKps = useMemo(() => {
    if (isAllKps) return content.kps;
    return groupId ? subjectKps.filter((kp) => (kp.group ?? '未分组') === groupId) : subjectKps;
  }, [isAllKps, content.kps, subjectKps, groupId]);

  const graph = useMemo(() => {
    if (all) return layoutAllKnowledge(content.subjects, content.kpsBySubject);
    return layoutKnowledgeGraph(scopeKps, !groupId);
  }, [all, content.subjects, content.kpsBySubject, scopeKps]);

  const focusLevels = useMemo(() => {
    if (!selectedId) return null;
    const levels = new Map<string, number>();
    levels.set(selectedId, 0);
    for (const edge of graph.edges) {
      if (edge.from === selectedId && !levels.has(edge.to)) levels.set(edge.to, 1);
      if (edge.to === selectedId && !levels.has(edge.from)) levels.set(edge.from, 1);
    }
    const first = [...levels.entries()].filter(([, level]) => level === 1).map(([id]) => id);
    for (const id of first) {
      for (const edge of graph.edges) {
        const other = edge.from === id ? edge.to : edge.to === id ? edge.from : null;
        if (other && !levels.has(other)) levels.set(other, 2);
      }
    }
    return levels;
  }, [selectedId, graph.edges]);

  const [drawerPos, setDrawerPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setDrawerPos(null);
      return;
    }
    let raf = 0;
    const started = performance.now();
    const tick = () => {
      const p = graphRef.current?.getScreenPoint(selectedId);
      if (p) {
        const canvasRect = document.querySelector('.kmap-canvas')?.getBoundingClientRect();
        const screenX = (canvasRect?.left ?? 0) + p.x;
        const screenY = (canvasRect?.top ?? 0) + p.y;
        const width = window.innerWidth;
        const panelW = Math.min(340, width - 24);
        const mobile = width < 700;
        const x = screenX + 28 + panelW > width - 12 ? screenX - panelW - 28 : screenX + 28;
        const panelH = Math.min(window.innerHeight * 0.44, 430);
        const below = screenY + 40;
        setDrawerPos({
          x: mobile ? 12 : Math.max(12, Math.min(width - panelW - 12, x)),
          y: mobile
            ? below + panelH < window.innerHeight - 12
              ? below
              : Math.max(84, screenY - panelH - 28)
            : Math.max(84, Math.min(window.innerHeight - 260, screenY - 120)),
        });
      }
      if (performance.now() - started < 900) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [selectedId, layoutMode, subjectId, groupId]);

  const anchors = useMemo(() => {
    if (all) return anchorPositions(graph.blocks);
    if (groupId || groupNames.length === 0) return undefined;
    const cx = graph.bounds.x + graph.bounds.w / 2;
    const cy = graph.bounds.y + graph.bounds.h / 2;
    const radius = Math.max(150, Math.min(graph.bounds.w, graph.bounds.h) * 0.44);
    const map = new Map<string, { x: number; y: number }>();
    groupNames.forEach((name, i) => {
      const angle = (i / groupNames.length) * Math.PI * 2 - Math.PI / 2;
      map.set(name, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    });
    return map;
  }, [all, graph.blocks, graph.bounds, groupId, groupNames]);

  const metrics = useMemo(
    () => computeKpMetrics(scopeKps, planCtx.questions, data.attempts, kpStats),
    [scopeKps, planCtx.questions, data.attempts, kpStats],
  );

  const colors = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of graph.nodes) {
      const metric = metrics.get(node.id);
      const subjectColor =
        all && colorMode === 'mastery'
          ? content.subjectsById.get(node.kp.subjectId)?.color
          : undefined;
      map.set(node.id, subjectColor ?? colorOf(metric, colorMode));
    }
    return map;
  }, [graph.nodes, metrics, colorMode, all, content.subjectsById]);

  const opacities = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of graph.nodes) map.set(node.id, opacityOf(metrics.get(node.id), colorMode));
    return map;
  }, [graph.nodes, metrics, colorMode]);

  const filtered = query.trim().toLowerCase();
  const hits = useMemo(
    () =>
      filtered
        ? graph.nodes
            .filter(
              (n) =>
                n.kp.name.toLowerCase().includes(filtered) ||
                (n.kp.description ?? '').toLowerCase().includes(filtered) ||
                (n.kp.group ?? '').toLowerCase().includes(filtered),
            )
            .sort((a, b) => {
              const an = a.kp.name.toLowerCase().includes(filtered) ? 0 : 1;
              const bn = b.kp.name.toLowerCase().includes(filtered) ? 0 : 1;
              if (an !== bn) return an - bn;
              return a.kp.name.localeCompare(b.kp.name, 'zh-CN');
            })
        : [],
    [filtered, graph.nodes],
  );
  const highlightIds = filtered ? new Set(hits.map((n) => n.id)) : null;

  const activeKp = selectedId ? content.kpsById.get(selectedId) : undefined;
  const activeMetric = selectedId ? metrics.get(selectedId) : undefined;
  const activeSubject = activeKp
    ? content.subjectsById.get(activeKp.subjectId)
    : subject;
  const childrenOfActive = activeKp
    ? content.kps.filter((kp) => kp.parents.includes(activeKp.id))
    : [];
  const relatedOfActive = activeKp
    ? (activeKp.related ?? []).map((id) => content.kpsById.get(id)).filter(Boolean)
    : [];
  const canPractice = activeKp
    ? (content.questionCountByKp.get(activeKp.id) ?? 0) > 0
    : false;

  const subjectMastery = subject ? computeSubjectMastery(subject.id, content.kps, kpStats) : null;
  const subjectDue = all
    ? content.kps.reduce((sum, kp) => sum + (dueByKp.get(kp.id) ?? 0), 0)
    : subjectKps.reduce((sum, kp) => sum + (dueByKp.get(kp.id) ?? 0), 0);
  const scopeDue = scopeKps.reduce((sum, kp) => sum + (dueByKp.get(kp.id) ?? 0), 0);
  const scopeLit = scopeKps.filter((kp) => (kpStats.get(kp.id)?.mastery ?? 0) >= 0.6).length;
  const hasAttempts = useMemo(
    () => [...metrics.values()].some((m) => m.attempts > 0),
    [metrics],
  );

  const enterSubject = (id: string) => {
    setSubjectId(id);
    setGroupId(null);
    setSelectedId(null);
    setQuery('');
  };

  const back = () => {
    if (groupId) {
      setGroupId(null);
      setSelectedId(null);
      setQuery('');
      return;
    }
    if (!all) {
      setSubjectId('all');
      setSelectedId(null);
      setQuery('');
      return;
    }
    goBack('/subjects');
  };

  const selectNode = (id: string) => {
    setSelectedId(id);
    setQuery('');
    graphRef.current?.focusNode(id);
  };

  const selectNodeById = (id: string) => {
    if (graph.nodes.some((n) => n.id === id)) {
      selectNode(id);
      return;
    }
    const kp = content.kpsById.get(id);
    if (kp) navigate(`/star?subject=${kp.subjectId}&focus=${kp.id}`);
  };

  const practice = (kpId: string, name: string) => {
    const count = content.questionCountByKp.get(kpId) ?? 0;
    if (count === 0) {
      toast('这个知识点还没有题，先看理论吧');
      navigate(`/kp/${kpId}`);
      return;
    }
    const ok = startSession('kp', {
      label: name,
      kpId,
      count: Math.min(5, count),
      reveal: 'immediate',
    });
    if (!ok) toast('这个知识点还没有题');
  };

  const changeLayout = (mode: LayoutMode) => {
    if (mode === 'tree' && !all && !groupId && groupNames.length > 0) {
      setGroupId(groupNames[0]);
      toast(`树状图按板块展开：${shortGroup(groupNames[0])}`);
    }
    setLayoutMode(mode);
  };

  return (
    <div className={`kmap kmap--subject kmap--${layoutMode}`}>
      <header className="kmap-head">
        <button className="icon-btn" onClick={back} aria-label={groupId ? '返回学科' : all ? '返回' : '返回总星图'}>
          <Icon name="arrow-left" />
        </button>
        <div className="kmap-title">
          <h1>{all ? '知识总星图' : subject?.name}</h1>
          <p>
            {all
              ? `${content.subjects.length} 个学科 · ${content.kps.length} 颗星球 · 已点亮 ${scopeLit}`
              : `${groupId ? `${shortGroup(groupId)} · ` : ''}${scopeKps.length} 颗星球 · 已点亮 ${scopeLit}${
                  subjectMastery != null ? ` · 掌握 ${pct(subjectMastery)}` : ''
                }${scopeDue > 0 ? ` · ${scopeDue} 道到期` : ''}`}
          </p>
        </div>
        <div className="kmap-head-actions">
          <button
            className="icon-btn"
            onClick={() => navigate(all ? '/subjects' : '/star')}
            aria-label={all ? '科目列表' : '总星图'}
            title={all ? '科目列表' : '总星图'}
          >
            <Icon name={all ? 'grid' : 'star'} />
          </button>
        </div>
      </header>

      {all ? (
        <div className="kmap-groups kmap-groups--inline kmap-subjects">
          <button className="kmap-group-chip is-on">全部学科</button>
          {content.subjects.map((s) => {
            const kps = content.kpsBySubject.get(s.id) ?? [];
            return (
              <button key={s.id} className="kmap-group-chip" onClick={() => enterSubject(s.id)}>
                <i className="kmap-subject-dot" style={{ background: s.color }} />
                {s.name}
                <small>{kps.length}</small>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="kmap-groups kmap-groups--inline">
          <button
            className={`kmap-group-chip ${groupId ? '' : 'is-on'}`}
            onClick={() => {
              setGroupId(null);
              setSelectedId(null);
              setQuery('');
            }}
          >
            全部板块
          </button>
          {groupNames.map((name) => (
            <button
              key={name}
              className={`kmap-group-chip ${groupId === name ? 'is-on' : ''}`}
              onClick={() => {
                setGroupId(name);
                setSelectedId(null);
                setQuery('');
              }}
            >
              {shortGroup(name)}
              <small>{subjectKps.filter((kp) => (kp.group ?? '未分组') === name).length}</small>
            </button>
          ))}
        </div>
      )}

      <div className="kmap-tools">
        <div className="kmap-modes" role="tablist" aria-label="着色模式">
          {(Object.keys(COLOR_LABEL) as KnowledgeColorMode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={colorMode === m}
              className={`kmap-mode ${colorMode === m ? 'is-on' : ''}`}
              style={{ ['--mode-color' as string]: COLOR_HEX[m] }}
              onClick={() => setColorMode(m)}
            >
              <i />
              {COLOR_LABEL[m]}
            </button>
          ))}
        </div>
        <label className="kmap-search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={all ? '搜索全图…' : '搜索当前板块…'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits[0]) {
                setQuery('');
                selectNode(hits[0].id);
              }
            }}
          />
          {query && (
            <button className="icon-btn icon-btn--tiny" onClick={() => setQuery('')} aria-label="清空">
              <Icon name="close" size={13} />
            </button>
          )}
        </label>
        <div className="kmap-layout-switch" role="group" aria-label="布局">
          <button
            className={layoutMode === 'tree' ? 'is-on' : ''}
            onClick={() => changeLayout('tree')}
            title="固定树状结构"
          >
            树状
          </button>
          <button
            className={layoutMode === 'net' ? 'is-on' : ''}
            onClick={() => setLayoutMode('net')}
            title="实时引力原子图"
          >
            原子
          </button>
        </div>
      </div>

      <div className="kmap-stage-wrap">
        <ForceGraphCanvas
          key={all ? `total:${layoutMode}` : `${subjectId}:${groupId ?? 'all'}`}
          ref={graphRef}
          nodes={graph.nodes}
          edges={graph.edges}
          blocks={all ? graph.blocks : undefined}
          anchors={anchors}
          colors={colors}
          opacities={opacities}
          selectedId={selectedId}
          highlightIds={highlightIds}
          focusLevels={focusLevels}
          initialView={graph.bounds}
          mode={layoutMode}
          forces={forces}
          motes={motes}
          giantNames={giantNames}
          onGiantEvent={pushFeed}
          onSelect={(id) => {
            if (id) selectNode(id);
            else setSelectedId(null);
          }}
        />

        {query.trim() && (
          <div className="kmap-search-hits">
            {hits.length === 0 ? (
              <span className="quiet">没有找到相关知识点</span>
            ) : (
              hits.slice(0, 7).map((n) => (
                <button key={n.id} className="kmap-hit" onClick={() => selectNode(n.id)}>
                  <span>{n.kp.name}</span>
                  <small>{n.kp.group}</small>
                </button>
              ))
            )}
          </div>
        )}

        <div className="kmap-zoom">
          <button onClick={() => setForceOpen(true)} aria-label="力参数" title="力参数">
            <Icon name="sliders" size={15} />
          </button>
          <button onClick={() => graphRef.current?.zoom(1.25)} aria-label="放大">
            ＋
          </button>
          <button onClick={() => graphRef.current?.zoom(0.8)} aria-label="缩小">
            −
          </button>
          <button onClick={() => graphRef.current?.resetView()} aria-label="重置视图">
            <Icon name="target" size={15} />
          </button>
        </div>

        <div className="kmap-hint">
          {layoutMode === 'tree' ? (
            <>
              树状 · 固定层级
              <span>从上到下分枝 · 滚轮缩放 · 点击星球看理论</span>
            </>
          ) : (
            <>
              原子图 · 实时引力
              <span>拖动/滚轮/双指缩放 · 节点越大，联系与考频越高</span>
            </>
          )}
        </div>
      </div>

        {activeKp && activeMetric && (
          <aside
            className="kp-drawer kp-drawer--floating"
            style={drawerPos ? { left: drawerPos.x, top: drawerPos.y } : undefined}
          >
            <div
              className="kp-drawer-head kp-drawer-head--drag"
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                const panel = (e.currentTarget as HTMLElement).parentElement;
                if (!panel) return;
                const rect = panel.getBoundingClientRect();
                const dx = e.clientX - rect.left;
                const dy = e.clientY - rect.top;
                const move = (ev: PointerEvent) => {
                  const width = window.innerWidth;
                  setDrawerPos({
                    x: Math.max(12, Math.min(width - 340, ev.clientX - dx)),
                    y: Math.max(72, Math.min(window.innerHeight - 120, ev.clientY - dy)),
                  });
                };
                const up = () => {
                  document.removeEventListener('pointermove', move);
                  document.removeEventListener('pointerup', up);
                };
                document.addEventListener('pointermove', move);
                document.addEventListener('pointerup', up);
                e.preventDefault();
              }}
            >
              <SubjectTag subject={activeSubject} size="sm" />
              <button className="icon-btn icon-btn--tiny" onClick={() => setSelectedId(null)} aria-label="关闭">
                <Icon name="close" size={15} />
              </button>
            </div>
            <h2>{activeKp.name}</h2>
            <div className="kp-drawer-sub">
              {activeKp.group && <span>{activeKp.group}</span>}
              <MasteryBadge mastery={activeMetric.mastery} />
            </div>
            <div className="kp-drawer-metrics">
              <div>
                <b>{activeMetric.questionCount}</b>
                <span>关联题量</span>
              </div>
              <div>
                <b>{pct(activeMetric.exam)}</b>
                <span>考频信号</span>
              </div>
              <div>
                <b>{pct(activeMetric.weight)}</b>
                <span>重难信号</span>
              </div>
              <div>
                <b>{activeMetric.attempts}</b>
                <span>作答次数</span>
              </div>
            </div>
            {activeKp.description && (
              <div className="kp-drawer-desc">
                <Markdown source={activeKp.description} />
              </div>
            )}
            {(activeKp.parents.length > 0 || childrenOfActive.length > 0 || relatedOfActive.length > 0) && (
              <div className="kp-drawer-links">
                {activeKp.parents.length > 0 && (
                  <div>
                    <span>上游</span>
                    {activeKp.parents.map((id) => {
                      const kp = content.kpsById.get(id);
                      return kp ? (
                        <button key={id} onClick={() => selectNodeById(id)}>
                          {kp.name}
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
                {childrenOfActive.length > 0 && (
                  <div>
                    <span>下游</span>
                    {childrenOfActive.map((kp) => (
                      <button key={kp.id} onClick={() => selectNodeById(kp.id)}>
                        {kp.name}
                      </button>
                    ))}
                  </div>
                )}
                {relatedOfActive.length > 0 && (
                  <div>
                    <span>相关</span>
                    {relatedOfActive.map((kp) =>
                      kp ? (
                        <button key={kp.id} onClick={() => selectNodeById(kp.id)}>
                          {kp.name}
                        </button>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="kp-drawer-actions">
              <button className="btn btn--primary" onClick={() => practice(activeKp.id, activeKp.name)}>
                <Icon name="play" size={15} />
                {canPractice ? '练 5 题' : '查看理论'}
              </button>
              <button className="btn btn--ghost" onClick={() => navigate(`/kp/${activeKp.id}`)}>
                知识点详情
              </button>
            </div>
          </aside>
        )}

      <Sheet
        open={forceOpen}
        onClose={() => setForceOpen(false)}
        title="力参数"
        footer={
          <button
            className="btn btn--ghost btn--block"
            onClick={() => {
              setForces(DEFAULT_FORCES);
              setMotes(DEFAULT_MOTES);
            }}
          >
            恢复全部默认
          </button>
        }
      >
        <div className="force-settings">
          <p className="force-settings-note">
            参考 Obsidian 默认：向心力 0.52 · 斥力 10 · 连杆力 1 · 连杆距离 250。
            原子图会实时响应；树状图保持固定结构。滑块范围有限，右侧可输入任意数值。
          </p>
          {FORCE_FIELDS.map((field) => (
            <label className="force-row" key={field.key}>
              <span className="force-row-head">
                <b>{field.label}</b>
                <NumberField
                  value={forces[field.key]}
                  step={field.step}
                  label={`${field.label}数值`}
                  onCommit={(v) => patchForces({ [field.key]: v })}
                />
              </span>
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step}
                value={forces[field.key]}
                onChange={(e) => patchForces({ [field.key]: Number(e.target.value) })}
              />
              <span className="force-row-hint">{field.hint}</span>
            </label>
          ))}

          <div className="giant-name-section mote-settings">
            <div className="giant-name-head">
              <b>游离元素</b>
              <span>背景动态</span>
            </div>
            <p className="force-settings-note">
              这些参数只影响背景中的游离元素；改动会立即生效，并记住到本机。滑块范围有限，右侧输入框可直接输入更大数值。
            </p>
            {MOTE_FIELDS.map((field) => (
              <label className="force-row" key={field.key}>
                <span className="force-row-head">
                  <b>{field.label}</b>
                  <NumberField
                    value={motes[field.key]}
                    step={field.step}
                    label={`${field.label}数值`}
                    onCommit={(v) => patchMotes({ [field.key]: v })}
                  />
                </span>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={motes[field.key]}
                  onChange={(e) => patchMotes({ [field.key]: Number(e.target.value) })}
                />
                <span className="force-row-hint">{field.hint}</span>
              </label>
            ))}
            <div className="force-row">
              <span className="force-row-head">
                <b>寿命范围</b>
                <span className="force-life-inputs">
                  <NumberField
                    value={motes.lifeMin}
                    min={1}
                    step={10}
                    label="最短寿命"
                    className="force-number"
                    onCommit={(v) => patchMotes({ lifeMin: v })}
                  />
                  <span>s –</span>
                  <NumberField
                    value={motes.lifeMax}
                    min={1}
                    step={10}
                    label="最长寿命"
                    className="force-number"
                    onCommit={(v) => patchMotes({ lifeMax: v })}
                  />
                  <span>s</span>
                </span>
              </span>
              <div className="dual-range">
                <div className="dual-range-track">
                  <span
                    style={{
                      left: `${Math.max(0, Math.min(100, ((motes.lifeMin - 10) / 3590) * 100))}%`,
                      right: `${100 - Math.max(0, Math.min(100, ((motes.lifeMax - 10) / 3590) * 100))}%`,
                    }}
                  />
                </div>
                <input
                  type="range"
                  min={10}
                  max={3600}
                  step={10}
                  value={motes.lifeMin}
                  aria-label="最短寿命滑块"
                  onChange={(e) => patchMotes({ lifeMin: Number(e.target.value) })}
                />
                <input
                  type="range"
                  min={10}
                  max={3600}
                  step={10}
                  value={motes.lifeMax}
                  aria-label="最长寿命滑块"
                  onChange={(e) => patchMotes({ lifeMax: Number(e.target.value) })}
                />
              </div>
              <span className="force-row-hint">
                每颗元素在最小值和最大值之间随机取一个寿命；滑块上限 3600 秒，输入框可超出
              </span>
            </div>
            <button
              className="giant-name-reset"
              type="button"
              onClick={() => setMotes(DEFAULT_MOTES)}
            >
              恢复游离元素默认
            </button>
          </div>

          <div className="giant-name-section">
            <div className="giant-name-head">
              <b>巨元素名字</b>
              <span>{giantNames.length} 个</span>
            </div>
            <p className="force-settings-note">
              五个以上游离元素抱团时，会从下面随机取名。可以增删，至少保留一个。
            </p>
            <div className="giant-name-list">
              {giantNames.map((name) => (
                <span className="giant-name-chip" key={name}>
                  {name}
                  <button
                    type="button"
                    aria-label={`删除 ${name}`}
                    disabled={giantNames.length <= 1}
                    onClick={() => removeGiantName(name)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <form
              className="giant-name-add"
              onSubmit={(e) => {
                e.preventDefault();
                addGiantName();
              }}
            >
              <input
                value={giantInput}
                onChange={(e) => setGiantInput(e.target.value)}
                maxLength={12}
                placeholder="添加一个名字…"
                aria-label="添加巨元素名字"
              />
              <button className="btn btn--ghost" type="submit">
                添加
              </button>
            </form>
            <button
              className="giant-name-reset"
              type="button"
              onClick={() => setGiantNames([...DEFAULT_GIANT_NAMES])}
            >
              恢复默认名单
            </button>
          </div>

          <PhraseEditor kind="born" title="诞生播报" hint="巨元素形成时随机使用" lines={bornLines} onChange={setBornLines} />
          <PhraseEditor kind="grow" title="成长播报" hint="巨元素吸收新成员时随机使用" lines={growLines} onChange={setGrowLines} />
          <PhraseEditor kind="devour" title="吞噬播报" hint="两个巨元素合并时使用" lines={devourLines} onChange={setDevourLines} />
          <PhraseEditor kind="die" title="死亡播报" hint="巨元素无法维持时使用" lines={dieLines} onChange={setDieLines} />
        </div>
      </Sheet>

      <div className="giant-feed" aria-live="polite">
        {feed.map((item) => (
          <div className={`giant-feed-item giant-feed-item--${item.kind}`} key={item.id}>
            <span className="giant-feed-spark" />
            <span>{item.text}</span>
          </div>
        ))}
      </div>

      <div className="kmap-legend">
        <span className="kmap-legend-title">{COLOR_LABEL[colorMode]}</span>
        <span className="kmap-legend-bar" style={{ ['--legend' as string]: COLOR_HEX[colorMode] }} />
        <span>低</span>
        <span>高</span>
        <span className="kmap-legend-tip">
          {!hasAttempts && (colorMode === 'strength' || colorMode === 'weakness')
            ? '这块还没有作答数据，先做几道题'
            : colorMode === 'exam'
              ? '题库关联题量优先，暂无题时使用考纲先验'
              : colorMode === 'weight'
                ? '由重要性 × 难度归一化'
                : all
                  ? `${content.subjects.length} 个学科 · 335 颗星球`
                  : '由你的作答与掌握度计算'}
        </span>
      </div>
    </div>
  );
}

function NumberField({
  value,
  onCommit,
  step = 1,
  min = 0,
  label,
  className = 'force-number',
}: {
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const commit = () => {
    const parsed = Number(text);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setText(String(value));
  };
  return (
    <input
      className={className}
      type="number"
      min={min}
      step={step}
      value={text}
      aria-label={label}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function PhraseEditor({
  kind,
  title,
  hint,
  lines,
  onChange,
}: {
  kind: GiantPhraseKind;
  title: string;
  hint: string;
  lines: string[];
  onChange: (lines: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const phrase = input.trim().slice(0, 14);
    if (!phrase || lines.includes(phrase)) return;
    onChange([...lines, phrase].slice(0, 16));
    setInput('');
  };
  return (
    <div className="giant-name-section giant-phrase-section">
      <div className="giant-name-head">
        {title}
        <span>{lines.length} 个</span>
      </div>
      <p className="giant-phrase-hint">{hint}</p>
      <div className="giant-name-list">
        {lines.map((phrase) => (
          <span className="giant-name-chip" key={phrase}>
            {phrase}
            <button
              type="button"
              aria-label={`删除${phrase}`}
              disabled={lines.length <= 1}
              onClick={() => onChange(lines.filter((x) => x !== phrase))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <form
        className="giant-name-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={14}
          placeholder="添加一句播报词…"
          aria-label={`添加${title}`}
        />
        <button className="btn btn--ghost" type="submit">
          添加
        </button>
      </form>
      <button
        className="giant-name-reset"
        type="button"
        onClick={() => onChange([...DEFAULT_GIANT_PHRASES[kind]])}
      >
        恢复默认播报词
      </button>
    </div>
  );
}

function colorOf(metric: KpMetric | undefined, mode: KnowledgeColorMode): string {
  if (!metric) return '#5d6b86';
  if (!metricApplicable(metric, mode)) return '#43506a';
  metricValue(metric, mode);
  return COLOR_HEX[mode];
}

function opacityOf(metric: KpMetric | undefined, mode: KnowledgeColorMode): number {
  if (!metric) return 0.35;
  if (!metricApplicable(metric, mode)) return 0.22;
  const v = metricValue(metric, mode);
  if (mode === 'mastery' && metric.mastery == null) return 0.25;
  return 0.28 + Math.pow(Math.max(0, Math.min(1, v)), 0.7) * 0.72;
}
