import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { masteryBand } from '../engine/mastery';
import { pct } from '../lib/format';
import { Icon, type IconName } from './Icon';
import type { Subject } from '../types';

/* ------------------------------ 进度条 ------------------------------ */

export function Meter({
  value,
  tone = 'accent',
  height = 6,
  className = '',
}: {
  value: number | null;
  tone?: string;
  height?: number;
  className?: string;
}) {
  const width = value == null ? 0 : Math.max(3, Math.min(100, value * 100));
  return (
    <div className={`meter ${className}`} style={{ height }} role="presentation">
      <span className={`meter-fill tone-${tone}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function MasteryBadge({
  mastery,
  showValue = true,
}: {
  mastery: number | null;
  showValue?: boolean;
}) {
  const band = masteryBand(mastery);
  return (
    <span className={`badge tone-${band.tone}`}>
      {band.label}
      {showValue && mastery != null && <strong>{pct(mastery)}</strong>}
    </span>
  );
}

export function Ring({
  value,
  size = 58,
  stroke = 5,
  color = 'var(--accent)',
  label,
  sub,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, value ?? 0)));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-bar"
        />
      </svg>
      <div className="ring-center">
        <span className="ring-label">{label ?? pct(value)}</span>
        {sub && <span className="ring-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function DifficultyDots({ value }: { value: number }) {
  return (
    <span className="difficulty" title={`难度 ${value}/5`} aria-label={`难度 ${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= value ? 'on' : ''} />
      ))}
    </span>
  );
}

export function SubjectTag({
  subject,
  size = 'md',
}: {
  subject: Subject | undefined;
  size?: 'sm' | 'md';
}) {
  if (!subject) return null;
  return (
    <span
      className={`subject-tag subject-tag--${size}`}
      style={{ ['--subject' as string]: subject.color }}
    >
      <i className="subject-dot" />
      {subject.name}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {back && (
          <button className="icon-btn page-back" onClick={back} aria-label="返回">
            <Icon name="arrow-left" />
          </button>
        )}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
      </div>
      {right && <div className="page-head-right">{right}</div>}
    </header>
  );
}

export function SectionHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  desc,
  action,
}: {
  icon?: IconName;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" />
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone ? `tone-text-${tone}` : ''}`}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
