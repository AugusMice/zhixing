import { createStore, get, set } from 'idb-keyval';

export interface PaperReport {
  id: string;
  paperId: string;
  questionId: string;
  number: number;
  message: string;
  createdAt: number;
}

const store = createStore('zhixing-db', 'kv');
const KEY = 'paper-reports';
const reportListeners = new Set<() => void>();

export function onPaperReportMutation(fn: () => void): () => void {
  reportListeners.add(fn);
  return () => reportListeners.delete(fn);
}

export async function loadPaperReports(): Promise<PaperReport[]> {
  try {
    return (await get<PaperReport[]>(KEY, store)) ?? [];
  } catch {
    return [];
  }
}

export async function savePaperReports(reports: PaperReport[]): Promise<void> {
  try {
    await set(KEY, reports.slice(0, 200), store);
  } catch {
    // ignore
  }
}

export async function addPaperReport(
  report: Omit<PaperReport, 'id' | 'createdAt'>,
): Promise<PaperReport> {
  const entry: PaperReport = {
    ...report,
    id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  try {
    const list = (await get<PaperReport[]>(KEY, store)) ?? [];
    await set(KEY, [entry, ...list].slice(0, 200), store);
    for (const fn of reportListeners) fn();
  } catch {
    // 本地保存失败不影响用户继续看卷。
  }
  return entry;
}
