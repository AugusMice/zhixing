/* ============================================================
 * 知星 · 数据模型
 * 这一层是「杯子」：题库、知识点、学习记录都不依赖任何 UI，
 * 后续游戏系统只需要读这些数据 + 订阅事件即可。
 * ============================================================ */

export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short';
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface Subject {
  id: string;
  name: string;
  /** 星图与标签的主色，建议用 hsl 或 hex */
  color: string;
  order?: number;
}

export interface KnowledgePoint {
  id: string;
  subjectId: string;
  name: string;
  description?: string;
  /** 板块 / 章节，例如「力学」「经济与社会」，用于图上的大板块分组 */
  group?: string;
  /** 前置知识点（树与星图的航道） */
  parents: string[];
  /** 高考考频先验 1~5；题库存量足够时界面会优先使用题库统计 */
  examFrequency?: Difficulty;
  /** 重难程度 1~5：重要性 */
  importance?: Difficulty;
  /** 重难程度 1~5：理解难度 */
  difficulty?: Difficulty;
  /** 跨分支的相关知识点（网状图上的虚线联系） */
  related?: string[];
  /** 可选：手动指定星图坐标 [x, y]，不填则自动布局 */
  pos?: [number, number];
}

export interface Option {
  key: string;
  text: string;
}

export interface RubricItem {
  text: string;
  score: number;
}

interface QuestionBase {
  id: string;
  subjectId: string;
  /** 关联 1~3 个知识点，掌握度按这些点累计 */
  kpIds: string[];
  /** 支持 Markdown 与 $LaTeX$ / $$LaTeX$$ */
  stem: string;
  explanation?: string;
  difficulty: Difficulty;
  source?: string;
  tags?: string[];
  /** 关联到古诗文栏目（content/texts），默写题、字词题、赏析题用它跳回原文 */
  textId?: string;
  /** 本题直接考查的原文片段，展示时会高亮 */
  quote?: string;
  /** 古诗文的考查方式，用于栏目页筛选 */
  recite?: TextReciteKind;
}

/** 古诗文题目类型 */
export type TextReciteKind = 'direct' | 'context' | 'word' | 'culture' | 'appreciation';

export interface SingleQuestion extends QuestionBase {
  type: 'single';
  options: Option[];
  /** 正确选项的 key */
  answer: string;
}

export interface MultipleQuestion extends QuestionBase {
  type: 'multiple';
  options: Option[];
  /** 正确选项 key 的集合，顺序无关 */
  answer: string[];
}

export interface JudgeQuestion extends QuestionBase {
  type: 'judge';
  answer: boolean;
}

export interface FillBlank {
  /** 可接受的答案，任意一个匹配即算对 */
  accept: string[];
  hint?: string;
}

export interface FillQuestion extends QuestionBase {
  type: 'fill';
  blanks: FillBlank[];
}

export interface ShortQuestion extends QuestionBase {
  type: 'short';
  /** 评分细则，学生答完后逐条自评 */
  rubric: RubricItem[];
  /** 参考答案 / 解析 */
  reference?: string;
  maxScore?: number;
}

export type Question =
  | SingleQuestion
  | MultipleQuestion
  | JudgeQuestion
  | FillQuestion
  | ShortQuestion;

/* ---------------------------- 古诗文栏目 ---------------------------- */

export type TextGenre = '诗' | '词' | '曲' | '文' | '赋' | '辞';

export interface TextNote {
  /** 原文中的词或短语，必须能在原文里找到 */
  term: string;
  /** 释义 */
  gloss: string;
}

export interface TextHardChar {
  /** 易错字，单个字或词 */
  text: string;
  /** 为什么易错 / 正确写法提示 */
  note: string;
}

