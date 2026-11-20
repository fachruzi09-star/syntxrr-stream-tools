import { cn } from '../ui/cn';

interface BrandMarkProps {
  /** Square edge in px. Header uses 30, drawer hero uses 40. */
  size?: number;
  className?: string;
}

/**
 * SYNTXRR brand mark.
 *
 * Three ascending level bars on the solid brand-yellow plate — a streaming
 * level meter rather than a generic play button. Pure inline SVG so it needs
 * no asset pipeline and inherits the theme accent automatically.
 */
export function BrandMark({ size = 30, className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sx-md bg-sx-accent text-sx-accent-fg',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={Math.round(size * 0.62)}
        height={Math.round(size * 0.62)}
        fill="none"
        focusable="false"
      >
        <rect x="3.4" y="13.2" width="3.6" height="7" rx="1.7" fill="currentColor" opacity="0.5" />
        <rect x="10.2" y="9.2" width="3.6" height="11" rx="1.7" fill="currentColor" opacity="0.78" />
        <rect x="17" y="4.4" width="3.6" height="15.8" rx="1.7" fill="currentColor" />
      </svg>
    </span>
  );
}
