import type { AnswerPayload } from '../lib/answers';
import type { KnowledgePoint, KpStat, Question, Subject } from '../types';

/* ============================================================
 * 星域战斗 · 纯函数引擎
 * 这里不依赖 React、不读写学习数据：
 *   - 抽题（优先薄弱知识点）
 *   - 伤害 / 护盾结算
 *   - 敌人 AI 与难度缩放
 *   - 结算评级
 * 组件层只负责把状态搬进界面。
 * ============================================================ */

/** 每回合抽几张指令卡 */
export const CARDS_PER_ROUND = 3;
/** 连对加成上限 */
export const COMBO_CAP = 4;
/** 答错时只结算的伤害比例 */
export const WRONG_DAMAGE_RATIO = 0.35;
/** 本科目文本题少于这个数量时跨科目抽题 */
export const MIN_SUBJECT_POOL = 6;
/** 最多回合数，防止一局无限拖长 */
export const MAX_ROUNDS = 10;

export type BattleDifficultyId = 'relaxed' | 'standard' | 'hard' | 'custom';

export interface DamageRange {
  min: number;
  max: number;
}

export interface BattleDifficulty {
  id: BattleDifficultyId;
  label: string;
  tagline: string;
  enemyName: string;
  /** 基础结构值，实际会按科目掌握度轻微缩放 */
  enemyHp: number;
  enemyShield: number;
  playerHull: number;
  playerShield: number;
  /** 每回合开始恢复的护盾 */
  shieldRegen: number;
  /** 每题限时（秒） */
  seconds: number;
  /** 答对后敌人的弱攻击 */
  weakAtk: DamageRange;
  /** 答错后敌人的立刻反击 */
  counterAtk: DamageRange;
}

export const DIFFICULTIES: BattleDifficulty[] = [
  {
    id: 'relaxed',
    label: '轻松',
    tagline: '敌舰火力有限，适合先熟悉节奏',
    enemyName: '侦察艇',
    enemyHp: 110,
    enemyShield: 16,
    playerHull: 110,
    playerShield: 34,
    shieldRegen: 7,
    seconds: 60,
    weakAtk: { min: 4, max: 7 },
    counterAtk: { min: 8, max: 11 },
  },
  {
    id: 'standard',
    label: '标准',
    tagline: '一场势均力敌的星域遭遇战',
    enemyName: '虚空巡洋舰',
    enemyHp: 145,
    enemyShield: 22,
    playerHull: 100,
    playerShield: 30,
    shieldRegen: 6,
    seconds: 45,
    weakAtk: { min: 6, max: 10 },
    counterAtk: { min: 11, max: 15 },
  },
  {
    id: 'hard',
    label: '硬核',
    tagline: '敌方母舰装甲厚重，限时也更紧',
    enemyName: '湮灭母舰',
    enemyHp: 185,
    enemyShield: 30,
    playerHull: 90,
    playerShield: 24,
    shieldRegen: 5,
    seconds: 30,
    weakAtk: { min: 8, max: 13 },
    counterAtk: { min: 15, max: 20 },
  },
];

export const DIFFICULTY_MAP: Record<Exclude<BattleDifficultyId, 'custom'>, BattleDifficulty> = {
  relaxed: DIFFICULTIES[0],
  standard: DIFFICULTIES[1],
  hard: DIFFICULTIES[2],
};

/* ------------------------------ 自定义难度 ------------------------------ */

export interface CustomDifficultyInput {
  /** 每题限时（秒） */
  seconds: number;
  /** 敌舰结构值 */
  enemyHp: number;
  /** 以哪一档预设为基准缩放攻击力与护盾 */
  baseId?: Exclude<BattleDifficultyId, 'custom'>;
}

/**
 * 把预设难度按自定义的「限时 / 敌舰结构」重算一档。
 * 攻击力按血量比例的 0.8 次方缩放，避免高血量时一炮就被打死；
 * 护盾同步缩放，回盾按 0.5 次方，保证高血量局不会变成一回合回满。
 */