export interface TextItem {
  id: string;
  subjectId: string;
  title: string;
  author?: string;
  dynasty?: string;
  genre: TextGenre;
  /** 出处，如「《荀子》」「《全宋词》」 */
  source?: string;
  /** 是否为节选（长文背诵通常只考节选） */
  excerpt?: boolean;
  /** 原文段落，按自然段或诗句行分组 */
  paragraphs: string[];
  /** 注释 */
  notes: TextNote[];
  /** 译文，与 paragraphs 对应的段落 */
  translation?: string[];
  /** 赏析，支持 Markdown */
  appreciation: string;
  /** 名句，必须逐字出现在原文中 */
  famousLines: string[];
  /** 易错字 */
  hardChars?: TextHardChar[];
  /** 主题标签，如「送别」「怀古」「劝学」 */
  themes?: string[];
  /** 高考考查提示 */
  examNote?: string;
}

export interface TextBundle {
  texts: TextItem[];
  byId: Map<string, TextItem>;
  byGenre: Map<TextGenre, TextItem[]>;
  questionCountByText: Map<string, number>;
  errors: string[];
}

/* ---------------------------- 学习记录 ---------------------------- */

export interface Attempt {
  id: string;
  qid: string;
  ts: number;
  correct: boolean;
  /** 大题自评得分 */
  score?: number;
  maxScore?: number;
  /** SM-2 评分：1 忘记 / 3 困难 / 4 良好 / 5 轻松 */
  grade: number;
  elapsedMs: number;
  mode: string;
  sessionId: string;
  answer?: unknown;
}

export interface CardState {
  qid: string;
  /** 难度因子 1.3 ~ 3.0 */
  ease: number;
  /** 当前间隔（天），0 表示学习中 */
  interval: number;
  reps: number;
  lapses: number;
  /** 下次到期时间戳 */
  due: number;
  /** 首次学习时间，用于统计「今日新题」 */
  introducedAt: number;
  lastReview?: number;
  lastGrade?: number;
}

export interface WrongEntry {
  qid: string;
  count: number;
  lastAt: number;
  /** 连续答对次数，达到 2 次自动移出错题本 */
  streak: number;
}

export interface DailyEntry {
  count: number;
  correct: number;
  ms: number;
  newCount: number;
}

export interface Settings {
  dailyNew: number;
  dailyReview: number;
  theme: 'dark' | 'light' | 'auto';
  fontSize: 'sm' | 'md' | 'lg';
  showTimer: boolean;
  autoNext: boolean;
  /** 暂时不复习的古诗文（存「未启用」的 id，缺省=全部启用） */
  disabledTexts?: string[];
}

export type SessionMode =
  | 'daily'
  | 'subject'
  | 'kp'
  | 'wrong'
  | 'favorite'
  | 'random'
  | 'exam';

export interface SessionConfig {
  label: string;
  subjectId?: string;
  /** 组卷模式下参与抽题的科目 */
  subjectIds?: string[];
  kpId?: string;
  count: number;
  reveal: 'immediate' | 'end';
  timeLimitMin?: number;
}

export interface SessionAnswer {
  correct: boolean;
  score?: number;
  maxScore?: number;
  elapsedMs: number;
  /** 原始作答，便于回看错题 */
  answer?: unknown;
}

export interface SessionState {
  id: string;
  mode: SessionMode;
  startedAt: number;
  config: SessionConfig;
  queue: string[];
  index: number;
  answers: Record<string, SessionAnswer>;
  requeued: Record<string, number>;
  finishedAt?: number;
}

export interface AppData {
  version: number;
  cards: Record<string, CardState>;
  attempts: Attempt[];
  favorites: string[];
  wrong: Record<string, WrongEntry>;
  dailyLog: Record<string, DailyEntry>;
  settings: Settings;
  session: SessionState | null;
  userQuestions: Question[];
  createdAt: number;
  updatedAt: number;
}

/* ---------------------------- 派生视图 ---------------------------- */

export interface KpStat {
  kpId: string;
  attempts: number;
  correct: number;
  /** 0~1，贝叶斯平滑后的掌握度；null 表示未接触 */
  mastery: number | null;
  lastAt: number | null;
  questionCount: number;
  attemptedQuestions: number;
}

export interface AnswerResult {
  correct: boolean;
  score?: number;
  maxScore?: number;
  elapsedMs: number;
  answer?: unknown;
}
