import type {
  AppData,
  Attempt,
  CardState,
  DailyEntry,
  Question,
  SessionState,
  Settings,
  WrongEntry,
} from '../types';
import type { PaperExamSession } from '../papers/exam';
import type { PaperReport } from '../papers/reports';

export const SYNC_SCHEMA_VERSION = 1;
const MAX_ATTEMPTS = 20_000;
const MAX_REPORTS = 200;
const TOMBSTONE_TTL_MS = 90 * 86_400_000;

export interface SyncTombstones {
  favAdded: Record<string, number>;
  favRemoved: Record<string, number>;
  wrongRemoved: Record<string, number>;
  paperExamCleared: Record<string, number>;
  userQuestionRemoved: Record<string, number>;
  resetAt?: number;
  settingsUpdatedAt?: number;
  sessionUpdatedAt?: number;
}

export interface SyncSnapshot {
  schemaVersion: 1;
  appData: AppData;
  paperExams: Record<string, PaperExamSession>;
  paperReports: PaperReport[];
  tombstones: SyncTombstones;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function localDateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeNumRecord(raw: unknown): Record<string, number> {
  if (!isObj(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

export function emptyTombstones(): SyncTombstones {
  return {
    favAdded: {},
    favRemoved: {},
    wrongRemoved: {},
    paperExamCleared: {},
    userQuestionRemoved: {},
  };
}

export function normalizeTombstones(raw: unknown): SyncTombstones {
  if (!isObj(raw)) return emptyTombstones();
  const out: SyncTombstones = {
    favAdded: normalizeNumRecord(raw.favAdded),
    favRemoved: normalizeNumRecord(raw.favRemoved),
    wrongRemoved: normalizeNumRecord(raw.wrongRemoved),
    paperExamCleared: normalizeNumRecord(raw.paperExamCleared),
    userQuestionRemoved: normalizeNumRecord(raw.userQuestionRemoved),
  };
  if (typeof raw.resetAt === 'number' && Number.isFinite(raw.resetAt) && raw.resetAt > 0) {
    out.resetAt = raw.resetAt;
  }
  if (
    typeof raw.settingsUpdatedAt === 'number' &&
    Number.isFinite(raw.settingsUpdatedAt) &&
    raw.settingsUpdatedAt > 0
  ) {
    out.settingsUpdatedAt = raw.settingsUpdatedAt;
  }
  if (
    typeof raw.sessionUpdatedAt === 'number' &&
    Number.isFinite(raw.sessionUpdatedAt) &&
    raw.sessionUpdatedAt > 0
  ) {
    out.sessionUpdatedAt = raw.sessionUpdatedAt;
  }
  return out;
}

export function pruneTombstones(tombstones: SyncTombstones, now: number = Date.now()): SyncTombstones {
  const cutoff = now - TOMBSTONE_TTL_MS;
  const pruneMap = (map: Record<string, number>): Record<string, number> => {
    const next: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      if (v >= cutoff) next[k] = v;
    }
    return next;
  };
  return {
    ...tombstones,
    favAdded: pruneMap(tombstones.favAdded),
    favRemoved: pruneMap(tombstones.favRemoved),
    wrongRemoved: pruneMap(tombstones.wrongRemoved),
    paperExamCleared: pruneMap(tombstones.paperExamCleared),
    userQuestionRemoved: pruneMap(tombstones.userQuestionRemoved),
  };
}

export function normalizeSnapshot(raw: unknown, defaultSettings: Settings): SyncSnapshot {
  const obj = isObj(raw) ? raw : {};
  const rawApp = isObj(obj.appData) ? (obj.appData as Partial<AppData>) : {};
  const now = Date.now();
  const appData: AppData = {
    version: 1,
    cards: isObj(rawApp.cards) ? (rawApp.cards as Record<string, CardState>) : {},
    attempts: Array.isArray(rawApp.attempts) ? (rawApp.attempts as Attempt[]) : [],
    favorites: Array.isArray(rawApp.favorites)
      ? rawApp.favorites.filter((x): x is string => typeof x === 'string')
      : [],
    wrong: isObj(rawApp.wrong) ? (rawApp.wrong as Record<string, WrongEntry>) : {},
    dailyLog: isObj(rawApp.dailyLog) ? (rawApp.dailyLog as Record<string, DailyEntry>) : {},
    settings: {
      ...defaultSettings,
      ...(isObj(rawApp.settings) ? (rawApp.settings as Partial<Settings>) : {}),
    },
    session: isObj(rawApp.session) ? (rawApp.session as unknown as SessionState) : null,
    userQuestions: Array.isArray(rawApp.userQuestions) ? (rawApp.userQuestions as Question[]) : [],
    createdAt: typeof rawApp.createdAt === 'number' ? rawApp.createdAt : now,
    updatedAt: typeof rawApp.updatedAt === 'number' ? rawApp.updatedAt : now,
  };

  const paperExams: Record<string, PaperExamSession> = {};
  if (isObj(obj.paperExams)) {
    for (const [k, v] of Object.entries(obj.paperExams)) {
      if (isObj(v) && typeof v.paperId === 'string' && typeof v.id === 'string') {
        paperExams[k] = v as unknown as PaperExamSession;
      }
    }
  }

  const paperReports: PaperReport[] = Array.isArray(obj.paperReports)
    ? obj.paperReports.filter(
        (r): r is PaperReport =>
          isObj(r) && typeof r.id === 'string' && typeof r.paperId === 'string',
      )
    : [];

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    appData,
    paperExams,
    paperReports,
    tombstones: normalizeTombstones(obj.tombstones),
  };
}

function hadProgress(data: AppData): boolean {
  return (
    Object.keys(data.cards).length > 0 ||
    data.attempts.length > 0 ||
    Object.keys(data.wrong).length > 0 ||
    Object.keys(data.dailyLog).length > 0
  );
}

function isProgressCleared(data: AppData): boolean {
  return (
    Object.keys(data.cards).length === 0 &&
    data.attempts.length === 0 &&
    Object.keys(data.wrong).length === 0 &&
    Object.keys(data.dailyLog).length === 0
  );
}

/** 根据前后两份 AppData 推导收藏/错题/设置/重置等同步墓碑 */
export function diffAppDataTombstones(
  prev: AppData,
  next: AppData,
  tombstones: SyncTombstones,
  now: number = Date.now(),
): SyncTombstones {
  const favAdded = { ...tombstones.favAdded };
  const favRemoved = { ...tombstones.favRemoved };
  const wrongRemoved = { ...tombstones.wrongRemoved };
  const userQuestionRemoved = { ...tombstones.userQuestionRemoved };

  const prevFav = new Set(prev.favorites);
  const nextFav = new Set(next.favorites);
  for (const id of nextFav) {
    if (!prevFav.has(id)) {
      favAdded[id] = now;
      delete favRemoved[id];
    }
  }
  for (const id of prevFav) {
    if (!nextFav.has(id)) {
      favRemoved[id] = now;
      delete favAdded[id];
    }
  }

  for (const qid of Object.keys(prev.wrong)) {
    if (!next.wrong[qid]) {
      wrongRemoved[qid] = now;
    }
  }
  for (const qid of Object.keys(next.wrong)) {
    if (wrongRemoved[qid]) delete wrongRemoved[qid];
  }

  const prevUq = new Set(prev.userQuestions.map((q) => q.id));
  const nextUq = new Set(next.userQuestions.map((q) => q.id));
  for (const id of prevUq) {
    if (!nextUq.has(id)) userQuestionRemoved[id] = now;
  }
  for (const id of nextUq) {
    if (!prevUq.has(id)) delete userQuestionRemoved[id];
  }

  let resetAt = tombstones.resetAt;
  if (hadProgress(prev) && isProgressCleared(next)) {
    resetAt = now;
  }

  let settingsUpdatedAt = tombstones.settingsUpdatedAt;
  if (JSON.stringify(prev.settings) !== JSON.stringify(next.settings)) {
    settingsUpdatedAt = now;
  }

  let sessionUpdatedAt = tombstones.sessionUpdatedAt;
  if (JSON.stringify(prev.session) !== JSON.stringify(next.session)) {
    sessionUpdatedAt = now;
  }

  return {
    ...tombstones,
    favAdded,
    favRemoved,
    wrongRemoved,
    userQuestionRemoved,
    ...(resetAt ? { resetAt } : {}),
    ...(settingsUpdatedAt ? { settingsUpdatedAt } : {}),
    ...(sessionUpdatedAt ? { sessionUpdatedAt } : {}),
  };
}

function mergeNumRecords(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
}

function cardOrderTuple(c: CardState): [number, number, number] {
  return [c.lastReview ?? c.introducedAt ?? 0, c.reps ?? 0, c.due ?? 0];
}

function pickCard(a: CardState, b: CardState): CardState {
  const ta = cardOrderTuple(a);
  const tb = cardOrderTuple(b);
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] > tb[i] ? a : b;
  }
  return a;
}