export function customDifficulty(input: CustomDifficultyInput): BattleDifficulty {
  const base = DIFFICULTY_MAP[input.baseId ?? 'standard'];
  const seconds = Math.round(Math.min(180, Math.max(10, input.seconds)));
  const enemyHp = Math.round(Math.min(500, Math.max(40, input.enemyHp)));
  const ratio = enemyHp / base.enemyHp;
  const scale = (range: DamageRange): DamageRange => ({
    min: Math.max(1, Math.round(range.min * Math.pow(ratio, 0.8))),
    max: Math.max(2, Math.round(range.max * Math.pow(ratio, 0.8))),
  });
  return {
    ...base,
    id: 'custom',
    label: '自定义',
    tagline: `限时 ${seconds}s · 敌舰 ${enemyHp} 结构`,
    seconds,
    enemyHp,
    enemyShield: Math.max(4, Math.round(base.enemyShield * Math.pow(ratio, 0.6))),
    shieldRegen: Math.max(2, Math.round(base.shieldRegen * Math.pow(ratio, 0.5))),
    weakAtk: scale(base.weakAtk),
    counterAtk: scale(base.counterAtk),
  };
}

/* ------------------------------ 抽题 ------------------------------ */

/** 战斗只收文本题、跳过耗时的大题（图片真题的题干以 ![ 开头） */
export function isBattleQuestion(question: Question): boolean {
  if (question.type === 'short') return false;
  return !question.stem.trimStart().startsWith('![');
}

/** 一道题关联知识点的最低掌握度；全都没作答过则返回 null */
export function questionMastery(
  question: Question,
  kpStats: Map<string, KpStat>,
): number | null {
  let weakest: number | null = null;
  for (const kpId of question.kpIds) {
    const mastery = kpStats.get(kpId)?.mastery;
    if (mastery == null) continue;
    if (weakest == null || mastery < weakest) weakest = mastery;
  }
  return weakest;
}

/** 科目平均掌握度（只统计有作答记录的知识点） */
export function subjectAverageMastery(
  subjectId: string,
  kps: KnowledgePoint[],
  kpStats: Map<string, KpStat>,
): number | null {
  let sum = 0;
  let count = 0;
  for (const kp of kps) {
    if (kp.subjectId !== subjectId) continue;
    const mastery = kpStats.get(kp.id)?.mastery;
    if (mastery == null) continue;
    sum += mastery;
    count += 1;
  }
  return count === 0 ? null : sum / count;
}

/** 掌握度对敌舰结构值的缩放系数：高掌握度略微更难，低掌握度略微更脆 */
export function masteryScale(averageMastery: number | null): number {
  const value = averageMastery == null ? 0.5 : Math.min(1, Math.max(0, averageMastery));
  return 0.9 + 0.2 * value;
}

export function enemyHpFor(
  difficulty: BattleDifficulty,
  averageMastery: number | null,
): number {
  return Math.max(1, Math.round(difficulty.enemyHp * masteryScale(averageMastery)));
}

/** 卡片基础伤害：题目越难、题型越重，伤害越高 */
export function baseDamageOf(question: Question): number {
  const typeBonus: Record<Question['type'], number> = {
    single: 0,
    multiple: 2,
    judge: -1,
    fill: 1,
    short: 0,
  };
  return 16 + question.difficulty * 2 + typeBonus[question.type];
}

export interface BattleCard {
  question: Question;
  baseDamage: number;
  /** 这道题最薄弱知识点的掌握度，null 表示未探索 */
  mastery: number | null;
  weak: boolean;
  fromOtherSubject: boolean;
  /** 题库循环后再次出现的题 */
  recycled: boolean;
}

