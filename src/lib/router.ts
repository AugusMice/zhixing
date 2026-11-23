import { useEffect, useState } from 'react';

export function currentHash(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function navigate(to: string, replace = false): void {
  if (replace) {
    const base = window.location.href.split('#')[0];
    window.history.replaceState(null, '', `${base}#${to}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (window.location.hash !== `#${to}`) {
    window.location.hash = to;
  }
}

export function goBack(fallback = '/'): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}

export function useHashRoute(): {
  path: string;
  query: URLSearchParams;
  segments: string[];
} {
  const [hash, setHash] = useState(currentHash);

  useEffect(() => {
    const onChange = () => setHash(currentHash());
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);

  const [pathPart, queryPart] = hash.split('?');
  const path = pathPart || '/';
  return {
    path,
    query: new URLSearchParams(queryPart ?? ''),
    segments: path.split('/').filter(Boolean),
  };
}
