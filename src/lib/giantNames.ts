export const GIANT_NAME_STORAGE = 'zhixing.giant.names';

export const DEFAULT_GIANT_NAMES = [
  '黑洞',
  '霸权主义',
  '强权政治',
  '读后续写',
  '议论文',
  '白细胞',
  '贪吃鬼',
  '巨元素',
  '史莱姆',
  '引力奇点',
  '吞星者',
  '暗物质团',
];

export type GiantPhraseKind = 'born' | 'grow' | 'devour' | 'die';

export const GIANT_PHRASE_STORAGE: Record<GiantPhraseKind, string> = {
  born: 'zhixing.giant.born',
  grow: 'zhixing.giant.grow',
  devour: 'zhixing.giant.devour',
  die: 'zhixing.giant.die',
};

export const DEFAULT_GIANT_PHRASES: Record<GiantPhraseKind, string[]> = {
  born: ['出生了', '诞生了', '出现了', '成团了'],
  grow: ['长大了', '吃到了', '变大了', '变胖了'],
  devour: ['吞噬了', '吃掉了', '合并了'],
  die: ['寿终正寝了', '自然凋亡了', '悄悄嗝屁了', '离开世界了', '轮回转世了'],
};

export function loadGiantNames(): string[] {
  try {
    const raw = localStorage.getItem(GIANT_NAME_STORAGE);
    if (!raw) return [...DEFAULT_GIANT_NAMES];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [...DEFAULT_GIANT_NAMES];
    const names = [...new Set(list.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))];
    return names.length > 0 ? names.slice(0, 24) : [...DEFAULT_GIANT_NAMES];
  } catch {
    return [...DEFAULT_GIANT_NAMES];
  }
}

export function saveGiantNames(names: string[]) {
  try {
    localStorage.setItem(GIANT_NAME_STORAGE, JSON.stringify(names));
  } catch {
    /* ignore quota */
  }
}

export function loadGiantPhrases(kind: GiantPhraseKind): string[] {
  try {
    const raw = localStorage.getItem(GIANT_PHRASE_STORAGE[kind]);
    if (!raw) return [...DEFAULT_GIANT_PHRASES[kind]];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [...DEFAULT_GIANT_PHRASES[kind]];
    const phrases = [...new Set(list.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))];
    return phrases.length > 0 ? phrases.slice(0, 16) : [...DEFAULT_GIANT_PHRASES[kind]];
  } catch {
    return [...DEFAULT_GIANT_PHRASES[kind]];
  }
}

export function saveGiantPhrases(kind: GiantPhraseKind, phrases: string[]) {
  try {
    localStorage.setItem(GIANT_PHRASE_STORAGE[kind], JSON.stringify(phrases));
  } catch {
    /* ignore quota */
  }
}
