import type { ReactNode } from 'react';
import { cn } from './cn';

export interface FieldProps {
  /** Visible control label. */
  label?: ReactNode;
  /** Helper text shown under the control when there is no error. */
  hint?: ReactNode;
  /** Validation error. Replaces the hint and is announced immediately. */
  error?: ReactNode;
  required?: boolean;
  /** Id of the control this label belongs to. */
  htmlFor?: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + description layout. Presentation only: it does not own
 * value state and does not wrap or clone the control.
 *
 * Pair it with a control that accepts `id={htmlFor}` and, when `error` is set,
 * `aria-invalid` + `aria-describedby`.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  disabled = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className={cn(
            'text-sx-secondary font-medium',
            disabled ? 'text-sx-disabled-text' : 'text-sx-text-secondary',
          )}
        >
          {label}
          {required ? (
            <span aria-hidden className="ml-0.5 text-sx-danger">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {children}

      {error ? (
        <p role="alert" className="text-sx-caption font-medium text-sx-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sx-caption text-sx-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
