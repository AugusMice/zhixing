import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'sun'
  | 'grid'
  | 'star'
  | 'bookmark'
  | 'user'
  | 'play'
  | 'arrow-left'
  | 'chevron-right'
  | 'close'
  | 'check'
  | 'x'
  | 'timer'
  | 'flame'
  | 'sparkles'
  | 'download'
  | 'upload'
  | 'trash'
  | 'sliders'
  | 'target'
  | 'chart'
  | 'plus'
  | 'refresh'
  | 'book'
  | 'search'
  | 'git-branch';

const paths: Record<IconName, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.8" />
      <rect x="14" y="3" width="7" height="7" rx="1.8" />
      <rect x="3" y="14" width="7" height="7" rx="1.8" />
      <rect x="14" y="14" width="7" height="7" rx="1.8" />
    </>
  ),
  star: (
    <path d="M12 3.2l2.6 5.4 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3.2z" />
  ),
  bookmark: <path d="M6.5 3h11a1 1 0 0 1 1 1v17l-6.5-4-6.5 4V4a1 1 0 0 1 1-1z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21c0-4 3.4-6.2 7.5-6.2s7.5 2.2 7.5 6.2" />
    </>
  ),
  play: <path d="M8 5.2v13.6L19 12 8 5.2z" />,
  'arrow-left': <path d="M19 12H5M12 19l-7-7 7-7" />,
  'chevron-right': <path d="M9 18l6-6-6-6" />,
  close: <path d="M18 6L6 18M6 6l12 12" />,
  check: <path d="M20 6L9 17l-5-5" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.6 2M9 2h6" />
    </>
  ),
  flame: (
    <path d="M12 22c4.1 0 7-2.8 7-6.7 0-3.6-2.5-5.6-4-8.6-1 2-2 3-3 3.6C11 7.2 10.2 4.6 8.6 3 8.1 6 5 8.2 5 15.3 5 19.2 7.9 22 12 22z" />
  ),
  sparkles: (
    <>
      <path d="M12 3l1.9 5 5 1.9-5 1.9L12 17l-1.9-5.2-5-1.9 5-1.9L12 3z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </>
  ),
  download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
  upload: <path d="M12 21V9M7 14l5-5 5 5M5 3h14" />,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6" />,
  sliders: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" fill="var(--panel-solid)" />
      <circle cx="15" cy="12" r="2" fill="var(--panel-solid)" />
      <circle cx="7" cy="18" r="2" fill="var(--panel-solid)" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 6M20 5v6h-6" />,
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  'git-branch': (
    <>
      <circle cx="6" cy="5" r="2.2" />
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="7" r="2.2" />
      <path d="M6 7.2v9.6M8.2 5h5.4A4.4 4.4 0 0 1 18 9.4V10" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  filled = false,
  ...rest
}: {
  name: IconName;
  size?: number;
  filled?: boolean;
} & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
