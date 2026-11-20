import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
export type BadgeVariant = 'soft' | 'outline' | 'solid';
export type BadgeSize = 'sm' | 'md';

const SOFT_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-sx-neutral-soft text-sx-neutral',
  success: 'bg-sx-success-soft text-sx-success',
  warning: 'bg-sx-warning-soft text-sx-warning',
  danger: 'bg-sx-danger-soft text-sx-danger',
  info: 'bg-sx-info-soft text-sx-info',
  accent: 'bg-sx-accent-soft text-sx-accent-text',
};

const OUTLINE_CLASS: Record<BadgeTone, string> = {
  neutral: 'border border-sx-border-strong text-sx-neutral',
  success: 'border border-sx-success/40 text-sx-success',
  warning: 'border border-sx-warning/40 text-sx-warning',
  danger: 'border border-sx-danger/40 text-sx-danger',
  info: 'border border-sx-info/40 text-sx-info',
  accent: 'border border-sx-selected-border text-sx-accent-text',
};

/**
 * Solid fills use the page background as foreground: it is dark on dark-theme
 * status colours and light on light-theme status colours, so contrast holds in
 * both themes. Accent uses its dedicated dark foreground token instead.
 */
const SOLID_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-sx-neutral text-sx-bg',
  success: 'bg-sx-success text-sx-bg',
  warning: 'bg-sx-warning text-sx-bg',
  danger: 'bg-sx-danger text-sx-bg',
  info: 'bg-sx-info text-sx-bg',
  accent: 'bg-sx-accent text-sx-accent-fg',
};

const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[11px] gap-1',
  md: 'px-2 py-1 text-sx-caption gap-1.5',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
}

/**
 * Compact status/metadata label. Text is never smaller than 11px so it stays
 * readable on phone screens.
 */
export function Badge({
  tone = 'neutral',
  variant = 'soft',
  size = 'sm',
  className,
  children,
  ...rest
}: BadgeProps) {
  const variantClass =
    variant === 'solid' ? SOLID_CLASS[tone] : variant === 'outline' ? OUTLINE_CLASS[tone] : SOFT_CLASS[tone];

  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center rounded-sx-sm font-semibold whitespace-nowrap',
        SIZE_CLASS[size],
        variantClass,
        className,
      )}
    >
      {children}
    </span>
  );
}
