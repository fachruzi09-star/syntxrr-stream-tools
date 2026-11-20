import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Status vocabulary shared by the HUD, Studio and Settings. Only states that a
 * real service/connection can report are allowed — never a decorative "online".
 */
export type StatusTone = 'ready' | 'connected' | 'connecting' | 'disconnected' | 'unavailable' | 'idle';

export type StatusDotSize = 'sm' | 'md';

const TONE_CLASS: Record<StatusTone, { dot: string; text: string; pulse: boolean }> = {
  ready: { dot: 'bg-sx-success', text: 'text-sx-success', pulse: false },
  connected: { dot: 'bg-sx-success', text: 'text-sx-success', pulse: false },
  connecting: { dot: 'bg-sx-info', text: 'text-sx-info', pulse: true },
  disconnected: { dot: 'bg-sx-danger', text: 'text-sx-danger', pulse: false },
  unavailable: { dot: 'bg-sx-neutral', text: 'text-sx-neutral', pulse: false },
  idle: { dot: 'bg-sx-neutral', text: 'text-sx-text-muted', pulse: false },
};

const DOT_SIZE: Record<StatusDotSize, string> = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
};

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  size?: StatusDotSize;
  /** Visible label. When omitted the dot stays decorative. */
  label?: string;
}

export function StatusDot({ tone = 'idle', size = 'sm', label, className, ...rest }: StatusDotProps) {
  const config = TONE_CLASS[tone];

  return (
    <span {...rest} className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden
        className={cn(
          'shrink-0 rounded-sx-full',
          DOT_SIZE[size],
          config.dot,
          config.pulse && 'animate-pulse',
        )}
      />
      {label ? (
        <span className={cn('text-sx-caption font-medium', config.text)}>{label}</span>
      ) : (
        <span className="sr-only">{tone}</span>
      )}
    </span>
  );
}
