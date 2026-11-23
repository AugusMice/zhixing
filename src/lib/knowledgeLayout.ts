import type { KnowledgePoint } from '../types';
import { hashString } from './format';

export interface KnowledgeNode {
  id: string;
  kp: KnowledgePoint;
  depth: number;
  /** 树状布局坐标 */
  x: number;
  y: number;
  /** 网状布局坐标 */
  nx: number;
  ny: number;
  radius: number;
  childCount: number;
  questionScore: number;
}

export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  kind: 'parent' | 'related';
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KnowledgeLayout {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  treeBounds: Box;
  netBounds: Box;
  roots: string[];
}

const TREE_BASE_RADIUS = 54;
const TREE_RING_GAP = 120;

/** 树状布局：根节点按叶子权重分扇区，父节点落在子节点角度中位，向外生长。 */
function treePositions(nodes: KnowledgePoint[], byId: Map<string, KnowledgePoint>) {
  const children = new Map<string, KnowledgePoint[]>();
  const roots: KnowledgePoint[] = [];
  const localParents = new Map<string, string[]>();

  for (const kp of nodes) {
    const ps = kp.parents.filter((p) => byId.has(p) && p !== kp.id);
    localParents.set(kp.id, ps);
    if (ps.length === 0) roots.push(kp);
    for (const p of ps) {
      const list = children.get(p) ?? [];
      if (!list.some((k) => k.id === kp.id)) list.push(kp);
      children.set(p, list);
    }
  }
  if (roots.length === 0 && nodes[0]) roots.push(nodes[0]);

  const leafMemo = new Map<string, number>();
  const leafCount = (kp: KnowledgePoint, seen: Set<string>): number => {
    const hit = leafMemo.get(kp.id);
    if (hit != null) return hit;
    if (seen.has(kp.id)) return 1;
    seen.add(kp.id);
    const kids = (children.get(kp.id) ?? []).filter((k) => !seen.has(k.id));
    const n = kids.length === 0 ? 1 : kids.reduce((s, k) => s + leafCount(k, seen), 0);
    seen.delete(kp.id);
    leafMemo.set(kp.id, n);
    return n;
  };

  const total = Math.max(1, roots.reduce((s, r) => s + leafCount(r, new Set()), 0));
  const pos = new Map<string, { x: number; y: number; depth: number; angle: number }>();

  const place = (
    kp: KnowledgePoint,
    depth: number,
    start: number,
    span: number,
    seen: Set<string>,
  ): number => {
    const angle = start + span / 2;
    if (!pos.has(kp.id)) {
      const radius =
        TREE_BASE_RADIUS + TREE_RING_GAP * Math.pow(Math.max(0, depth), 0.72);
      pos.set(kp.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.86,
        depth,
        angle,
      });
    }
    if (seen.has(kp.id)) return angle;
    seen.add(kp.id);
    const kids = (children.get(kp.id) ?? []).filter((k) => !seen.has(k.id));
    let cursor = start;
    const childTotal = Math.max(1, kids.reduce((s, k) => s + leafCount(k, new Set()), 0));
    for (const kid of kids) {
      const w = (span * leafCount(kid, new Set())) / childTotal;
      place(kid, depth + 1, cursor, w, seen);
      cursor += w;
    }
    seen.delete(kp.id);
    return angle;
  };

  let cursor = -Math.PI / 2;
  for (const root of roots) {
    const span = (Math.PI * 2 * leafCount(root, new Set())) / total;
    place(root, 0, cursor, span, new Set());
    cursor += span;
  }
  // 环形/孤立数据兜底
  let fallback = 0;
  for (const kp of nodes) {
    if (!pos.has(kp.id)) {
      const angle = -Math.PI / 2 + fallback * 0.7;
      const radius = TREE_BASE_RADIUS + 2 * TREE_RING_GAP;
      pos.set(kp.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius * 0.86,
        depth: 2,
        angle,
      });
      fallback += 1;
    }
  }
  return { pos, children, roots, localParents };
}

