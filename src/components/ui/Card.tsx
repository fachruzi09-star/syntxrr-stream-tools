import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type CardVariant = 'flat' | 'surface' | 'raised' | 'overlay' | 'selected';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<CardVariant, string> = {
  flat: 'bg-transparent border border-sx-border-subtle',
  surface: 'bg-sx-surface border border-sx-border',
  raised: 'bg-sx-surface-2 border border-sx-border shadow-sx-raised',
  overlay: 'bg-sx-surface-3 border border-sx-border-strong shadow-sx-overlay',
  selected: 'bg-sx-selected border border-sx-selected-border',
};

const PADDING_CLASS: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  /** Adds hover affordance for cards that act as buttons. */
  interactive?: boolean;
}

/**
 * Surface container. Elevation is semantic (`raised`, `overlay`) rather than a
 * decorative shadow scale.
 */
export function Card({
  variant = 'surface',
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'rounded-sx-lg',
        VARIANT_CLASS[variant],
        PADDING_CLASS[padding],
        interactive &&
          'cursor-pointer transition-colors sx-transition-fast hover:border-sx-border-strong',
        className,
      )}
    >
      {children}
    </div>
  );
}