function pickWrong(a: WrongEntry, b: WrongEntry): WrongEntry {
  if (a.lastAt !== b.lastAt) return a.lastAt > b.lastAt ? a : b;
  if (a.count !== b.count) return a.count > b.count ? a : b;
  return a.streak >= b.streak ? a : b;
}

function mergeSession(
  local: SyncSnapshot,
  remote: SyncSnapshot,
): SessionState | null {
  const a = local.appData.session;
  const b = remote.appData.session;
  const aTs = local.tombstones.sessionUpdatedAt ?? local.appData.updatedAt ?? 0;
  const bTs = remote.tombstones.sessionUpdatedAt ?? remote.appData.updatedAt ?? 0;

  if (!a && !b) return null;
  if (a && !b) {
    const aActivity = Math.max(a.startedAt, a.finishedAt ?? 0, aTs);
    return bTs > aActivity ? null : a;
  }
  if (!a && b) {
    const bActivity = Math.max(b.startedAt, b.finishedAt ?? 0, bTs);
    return aTs > bActivity ? null : b;
  }
  if (!a || !b) return null;

  if (a.id === b.id) {
    const aProgress = (a.finishedAt ? 1_000_000 : 0) + Object.keys(a.answers).length * 100 + a.index;
    const bProgress = (b.finishedAt ? 1_000_000 : 0) + Object.keys(b.answers).length * 100 + b.index;
    const winner = aProgress === bProgress ? (aTs >= bTs ? a : b) : aProgress > bProgress ? a : b;
    const other = winner === a ? b : a;
    return {
      ...winner,
      answers: { ...other.answers, ...winner.answers },
      requeued: { ...other.requeued, ...winner.requeued },
    };
  }

  const aStart = Math.max(a.startedAt, a.finishedAt ?? 0);
  const bStart = Math.max(b.startedAt, b.finishedAt ?? 0);
  return aStart >= bStart ? a : b;
}

