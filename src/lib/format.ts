export const DAY_MS = 86_400_000;

export function uid(prefix = ''): string {
  return (
    prefix +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 本地时区的 YYYY-MM-DD，用于每日统计 */
export function dateKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfDay(ts: number = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDate(ts: number, withYear = false): string {
  const d = new Date(ts);
  return withYear
    ? `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`
    : `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function weekdayCN(ts: number): string {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(ts).getDay()];
}

/** 长格式时长：2 小时 15 分 */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec < 60) return `${totalSec} 秒`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) return `${totalMin} 分`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}

/** 计时器格式：12:34 / 1:02:03 */
export function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const days = Math.floor(diff / 86_400_000);
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return formatDate(ts);
}

/** 距离某时间点还有几天（向上取整），已过期为 0 */
export function daysUntil(ts: number, now: number = Date.now()): number {
  if (ts <= now) return 0;
  return Math.ceil((ts - now) / DAY_MS);
}

export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function percent(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** 0~1 的比例，null 显示为 — */
export function pct(n: number | null | undefined, digits = 0): string {
  return n == null ? '—' : `${(n * 100).toFixed(digits)}%`;
}

export function unique<T>(arr: readonly T[]): T[] {
  return Array.from(new Set(arr));
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 最近 n 天的日期 key，从旧到新 */
export function lastNDays(n: number, now: number = Date.now()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dateKey(now - i * DAY_MS));
  return out;
}

export function greeting(now: number = Date.now()): string {
  const h = new Date(now).getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}
