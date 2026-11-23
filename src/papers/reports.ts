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
  } catch {
    // 本地保存失败不影响用户继续看卷。
  }
  return entry;
}