function mergePaperExam(a: PaperExamSession, b: PaperExamSession): PaperExamSession {
  if (a.id === b.id) {
    const aRank = (a.status === 'submitted' ? 1 : 0) * 1e13 + (a.submittedAt ?? a.startedAt);
    const bRank = (b.status === 'submitted' ? 1 : 0) * 1e13 + (b.submittedAt ?? b.startedAt);
    const winner = aRank >= bRank ? a : b;
    const other = winner === a ? b : a;
    return {
      ...winner,
      answers: { ...other.answers, ...winner.answers },
      selfScores:
        other.selfScores || winner.selfScores
          ? { ...(other.selfScores ?? {}), ...(winner.selfScores ?? {}) }
          : undefined,
      applied: Boolean(a.applied || b.applied),
    };
  }
  const aTs = Math.max(a.submittedAt ?? 0, a.startedAt);
  const bTs = Math.max(b.submittedAt ?? 0, b.startedAt);
  return aTs >= bTs ? a : b;
}

/**
 * 纯函数：把本地快照与云端快照按字段智能合并，保证多设备离线作答不丢失且幂等。
 */
export function mergeSyncSnapshots(
  local: SyncSnapshot,
  remote: SyncSnapshot,
  now: number = Date.now(),
): SyncSnapshot {
  const resetAt = Math.max(local.tombstones.resetAt ?? 0, remote.tombstones.resetAt ?? 0) || undefined;
  const resetDay = resetAt ? localDateKey(resetAt) : '';

  const favAdded = mergeNumRecords(local.tombstones.favAdded, remote.tombstones.favAdded);
  const favRemoved = mergeNumRecords(local.tombstones.favRemoved, remote.tombstones.favRemoved);
  const wrongRemoved = mergeNumRecords(local.tombstones.wrongRemoved, remote.tombstones.wrongRemoved);
  const paperExamCleared = mergeNumRecords(
    local.tombstones.paperExamCleared,
    remote.tombstones.paperExamCleared,
  );
  const userQuestionRemoved = mergeNumRecords(
    local.tombstones.userQuestionRemoved,
    remote.tombstones.userQuestionRemoved,
  );

  // 1. attempts: 按 id 去重合并，过滤掉早于 resetAt 的旧记录
  const attemptMap = new Map<string, Attempt>();
  for (const a of [...local.appData.attempts, ...remote.appData.attempts]) {
    if (resetAt && a.ts <= resetAt) continue;
    if (!attemptMap.has(a.id)) attemptMap.set(a.id, a);
  }
  const attempts = Array.from(attemptMap.values())
    .sort((a, b) => a.ts - b.ts)
    .slice(-MAX_ATTEMPTS);

  // 2. cards: 每题取较新/复习次数更多的状态
  const cards: Record<string, CardState> = {};
  const cardIds = new Set([
    ...Object.keys(local.appData.cards),
    ...Object.keys(remote.appData.cards),
  ]);
  for (const qid of cardIds) {
    const lc = local.appData.cards[qid];
    const rc = remote.appData.cards[qid];
    const validL = lc && (!resetAt || Math.max(lc.lastReview ?? 0, lc.introducedAt ?? 0) > resetAt) ? lc : undefined;
    const validR = rc && (!resetAt || Math.max(rc.lastReview ?? 0, rc.introducedAt ?? 0) > resetAt) ? rc : undefined;
    if (validL && validR) cards[qid] = pickCard(validL, validR);
    else if (validL || validR) cards[qid] = (validL ?? validR)!;
  }

  // 3. wrong: 取较新记录；若另一端在 lastAt 之后手动移除或复习毕业，则保持移除
  const wrong: Record<string, WrongEntry> = {};
  const wrongIds = new Set([
    ...Object.keys(local.appData.wrong),
    ...Object.keys(remote.appData.wrong),
  ]);
  for (const qid of wrongIds) {
    const lw = local.appData.wrong[qid];
    const rw = remote.appData.wrong[qid];
    const validL = lw && (!resetAt || lw.lastAt > resetAt) ? lw : undefined;
    const validR = rw && (!resetAt || rw.lastAt > resetAt) ? rw : undefined;

    if (validL && validR) {
      wrong[qid] = pickWrong(validL, validR);
    } else if (validL) {
      const removedOnRemote = (remote.tombstones.wrongRemoved[qid] ?? 0) >= validL.lastAt;
      const graduatedOnRemote = (remote.appData.cards[qid]?.lastReview ?? 0) > validL.lastAt;
      if (!removedOnRemote && !graduatedOnRemote) wrong[qid] = validL;
    } else if (validR) {
      const removedOnLocal = (local.tombstones.wrongRemoved[qid] ?? 0) >= validR.lastAt;
      const graduatedOnLocal = (local.appData.cards[qid]?.lastReview ?? 0) > validR.lastAt;
      if (!removedOnLocal && !graduatedOnLocal) wrong[qid] = validR;
    }
  }

  // 4. favorites: 按添加/取消时间戳收敛
  const favSet = new Set<string>();
  for (const id of [...local.appData.favorites, ...remote.appData.favorites]) {
    const addedAt = favAdded[id] ?? 0;
    const removedAt = favRemoved[id] ?? 0;
    if (removedAt <= addedAt) favSet.add(id);
  }
  const favorites = Array.from(favSet);

  // 5. dailyLog: 由合并后的 attempts + cards 精确重算，并与双方历史天数取 max（防超上限截断丢失）
  const derivedDaily: Record<string, DailyEntry> = {};
  for (const a of attempts) {
    const day = localDateKey(a.ts);
    const cur = derivedDaily[day] ?? { count: 0, correct: 0, ms: 0, newCount: 0 };
    cur.count += 1;
    if (a.correct) cur.correct += 1;
    cur.ms += a.elapsedMs || 0;
    derivedDaily[day] = cur;
  }
  for (const c of Object.values(cards)) {
    const day = localDateKey(c.introducedAt);
    const cur = derivedDaily[day] ?? { count: 0, correct: 0, ms: 0, newCount: 0 };
    cur.newCount += 1;
    derivedDaily[day] = cur;
  }

  const localResetAt = local.tombstones.resetAt ?? 0;
  const remoteResetAt = remote.tombstones.resetAt ?? 0;
  const ignoreLocalPreReset = Boolean(resetAt && localResetAt < resetAt);
  const ignoreRemotePreReset = Boolean(resetAt && remoteResetAt < resetAt);

  const dayKeys = new Set([
    ...Object.keys(derivedDaily),
    ...Object.keys(local.appData.dailyLog),
    ...Object.keys(remote.appData.dailyLog),
  ]);
  const dailyLog: Record<string, DailyEntry> = {};
  for (const day of dayKeys) {
    const d = derivedDaily[day];
    const l = ignoreLocalPreReset && day <= resetDay ? undefined : local.appData.dailyLog[day];
    const r = ignoreRemotePreReset && day <= resetDay ? undefined : remote.appData.dailyLog[day];
    const count = Math.max(d?.count ?? 0, l?.count ?? 0, r?.count ?? 0);
    if (count === 0 && (d?.newCount ?? 0) === 0 && (l?.newCount ?? 0) === 0 && (r?.newCount ?? 0) === 0) {
      continue;
    }
    const correct = Math.min(count, Math.max(d?.correct ?? 0, l?.correct ?? 0, r?.correct ?? 0));
    const ms = Math.max(d?.ms ?? 0, l?.ms ?? 0, r?.ms ?? 0);
    const newCount = Math.max(d?.newCount ?? 0, l?.newCount ?? 0, r?.newCount ?? 0);
    dailyLog[day] = { count, correct, ms, newCount };
  }

  // 6. settings: 按最新设置变更时间覆盖
  const localSettingsTs = local.tombstones.settingsUpdatedAt ?? local.appData.updatedAt ?? 0;
  const remoteSettingsTs = remote.tombstones.settingsUpdatedAt ?? remote.appData.updatedAt ?? 0;
  const settings =
    remoteSettingsTs > localSettingsTs ? { ...remote.appData.settings } : { ...local.appData.settings };
  const settingsUpdatedAt = Math.max(localSettingsTs, remoteSettingsTs) || undefined;

  // 7. session: 当前练习会话
  const session = mergeSession(local, remote);
  const sessionUpdatedAt =
    Math.max(local.tombstones.sessionUpdatedAt ?? 0, remote.tombstones.sessionUpdatedAt ?? 0) || undefined;

  // 8. userQuestions: 按 id 合并去重
  const uqMap = new Map<string, Question>();
  const localNewer = (local.appData.updatedAt ?? 0) >= (remote.appData.updatedAt ?? 0);
  const firstUqs = localNewer ? local.appData.userQuestions : remote.appData.userQuestions;
  const secondUqs = localNewer ? remote.appData.userQuestions : local.appData.userQuestions;
  for (const q of [...firstUqs, ...secondUqs]) {
    if (!uqMap.has(q.id) && !userQuestionRemoved[q.id]) {
      uqMap.set(q.id, q);
    }
  }

  // 9. paperExams: 合并每套试卷作答、交卷成绩与综合题自评
  const paperExams: Record<string, PaperExamSession> = {};
  const paperIds = new Set([...Object.keys(local.paperExams), ...Object.keys(remote.paperExams)]);
  for (const pid of paperIds) {
    const clearedAt = paperExamCleared[pid] ?? 0;
    const le = local.paperExams[pid];
    const re = remote.paperExams[pid];
    const validL = le && Math.max(le.submittedAt ?? 0, le.startedAt) > clearedAt ? le : undefined;
    const validR = re && Math.max(re.submittedAt ?? 0, re.startedAt) > clearedAt ? re : undefined;
    if (validL && validR) paperExams[pid] = mergePaperExam(validL, validR);
    else if (validL || validR) paperExams[pid] = (validL ?? validR)!;
  }

  // 10. paperReports: 按 id 去重，时间倒序保留 200 条
  const reportMap = new Map<string, PaperReport>();
  for (const rep of [...local.paperReports, ...remote.paperReports]) {
    if (!reportMap.has(rep.id)) reportMap.set(rep.id, rep);
  }
  const paperReports = Array.from(reportMap.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_REPORTS);

  const createdAt = Math.min(local.appData.createdAt || now, remote.appData.createdAt || now);
  const updatedAt = Math.max(local.appData.updatedAt || 0, remote.appData.updatedAt || 0) || now;

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    appData: {
      version: 1,
      cards,
      attempts,
      favorites,
      wrong,
      dailyLog,
      settings,
      session,
      userQuestions: Array.from(uqMap.values()),
      createdAt,
      updatedAt,
    },
    paperExams,
    paperReports,
    tombstones: pruneTombstones(
      {
        favAdded,
        favRemoved,
        wrongRemoved,
        paperExamCleared,
        userQuestionRemoved,
        ...(resetAt ? { resetAt } : {}),
        ...(settingsUpdatedAt ? { settingsUpdatedAt } : {}),
        ...(sessionUpdatedAt ? { sessionUpdatedAt } : {}),
      },
      now,
    ),
  };
}

/** 比较两份快照的实质业务内容是否相等（忽略纯元数据顺序以外的噪声） */
export function snapshotsContentEqual(a: SyncSnapshot, b: SyncSnapshot): boolean {
  const norm = (s: SyncSnapshot) => ({
    appData: {
      ...s.appData,
      favorites: [...s.appData.favorites].sort(),
      updatedAt: 0,
    },
    paperExams: s.paperExams,
    paperReports: s.paperReports,
    tombstones: s.tombstones,
  });
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
