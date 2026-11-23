import type { KnowledgePoint, Subject } from '../types';

export interface GraphNode {
  id: string;
  kp: KnowledgePoint;
  depth: number;
  /** 固定树状坐标（总图已缩放到六科分块内） */
  x: number;
  y: number;
  radius: number;
  childCount: number;
  degree: number;
  subjectId: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: 'parent' | 'related';
}

export interface GraphBlock {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface GraphBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KnowledgeGraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bounds: GraphBounds;
  roots: string[];
  blocks: GraphBlock[];
}

const LEAF_GAP = 46;
const SIBLING_GAP = 14;
const LEVEL_GAP = 138;
const ROOT_GAP = 56;
const PAD = 64;
const TOTAL_COLS = 3;
const TOTAL_BLOCK_W = 1520;
const TOTAL_BLOCK_H = 980;
const TOTAL_GAP = 72;
const TOTAL_HEADER = 58;

function buildForest(kps: KnowledgePoint[]) {
  const byId = new Map(kps.map((kp) => [kp.id, kp]));
  const children = new Map<string, KnowledgePoint[]>();
  const localParents = new Map<string, string[]>();
  for (const kp of kps) {
    const parents = kp.parents.filter((p) => byId.has(p) && p !== kp.id);
    localParents.set(kp.id, parents);
    for (const p of parents) {
      const list = children.get(p) ?? [];
      if (!list.some((k) => k.id === kp.id)) list.push(kp);
      children.set(p, list);
    }
  }
  const roots = kps.filter((kp) => (localParents.get(kp.id) ?? []).length === 0);
  return { byId, children, roots };
}

/** 由上到下的 tidy tree：叶子等距排开，父节点落在子节点中点。 */
function layoutSubjectTree(
  kps: KnowledgePoint[],
  stackRoots = false,
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  bounds: GraphBounds;
  roots: string[];
} {
  const { byId, children, roots } = buildForest(kps);
  const widths = new Map<string, number>();
  const measured = new Set<string>();

  const measure = (kp: KnowledgePoint, seen: Set<string>): number => {
    const memo = widths.get(kp.id);
    if (memo != null) return memo;
    if (seen.has(kp.id)) return LEAF_GAP;
    seen.add(kp.id);
    const kids = (children.get(kp.id) ?? []).filter((k) => !seen.has(k.id));
    const value =
      kids.length === 0
        ? LEAF_GAP
        : kids.reduce((sum, k) => sum + measure(k, seen), 0) +
          SIBLING_GAP * (kids.length - 1);
    seen.delete(kp.id);
    const final = Math.max(LEAF_GAP, value);
    widths.set(kp.id, final);
    return final;
  };

  const placed = new Map<string, { x: number; y: number; depth: number }>();
  const place = (
    kp: KnowledgePoint,
    left: number,
    depth: number,
    seen: Set<string>,
  ): void => {
    const width = widths.get(kp.id) ?? LEAF_GAP;
    if (!placed.has(kp.id)) {
      placed.set(kp.id, { x: left + width / 2, y: depth * LEVEL_GAP, depth });
    }
    if (seen.has(kp.id)) return;
    seen.add(kp.id);
    const kids = (children.get(kp.id) ?? []).filter((k) => !seen.has(k.id));
    let cursor = left;
    for (const kid of kids) {
      const w = widths.get(kid.id) ?? LEAF_GAP;
      place(kid, cursor, depth + 1, seen);
      cursor += w + SIBLING_GAP;
    }
    seen.delete(kp.id);
  };

  let cursor = 0;
  for (const root of roots) {
    const width = measure(root, new Set());
    place(root, cursor, 0, new Set());
    cursor += width + ROOT_GAP;
  }
  // 成环或数据异常时兜底
  for (const kp of kps) {
    if (placed.has(kp.id)) continue;
    measure(kp, new Set());
    place(kp, cursor, 0, new Set());
    cursor += (widths.get(kp.id) ?? LEAF_GAP) + ROOT_GAP;
  }

  // 单科总览：把每个根（教材板块）排成两列多行，保留各自的树杈形状。
  if (stackRoots) {
    const comps = roots.map((root) => {
      const ids: string[] = [];
      const stack = [root.id];
      const seen = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        for (const kid of children.get(id) ?? []) stack.push(kid.id);
      }
      const points = ids.map((id) => placed.get(id)).filter(Boolean) as {
        x: number;
        y: number;
      }[];
      return {
        ids,
        minX: Math.min(...points.map((p) => p.x)),
        minY: Math.min(...points.map((p) => p.y)),
        maxX: Math.max(...points.map((p) => p.x)),
        maxY: Math.max(...points.map((p) => p.y)),
      };
    });
    const cols = comps.length > 4 ? 2 : 1;
    const colW: number[] = [];
    const rowH: number[] = [];
    comps.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      colW[col] = Math.max(colW[col] ?? 0, c.maxX - c.minX);
      rowH[row] = Math.max(rowH[row] ?? 0, c.maxY - c.minY);
    });
    const colX: number[] = [];
    colW.forEach((w, i) => {
      colX[i] = (colX[i - 1] ?? 0) + (colW[i - 1] ?? 0) + ROOT_GAP;
    });
    const rowY: number[] = [];
    rowH.forEach((h, i) => {
      rowY[i] = (rowY[i - 1] ?? 0) + (rowH[i - 1] ?? 0) + ROOT_GAP;
    });
    comps.forEach((c, i) => {
      const dx = colX[i % cols] - c.minX;
      const dy = rowY[Math.floor(i / cols)] - c.minY;
      for (const id of c.ids) {
        const p = placed.get(id);
        if (!p) continue;
        p.x += dx;
        p.y += dy;
      }
    });
  }

  const nodes: GraphNode[] = kps.map((kp) => {
    const p = placed.get(kp.id) ?? { x: 0, y: 0, depth: 0 };
    const childCount = (children.get(kp.id) ?? []).length;
    const parentCount = kp.parents.filter((id) => byId.has(id) && id !== kp.id).length;
    const relatedCount = (kp.related ?? []).filter((id) => byId.has(id) && id !== kp.id).length;
    const degree = childCount + parentCount + relatedCount;
    const importance = kp.importance ?? 1;
    const exam = kp.examFrequency ?? 1;
    return {
      id: kp.id,
      kp,
      depth: p.depth,
      x: p.x,
      y: p.y,
      radius:
        3.2 +
        Math.min(6, degree * 0.55) +
        importance * 0.36 +
        exam * 0.22 +
        (p.depth === 0 ? 0.8 : 0),
      childCount,
      degree,
      subjectId: kp.subjectId,
    };
  });

  const edgeMap = new Map<string, GraphEdge>();
  for (const kp of kps) {
    for (const p of kp.parents) {
      if (!byId.has(p) || p === kp.id) continue;
      const key = `p:${p}->${kp.id}`;
      edgeMap.set(key, { id: key, from: p, to: kp.id, kind: 'parent' });
    }
    for (const r of kp.related ?? []) {
      if (!byId.has(r) || r === kp.id) continue;
      const [a, b] = [kp.id, r].sort();
      const key = `r:${a}<->${b}`;
      edgeMap.set(key, { id: key, from: a, to: b, kind: 'related' });
    }
  }

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs, 0) - PAD;
  const maxX = Math.max(...xs, 0) + PAD;
  const minY = Math.min(...ys, 0) - PAD;
  const maxY = Math.max(...ys, 0) + PAD;
  return {
    nodes,
    edges: [...edgeMap.values()],
    bounds: {
      x: minX,
      y: minY,
      w: Math.max(160, maxX - minX),
      h: Math.max(160, maxY - minY),
    },
    roots: roots.map((r) => r.id),
  };
}

