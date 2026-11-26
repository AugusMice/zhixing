import { createStore, get, set } from 'idb-keyval';
import type { AppData } from '../types';
import { DEFAULT_SETTINGS, saveData } from './store';
import {
  diffAppDataTombstones,
  emptyTombstones,
  mergeSyncSnapshots,
  normalizeSnapshot,
  normalizeTombstones,
  pruneTombstones,
  snapshotsContentEqual,
  SYNC_SCHEMA_VERSION,
  type SyncSnapshot,
  type SyncTombstones,
} from './sync';
import {
  loadAllPaperExams,
  onPaperExamMutation,
  replaceAllPaperExams,
} from '../papers/exam';
import {
  loadPaperReports,
  onPaperReportMutation,
  savePaperReports,
} from '../papers/reports';

export interface AuthUser {
  sub: string;
  provider: string;
  name: string;
  login: string;
  avatar: string | null;
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error';

export interface SyncState {
  status: SyncStatus;
  message: string;
  lastSyncedAt: number;
  revision: number;
  dirty: boolean;
  user: AuthUser | null;
  authChecked: boolean;
  authError: string;
}

export interface SyncRunResult {
  ok: boolean;
  skipped?: 'unauthenticated' | 'uninitialized' | 'offline';
  pulled: boolean;
  pushed: boolean;
  error?: string;
}

interface SyncMeta {
  userSub: string | null;
  revision: number;
  lastSyncedAt: number;
  dirty: boolean;
  tombstones: SyncTombstones;
}

const store = createStore('zhixing-db', 'kv');
const META_KEY = 'sync-meta';
const PUSH_DEBOUNCE_MS = 2500;
const MAX_CONFLICT_RETRIES = 3;

let syncState: SyncState = {
  status: 'off',
  message: '',
  lastSyncedAt: 0,
  revision: 0,
  dirty: false,
  user: null,
  authChecked: false,
  authError: '',
};

let metaCache: SyncMeta | null = null;
let hooks: {
  getAppData: () => AppData;
  applyMergedAppData: (data: AppData) => void;
} | null = null;

let debounceTimer: number | undefined;
let inflightSync: Promise<SyncRunResult> | null = null;
let rerunRequested = false;
let initialized = false;
const listeners = new Set<(state: SyncState) => void>();

function emitState(patch: Partial<SyncState>) {
  syncState = { ...syncState, ...patch };
  for (const fn of listeners) fn(syncState);
}

export function getSyncState(): SyncState {
  return syncState;
}

export function subscribeSyncState(fn: (state: SyncState) => void): () => void {
  listeners.add(fn);
  fn(syncState);
  return () => listeners.delete(fn);
}

async function loadMeta(): Promise<SyncMeta> {
  if (metaCache) return metaCache;
  try {
    const raw = await get<Partial<SyncMeta>>(META_KEY, store);
    if (raw && typeof raw === 'object') {
      metaCache = {
        userSub: typeof raw.userSub === 'string' ? raw.userSub : null,
        revision: typeof raw.revision === 'number' && raw.revision >= 0 ? raw.revision : 0,
        lastSyncedAt: typeof raw.lastSyncedAt === 'number' ? raw.lastSyncedAt : 0,
        dirty: Boolean(raw.dirty),
        tombstones: normalizeTombstones(raw.tombstones),
      };
      return metaCache;
    }
  } catch {
    // ignore
  }
  metaCache = {
    userSub: null,
    revision: 0,
    lastSyncedAt: 0,
    dirty: false,
    tombstones: emptyTombstones(),
  };
  return metaCache;
}

async function saveMeta(next: SyncMeta): Promise<void> {
  metaCache = next;
  try {
    await set(META_KEY, next, store);
  } catch {
    // ignore
  }
}

async function mutateMeta(updater: (cur: SyncMeta) => SyncMeta): Promise<SyncMeta> {
  const cur = await loadMeta();
  const next = updater(cur);
  await saveMeta(next);
  return next;
}

function schedulePush() {
  if (!syncState.user) return;
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    void syncNow();
  }, PUSH_DEBOUNCE_MS);
}

/** 记录一次本地 AppData 变更，计算墓碑并在已登录时触发防抖上传 */
export function trackAppDataChange(prev: AppData, next: AppData): void {
  const now = Date.now();
  if (metaCache) {
    metaCache = {
      ...metaCache,
      dirty: true,
      tombstones: diffAppDataTombstones(prev, next, metaCache.tombstones, now),
    };
  }
  emitState({ dirty: true });
  void mutateMeta((cur) => ({
    ...cur,
    dirty: true,
    tombstones: diffAppDataTombstones(prev, next, cur.tombstones, now),
  })).then(() => {
    schedulePush();
  });
}

