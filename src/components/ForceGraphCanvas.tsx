import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { GraphBlock, GraphEdge, GraphNode } from '../lib/knowledgeGraph';
import type { Box } from '../lib/knowledgeLayout';

export interface GiantEvent {
  kind: 'born' | 'grow' | 'devour' | 'die';
  name: string;
  other?: string;
}

export interface ForceGraphHandle {
  focusNode: (id: string) => void;
  resetView: () => void;
  zoom: (factor: number) => void;
  collapseToTree: (done: () => void) => void;
  getScreenPoint: (id: string) => { x: number; y: number } | null;
}

export interface ForceSettings {
  /** Obsidian 的 centerStrength：0~1 */
  center: number;
  /** Obsidian 的 repelStrength：0~30 */
  repel: number;
  /** Obsidian 的 linkStrength：0~2 */
  link: number;
  /** Obsidian 的 linkDistance，单位与画布世界坐标一致 */
  distance: number;
}

export const DEFAULT_FORCES: ForceSettings = {
  center: 0.52,
  repel: 10,
  link: 1,
  distance: 250,
};

export interface MoteSettings {
  count: number;
  attract: number;
  repel: number;
  center: number;
  bond: number;
  lifeMin: number;
  lifeMax: number;
}

export const DEFAULT_MOTES: MoteSettings = {
  count: 32,
  attract: 1,
  repel: 1,
  center: 0.16,
  bond: 36,
  lifeMin: 170,
  lifeMax: 370,
};

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  blocks?: GraphBlock[];
  anchors?: Map<string, { x: number; y: number }>;
  colors: Map<string, string>;
  opacities: Map<string, number>;
  selectedId: string | null;
  highlightIds: Set<string> | null;
  focusLevels?: Map<string, number> | null;
  initialView: Box;
  mode: 'tree' | 'net';
  forces?: ForceSettings;
  motes?: MoteSettings;
  giantNames?: string[];
  onSelect: (id: string | null) => void;
  onGiantEvent?: (event: GiantEvent) => void;
  onCollapseView?: (view: Box) => void;
}

interface SimNode extends GraphNode {
  vx: number;
  vy: number;
}

type InternalApi = ForceGraphHandle & {
  setMode: (mode: 'tree' | 'net') => void;
};

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const hex = color.length === 4
      ? color.slice(1).split('').map((c) => c + c).join('')
      : color.slice(1);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return color;
}

type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  age: number;
  fade: number;
  life: number;
  dying: boolean;
  dashed: boolean;
  bond?: Mote;
};
type Giant = {
  name: string;
  members: Set<Mote>;
  x: number;
  y: number;
  bornAt: number;
  announced: boolean;
  lastCount: number;
  lastGrowAt: number;
};
const GIANT_RADIUS = 46;
const GIANT_MIN = 4;
const GIANT_MAX = 3;
const GIANT_ANNOUNCE_MS = 2000;
const DAMPING = 0.84;
const IDLE_ALPHA = 0.018;

function splitText(text: string): string[] {
  if (text.length <= 9) return [text];
  const parts = text.split(/[、与和的：]/).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 3) return parts;
  const half = Math.ceil(text.length / 2);
  return [text.slice(0, half), text.slice(half)].filter(Boolean);
}