export function layoutKnowledgeGraph(
  kps: KnowledgePoint[],
  stackRoots = false,
): KnowledgeGraphLayout {
  const tree = layoutSubjectTree(kps, stackRoots);
  return { ...tree, blocks: [] };
}

/**
 * 六科总图：每科一棵由上到下的树，按 3×2 分块摆放。
 * 树坐标缩放进分块；原子图会以这些块为初始位置，再由力导向散开。
 */
export function layoutAllKnowledge(
  subjects: Subject[],
  kpsBySubject: Map<string, KnowledgePoint[]>,
): KnowledgeGraphLayout {
  const ordered = [...subjects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const rows = Math.ceil(ordered.length / TOTAL_COLS);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const blocks: GraphBlock[] = [];

  ordered.forEach((subject, i) => {
    const col = i % TOTAL_COLS;
    const row = Math.floor(i / TOTAL_COLS);
    const blockX = col * (TOTAL_BLOCK_W + TOTAL_GAP);
    const blockY = row * (TOTAL_BLOCK_H + TOTAL_GAP);
    const tree = layoutSubjectTree(kpsBySubject.get(subject.id) ?? []);
    const availableW = TOTAL_BLOCK_W - PAD * 2;
    const availableH = TOTAL_BLOCK_H - TOTAL_HEADER - PAD * 2;
    const scale = Math.min(
      availableW / Math.max(1, tree.bounds.w),
      availableH / Math.max(1, tree.bounds.h),
      1.1,
    );
    const contentW = tree.bounds.w * scale;
    const contentH = tree.bounds.h * scale;
    const offsetX = blockX + (TOTAL_BLOCK_W - contentW) / 2;
    const offsetY = blockY + TOTAL_HEADER + PAD + (availableH - contentH) / 2;

    for (const node of tree.nodes) {
      nodes.push({
        ...node,
        x: offsetX + (node.x - tree.bounds.x) * scale,
        y: offsetY + (node.y - tree.bounds.y) * scale,
        radius: Math.max(2.4, node.radius * Math.min(1.3, scale + 0.55)),
      });
    }
    for (const edge of tree.edges) {
      edges.push({ ...edge, id: `${subject.id}:${edge.id}` });
    }
    blocks.push({
      id: subject.id,
      name: subject.name,
      color: subject.color,
      x: blockX,
      y: blockY,
      w: TOTAL_BLOCK_W,
      h: TOTAL_BLOCK_H,
      cx: blockX + TOTAL_BLOCK_W / 2,
      cy: blockY + TOTAL_BLOCK_H / 2,
    });
  });

  return {
    nodes,
    edges,
    bounds: {
      x: -PAD,
      y: -PAD,
      w: TOTAL_COLS * TOTAL_BLOCK_W + (TOTAL_COLS - 1) * TOTAL_GAP + PAD * 2,
      h: rows * TOTAL_BLOCK_H + (rows - 1) * TOTAL_GAP + PAD * 2,
    },
    roots: nodes.filter((n) => n.depth === 0).map((n) => n.id),
    blocks,
  };
}

/** 总图原子视图的六科锚点：让六簇围绕中心散开，而不是停在树状网格。 */
export function anchorPositions(blocks: GraphBlock[]): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  if (blocks.length === 0) return map;
  const cx = blocks.reduce((s, b) => s + b.cx, 0) / blocks.length;
  const cy = blocks.reduce((s, b) => s + b.cy, 0) / blocks.length;
  const radius = 260 + blocks.length * 18;
  blocks.forEach((b, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / blocks.length;
    map.set(b.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.82,
    });
  });
  return map;
}
