/** 去掉 Markdown / LaTeX 标记，取一段适合列表展示的纯文本 */
export function plainText(source: string, max = 90): string {
  if (!source) return '';
  let text = source
    .replace(/\$\$[\s\S]*?\$\$/g, ' [公式] ')
    .replace(/\$[^$\n]*\$/g, ' [公式] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > max) text = `${text.slice(0, max)}…`;
  return text;
}

/** 截断中文文本 */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