function fitBoxToAspect(bounds: Box, aspect: number, pad = 0.92): Box {
  const targetAspect = aspect > 0 ? aspect : 1;
  let w = bounds.w;
  let h = bounds.h;
  if (w / h > targetAspect) h = w / targetAspect;
  else w = h * targetAspect;
  w /= pad;
  h /= pad;
  return {
    x: bounds.x - (w - bounds.w) / 2,
    y: bounds.y - (h - bounds.h) / 2,
    w,
    h,
  };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export const ForceGraphCanvas = forwardRef<ForceGraphHandle, Props>(function ForceGraphCanvas(
  {
    nodes,
    edges,
    blocks,
    anchors,
    colors,
    opacities,
    selectedId,
    highlightIds,
    focusLevels,
    initialView,
    mode,
    forces = DEFAULT_FORCES,
    motes = DEFAULT_MOTES,
    giantNames = [],
    onSelect,
    onGiantEvent,
    onCollapseView,
  },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const apiRef = useRef<InternalApi | null>(null);
  const colorRef = useRef(colors);
  const opacityRef = useRef(opacities);
  const selectedRef = useRef(selectedId);
  const highlightRef = useRef(highlightIds);
  const focusLevelsRef = useRef(focusLevels);
  const selectRef = useRef(onSelect);
  const giantEventRef = useRef(onGiantEvent);
  const nodesRef = useRef(nodes);
  const forcesRef = useRef(forces);
  const motesRef = useRef(motes);
  const giantNamesRef = useRef(giantNames);
  const edgesRef = useRef(edges);
  const blocksRef = useRef(blocks);
  const anchorsRef = useRef(anchors);
  const collapseViewRef = useRef(onCollapseView);

  colorRef.current = colors;
  opacityRef.current = opacities;
  selectedRef.current = selectedId;
  highlightRef.current = highlightIds;
  focusLevelsRef.current = focusLevels;
  selectRef.current = onSelect;
  nodesRef.current = nodes;
  edgesRef.current = edges;
  blocksRef.current = blocks;
  anchorsRef.current = anchors;
  collapseViewRef.current = onCollapseView;

  useImperativeHandle(
    ref,
    () => ({
      focusNode: (id: string) => apiRef.current?.focusNode(id),
      resetView: () => apiRef.current?.resetView(),
      zoom: (factor: number) => apiRef.current?.zoom(factor),
      collapseToTree: (done: () => void) => apiRef.current?.collapseToTree(done),
      getScreenPoint: (id: string) => apiRef.current?.getScreenPoint(id) ?? null,
    }),
    [],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cloudCache = new Map<string, HTMLCanvasElement>();
    const cloudSprite = (color: string) => {
      const cached = cloudCache.get(color);
      if (cached) return cached;
      const sprite = document.createElement('canvas');
      sprite.width = 64;
      sprite.height = 64;
      const sctx = sprite.getContext('2d');
      if (!sctx) return sprite;
      const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, withAlpha(color, 1));
      grad.addColorStop(0.18, withAlpha(color, 0.95));
      grad.addColorStop(0.42, withAlpha(color, 0.45));
      grad.addColorStop(0.68, withAlpha(color, 0.14));
      grad.addColorStop(1, withAlpha(color, 0));
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 64, 64);
      cloudCache.set(color, sprite);
      return sprite;
    };

    let width = 0;
    let height = 0;
    let dpr = 1;
    let view: Box = { ...initialView };
    const motes: Mote[] = [];
    const giants: Giant[] = [];
    const spawnMote = (seed = false): Mote => {
      const cx = view.x + view.w / 2;
      const cy = view.y + view.h / 2;
      const angle = Math.random() * Math.PI * 2;
      const span = Math.min(900, Math.max(280, Math.min(view.w, view.h)));
      const radius = (seed ? 0.3 + Math.random() * 0.3 : 0.4 + Math.random() * 0.3) * span;
      const lifeCfg = motesRef.current;
      const lifeLo = Math.min(lifeCfg.lifeMin, lifeCfg.lifeMax) * 60;
      const lifeHi = Math.max(lifeCfg.lifeMin, lifeCfg.lifeMax) * 60;
      return {
        x: cx + Math.cos(angle) * radius * 1.15,
        y: cy + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        r: 0.9 + Math.random() * 2.2,
        hue: 205 + Math.random() * 70,
        age: seed ? 700 : 0,
        fade: seed ? 1 : 0,
        life: Math.max(240, lifeLo + Math.random() * Math.max(1, lifeHi - lifeLo)),
        dying: false,
        dashed: Math.random() > 0.45,
      };
    };
    const sim: SimNode[] = nodesRef.current.map((n) => ({ ...n, vx: 0, vy: 0 }));
    const treeById = new Map(nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y }]));
    if (mode === 'net' && anchorsRef.current && anchorsRef.current.size > 0) {
      sim.forEach((node, i) => {
        const anchor =
          anchorsRef.current?.get(node.kp.group ?? '') ??
          anchorsRef.current?.get(node.subjectId);
        if (!anchor) return;
        const angle = (i * 2.399963) % (Math.PI * 2);
        const radius = 26 + (i % 13) * 9;
        node.x = anchor.x + Math.cos(angle) * radius;
        node.y = anchor.y + Math.sin(angle) * radius;
      });
    } else if (mode === 'net') {
      const cx = sim.reduce((s, n) => s + n.x, 0) / Math.max(1, sim.length);
      const cy = sim.reduce((s, n) => s + n.y, 0) / Math.max(1, sim.length);
      const ring = Math.max(180, Math.sqrt(sim.length) * 42);
      sim.forEach((node, i) => {
        const angle = (i * 2.399963) % (Math.PI * 2);
        const radius = ring * (0.55 + ((i * 37) % 100) / 160);
        node.x = cx + Math.cos(angle) * radius;
        node.y = cy + Math.sin(angle) * radius * 0.82;
      });
    }
    const nodeById = new Map(sim.map((n) => [n.id, n]));
    let graphMode: 'tree' | 'net' = mode;
    let alpha = mode === 'net' ? 1 : 0;
    let running = false;
    let raf = 0;
    let last = 0;
    let hoverId: string | null = null;
    let selected = selectedRef.current;
    let autoFitted = false;
    let ambientPhase = 0;
    let dragging: { id: string; startX: number; startY: number; moved: boolean; ox: number; oy: number } | null =
      null;
    let panning:
      | { startX: number; startY: number; view: Box; lastX: number; lastY: number; vx: number; vy: number; moved: boolean }
      | null = null;
    let panInertia = { x: 0, y: 0 };
    let zoomTarget: { w: number; px: number; py: number; worldX: number; worldY: number } | null = null;
    let camAnim: { from: Box; to: Box; start: number; dur: number } | null = null;
    let collapsing: { start: number; from: Map<string, { x: number; y: number }>; done: () => void } | null =
      null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; view: Box; cx: number; cy: number } | null = null;

    const scale = () => (width > 0 ? width / Math.max(1, view.w) : 1);
    const toScreen = (x: number, y: number) => ({
      x: ((x - view.x) / view.w) * width,
      y: ((y - view.y) / view.h) * height,
    });
    const toWorld = (x: number, y: number) => ({
      x: view.x + (x / Math.max(1, width)) * view.w,
      y: view.y + (y / Math.max(1, height)) * view.h,
    });

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(2, wrap.clientWidth);
      height = Math.max(2, wrap.clientHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      if (motes.length === 0) {
        for (let i = 0; i < 32; i++) motes.push(spawnMote(true));
      }
      view = fitBoxToAspect(view, width / height, 1);
      draw();
    };

    const fitCurrent = (animated: boolean) => {
      if (sim.length === 0) return;
      const xs = sim.map((n) => n.x);
      const ys = sim.map((n) => n.y);
      const pad = nodesRef.current.length > 100 ? 170 : 70;
      const bounds = {
        x: Math.min(...xs) - pad,
        y: Math.min(...ys) - pad,
        w: Math.max(1, Math.max(...xs) - Math.min(...xs)) + pad * 2,
        h: Math.max(1, Math.max(...ys) - Math.min(...ys)) + pad * 2,
      };
      let target = fitBoxToAspect(bounds, width / height, 0.92);
      // 单科树图优先撑满高度：树通常很宽，按宽度适配会把层级压成一条线。
      if (graphMode === 'tree' && sim.length <= 90) {
        const targetH = bounds.h;
        const targetW = targetH * (width / Math.max(1, height));
        target = {
          x: bounds.x + bounds.w / 2 - targetW / 2,
          y: bounds.y,
          w: targetW,
          h: targetH,
        };
      }
      if (animated) animateView(target, 520);
      else view = target;
    };

    const fitTreeWidth = () => {
      if (sim.length === 0) return;
      const xs = sim.map((n) => n.x);
      const ys = sim.map((n) => n.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const aspect = width / Math.max(1, height);
      const spanW = maxX - minX + 300;
      const spanH = maxY - minY + 120;
      const h = Math.max(spanH, spanW / aspect);
      const w = h * aspect;
      view = {
        x: (minX + maxX) / 2 - w / 2,
        y: (minY + maxY) / 2 - h / 2,
        w,
        h,
      };
    };

    const fitTreeHeight = () => {
      if (sim.length === 0) return;
      const ys = sim.map((n) => n.y);
      const xs = sim.map((n) => n.x);
      const minY = Math.min(...ys) - 80;
      const maxY = Math.max(...ys) + 80;
      let targetH = Math.max(200, maxY - minY);
      let targetW = targetH * (width / Math.max(1, height));
      const spanW = Math.max(...xs) - Math.min(...xs) + 260;
      targetW = Math.max(targetW, spanW);
      targetH = targetW / (width / Math.max(1, height));
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
      const cy = (minY + maxY) / 2;
      view = { x: cx - targetW / 2, y: cy - targetH / 2, w: targetW, h: targetH };
    };

    const step = (dt: number) => {
      const n = sim.length;
      if (n === 0) return;
      const f = forcesRef.current;
      const repulsion = 1600 * f.repel;
      const linkDistance = f.distance;
      const linkStrength = 0.007 * f.link;
      const centerScale = Math.max(0, f.center) / 0.52;
      alpha = Math.max(IDLE_ALPHA, alpha * 0.9915 - 0.00035);
      ambientPhase += dt * 0.012;

      for (let i = 0; i < n; i++) {
        if (alpha <= 0.03) {
          sim[i].vx += Math.cos(ambientPhase + i * 1.7) * 0.004;
          sim[i].vy += Math.sin(ambientPhase + i * 2.3) * 0.004;
        }
      }

      for (let i = 0; i < n; i++) {
        const a = sim[i];
        for (let j = i + 1; j < n; j++) {
          const b = sim[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = (Math.random() - 0.5) * 2;
            dy = (Math.random() - 0.5) * 2;
            d2 = 1;
          }
          const d = Math.sqrt(d2);
          const force = (-repulsion / Math.max(1200, d2)) * alpha;
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
          const minD = a.radius + b.radius + 12;
          if (d < minD) {
            const push = ((minD - d) / d) * 0.24;
            a.vx -= dx * push;
            a.vy -= dy * push;
            b.vx += dx * push;
            b.vy += dy * push;
          }
        }
      }

      for (const edge of edgesRef.current) {
        const a = nodeById.get(edge.from);
        const b = nodeById.get(edge.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(0.1, Math.hypot(dx, dy));
        const desired = edge.kind === 'related' ? linkDistance * 0.65 : linkDistance;
        const force = (d - desired) * linkStrength * alpha;
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      if (anchorsRef.current && anchorsRef.current.size > 0) {
        for (const node of sim) {
          const anchor =
            anchorsRef.current.get(node.kp.group ?? '') ??
            anchorsRef.current.get(node.subjectId);
          if (!anchor) continue;
          node.vx += (anchor.x - node.x) * 0.012 * centerScale * alpha;
          node.vy += (anchor.y - node.y) * 0.012 * centerScale * alpha;
        }
      }

      if (blocksRef.current && blocksRef.current.length > 0) {
        const cx = blocksRef.current.reduce((s, b) => s + b.cx, 0) / blocksRef.current.length;
        const cy = blocksRef.current.reduce((s, b) => s + b.cy, 0) / blocksRef.current.length;
        for (const node of sim) {
          node.vx += (cx - node.x) * 0.00035 * centerScale * alpha;
          node.vy += (cy - node.y) * 0.00035 * centerScale * alpha;
        }
      }

      for (const node of sim) {
        if (node.id === dragging?.id) {
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx = Math.max(-28, Math.min(28, node.vx * DAMPING));
        node.vy = Math.max(-28, Math.min(28, node.vy * DAMPING));
        node.x += node.vx * dt;
        node.y += node.vy * dt;
      }

      if (!autoFitted && alpha < 0.32) {
        autoFitted = true;
        fitCurrent(true);
      }
    };

    const drawLabels = (scaleValue: number, forcedIds: Set<string>) => {
      if (!ctx) return;
      const total = nodesRef.current.length > 100;
      const showAll = !total && scaleValue > 0.55;
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      let rootIndex = 0;
      const sorted = [...sim].sort((a, b) => b.childCount - a.childCount || a.depth - b.depth);
      ctx.font = '600 11px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
      ctx.textBaseline = 'top';
      for (const node of sorted) {
        const hit = forcedIds.has(node.id);
        const mustShow = !total && node.depth === 0;
        if (!showAll && !mustShow && !hit) continue;
        const p = toScreen(node.x, node.y);
        const radius = Math.max(2.2, node.radius * scaleValue);
        const lines = splitText(node.kp.name);
        const widths = lines.map((line) => ctx.measureText(line).width);
        const boxW = Math.max(...widths) + 10;
        const boxH = lines.length * 14 + 4;
        const rootStagger = mustShow ? (rootIndex++ % 2) * 18 : 0;
        const bx = Math.min(width - boxW - 6, Math.max(6, p.x - boxW / 2));
        const by = Math.min(height - boxH - 6, Math.max(6, p.y + radius + 7 + rootStagger));
        if (!hit && !mustShow && occupied.some((r) => bx < r.x + r.w && bx + boxW > r.x && by < r.y + r.h && by + boxH > r.y)) {
          continue;
        }
        occupied.push({ x: bx, y: by, w: boxW, h: boxH });
        const tx = bx + boxW / 2;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(5, 9, 18, 0.86)';
        ctx.fillStyle = hit ? '#ffffff' : 'rgba(203, 216, 238, 0.78)';
        lines.forEach((line, i) => {
          const ty = by + i * 14;
          ctx.strokeText(line, tx, ty);
          ctx.fillText(line, tx, ty);
        });
      }
    };

    const updateMotes = (dt: number) => {
      let cx = 0;
      let cy = 0;
      let clusterR = 0;
      if (sim.length > 0) {
        cx = sim.reduce((s, n) => s + n.x, 0) / sim.length;
        cy = sim.reduce((s, n) => s + n.y, 0) / sim.length;
        for (const n of sim) {
          clusterR = Math.max(clusterR, Math.hypot(n.x - cx, n.y - cy));
        }
      }
      const influenceR = Math.max(220, clusterR * 2);
      const cfg = motesRef.current;
      const targetCount = Math.max(0, Math.min(300, Math.round(cfg.count)));
      while (motes.length < targetCount) motes.push(spawnMote());
      while (motes.length > targetCount) {
        const removed = motes.pop();
        if (removed?.bond) removed.bond.bond = undefined;
      }
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.age += dt;
        if (m.dying) {
          m.fade = Math.max(0, 1 - (m.age - m.life) / 700);
          if (m.age > m.life + 700) {
            if (m.bond) m.bond.bond = undefined;
            motes.splice(i, 1, spawnMote());
            continue;
          }
        } else {
          m.fade = Math.min(1, m.age / 620);
          if (m.age > m.life) m.dying = true;
        }
        for (let j = i - 1; j >= 0; j--) {
          const o = motes[j];
          const dx = m.x - o.x;
          const dy = m.y - o.y;
          const d = Math.hypot(dx, dy) + 0.001;
          const ux = dx / d;
          const uy = dy / d;
          if (m.bond === o || o.bond === m) {
            const spring = (d - 18) * 0.055 * dt;
            m.vx -= ux * spring;
            m.vy -= uy * spring;
            o.vx += ux * spring;
            o.vy += uy * spring;
            m.vx *= Math.pow(0.94, dt);
            m.vy *= Math.pow(0.94, dt);
            o.vx *= Math.pow(0.94, dt);
            o.vy *= Math.pow(0.94, dt);
            continue;
          }
          if (d < 230) {
            const pull = (0.16 + (1 - d / 230) * 0.46) * cfg.attract * dt;
            m.vx -= ux * pull;
            m.vy -= uy * pull;
            o.vx += ux * pull;
            o.vy += uy * pull;
            if (d < cfg.bond && !m.bond && !o.bond) {
              m.bond = o;
              o.bond = m;
            }
          }
          if (d < 8) {
            const push = (8 - d) * 0.9 * cfg.repel * dt;
            m.vx += ux * push;
            m.vy += uy * push;
            o.vx -= ux * push;
            o.vy -= uy * push;
          }
        }
        m.vx += Math.cos(m.age * 0.0007 + m.hue) * 1.2 * dt;
        m.vy += Math.sin(m.age * 0.0009 + m.r) * 1.2 * dt;
        if (sim.length > 0) {
          const dx = m.x - cx;
          const dy = m.y - cy;
          const dist = Math.hypot(dx, dy) + 1;
          const pull = cfg.center * dt;
          m.vx -= (dx / dist) * pull;
          m.vy -= (dy / dist) * pull;
          if (dist < influenceR) {
            const coreR = Math.max(90, clusterR * 1.12);
            if (dist < coreR) {
              const push = (1 - dist / coreR) * 0.9 * dt;
              m.vx += (dx / dist) * push;
              m.vy += (dy / dist) * push;
            } else {
              const local = (1 - dist / influenceR) * 0.3 * dt;
              m.vx -= (dx / dist) * local;
              m.vy -= (dy / dist) * local;
            }
          }
        }
        m.vx *= Math.pow(0.985, dt);
        m.vy *= Math.pow(0.985, dt);
        m.x += m.vx * dt * 0.06;
        m.y += m.vy * dt * 0.06;
      }
    };

    const syncGiants = () => {
      const now = performance.now();
      if (motes.length < GIANT_MIN) {
        for (const old of giants) {
          if (old.announced) giantEventRef.current?.({ kind: 'die', name: old.name });
        }
        giants.length = 0;
        return;
      }
      const components: Mote[][] = [];
      const visited = new Set<Mote>();
      for (const start of motes) {
        if (visited.has(start)) continue;
        const comp: Mote[] = [];
        const queue = [start];
        visited.add(start);
        while (queue.length) {
          const cur = queue.pop()!;
          comp.push(cur);
          for (const other of motes) {
            if (visited.has(other)) continue;
            if (Math.hypot(cur.x - other.x, cur.y - other.y) <= GIANT_RADIUS) {
              visited.add(other);
              queue.push(other);
            }
          }
        }
        if (comp.length >= GIANT_MIN) components.push(comp);
      }

      const names = giantNamesRef.current.length > 0 ? giantNamesRef.current : ['巨元素'];
      const next: Giant[] = [];
      const claimed = new Set<Giant>();
      const consumed = new Set<Giant>();
      for (const comp of components) {
        if (next.length >= GIANT_MAX) break;
        const overlaps = giants
          .filter((g) => !claimed.has(g))
          .map((g) => {
            let count = 0;
            for (const mote of comp) if (g.members.has(mote)) count++;
            return { giant: g, count };
          })
          .filter((x) => x.count >= 2)
          .sort((a, b) => b.count - a.count);
        const best = overlaps[0]?.giant;
        const cx = comp.reduce((sum, m) => sum + m.x, 0) / comp.length;
        const cy = comp.reduce((sum, m) => sum + m.y, 0) / comp.length;
        let devoured = false;
        if (best && best.announced) {
          for (const extra of overlaps.slice(1)) {
            if (!extra.giant.announced) continue;
            giantEventRef.current?.({ kind: 'devour', name: best.name, other: extra.giant.name });
            claimed.add(extra.giant);
            consumed.add(extra.giant);
            devoured = true;
          }
        }
        if (best) {
          claimed.add(best);
          const grew = comp.length > best.lastCount;
          best.members = new Set(comp);
          best.x = cx;
          best.y = cy;
          best.lastCount = comp.length;
          if (!best.announced && now - best.bornAt >= GIANT_ANNOUNCE_MS) {
            best.announced = true;
            giantEventRef.current?.({ kind: 'born', name: best.name });
          } else if (best.announced && grew && !devoured && now - best.lastGrowAt > 1400) {
            best.lastGrowAt = now;
            giantEventRef.current?.({ kind: 'grow', name: best.name });
          }
          next.push(best);
        } else {
          const taken = new Set(next.map((g) => g.name));
          const pool = names.filter((name) => !taken.has(name));
          const name = pool[Math.floor(Math.random() * pool.length)] ?? names[next.length % names.length];
          next.push({
            name,
            members: new Set(comp),
            x: cx,
            y: cy,
            bornAt: now,
            announced: false,
            lastCount: comp.length,
            lastGrowAt: now,
          });
        }
      }
      for (const old of giants) {
        if (old.announced && !next.includes(old) && !consumed.has(old)) {
          giantEventRef.current?.({ kind: 'die', name: old.name });
        }
      }
      giants.length = 0;
      giants.push(...next);
    };

    const drawGiants = () => {
      if (graphMode !== 'net') return;
      syncGiants();
      if (giants.length === 0) return;
      const now = performance.now();
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = '700 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
      for (const giant of giants) {
        if (!giant.announced) continue;
        const fade = Math.min(1, Math.max(0, (now - giant.bornAt - GIANT_ANNOUNCE_MS) / 360));
        if (fade <= 0) continue;
        const p = toScreen(giant.x, giant.y);
        if (p.x < -60 || p.x > width + 60 || p.y < -30 || p.y > height + 30) continue;
        const label = giant.name;
        const textWidth = ctx.measureText(label).width;
        const labelX = Math.min(width - textWidth / 2 - 10, Math.max(textWidth / 2 + 10, p.x));
        const y = p.y - 20;
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(7, 11, 22, 0.62)';
        ctx.beginPath();
        ctx.roundRect(labelX - textWidth / 2 - 9, y - 19, textWidth + 18, 22, 11);
        ctx.fill();
        ctx.shadowColor = 'rgba(167, 139, 250, 0.75)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#eef3ff';
        ctx.fillText(label, labelX, y - 2);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    const drawMotes = () => {
      if (graphMode !== 'net') return;
      const pts = motes.map((m) => ({ m, p: toScreen(m.x, m.y) }));
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i];
          const b = pts[j];
          const d = Math.hypot(a.m.x - b.m.x, a.m.y - b.m.y);
          const bonded = a.m.bond === b.m || b.m.bond === a.m;
          if (d > 230 && !bonded) continue;
          ctx.beginPath();
          ctx.setLineDash(bonded ? [] : a.m.dashed ? [2, 6] : []);
          ctx.strokeStyle = bonded
            ? `hsla(${a.m.hue}, 82%, 78%, ${0.42 * a.m.fade * b.m.fade})`
            : `hsla(${a.m.hue}, 70%, 72%, ${0.14 * a.m.fade * b.m.fade})`;
          ctx.lineWidth = bonded ? 1.4 : 0.7;
          ctx.moveTo(a.p.x, a.p.y);
          ctx.lineTo(b.p.x, b.p.y);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
      for (const { m, p } of pts) {
        const overshoot = m.age < 480 ? Math.min(1.18, (m.age / 480) * 1.35) : 1;
        const r = Math.max(2.1, m.r * scale() * 5.2) * overshoot;
        const alpha = m.fade * 0.55;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6);
        grad.addColorStop(0, `hsla(${m.hue}, 70%, 76%, ${alpha})`);
        grad.addColorStop(0.35, `hsla(${m.hue}, 70%, 70%, ${alpha * 0.38})`);
        grad.addColorStop(0.72, `hsla(${m.hue}, 70%, 65%, ${alpha * 0.1})`);
        grad.addColorStop(1, `hsla(${m.hue}, 70%, 60%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const draw = () => {
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const scaleValue = scale();
      const selectedNow = selected;
      const highlightSet = highlightRef.current;
      const focus = focusLevelsRef.current;
      const forced = new Set<string>();
      if (selectedNow) forced.add(selectedNow);
      if (hoverId) forced.add(hoverId);
      if (highlightSet) for (const id of highlightSet) forced.add(id);
      if (focus) for (const [id, level] of focus) if (level <= 1) forced.add(id);

      for (const edge of edgesRef.current) {
        const a = nodeById.get(edge.from);
        const b = nodeById.get(edge.to);
        if (!a || !b) continue;
        const pa = toScreen(a.x, a.y);
        const pb = toScreen(b.x, b.y);
        const active =
          (selectedNow != null && (edge.from === selectedNow || edge.to === selectedNow)) ||
          (hoverId != null && (edge.from === hoverId || edge.to === hoverId));
        const level = focus
          ? Math.min(focus.get(edge.from) ?? 3, focus.get(edge.to) ?? 3)
          : null;
        let stroke: string;
        let width = 1;
        if (edge.kind === 'related') {
          ctx.setLineDash([3, 5]);
          stroke = active ? 'rgba(190, 160, 255, 0.7)' : 'rgba(167, 139, 250, 0.18)';
        } else {
          ctx.setLineDash([]);
          stroke = active ? 'rgba(126, 170, 255, 0.72)' : 'rgba(126, 160, 220, 0.16)';
        }
        if (level != null) {
          if (level <= 1) {
            stroke = edge.kind === 'related' ? 'rgba(190, 160, 255, 0.75)' : 'rgba(126, 170, 255, 0.7)';
            width = 1.8;
          } else if (level === 2) {
            stroke = edge.kind === 'related' ? 'rgba(167, 139, 250, 0.3)' : 'rgba(126, 160, 220, 0.3)';
            width = 1.25;
          } else {
            stroke = edge.kind === 'related' ? 'rgba(167, 139, 250, 0.08)' : 'rgba(126, 160, 220, 0.07)';
            width = 0.85;
          }
        } else if (active) {
          width = 1.5;
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        if (graphMode === 'tree') {
          const midY = (pa.y + pb.y) / 2;
          ctx.bezierCurveTo(pa.x, midY, pb.x, midY, pb.x, pb.y);
        } else {
          ctx.lineTo(pb.x, pb.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      if (blocksRef.current && blocksRef.current.length > 0) {
        if (graphMode === 'tree') {
          ctx.font = '700 15px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          for (const block of blocksRef.current) {
            const p = toScreen(block.x + 18, block.y + 22);
            ctx.fillStyle = block.color;
            ctx.globalAlpha = 0.92;
            ctx.fillText(block.name, p.x, p.y);
            ctx.globalAlpha = 1;
          }
        } else {
          const groups = new Map<string, SimNode[]>();
          for (const node of sim) {
            const list = groups.get(node.subjectId) ?? [];
            list.push(node);
            groups.set(node.subjectId, list);
          }
          ctx.font = '700 13px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          for (const block of blocksRef.current) {
            const list = groups.get(block.id) ?? [];
            if (list.length === 0) continue;
            const cx = list.reduce((s, n) => s + n.x, 0) / list.length;
            const top = Math.min(...list.map((n) => n.y));
            const p = toScreen(cx, top);
            ctx.fillStyle = block.color;
            ctx.globalAlpha = 0.9;
            ctx.fillText(block.name, p.x, p.y - 18);
            ctx.globalAlpha = 1;
          }
        }
      }

      for (const node of sim) {
        const p = toScreen(node.x, node.y);
        const color = colorRef.current.get(node.id) ?? '#6b7fa8';
        const opacity = opacityRef.current.get(node.id) ?? 0.25;
        const r = Math.max(3.2, node.radius * scaleValue);
        const active = node.id === selectedNow;
        const hot = node.id === hoverId;
        const level = focus?.get(node.id);
        const focusAlpha =
          level == null ? (focus ? 0.16 : 1) : level === 0 ? 1 : level === 1 ? 0.92 : level === 2 ? 0.4 : 0.16;
        const strong =
          (node.kp.id === selectedNow || hot || forced.has(node.id)) && (level == null || level <= 1);
        ctx.fillStyle = color;
        // 电子云：用径向渐变 sprite 一次绘制，边缘连续衰减。
        const cloud = cloudSprite(color);
        const size = r * 6.2;
        ctx.globalAlpha = opacity * focusAlpha;
        ctx.drawImage(cloud, p.x - size / 2, p.y - size / 2, size, size);
        if (strong) {
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = '#dce9ff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.95, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (active) {
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.setLineDash([2, 4]);
          ctx.arc(p.x, p.y, r * 1.8 + 6, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
      }

      drawMotes();
      drawLabels(scaleValue, forced);
      drawGiants();

      if (sim.length === 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(170, 190, 220, 0.65)';
        ctx.font = '13px system-ui';
        ctx.fillText('这个范围还没有知识点', width / 2, height / 2);
      }
    };

    const animateView = (target: Box, duration = 480) => {
      camAnim = { from: { ...view }, to: target, start: performance.now(), dur: duration };
      kick();
    };

    const kick = () => {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(2.2, Math.max(0.4, (now - last) / 16.67)) : 1;
      last = now;
      let cameraMoving = false;
      if (zoomTarget) {
        const nw = view.w + (zoomTarget.w - view.w) * Math.min(1, 0.22 * dt);
        if (Math.abs(zoomTarget.w - nw) < 0.4) {
          const nh = view.h * (zoomTarget.w / view.w);
          view = {
            x: zoomTarget.worldX - (zoomTarget.px / Math.max(1, width)) * zoomTarget.w,
            y: zoomTarget.worldY - (zoomTarget.py / Math.max(1, height)) * nh,
            w: zoomTarget.w,
            h: nh,
          };
          zoomTarget = null;
        } else {
          view = {
            x: zoomTarget.worldX - (zoomTarget.px / Math.max(1, width)) * nw,
            y: zoomTarget.worldY - (zoomTarget.py / Math.max(1, height)) * (view.h * (nw / view.w)),
            w: nw,
            h: view.h * (nw / view.w),
          };
          cameraMoving = true;
        }
      }
      if (Math.abs(panInertia.x) > 0.015 || Math.abs(panInertia.y) > 0.015) {
        view = {
          ...view,
          x: view.x + panInertia.x * dt,
          y: view.y + panInertia.y * dt,
        };
        const decay = Math.pow(0.9, dt);
        panInertia = { x: panInertia.x * decay, y: panInertia.y * decay };
        cameraMoving = true;
      } else if (panInertia.x !== 0 || panInertia.y !== 0) {
        panInertia = { x: 0, y: 0 };
      }
      if (camAnim) cameraMoving = true;
      if (collapsing) cameraMoving = true;
      if (camAnim) {
        const t = Math.min(1, (now - camAnim.start) / camAnim.dur);
        const p = easeOutCubic(t);
        view = {
          x: camAnim.from.x + (camAnim.to.x - camAnim.from.x) * p,
          y: camAnim.from.y + (camAnim.to.y - camAnim.from.y) * p,
          w: camAnim.from.w + (camAnim.to.w - camAnim.from.w) * p,
          h: camAnim.from.h + (camAnim.to.h - camAnim.from.h) * p,
        };
        if (t >= 1) camAnim = null;
      }
      if (collapsing) {
        const t = Math.min(1, (now - collapsing.start) / 720);
        const p = easeOutCubic(t);
        for (const node of sim) {
          const target = treeById.get(node.id);
          const from = collapsing.from.get(node.id);
          if (!target || !from) continue;
          node.x = from.x + (target.x - from.x) * p;
          node.y = from.y + (target.y - from.y) * p;
        }
        draw();
        if (t >= 1) {
          const done = collapsing.done;
          collapsing = null;
          running = false;
          collapseViewRef.current?.(view);
          done();
          return;
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      if (graphMode === 'tree') {
        draw();
        if (cameraMoving) {
          raf = requestAnimationFrame(tick);
        } else {
          running = false;
        }
        return;
      }
      if (graphMode === 'net') {
        updateMotes(dt);
        step(dt);
        draw();
        raf = requestAnimationFrame(tick);
        return;
      }
      draw();
      running = false;
    };

    const hitTest = (sx: number, sy: number) => {
      const sc = scale();
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const node of sim) {
        const p = toScreen(node.x, node.y);
        const d = Math.hypot(p.x - sx, p.y - sy);
        const limit = Math.max(coarse ? 24 : 12, node.radius * sc + (coarse ? 12 : 7));
        if (d <= limit && d < bestD) {
          best = node;
          bestD = d;
        }
      }
      return best;
    };

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinch = {
          dist: Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
          view: { ...view },
          cx: (pts[0].x + pts[1].x) / 2,
          cy: (pts[0].y + pts[1].y) / 2,
        };
        dragging = null;
        panning = null;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) {
        const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        dragging = {
          id: hit.id,
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          ox: hit.x - world.x,
          oy: hit.y - world.y,
        };
        alpha = Math.max(alpha, 0.24);
        if (graphMode === 'net') kick();
      } else {
        zoomTarget = null;
        panInertia = { x: 0, y: 0 };
        panning = {
          startX: e.clientX,
          startY: e.clientY,
          view: { ...view },
          lastX: e.clientX,
          lastY: e.clientY,
          vx: 0,
          vy: 0,
          moved: false,
        };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) {
        const pts = [...pointers.values()];
        const dist = Math.max(20, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
        const factor = pinch.dist / dist;
        const rect = canvas.getBoundingClientRect();
        const px = pinch.cx - rect.left;
        const py = pinch.cy - rect.top;
        const wx = pinch.view.x + (px / Math.max(1, width)) * pinch.view.w;
        const wy = pinch.view.y + (py / Math.max(1, height)) * pinch.view.h;
        const w = Math.max(180, Math.min(pinch.view.w * 4, pinch.view.w * factor));
        const h = pinch.view.h * (w / pinch.view.w);
        view = {
          x: wx - (px / Math.max(1, width)) * w,
          y: wy - (py / Math.max(1, height)) * h,
          w,
          h,
        };
        draw();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (dragging && graphMode === 'net') {
        const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        const node = nodeById.get(dragging.id);
        if (node) {
          node.x = world.x + dragging.ox;
          node.y = world.y + dragging.oy;
          node.vx = 0;
          node.vy = 0;
          if (Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY) > 4) {
            dragging.moved = true;
          }
          draw();
        }
        return;
      }
      if (panning) {
        const kx = view.w / Math.max(1, width);
        const ky = view.h / Math.max(1, height);
        const dx = e.clientX - panning.lastX;
        const dy = e.clientY - panning.lastY;
        panning.lastX = e.clientX;
        panning.lastY = e.clientY;
        panning.vx = panning.vx * 0.55 + -dx * kx * 0.45;
        panning.vy = panning.vy * 0.55 + -dy * ky * 0.45;
        if (Math.hypot(e.clientX - panning.startX, e.clientY - panning.startY) > 4) panning.moved = true;
        view = {
          ...panning.view,
          x: panning.view.x - (e.clientX - panning.startX) * kx,
          y: panning.view.y - (e.clientY - panning.startY) * ky,
        };
        draw();
        return;
      }
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if ((hit?.id ?? null) !== hoverId) {
        hoverId = hit?.id ?? null;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        draw();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (dragging) {
        if (!dragging.moved) {
          selected = dragging.id;
          selectedRef.current = dragging.id;
          selectRef.current(dragging.id);
        }
        dragging = null;
      }
      if (panning && panning.moved) {
        panInertia = { x: panning.vx, y: panning.vy };
        kick();
      } else if (panning) {
        selected = null;
        selectedRef.current = null;
        selectRef.current(null);
      }
      panning = null;
      if (e.pointerType !== 'mouse') {
        selected = selectedRef.current;
      }
      if (pointers.size === 0) canvas.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const world = toWorld(px, py);
      const base = zoomTarget?.w ?? view.w;
      const factor = Math.exp(-e.deltaY * 0.0014);
      const w = Math.max(180, Math.min(initialView.w * 4, base / Math.max(0.65, Math.min(1.55, factor))));
      const anchor = zoomTarget
        ? { worldX: zoomTarget.worldX, worldY: zoomTarget.worldY }
        : { worldX: world.x, worldY: world.y };
      zoomTarget = { w, px, py, ...anchor };
      kick();
    };

    const onDoubleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (hitTest(e.clientX - rect.left, e.clientY - rect.top)) return;
      selectRef.current(null);
      if (graphMode === 'tree') {
        fitTreeWidth();
        draw();
      } else {
        fitCurrent(true);
      }
    };

    const onRedraw = () => {
      selected = selectedRef.current;
      draw();
    };

    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', onDoubleClick);
    canvas.addEventListener('kmap-redraw', onRedraw);
    const initialFitTimer = window.setTimeout(() => {
      if (graphMode === 'net' && width > 2) {
        fitCurrent(false);
        draw();
      } else if (graphMode === 'tree' && width > 2) {
        if (nodesRef.current.length > 100) fitCurrent(false);
        else {
          fitTreeWidth();
          draw();
        }
      }
    }, 140);

    const startCollapse = (done: () => void) => {
      const from = new Map<string, { x: number; y: number }>();
      for (const node of sim) from.set(node.id, { x: node.x, y: node.y });
      collapsing = { start: performance.now(), from, done };
      alpha = 0;
      camAnim = null;
      kick();
    };

    apiRef.current = {
      getScreenPoint: (id: string) => {
        const node = nodeById.get(id);
        return node ? toScreen(node.x, node.y) : null;
      },
      focusNode: (id: string) => {
        const node = nodeById.get(id);
        if (!node) return;
        const targetW = Math.min(900, Math.max(240, view.w * 0.62));
        const targetH = targetW * (height / Math.max(1, width));
        const cx = node.x;
        const cy = node.y + (height < width ? 0 : targetH * 0.16);
        animateView({ x: cx - targetW / 2, y: cy - targetH / 2, w: targetW, h: targetH }, 460);
      },
      resetView: () => {
        if (graphMode === 'tree') {
          if (nodesRef.current.length > 100) fitCurrent(true);
          else {
            fitTreeWidth();
            draw();
          }
        } else {
          fitCurrent(true);
        }
      },
      zoom: (factor: number) => {
        const w = Math.max(180, Math.min(initialView.w * 4, view.w / factor));
        const h = view.h * (w / view.w);
        animateView({ x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2, w, h }, 260);
      },
      collapseToTree: (done: () => void) => {
        startCollapse(done);
      },
      setMode: (next: 'tree' | 'net') => {
        if (next === graphMode && !collapsing) return;
        if (next === 'net') {
          collapsing = null;
          graphMode = 'net';
          autoFitted = false;
          const cx = sim.reduce((s, n) => s + n.x, 0) / Math.max(1, sim.length);
          const cy = sim.reduce((s, n) => s + n.y, 0) / Math.max(1, sim.length);
          sim.forEach((node, i) => {
            const dx = node.x - cx;
            const dy = node.y - cy;
            const radial = Math.atan2(dy, dx);
            const angle = radial * 0.35 + i * 2.399963;
            node.vx += Math.cos(angle) * 7;
            node.vy += Math.sin(angle) * 7;
          });
          alpha = 1;
          kick();
          window.setTimeout(() => {
            if (graphMode === 'net') fitCurrent(true);
          }, 1200);
          return;
        }
        graphMode = 'tree';
        startCollapse(() => {
          if (nodesRef.current.length > 100) fitCurrent(true);
          else {
            fitTreeWidth();
            draw();
          }
        });
      },
    };

    resize();
    if (graphMode === 'net' && anchorsRef.current && anchorsRef.current.size > 0) {
      const xs = sim.map((n) => n.x);
      const ys = sim.map((n) => n.y);
      const pad = 240;
      view = fitBoxToAspect(
        {
          x: Math.min(...xs) - pad,
          y: Math.min(...ys) - pad,
          w: Math.max(1, Math.max(...xs) - Math.min(...xs)) + pad * 2,
          h: Math.max(1, Math.max(...ys) - Math.min(...ys)) + pad * 2,
        },
        width / Math.max(1, height),
        0.92,
      );
      autoFitted = true;
    }
    kick();
    if (selected) {
      const node = nodeById.get(selected);
      if (node) {
        const targetW = Math.max(260, view.w * 0.7);
        const targetH = targetW * (height / Math.max(1, width));
        view = {
          x: node.x - targetW / 2,
          y: node.y - targetH / 2 + (height < width ? 0 : targetH * 0.14),
          w: targetW,
          h: targetH,
        };
      }
    }
    draw();

    return () => {
      running = false;
      window.clearTimeout(initialFitTimer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('dblclick', onDoubleClick);
      canvas.removeEventListener('kmap-redraw', onRedraw);
      apiRef.current = null;
    };
    // 鍙寜鎸傝浇鍒濆鍖栵紱鐫€鑹?閫変腑鍙樺寲閫氳繃 ref 璇诲彇骞堕噸缁樸€?    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    forcesRef.current = forces;
  }, [forces]);

  useEffect(() => {
    motesRef.current = motes;
  }, [motes]);

  useEffect(() => {
    giantNamesRef.current = giantNames;
  }, [giantNames]);

  useEffect(() => {
    giantEventRef.current = onGiantEvent;
  }, [onGiantEvent]);

  useEffect(() => {
    // 外部选中/高亮变化时，画布重绘由父组件的 key 和 focus 处理；
    // 这里只处理键盘聚焦节点时的一次重绘。
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // 触发一次轻量重绘：模拟静止时修改 selected 不会自动跑 RAF。
    const ev = new Event('kmap-redraw');
    canvas.dispatchEvent(ev);
  }, [selectedId, highlightIds]);

  return (
    <div className="kmap-canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="kmap-canvas" aria-label="知识点原子图" role="img" />
    </div>
  );
});

