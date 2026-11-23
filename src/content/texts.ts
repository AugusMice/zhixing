import type { Question, TextBundle, TextGenre, TextItem } from '../types';

const GENRES: TextGenre[] = ['诗', '词', '曲', '文', '赋', '辞'];

/**
 * 古诗文栏目加载器。
 *
 * 目录结构：
 *   content/texts/<batch>.json   -> TextItem[]（一个文件可以放多篇）
 *
 * 校验要点（出错只写 console，不阻断页面）：
 *   - id 唯一、非空
 *   - genre 合法、paragraphs 非空
 *   - famousLines 必须逐字出现在原文中
 *   - notes[].term 必须能在原文里找到
 */
function normalizeForMatch(text: string): string {
  return text.replace(/[\s\u3000]/g, '');
}

const raw = import.meta.glob<TextItem[]>('../../content/texts/*.json', {
  eager: true,
  import: 'default',
});

const errors: string[] = [];
const texts: TextItem[] = [];

const seen = new Set<string>();

for (const [path, pack] of Object.entries(raw)) {
  const name = path.split('/').pop() ?? path;
  if (!Array.isArray(pack)) {
    errors.push(`${name}: 顶层不是数组`);
    continue;
  }
  for (const item of pack) {
    if (!item || typeof item !== 'object') {
      errors.push(`${name}: 存在非对象条目`);
      continue;
    }
    if (!item.id) {
      errors.push(`${name}: 缺少 id（标题「${item.title ?? '?'}」）`);
      continue;
    }
    if (seen.has(item.id)) {
      errors.push(`${name}: 重复的诗文 id「${item.id}」`);
      continue;
    }
    if (!GENRES.includes(item.genre)) {
      errors.push(`${item.id}: genre 非法「${String(item.genre)}」`);
      continue;
    }
    if (!Array.isArray(item.paragraphs) || item.paragraphs.length === 0) {
      errors.push(`${item.id}: paragraphs 为空`);
      continue;
    }
    const body = normalizeForMatch(item.paragraphs.join(''));
    if (body.length < 12) {
      errors.push(`${item.id}: 正文过短（${body.length} 字）`);
      continue;
    }
    for (const line of item.famousLines ?? []) {
      if (!body.includes(normalizeForMatch(line))) {
        errors.push(`${item.id}: 名句不在原文中「${line}」`);
      }
    }
    for (const note of item.notes ?? []) {
      if (!body.includes(normalizeForMatch(note.term))) {
        errors.push(`${item.id}: 注释词不在原文中「${note.term}」`);
      }
    }
    if (!item.appreciation || item.appreciation.trim().length < 40) {
      errors.push(`${item.id}: 赏析过短`);
    }
    seen.add(item.id);
    texts.push(item);
  }
}

if (errors.length > 0) {
  console.error(`[知星] 古诗文栏目有 ${errors.length} 个问题：\n` + errors.join('\n'));
}

const byId = new Map(texts.map((t) => [t.id, t]));
const byGenre = new Map<TextGenre, TextItem[]>();
for (const t of texts) {
  const list = byGenre.get(t.genre) ?? [];
  list.push(t);
  byGenre.set(t.genre, list);
}

export function countQuestionsByText(questions: Question[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const q of questions) {
    if (!q.textId) continue;
    map.set(q.textId, (map.get(q.textId) ?? 0) + 1);
  }
  return map;
}

export const TEXTS: TextBundle = {
  texts,
  byId,
  byGenre,
  questionCountByText: new Map(),
  errors,
};

export function textStatFor(textId: string, questions: Question[]): number {
  return questions.filter((q) => q.textId === textId).length;
}