/** 网状布局：从树状位置出发做一次确定性的力导向松弛，避免每次进入都跳成随机形状。 */
function networkPositions(
  nodes: KnowledgePoint[],
  tree: Map<string, { x: number; y: number }>,
  localParents: Map<string, string[]>,
) {
  const sim = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  for (const kp of nodes) {
    const t = tree.get(kp.id) ?? { x: 0, y: 0 };
    const seed = hashString(kp.id);
    sim.set(kp.id, {
      x: t.x + ((seed % 100) - 50) * 0.5,
      y: t.y + (((seed >> 7) % 100) - 50) * 0.5,
      vx: 0,
      vy: 0,
    });
  }

  const ids = nodes.map((n) => n.id);
  const parentPairs: [string, string][] = [];
  for (const [child, ps] of localParents) {
    for (const p of ps) parentPairs.push([p, child]);
  }

  for (let step = 0; step < 260; step++) {
    // 斥力
    for (let i = 0; i < ids.length; i++) {
      const a = sim.get(ids[i]);
      if (!a) continue;
      for (let j = i + 1; j < ids.length; j++) {
        const b = sim.get(ids[j]);
        if (!b) continue;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = 0.7;
          dy = 0.5;
          d2 = 0.74;
        }
        const d = Math.sqrt(d2);
        const force = Math.min(140, 11500 / d2);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // 前置关系弹簧
    for (const [from, to] of parentPairs) {
      const a = sim.get(from);
      const b = sim.get(to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const target = 128;
      const f = (d - target) * 0.012;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // 轻微向心，防止散成一条线
    for (const id of ids) {
      const p = sim.get(id);
      if (!p) continue;
      p.vx += (-p.x / 2600) * 1;
      p.vy += (-p.y / 2600) * 1;
    }

    for (const id of ids) {
      const p = sim.get(id);
      if (!p) continue;
      p.vx *= 0.78;
      p.vy *= 0.78;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 18) {
        p.vx = (p.vx / speed) * 18;
        p.vy = (p.vy / speed) * 18;
      }
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  // 去中心 + 按半径归一，避免极端稀疏或过密
  let cx = 0;
  let cy = 0;
  for (const id of ids) {
    const p = sim.get(id)!;
    cx += p.x;
    cy += p.y;
  }
  cx /= Math.max(1, ids.length);
  cy /= Math.max(1, ids.length);
  let maxR = 1;
  for (const id of ids) {
    const p = sim.get(id)!;
    p.x -= cx;
    p.y -= cy;
    maxR = Math.max(maxR, Math.hypot(p.x, p.y));
  }
  const scale = Math.min(1.25, Math.max(0.62, 430 / maxR));
  for (const id of ids) {
    const p = sim.get(id)!;
    p.x *= scale;
    p.y *= scale;
  }
  return sim;
}

function boxOf(points: { x: number; y: number }[], padX: number, padY: number): Box {
  if (points.length === 0) return { x: -220, y: -160, w: 440, h: 320 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX - padX,
    y: minY - padY,
    w: Math.max(1, maxX - minX + padX * 2),
    h: Math.max(1, maxY - minY + padY * 2),
  };
}

export function layoutKnowledge(
  subjectKps: KnowledgePoint[],
  portrait = false,
): KnowledgeLayout {
  const byId = new Map(subjectKps.map((kp) => [kp.id, kp]));
  if (subjectKps.length === 0) {
    return {
      nodes: [],
      edges: [],
      treeBounds: { x: -220, y: -160, w: 440, h: 320 },
      netBounds: { x: -220, y: -160, w: 440, h: 320 },
      roots: [],
    };
  }

  const { pos, children, roots, localParents } = treePositions(subjectKps, byId);
  const net = networkPositions(subjectKps, pos, localParents);

  const nodes: KnowledgeNode[] = subjectKps.map((kp) => {
    const t = pos.get(kp.id) ?? { x: 0, y: 0, depth: 0 };
    const n = net.get(kp.id) ?? { x: t.x, y: t.y };
    const childCount = children.get(kp.id)?.length ?? 0;
    const qScore = kp.examFrequency ?? 1;
    return {
      id: kp.id,
      kp,
      depth: t.depth,
      x: portrait ? t.y : t.x,
      y: portrait ? t.x : t.y,
      nx: portrait ? n.y : n.x,
      ny: portrait ? n.x : n.y,
      radius: 6 + Math.min(7, Math.sqrt(childCount) * 2.4) + qScore * 0.42,
      childCount,
      questionScore: qScore,
    };
  });

  const edges: KnowledgeEdge[] = [];
  const seen = new Set<string>();
  for (const kp of subjectKps) {
    for (const p of kp.parents) {
      if (!byId.has(p) || p === kp.id) continue;
      const key = `${p}->${kp.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: key, from: p, to: kp.id, kind: 'parent' });
    }
    for (const r of kp.related ?? []) {
      if (!byId.has(r) || r === kp.id) continue;
      const key = [kp.id, r].sort().join('~');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: key, from: kp.id, to: r, kind: 'related' });
    }
  }

  return {
    nodes,
    edges,
    treeBounds: boxOf(nodes.map((n) => ({ x: n.x, y: n.y })), 108, 78),
    netBounds: boxOf(nodes.map((n) => ({ x: n.nx, y: n.ny })), 108, 78),
    roots: roots.map((r) => r.id),
  };
}
