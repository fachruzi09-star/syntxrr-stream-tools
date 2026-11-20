import type { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from './cn';

/**
 * Standard icon sizes. Lucide icons are stroke-based, so sizing and stroke
 * weight are standardised here instead of per screen.
 */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export type IconTone =
  | 'inherit'
  | 'default'
  | 'secondary'
  | 'muted'
  | 'accent'
  | 'accent-fg'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

const SIZE_CLASS: Record<IconSize, string> = {
  xs: 'h-3.5 w-3.5', // 14px
  sm: 'h-4 w-4', // 16px
  md: 'h-[18px] w-[18px]', // 18px — default optical size
  lg: 'h-5 w-5', // 20px
  xl: 'h-6 w-6', // 24px
};

const TONE_CLASS: Record<IconTone, string> = {
  inherit: '',
  default: 'text-sx-text',
  secondary: 'text-sx-text-secondary',
  muted: 'text-sx-text-muted',
  accent: 'text-sx-accent',
  'accent-fg': 'text-sx-accent-fg',
  success: 'text-sx-success',
  warning: 'text-sx-warning',
  danger: 'text-sx-danger',
  info: 'text-sx-info',
  neutral: 'text-sx-neutral',
};

export interface IconProps extends Omit<LucideProps, 'size'> {
  /** Lucide icon component, e.g. `import { Play } from 'lucide-react'`. */
  icon: LucideIcon;
  size?: IconSize;
  tone?: IconTone;
  /** Selected/active treatment: slightly heavier stroke. */
  active?: boolean;
  /**
   * Accessible name. Omit for decorative icons so they stay `aria-hidden`
   * and are not announced twice next to a text label.
   */
  label?: string;
}

/**
 * Standardised Lucide icon. Keeps stroke weight, sizing and alignment
 * consistent across the app without replacing the existing icon library.
 *
 * Chat/gift content emoji are application data, not interface icons — never
 * route them through this component.
 */
export function Icon({
  icon: Glyph,
  size = 'md',
  tone = 'inherit',
  active = false,
  strokeWidth,
  label,
  className,
  ...rest
}: IconProps) {
  return (
    <Glyph
      {...rest}
      strokeWidth={strokeWidth ?? (active ? 2.25 : 1.75)}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
      className={cn(SIZE_CLASS[size], TONE_CLASS[tone], 'shrink-0', className)}
    />
  );
}