export interface BuildDeckInput {
  questions: Question[];
  subjectId: string;
  kpStats: Map<string, KpStat>;
  minSubjectPool?: number;
  rng?: () => number;
}

export interface DeckResult {
  cards: BattleCard[];
  /** 本科目文本题不足，混入了其他科目 */
  crossSubject: boolean;
  subjectPool: number;
  totalPool: number;
}

/**
 * 按「薄弱优先」做加权无放回洗牌。
 * 选中的科目权重更高；掌握度越低权重越高，形成「补弱点 → 打得更痛」的正反馈。
 */
export function buildDeck(input: BuildDeckInput): DeckResult {
  const rng = input.rng ?? Math.random;
  const minSubjectPool = input.minSubjectPool ?? MIN_SUBJECT_POOL;
  const eligible = input.questions.filter(isBattleQuestion);
  const own = eligible.filter((q) => q.subjectId === input.subjectId);
  const others = eligible.filter((q) => q.subjectId !== input.subjectId);
  const crossSubject = own.length < minSubjectPool;
  const source = crossSubject ? [...own, ...others] : own;

  const pool = source.map((question) => {
    const mastery = questionMastery(question, input.kpStats);
    const weakness = mastery == null ? 1.9 : 1 + 2.4 * (1 - mastery);
    const subjectFactor = question.subjectId === input.subjectId ? 1 : 0.55;
    const card: BattleCard = {
      question,
      baseDamage: baseDamageOf(question),
      mastery,
      weak: mastery != null && mastery < 0.5,
      fromOtherSubject: question.subjectId !== input.subjectId,
      recycled: false,
    };
    return { card, weight: weakness * subjectFactor };
  });

  const cards: BattleCard[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let ticket = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= pool[i].weight;
      if (ticket <= 0) {
        index = i;
        break;
      }
    }
    const picked = pool.splice(index, 1);
    if (picked.length > 0) cards.push(picked[0].card);
  }

  return {
    cards,
    crossSubject,
    subjectPool: own.length,
    totalPool: eligible.length,
  };
}

export interface ScopeDeckInput {
  questions: Question[];
  /** 选中要考的知识点；null 表示不限制（全部题库） */
  kpIds: Set<string> | null;
  kpStats: Map<string, KpStat>;
  rng?: () => number;
}

/**
 * 按「选中的知识点集合」组牌。
 * 与 buildDeck 的区别：不再只认一个 subjectId，而是认一组 kpId，
 * 因此可以精确到「某个大板块」「跨科目的若干小知识点」。
 */
export function buildScopedDeck(input: ScopeDeckInput): DeckResult {
  const rng = input.rng ?? Math.random;
  const eligible = input.questions.filter(isBattleQuestion);
  const scope = input.kpIds;
  const own =
    scope == null || scope.size === 0
      ? eligible
      : eligible.filter((question) => question.kpIds.some((id) => scope.has(id)));

  const pool = own.map((question) => {
    const mastery = questionMastery(question, input.kpStats);
    const weakness = mastery == null ? 1.9 : 1 + 2.4 * (1 - mastery);
    const card: BattleCard = {
      question,
      baseDamage: baseDamageOf(question),
      mastery,
      weak: mastery != null && mastery < 0.5,
      fromOtherSubject: false,
      recycled: false,
    };
    return { card, weight: weakness };
  });

  const cards: BattleCard[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let ticket = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i += 1) {
      ticket -= pool[i].weight;
      if (ticket <= 0) {
        index = i;
        break;
      }
    }
    const picked = pool.splice(index, 1);
    if (picked.length > 0) cards.push(picked[0].card);
  }

  return {
    cards,
    crossSubject: false,
    subjectPool: own.length,
    totalPool: eligible.length,
  };
}

export interface RoundDraw {  cards: BattleCard[];
  cursor: number;
  /** 本回合是否已经用到循环的题 */
  recycled: boolean;
}