async function buildLocalSnapshot(appData: AppData, tombstones: SyncTombstones): Promise<SyncSnapshot> {
  const [paperExams, paperReports] = await Promise.all([
    loadAllPaperExams(),
    loadPaperReports(),
  ]);
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    appData,
    paperExams,
    paperReports,
    tombstones: pruneTombstones(tombstones),
  };
}

async function applySnapshotLocally(
  merged: SyncSnapshot,
  localBefore: SyncSnapshot,
): Promise<boolean> {
  if (snapshotsContentEqual(localBefore, merged)) return false;
  await Promise.all([
    saveData(merged.appData),
    replaceAllPaperExams(merged.paperExams),
    savePaperReports(merged.paperReports),
  ]);
  hooks?.applyMergedAppData(merged.appData);
  return true;
}

async function fetchAuthUser(): Promise<{ user: AuthUser | null; error: string }> {
  try {
    const res = await fetch('/api/auth/me', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('登录状态查询失败');
    const result = (await res.json()) as { user?: AuthUser | null };
    return { user: result.user ?? null, error: '' };
  } catch {
    return { user: null, error: '登录服务暂不可用；本机学习数据不受影响。' };
  }
}

export async function refreshAuthAndSync(): Promise<SyncRunResult> {
  const { user, error } = await fetchAuthUser();
  const meta = await loadMeta();
  emitState({
    user,
    authChecked: true,
    authError: error,
    status: user ? (syncState.status === 'off' ? 'idle' : syncState.status) : 'off',
    lastSyncedAt: meta.lastSyncedAt,
    revision: meta.revision,
    dirty: meta.dirty,
  });
  if (!user) {
    return { ok: true, skipped: 'unauthenticated', pulled: false, pushed: false };
  }
  return syncNow();
}

export async function logoutAndClearSync(): Promise<void> {
  window.clearTimeout(debounceTimer);
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('退出失败，请重试。');
  await mutateMeta((cur) => ({
    ...cur,
    userSub: null,
    revision: 0,
  }));
  emitState({
    user: null,
    status: 'off',
    message: '',
    revision: 0,
    authError: '',
  });
}

async function runSyncOnce(): Promise<SyncRunResult> {
  if (!hooks) {
    return { ok: false, skipped: 'uninitialized', pulled: false, pushed: false };
  }
  const user = syncState.user;
  if (!user) {
    emitState({ status: 'off', message: '' });
    return { ok: true, skipped: 'unauthenticated', pulled: false, pushed: false };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitState({ status: 'error', message: '当前离线，联网后将自动同步' });
    return { ok: false, skipped: 'offline', pulled: false, pushed: false, error: '当前离线' };
  }

  emitState({ status: 'syncing', message: '' });

  let meta = await loadMeta();
  if (meta.userSub && meta.userSub !== user.sub) {
    meta = await mutateMeta((cur) => ({
      ...cur,
      userSub: user.sub,
      revision: 0,
      dirty: true,
    }));
  } else if (!meta.userSub) {
    meta = await mutateMeta((cur) => ({ ...cur, userSub: user.sub }));
  }

  let pulled = false;
  let pushed = false;

  try {
    const getRes = await fetch('/api/sync', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    });

    if (getRes.status === 401) {
      emitState({ user: null, status: 'off', message: '登录已过期，请重新登录' });
      return { ok: false, skipped: 'unauthenticated', pulled: false, pushed: false, error: '登录已过期' };
    }
    if (!getRes.ok) {
      const errBody = (await getRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(errBody?.error || `拉取云端进度失败（${getRes.status}）`);
    }

    const remoteBody = (await getRes.json()) as {
      exists: boolean;
      revision: number;
      updatedAt: number;
      snapshot: unknown;
    };

    const localSnapshot = await buildLocalSnapshot(hooks.getAppData(), meta.tombstones);
    let merged: SyncSnapshot;
    let baseRevision = Number(remoteBody.revision) || 0;
    let needPush = false;

    if (!remoteBody.exists || !remoteBody.snapshot) {
      merged = localSnapshot;
      baseRevision = 0;
      needPush = true;
    } else {
      const remoteSnapshot = normalizeSnapshot(remoteBody.snapshot, DEFAULT_SETTINGS);
      merged = mergeSyncSnapshots(localSnapshot, remoteSnapshot);
      pulled = await applySnapshotLocally(merged, localSnapshot);
      needPush = !snapshotsContentEqual(remoteSnapshot, merged);
    }

    let finalRevision = baseRevision;

    if (needPush) {
      let attempt = 0;
      let currentMerged = merged;
      let currentBaseRev = baseRevision;

      while (attempt < MAX_CONFLICT_RETRIES) {
        attempt += 1;
        const putRes = await fetch('/api/sync', {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            baseRevision: currentBaseRev,
            updatedAt: currentMerged.appData.updatedAt || Date.now(),
            snapshot: currentMerged,
          }),
        });

        if (putRes.status === 401) {
          emitState({ user: null, status: 'off', message: '登录已过期，请重新登录' });
          return { ok: false, skipped: 'unauthenticated', pulled, pushed, error: '登录已过期' };
        }

        if (putRes.status === 409) {
          const conflict = (await putRes.json().catch(() => null)) as {
            revision?: number;
            snapshot?: unknown;
          } | null;
          currentBaseRev = Number(conflict?.revision) || 0;
          const latestLocal = await buildLocalSnapshot(hooks.getAppData(), currentMerged.tombstones);
          if (conflict?.snapshot) {
            const latestRemote = normalizeSnapshot(conflict.snapshot, DEFAULT_SETTINGS);
            currentMerged = mergeSyncSnapshots(latestLocal, latestRemote);
            if (await applySnapshotLocally(currentMerged, latestLocal)) {
              pulled = true;
            }
          } else {
            currentMerged = latestLocal;
          }
          continue;
        }

        if (!putRes.ok) {
          const errBody = (await putRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errBody?.error || `上传云端进度失败（${putRes.status}）`);
        }

        const putData = (await putRes.json()) as { revision?: number };
        finalRevision = Number(putData.revision) || currentBaseRev + 1;
        merged = currentMerged;
        pushed = true;
        break;
      }

      if (!pushed) {
        throw new Error('多端并发冲突过多，请稍后再试');
      }
    }

    const syncedAt = Date.now();
    await saveMeta({
      userSub: user.sub,
      revision: finalRevision,
      lastSyncedAt: syncedAt,
      dirty: false,
      tombstones: merged.tombstones,
    });
    emitState({
      status: 'ok',
      message: '',
      lastSyncedAt: syncedAt,
      revision: finalRevision,
      dirty: false,
    });
    return { ok: true, pulled, pushed };
  } catch (err) {
    const message = err instanceof Error ? err.message : '云端同步失败';
    emitState({ status: 'error', message });
    return { ok: false, pulled, pushed, error: message };
  }
}

