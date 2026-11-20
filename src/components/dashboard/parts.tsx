import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Info, TriangleAlert, CircleCheck, CircleX } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { StatusDot } from '../ui/StatusDot';
import type { StatusTone } from '../ui/StatusDot';
import { cn } from '../ui/cn';

/**
 * Presentational parts for the redesigned Dashboard.
 *
 * These carry no application state and call no services: every value shown is
 * passed in by DashboardView from real connector/controller state.
 */

export type PanelTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_TEXT: Record<PanelTone, string> = {
  neutral: 'text-sx-text',
  success: 'text-sx-success',
  warning: 'text-sx-warning',
  danger: 'text-sx-danger',
  info: 'text-sx-info',
};

const TONE_TO_DOT: Record<PanelTone, StatusTone> = {
  neutral: 'idle',
  success: 'ready',
  warning: 'connecting',
  danger: 'disconnected',
  info: 'connecting',
};

const BANNER_CLASS: Record<PanelTone, string> = {
  neutral: 'border-sx-border bg-sx-surface-2',
  success: 'border-sx-success/35 bg-sx-success-soft',
  warning: 'border-sx-warning/35 bg-sx-warning-soft',
  danger: 'border-sx-danger/35 bg-sx-danger-soft',
  info: 'border-sx-info/35 bg-sx-info-soft',
};

const BANNER_ICON: Record<PanelTone, LucideIcon> = {
  neutral: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  info: Info,
};

export function SectionHeading({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-sx-text">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sx-caption leading-relaxed text-sx-text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Compact metric cell. `value` is always rendered with tabular/mono figures
 * because it is technical data (bitrate, FPS, resolution, counts).
 */
export function MetricTile({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: PanelTone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-sx-md border border-sx-border bg-sx-surface-2 p-2.5',
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        {icon ? <Icon icon={icon} size="xs" tone="muted" /> : null}
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-sx-text-muted">
          {label}
        </span>
      </div>
      <div className={cn('mt-1 truncate font-mono text-[13px] font-bold', TONE_TEXT[tone])}>
        {value}
      </div>
      {hint ? <div className="mt-0.5 truncate text-[10px] text-sx-text-muted">{hint}</div> : null}
    </div>
  );
}

/** Label / value row with an honest status dot. */
export function StatusRow({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: PanelTone;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="shrink-0 text-sx-caption text-sx-text-muted">{label}</span>
      <span className="min-w-0 text-right">
        <span className="flex items-center justify-end gap-1.5">
          <StatusDot tone={TONE_TO_DOT[tone]} />
          <span className={cn('truncate text-sx-caption font-semibold', TONE_TEXT[tone])}>
            {value}
          </span>
        </span>
        {detail ? (
          <span className="mt-0.5 block truncate text-[10px] text-sx-text-muted">{detail}</span>
        ) : null}
      </span>
    </div>
  );
}

/** Inline notice used for permission gaps, validation errors and HUD feedback. */
export function InfoBanner({
  tone = 'neutral',
  title,
  children,
  action,
  className,
}: {
  tone?: PanelTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2.5 rounded-sx-md border p-2.5',
        BANNER_CLASS[tone],
        className,
      )}
    >
      <Icon
        icon={BANNER_ICON[tone]}
        size="sm"
        tone={tone === 'neutral' ? 'secondary' : tone}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        {title ? (
          <div className={cn('text-sx-caption font-bold', TONE_TEXT[tone])}>{title}</div>
        ) : null}
        {children ? (
          <div className="text-[11px] leading-relaxed text-sx-text-secondary">{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

/** Navigation shortcut. Always navigates to a real module — never decorative. */
export function ShortcutTile({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-[56px] items-center gap-2.5 rounded-sx-md border border-sx-border bg-sx-surface-2 p-2.5 text-left',
        'transition-colors hover:border-sx-border-strong hover:bg-sx-surface-3',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus focus-visible:ring-offset-2 focus-visible:ring-offset-sx-bg',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm border border-sx-border bg-sx-surface">
        <Icon icon={icon} size="sm" tone="secondary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sx-caption font-semibold text-sx-text">{label}</span>
        {hint ? (
          <span className="block truncate text-[10px] text-sx-text-muted">{hint}</span>
        ) : null}
      </span>
      <Icon icon={ChevronRight} size="xs" tone="muted" />
    </button>
  );
}