/** 从牌堆按顺序抽一回合的指令卡；牌堆不够时从头循环 */
export function drawRound(
  deck: BattleCard[],
  cursor: number,
  count: number = CARDS_PER_ROUND,
): RoundDraw {
  if (deck.length === 0) return { cards: [], cursor: 0, recycled: false };
  if (deck.length <= count) {
    const recycled = cursor > 0;
    return {
      cards: deck.map((card) => (recycled ? { ...card, recycled: true } : card)),
      cursor: 0,
      recycled,
    };
  }

  const cards: BattleCard[] = [];
  let index = cursor % deck.length;
  let recycled = false;
  for (let i = 0; i < count; i += 1) {
    if (index >= deck.length) {
      index = 0;
      recycled = true;
    }
    const card = deck[index];
    cards.push(recycled ? { ...card, recycled: true } : card);
    index += 1;
  }
  return { cards, cursor: index % deck.length, recycled };
}

/** 随机科目：只在有可用文本题的科目里抽 */
export function pickRandomSubject(
  subjects: Subject[],
  countBySubject: Map<string, number>,
  rng: () => number = Math.random,
): string | null {
  const options = subjects.filter((s) => (countBySubject.get(s.id) ?? 0) > 0);
  if (options.length === 0) return null;
  const index = Math.min(options.length - 1, Math.floor(rng() * options.length));
  return options[index].id;
}

/* ------------------------------ 战斗结算 ------------------------------ */

export interface PlayerShip {
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
}

export interface EnemyShip {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
}

export interface DamageResult {
  shield: number;
  hull: number;
  /** 被护盾吃掉的部分 */
  absorbed: number;
  /** 打到结构上的部分 */
  hullDamage: number;
}

/** 先扣护盾，再扣结构值 */
export function applyDamage(shield: number, hull: number, damage: number): DamageResult {
  const total = Math.max(0, Math.round(damage));
  const absorbed = Math.min(shield, total);
  const hullDamage = Math.min(hull, total - absorbed);
  return {
    shield: shield - absorbed,
    hull: hull - hullDamage,
    absorbed,
    hullDamage,
  };
}

/** 连对加成倍率：1 + 0.25 × combo，combo 上限 4 */
export function comboMultiplier(combo: number): number {
  return 1 + 0.25 * Math.min(COMBO_CAP, Math.max(0, combo));
}

/** 伤害 = 基础伤害 × 连对加成；答错只结算 35% */
export function damageFor(baseDamage: number, combo: number, correct: boolean): number {
  const ratio = correct ? comboMultiplier(combo) : WRONG_DAMAGE_RATIO;
  return Math.max(1, Math.round(baseDamage * ratio));
}

export function rollAttack(range: DamageRange, rng: () => number = Math.random): number {
  const span = Math.max(0, range.max - range.min);
  return range.min + Math.floor(rng() * (span + 1));
}

export interface ResolveRoundInput {
  correct: boolean;
  combo: number;
  maxCombo: number;
  baseDamage: number;
  enemyShield: number;
  enemyHp: number;
  playerShield: number;
  playerHull: number;
  difficulty: BattleDifficulty;
  rng?: () => number;
}

export interface RoundResolution {
  correct: boolean;
  /** 本题结算后的连对数（答错归零） */
  combo: number;
  maxCombo: number;
  multiplier: number;
  /** 打出去的原始伤害 */
  damage: number;
  enemyShield: number;
  enemyHp: number;
  enemyAbsorbed: number;
  enemyHullDamage: number;
  enemyDied: boolean;
  /** 敌人这次攻击的伤害（0 表示敌舰已毁，没有还手） */
  enemyAttack: number;
  playerShield: number;
  playerHull: number;
  playerAbsorbed: number;
  playerHullDamage: number;
  playerDied: boolean;
}

/**
 * 一回合的完整结算：玩家开火 → 敌舰还手。
 * 答对时敌人只做弱攻击；答错时立刻反击。
 */