export async function syncNow(): Promise<SyncRunResult> {
  window.clearTimeout(debounceTimer);
  if (inflightSync) {
    rerunRequested = true;
    return inflightSync;
  }
  inflightSync = (async () => {
    let result = await runSyncOnce();
    while (rerunRequested) {
      rerunRequested = false;
      result = await runSyncOnce();
    }
    return result;
  })();
  try {
    return await inflightSync;
  } finally {
    inflightSync = null;
  }
}

export function initSync(config: {
  getAppData: () => AppData;
  applyMergedAppData: (data: AppData) => void;
}): () => void {
  hooks = config;
  if (initialized) {
    return () => {};
  }
  initialized = true;

  const offExam = onPaperExamMutation((evt) => {
    void mutateMeta((cur) => {
      const paperExamCleared = { ...cur.tombstones.paperExamCleared };
      if (evt.type === 'clear') {
        paperExamCleared[evt.paperId] = evt.at;
      } else {
        delete paperExamCleared[evt.paperId];
      }
      return {
        ...cur,
        dirty: true,
        tombstones: { ...cur.tombstones, paperExamCleared },
      };
    }).then(() => {
      emitState({ dirty: true });
      schedulePush();
    });
  });

  const offReport = onPaperReportMutation(() => {
    void mutateMeta((cur) => ({ ...cur, dirty: true })).then(() => {
      emitState({ dirty: true });
      schedulePush();
    });
  });

  const onOnline = () => {
    if (syncState.user) void syncNow();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible' && syncState.user && syncState.dirty) {
      void syncNow();
    }
  };
  const onPageHide = () => {
    if (syncState.user && syncState.dirty) {
      void syncNow();
    }
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', onPageHide);

  void refreshAuthAndSync();

  return () => {
    initialized = false;
    offExam();
    offReport();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', onPageHide);
  };
}
