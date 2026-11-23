import { marked } from 'marked';
import katex from 'katex';

marked.setOptions({ gfm: true, breaks: true });

const PLACEHOLDER = /@@MATH(\d+)@@/g;

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return tex;
  }
}

/**
 * 先把 $...$ / $$...$$ 抽成占位符，交给 KaTeX 渲染；
 * 再走 Markdown。这样公式里的下划线、星号不会被 Markdown 吃掉。
 */
export function renderMarkdown(source: string): string {
  if (!source) return '';
  const maths: string[] = [];
  const stash = (tex: string, display: boolean): string => {
    const i = maths.length;
    maths.push(renderTex(tex.trim(), display));
    return `@@MATH${i}@@`;
  };

  let text = source.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => stash(tex, true));
  text = text.replace(/(?<!\\)\$([^$\n]+?)\$/g, (_m, tex: string) => stash(tex, false));

  const html = marked.parse(text, { async: false }) as string;
  return html.replace(PLACEHOLDER, (_m, i: string) => maths[Number(i)] ?? '');
}