export function resolveRound(input: ResolveRoundInput): RoundResolution {
  const combo = input.correct ? Math.min(COMBO_CAP, input.combo + 1) : 0;
  const multiplier = input.correct ? comboMultiplier(combo) : WRONG_DAMAGE_RATIO;
  const damage = damageFor(input.baseDamage, combo, input.correct);

  const enemy = applyDamage(input.enemyShield, input.enemyHp, damage);
  const enemyDied = enemy.hull <= 0;

  const range = input.correct ? input.difficulty.weakAtk : input.difficulty.counterAtk;
  const enemyAttack = enemyDied ? 0 : rollAttack(range, input.rng);
  const player =
    enemyAttack > 0
      ? applyDamage(input.playerShield, input.playerHull, enemyAttack)
      : { shield: input.playerShield, hull: input.playerHull, absorbed: 0, hullDamage: 0 };

  return {
    correct: input.correct,
    combo,
    maxCombo: Math.max(input.maxCombo, combo),
    multiplier,
    damage,
    enemyShield: enemy.shield,
    enemyHp: enemy.hull,
    enemyAbsorbed: enemy.absorbed,
    enemyHullDamage: enemy.hullDamage,
    enemyDied,
    enemyAttack,
    playerShield: player.shield,
    playerHull: player.hull,
    playerAbsorbed: player.absorbed,
    playerHullDamage: player.hullDamage,
    playerDied: player.hull <= 0,
  };
}

/* ------------------------------ 评级 ------------------------------ */

export type Rating = 'S' | 'A' | 'B' | 'C';

export interface RateInput {
  won: boolean;
  correct: number;
  total: number;
  maxCombo: number;
  rounds: number;
}

export function accuracyOf(correct: number, total: number): number {
  return total <= 0 ? 0 : correct / total;
}

/**
 * S：赢下且正确率 ≥ 85%、打出过 3 连对
 * A：赢下且正确率 ≥ 65%
 * B：赢下，或虽然失败但正确率 ≥ 70%
 * C：其余情况
 */
export function rateBattle(input: RateInput): Rating {
  const accuracy = accuracyOf(input.correct, input.total);
  if (input.won && accuracy >= 0.85 && input.maxCombo >= 3 && input.rounds <= 8) return 'S';
  if (input.won && accuracy >= 0.65) return 'A';
  if (input.won || accuracy >= 0.7) return 'B';
  return 'C';
}

export interface RatingInfo {
  label: string;
  desc: string;
  color: string;
}

export function ratingInfo(rating: Rating): RatingInfo {
  switch (rating) {
    case 'S':
      return {
        label: 'S',
        desc: '教科书级指挥：几乎没有给敌舰喘息的机会。',
        color: '#ffd479',
      };
    case 'A':
      return {
        label: 'A',
        desc: '稳扎稳打，火力与护盾都在线。',
        color: 'var(--ok)',
      };
    case 'B':
      return {
        label: 'B',
        desc: '赢下了这一局，但还有几处漏洞被敌舰抓住。',
        color: 'var(--accent)',
      };
    case 'C':
      return {
        label: 'C',
        desc: '这一局打得很艰难，先回星图补一补薄弱知识点。',
        color: 'var(--text-3)',
      };
  }
}

/* ------------------------------ 作答初始值 ------------------------------ */

/**
 * 题型对应的空作答。
 * 判断题故意取反，保证「没作答就超时」会被判错。
 */
export function emptyPayloadFor(question: Question): AnswerPayload {
  switch (question.type) {
    case 'single':
      return { type: 'single', selected: [] };
    case 'multiple':
      return { type: 'multiple', selected: [] };
    case 'judge':
      return { type: 'judge', value: !question.answer };
    case 'fill':
      return { type: 'fill', values: question.blanks.map(() => '') };
    case 'short':
      return { type: 'short', checked: [] };
  }
}
