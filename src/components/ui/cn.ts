/**
 * Minimal class-name joiner for the UI primitives.
 *
 * Intentionally dependency-free: the project does not ship `clsx` or
 * `tailwind-merge`, and adding a dependency is out of scope for the design
 * foundation batch. Primitives never emit conflicting utilities for the same
 * property, so simple concatenation is sufficient.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
}
