import { createStore, get, set } from 'idb-keyval';
import type {
  AppData,
  Question,
  SessionAnswer,
  SessionState,
  Settings,
  WrongEntry,
} from '../types';
import { dateKey, uid } from '../lib/format';
import { gradeFromResult, newCard, reviewCard } from './srs';
import { attemptCoins, attemptXp } from './game';

const DB_NAME = 'zhixing-db';
const STORE_NAME = 'kv';
const KEY = 'appdata';
const DATA_VERSION = 1;
const MAX_ATTEMPTS = 20_000;

const store = createStore(DB_NAME, STORE_NAME);

export const DEFAULT_SETTINGS: Settings = {
  dailyNew: 10,
  dailyReview: 40,
  theme: 'dark',
  fontSize: 'md',
  showTimer: true,
  autoNext: false,
};

export function defaultData(now: number = Date.now()): AppData {
  return {
    version: DATA_VERSION,
    cards: {},
    attempts: [],
    favorites: [],
    wrong: {},
    dailyLog: {},
    settings: { ...DEFAULT_SETTINGS },
    session: null,
    userQuestions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function migrate(raw: Partial<AppData>): AppData {
  const base = defaultData(raw.createdAt ?? Date.now());
  return {
    ...base,
    ...raw,
    version: DATA_VERSION,
    cards: raw.cards ?? {},
    attempts: raw.attempts ?? [],
    favorites: raw.favorites ?? [],
    wrong: raw.wrong ?? {},
    dailyLog: raw.dailyLog ?? {},
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    session: raw.session ?? null,
    userQuestions: raw.userQuestions ?? [],
    updatedAt: Date.now(),
  };
}

export async function loadData(): Promise<AppData> {
  try {
    const raw = await get<Partial<AppData>>(KEY, store);
    if (!raw || typeof raw !== 'object') return defaultData();
    return migrate(raw);
  } catch (err) {
    console.error('[知星] 读取本地进度失败，使用空数据', err);
    return defaultData();
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await set(KEY, { ...data, updatedAt: Date.now() }, store);
  } catch (err) {
    console.error('[知星] 保存进度失败', err);
  }
}

export interface AnswerOutcome {
  data: AppData;
  grade: number;
  xp: number;
  coins: number;
  isNewCard: boolean;
  removedFromWrong: boolean;
}

/** 纯函数：把一次作答写进学习记录，返回新数据和奖励信息 */
export function applyAnswer(
  data: AppData,
  question: Question,
  result: SessionAnswer,
  meta: { mode: string; sessionId: string },
  now: number = Date.now(),
): AnswerOutcome {
  const isNewCard = !data.cards[question.id];
  const grade = gradeFromResult(
    result.correct,
    result.elapsedMs,
    result.score,
    result.maxScore,
  );

  const prevCard = data.cards[question.id];
  const card = prevCard
    ? reviewCard(prevCard, grade, now)
    : reviewCard(newCard(question.id, now), grade, now);

  const cards = { ...data.cards, [question.id]: card };

  const attempts = [
    ...data.attempts,
    {
      id: uid(),
      qid: question.id,
      ts: now,
      correct: result.correct,
      score: result.score,
      maxScore: result.maxScore,
      grade,
      elapsedMs: result.elapsedMs,
      mode: meta.mode,
      sessionId: meta.sessionId,
      answer: result.answer,
    },
  ].slice(-MAX_ATTEMPTS);

  let wrong: Record<string, WrongEntry> = data.wrong;
  let removedFromWrong = false;
  if (!result.correct) {
    const prev = data.wrong[question.id];
    wrong = {
      ...data.wrong,
      [question.id]: {
        qid: question.id,
        count: (prev?.count ?? 0) + 1,
        lastAt: now,
        streak: 0,
      },
    };
  } else if (data.wrong[question.id]) {
    const prev = data.wrong[question.id];
    const streak = prev.streak + 1;
    const next = { ...data.wrong };
    if (streak >= 2) {
      delete next[question.id];
      removedFromWrong = true;
    } else {
      next[question.id] = { ...prev, streak, lastAt: now };
    }
    wrong = next;
  }

  const key = dateKey(now);
  const daily = data.dailyLog[key] ?? { count: 0, correct: 0, ms: 0, newCount: 0 };
  const dailyLog = {
    ...data.dailyLog,
    [key]: {
      count: daily.count + 1,
      correct: daily.correct + (result.correct ? 1 : 0),
      ms: daily.ms + (result.elapsedMs || 0),
      newCount: daily.newCount + (isNewCard ? 1 : 0),
    },
  };

  return {
    data: {
      ...data,
      cards,
      attempts,
      wrong,
      dailyLog,
      updatedAt: now,
    },
    grade,
    xp: attemptXp(result.correct, question.difficulty, grade),
    coins: attemptCoins(result.correct, question.difficulty),
    isNewCard,
    removedFromWrong,
  };
}

export async function recordAnswer(
  data: AppData,
  question: Question,
  result: SessionAnswer,
  meta: { mode: string; sessionId: string },
  now: number = Date.now(),
): Promise<AnswerOutcome> {
  const outcome = applyAnswer(data, question, result, meta, now);
  await saveData(outcome.data);
  return outcome;
}

export function setSession(data: AppData, session: SessionState | null): AppData {
  return { ...data, session, updatedAt: Date.now() };
}

export function toggleFavorite(data: AppData, qid: string): AppData {
  const has = data.favorites.includes(qid);
  return {
    ...data,
    favorites: has ? data.favorites.filter((id) => id !== qid) : [...data.favorites, qid],
    updatedAt: Date.now(),
  };
}

export function removeWrong(data: AppData, qid: string): AppData {
  if (!data.wrong[qid]) return data;
  const wrong = { ...data.wrong };
  delete wrong[qid];
  return { ...data, wrong, updatedAt: Date.now() };
}

export function clearWrong(data: AppData): AppData {
  return { ...data, wrong: {}, updatedAt: Date.now() };
}

export function updateSettings(data: AppData, patch: Partial<Settings>): AppData {
  return {
    ...data,
    settings: { ...data.settings, ...patch },
    updatedAt: Date.now(),
  };
}

export function resetProgress(data: AppData): AppData {
  return {
    ...data,
    cards: {},
    attempts: [],
    favorites: [],
    wrong: {},
    dailyLog: {},
    session: null,
    updatedAt: Date.now(),
  };
}

/* ---------------------------- 导入导出 ---------------------------- */

export function exportJson(data: AppData): string {
  return JSON.stringify(
    {
      app: 'zhixing',
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      data,
    },
    null,
    2,
  );
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function importJson(text: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('不是合法的 JSON 文件');
  }
  if (!isObj(parsed)) throw new Error('文件结构不正确');
  const payload = isObj(parsed.data) ? parsed.data : parsed;
  if (!isObj(payload)) throw new Error('文件里没有学习记录');
  if (!isObj(payload.cards) && !Array.isArray(payload.attempts)) {
    throw new Error('这不像知星的进度文件');
  }
  return migrate(payload as Partial<AppData>);
}
