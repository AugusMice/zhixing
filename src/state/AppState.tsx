import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CONTENT } from '../content';
import { computeKpStats } from '../engine/mastery';
import { buildSession, type PlanContext } from '../engine/planner';
import { createSession } from '../engine/session';
import { loadData, saveData, setSession } from '../engine/store';
import {
  getSyncState,
  initSync,
  logoutAndClearSync,
  subscribeSyncState,
  syncNow,
  trackAppDataChange,
  type SyncRunResult,
  type SyncState,
} from '../engine/syncClient';
import type {
  AppData,
  KpStat,
  Question,
  SessionConfig,
  SessionMode,
} from '../types';
import { navigate } from '../lib/router';
import { PAPER_QUESTIONS } from '../papers/adapt';

interface AppContextValue {
  data: AppData;
  content: typeof CONTENT;
  questions: Question[];
  questionsById: Map<string, Question>;
  kpStats: Map<string, KpStat>;
  planCtx: PlanContext;
  update: (updater: (data: AppData) => AppData) => void;
  startSession: (mode: SessionMode, config: SessionConfig) => boolean;
  startQueue: (label: string, qids: string[], mode?: SessionMode) => boolean;
  toast: (message: string) => void;
  sync: SyncState;
  syncNow: () => Promise<SyncRunResult>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用');
  return ctx;
}

function Splash() {
  return (
    <div className="splash">
      <div className="splash-mark">
        <span className="splash-star" />
        <span className="splash-ring" />
      </div>
      <h1>知星</h1>
      <p>正在展开星图…</p>
    </div>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);

  useEffect(() => {
    let alive = true;
    loadData().then((loaded) => {
      if (alive) setData(loaded);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return <Splash />;
  return <ProviderInner initial={data}>{children}</ProviderInner>;
}

function ProviderInner({ initial, children }: { initial: AppData; children: ReactNode }) {
  const [data, setData] = useState<AppData>(initial);
  const dataRef = useRef<AppData>(data);
  dataRef.current = data;
  const [sync, setSync] = useState<SyncState>(() => getSyncState());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const update = useCallback((updater: (current: AppData) => AppData) => {
    setData((current) => {
      const next = updater(current);
      if (next !== current) {
        void saveData(next);
        trackAppDataChange(current, next);
      }
      return next;
    });
  }, []);

  useEffect(() => subscribeSyncState(setSync), []);

  useEffect(
    () =>
      initSync({
        getAppData: () => dataRef.current,
        applyMergedAppData: (merged) => setData(merged),
      }),
    [],
  );

  const toast = useCallback((message: string) => {
    setToastMsg(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const questions = useMemo(() => {
    const extra = data.userQuestions.filter(
      (q) =>
        CONTENT.subjectsById.has(q.subjectId) &&
        q.kpIds.length > 0 &&
        q.kpIds.every((kp) => CONTENT.kpsById.has(kp)),
    );
    return [...CONTENT.questions, ...PAPER_QUESTIONS, ...extra];
  }, [data.userQuestions]);

  const questionsById = useMemo(
    () => new Map(questions.map((q) => [q.id, q])),
    [questions],
  );

  const questionCountByKp = useMemo(() => {
    if (questions === CONTENT.questions) return CONTENT.questionCountByKp;
    const map = new Map<string, number>();
    for (const q of questions) {
      for (const kpId of q.kpIds) map.set(kpId, (map.get(kpId) ?? 0) + 1);
    }
    return map;
  }, [questions]);

  const kpStats = useMemo(
    () => computeKpStats(CONTENT.kps, questions, data.attempts, Date.now()),
    [questions, data.attempts],
  );

  const planCtx = useMemo<PlanContext>(
    () => ({
      questions,
      questionsById,
      kps: CONTENT.kps,
      kpsById: CONTENT.kpsById,
      questionCountByKp,
      cards: data.cards,
      kpStats,
      settings: data.settings,
      now: Date.now(),
    }),
    [questions, questionsById, questionCountByKp, data.cards, kpStats, data.settings],
  );

  const startSession = useCallback(
    (mode: SessionMode, config: SessionConfig): boolean => {
      const built = buildSession(mode, config, planCtx, data);
      if (!built) return false;
      const session = createSession(
        mode,
        built.config,
        built.questions.map((q) => q.id),
      );
      update((current) => setSession(current, session));
      navigate('/session');
      return true;
    },
    [planCtx, data, update],
  );

  const startQueue = useCallback(
    (label: string, qids: string[], mode: SessionMode = 'random'): boolean => {
      const valid = qids.filter((id) => questionsById.has(id));
      if (valid.length === 0) return false;
      const session = createSession(
        mode,
        { label, count: valid.length, reveal: 'immediate' },
        valid,
      );
      update((current) => setSession(current, session));
      navigate('/session');
      return true;
    },
    [questionsById, update],
  );

  useEffect(() => {
    const theme = data.settings.theme;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'auto' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (theme === 'auto') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
  }, [data.settings.theme]);

  useEffect(() => {
    document.documentElement.dataset.font = data.settings.fontSize;
  }, [data.settings.fontSize]);

  const value: AppContextValue = {
    data,
    content: CONTENT,
    questions,
    questionsById,
    kpStats,
    planCtx,
    update,
    startSession,
    startQueue,
    toast,
    sync,
    syncNow,
    logout: logoutAndClearSync,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </AppContext.Provider>
  );
}
