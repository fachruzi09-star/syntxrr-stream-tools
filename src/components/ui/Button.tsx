import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  /** Brand yellow fill — always paired with dark foreground text. */
  primary:
    'bg-sx-accent text-sx-accent-fg hover:bg-sx-accent-hover active:bg-sx-accent-pressed border border-transparent',
  secondary:
    'bg-sx-surface-2 text-sx-text border border-sx-border hover:bg-sx-surface-3 active:bg-sx-surface-3',
  outline:
    'bg-transparent text-sx-text border border-sx-border-strong hover:bg-sx-surface-2 active:bg-sx-surface-3',
  ghost:
    'bg-transparent text-sx-text-secondary border border-transparent hover:bg-sx-surface-2 hover:text-sx-text active:bg-sx-surface-3',
  danger: 'bg-sx-danger text-sx-bg border border-transparent hover:opacity-90 active:opacity-80',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 gap-1.5 text-sx-caption rounded-sx-md',
  /** 44dp — the default Android-friendly touch target. */
  md: 'h-11 px-4 gap-2 text-sx-secondary rounded-sx-md',
  lg: 'h-[52px] px-5 gap-2.5 text-sx-body rounded-sx-lg',
};

const DISABLED_CLASS =
  'bg-sx-disabled text-sx-disabled-text border border-sx-border-subtle cursor-not-allowed';

const BASE_CLASS =
  'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none ' +
  'transition-colors sx-transition-fast ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus focus-visible:ring-offset-2 focus-visible:ring-offset-sx-bg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction. Implies `disabled`. */
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

/**
 * Primary action primitive.
 *
 * Defaults to `type="button"` so it can never accidentally submit a form.
 * No business logic, no hidden state.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      {...rest}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        BASE_CLASS,
        SIZE_CLASS[size],
        isDisabled ? DISABLED_CLASS : VARIANT_CLASS[variant],
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading ? (
        <Icon icon={Loader2} size="sm" className="animate-spin" />
      ) : leftIcon ? (
        <Icon icon={leftIcon} size={size === 'lg' ? 'md' : 'sm'} />
      ) : null}
      {children}
      {!loading && rightIcon ? <Icon icon={rightIcon} size={size === 'lg' ? 'md' : 'sm'} /> : null}
    </button>
  );
}
