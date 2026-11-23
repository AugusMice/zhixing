import type { AppData, KpStat, Question } from '../types';

/* ============================================================
 * 游戏层接口（预留）
 * 规则：游戏系统只读 AppData / 派生快照，并订阅事件；
 * 学习逻辑（SRS、掌握度、错题本）不依赖这里的任何东西。
 * ============================================================ */

export interface CivilizationSnapshot {
  xp: number;
  level: number;
  /** 当前等级已获得的经验 */
  levelInto: number;
  /** 升到下一级所需经验 */
  levelNeed: number;
  coins: number;
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  /** 掌握度达到 60% 的知识点数量（点亮的星球） */
  litSystems: number;
  totalSystems: number;
  exploredRatio: number;
  fleetPower: number;
  techTier: number;
}

export function xpThreshold(level: number): number {
  return 60 + 40 * level;
}

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rem = Math.max(0, xp);
  while (rem >= xpThreshold(level) && level < 99) {
    rem -= xpThreshold(level);
    level++;
  }
  return { level, into: rem, need: xpThreshold(level) };
}

export function attemptXp(correct: boolean, difficulty: number, grade: number): number {
  if (!correct) return 2;
  return 8 + difficulty * 4 + (grade >= 4 ? 4 : 0);
}

export function attemptCoins(correct: boolean, difficulty: number): number {
  return correct ? 3 + difficulty * 2 : 1;
}

export function computeCivilization(
  data: AppData,
  questions: Question[],
  kpStats: Map<string, KpStat>,
): CivilizationSnapshot {
  const qmap = new Map(questions.map((q) => [q.id, q]));
  let xp = 0;
  let coins = 0;
  let correct = 0;

  for (const a of data.attempts) {
    const q = qmap.get(a.qid);
    const difficulty = q?.difficulty ?? 2;
    xp += attemptXp(a.correct, difficulty, a.grade);
    coins += attemptCoins(a.correct, difficulty);
    if (a.correct) correct++;
  }

  const { level, into, need } = levelFromXp(xp);
  let litSystems = 0;
  for (const st of kpStats.values()) {
    if ((st.mastery ?? 0) >= 0.6) litSystems++;
  }
  const totalSystems = kpStats.size;

  return {
    xp,
    level,
    levelInto: into,
    levelNeed: need,
    coins,
    totalAnswered: data.attempts.length,
    totalCorrect: correct,
    accuracy: data.attempts.length === 0 ? 0 : correct / data.attempts.length,
    litSystems,
    totalSystems,
    exploredRatio: totalSystems === 0 ? 0 : litSystems / totalSystems,
    fleetPower: Math.round(xp / 10),
    techTier: level,
  };
}

/* ---------------------------- 事件总线 ---------------------------- */

export interface GameEventMap {
  answer: {
    qid: string;
    correct: boolean;
    grade: number;
    xp: number;
    coins: number;
  };
  'session:complete': {
    sessionId: string;
    mode: string;
    answered: number;
    correct: number;
    accuracy: number;
  };
  'level:up': { from: number; to: number };
  'kp:mastered': { kpId: string; mastery: number };
}

export type GameEventName = keyof GameEventMap;

let bus: EventTarget | null = null;

function getBus(): EventTarget {
  if (!bus) bus = new EventTarget();
  return bus;
}

export function emitGameEvent<K extends GameEventName>(name: K, detail: GameEventMap[K]): void {
  getBus().dispatchEvent(new CustomEvent(name, { detail }));
}

export function onGameEvent<K extends GameEventName>(
  name: K,
  handler: (detail: GameEventMap[K]) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<GameEventMap[K]>).detail);
  getBus().addEventListener(name, listener);
  return () => getBus().removeEventListener(name, listener);
}
