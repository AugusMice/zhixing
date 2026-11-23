import type { KnowledgePoint, Subject } from '../types';

export interface StarNode {
  id: string;
  kp: KnowledgePoint;
  subject: Subject;
  x: number;
  y: number;
  /** 距离所属星系中心的半径，用于绘制光环 */
  radius: number;
  depth: number;
}

export interface StarLink {
  id: string;
  from: string;
  to: string;
  subjectId: string;
}

export interface StarCluster {
  subject: Subject;
  cx: number;
  cy: number;
  radius: number;
  count: number;
}

export interface StarBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StarLayout {
  nodes: StarNode[];
  links: StarLink[];
  clusters: StarCluster[];
  bounds: StarBounds;
}

const INNER_RADIUS = 48;
const RING_GAP = 88;

/**
 * 简易径向树布局：
 * - 每个科目是一团「星系」，星系中心按椭圆均匀分布；
 * - 知识点按前置关系从中心向外排，叶子节点均分角度，父节点取子节点角度均值；
 * - 不依赖第三方力导向库，布局稳定、可复现，18~200 个点都能看。
 */
export function layoutStarMap(kps: KnowledgePoint[], subjects: Subject[]): StarLayout {
  const groups = subjects
    .map((subject) => ({
      subject,
      kps: kps.filter((kp) => kp.subjectId === subject.id),
    }))
    .filter((g) => g.kps.length > 0);

  const n = groups.length;
  const orbit = n <= 1 ? 0 : Math.max(300, 170 + n * 58);

  const nodes: StarNode[] = [];
  const links: StarLink[] = [];
  const clusters: StarCluster[] = [];

  groups.forEach((group, gi) => {
    const centerAngle = -Math.PI / 2 + (gi * Math.PI * 2) / Math.max(1, n);
    const cx = n <= 1 ? 0 : Math.cos(centerAngle) * orbit;
    const cy = n <= 1 ? 0 : Math.sin(centerAngle) * orbit * 0.78;

    const byId = new Map(group.kps.map((kp) => [kp.id, kp]));
    const children = new Map<string, KnowledgePoint[]>();
    const roots: KnowledgePoint[] = [];

    for (const kp of group.kps) {
      const localParents = kp.parents.filter((p) => byId.has(p) && p !== kp.id);
      if (localParents.length === 0) roots.push(kp);
      for (const p of localParents) {
        const list = children.get(p);
        if (list) list.push(kp);
        else children.set(p, [kp]);
      }
    }

    // 防御：数据成环时至少挑一个节点当根
    if (roots.length === 0 && group.kps[0]) roots.push(group.kps[0]);

    const leafMemo = new Map<string, number>();
    const leafCount = (kp: KnowledgePoint, seen: Set<string>): number => {
      const memo = leafMemo.get(kp.id);
      if (memo != null) return memo;
      if (seen.has(kp.id)) return 1;
      seen.add(kp.id);
      const kids = (children.get(kp.id) ?? []).filter((k) => !seen.has(k.id));
      const count = kids.length === 0 ? 1 : kids.reduce((s, k) => s + leafCount(k, seen), 0);
      seen.delete(kp.id);
      leafMemo.set(kp.id, count);
      return count;
    };

    const totalLeaves = roots.reduce((s, r) => s + leafCount(r, new Set()), 0) || 1;
    const step = (Math.PI * 2) / totalLeaves;
    let cursor = 0;
    const angles = new Map<string, number>();
    const placed = new Set<string>();
    let maxRadius = INNER_RADIUS;

    const place = (kp: KnowledgePoint, depth: number, stack: Set<string>): number => {
      if (angles.has(kp.id)) return angles.get(kp.id) as number;
      if (stack.has(kp.id)) return -Math.PI / 2;
      stack.add(kp.id);
      const kids = (children.get(kp.id) ?? []).filter((k) => !stack.has(k.id));
      let angle: number;
      if (kids.length === 0) {
        angle = -Math.PI / 2 + (cursor + 0.5) * step;
        cursor += 1;
      } else {
        const kidAngles = kids.map((k) => place(k, depth + 1, stack));
        angle =
          kidAngles.reduce((s, a) => s + a, 0) / kidAngles.length;
      }
      stack.delete(kp.id);
      angles.set(kp.id, angle);
      const radius = INNER_RADIUS + depth * RING_GAP;
      maxRadius = Math.max(maxRadius, radius);
      if (!placed.has(kp.id)) {
        placed.add(kp.id);
        nodes.push({
          id: kp.id,
          kp,
          subject: group.subject,
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          radius,
          depth,
        });
      }
      return angle;
    };

    for (const root of roots) place(root, 0, new Set());
    // 防御：环里没被访问到的节点也放上去
    for (const kp of group.kps) {
      if (!placed.has(kp.id)) {
        place(kp, 1, new Set());
      }
    }

    for (const kp of group.kps) {
      for (const parentId of kp.parents) {
        if (!byId.has(parentId) || parentId === kp.id) continue;
        if (!placed.has(kp.id) || !placed.has(parentId)) continue;
        links.push({
          id: `${parentId}->${kp.id}`,
          from: parentId,
          to: kp.id,
          subjectId: group.subject.id,
        });
      }
    }

    clusters.push({
      subject: group.subject,
      cx,
      cy,
      radius: maxRadius + 46,
      count: group.kps.length,
    });
  });

  if (nodes.length === 0) {
    return { nodes, links, clusters, bounds: { x: -200, y: -140, w: 400, h: 280 } };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  for (const cluster of clusters) {
    minX = Math.min(minX, cluster.cx - cluster.radius);
    maxX = Math.max(maxX, cluster.cx + cluster.radius);
    minY = Math.min(minY, cluster.cy - cluster.radius);
    maxY = Math.max(maxY, cluster.cy + cluster.radius);
  }

  const padX = 90;
  const padY = 70;
  return {
    nodes,
    links,
    clusters,
    bounds: {
      x: minX - padX,
      y: minY - padY,
      w: maxX - minX + padX * 2,
      h: maxY - minY + padY * 2,
    },
  };
}
