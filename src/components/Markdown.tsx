import { memo, useMemo } from 'react';
import { renderMarkdown } from '../lib/markdown';

export const Markdown = memo(function Markdown({
  text,
  source,
  inline = false,
  className = '',
}: {
  text?: string;
  source?: string;
  inline?: boolean;
  className?: string;
}) {
  const raw = text ?? source ?? '';
  const html = useMemo(() => renderMarkdown(raw), [raw]);
  const cls = `md ${inline ? 'md--inline' : ''} ${className}`.trim();
  if (inline) {
    return <span className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <div className={cls} dangerouslySetInnerHTML={{ __html: html }} />;
});
