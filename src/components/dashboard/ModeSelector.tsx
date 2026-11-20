import { Info } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { OperatingMode } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';
import { Icon } from '../ui/Icon';
import { cn } from '../ui/cn';

interface ModeSelectorProps {
  isModeA: boolean;
  onSelect: (mode: OperatingMode) => void;
  /** Opens the informational Mode A / Mode B explanation sheet. */
  onOpenInfo: () => void;
}

const SEGMENT_BASE =
  'relative flex min-h-[46px] flex-1 flex-col items-start justify-center gap-0.5 overflow-hidden rounded-sx-md px-3 py-1.5 text-left ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-sx-bg';

/**
 * The single authoritative Mode A / Mode B switching surface.
 *
 * This is the only primary selector in the app: the header shows the current
 * context as read-only status and the explanation sheet no longer switches.
 * The active segment is a shared-layout element so the highlight slides
 * between the two options instead of blinking.
 */
export function ModeSelector({ isModeA, onSelect, onOpenInfo }: ModeSelectorProps) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const indicatorTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 420, damping: 38 };

  return (
    <div className="flex items-center gap-2">
      <div
        role="tablist"
        aria-label={t('mode.selector.aria')}
        className="flex flex-1 gap-1 rounded-sx-lg border border-sx-border bg-sx-surface-2 p-1"
      >
        <button
          type="button"
          role="tab"
          id="mode-tab-a"
          aria-selected={isModeA}
          aria-controls="mode-a-details"
          aria-pressed={isModeA}
          onClick={() => onSelect('MODE_A_TIKTOK_COMPANION')}
          className={cn(
            SEGMENT_BASE,
            isModeA
              ? 'text-sx-accent-fg'
              : 'text-sx-text-secondary hover:bg-sx-surface-3 hover:text-sx-text',
          )}
        >
          {isModeA ? (
            <motion.span
              layoutId="sx-mode-segment"
              aria-hidden="true"
              transition={indicatorTransition}
              className="absolute inset-0 rounded-sx-md bg-sx-accent shadow-sx-raised"
            />
          ) : null}
          <span className="relative z-10 text-sx-caption font-bold leading-none">Mode A</span>
          <span
            className={cn(
              'relative z-10 text-[10px] font-semibold leading-none',
              isModeA ? 'text-sx-accent-fg/75' : 'text-sx-text-muted',
            )}
          >
            {t('mode.selector.modeA')}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id="mode-tab-b"
          aria-selected={!isModeA}
          aria-controls="mode-b-details"
          aria-pressed={!isModeA}
          onClick={() => onSelect('MODE_B_STREAMING_ENCODER')}
          className={cn(
            SEGMENT_BASE,
            !isModeA
              ? 'text-sx-accent-fg'
              : 'text-sx-text-secondary hover:bg-sx-surface-3 hover:text-sx-text',
          )}
        >
          {!isModeA ? (
            <motion.span
              layoutId="sx-mode-segment"
              aria-hidden="true"
              transition={indicatorTransition}
              className="absolute inset-0 rounded-sx-md bg-sx-accent shadow-sx-raised"
            />
          ) : null}
          <span className="relative z-10 text-sx-caption font-bold leading-none">Mode B</span>
          <span
            className={cn(
              'relative z-10 text-[10px] font-semibold leading-none',
              !isModeA ? 'text-sx-accent-fg/75' : 'text-sx-text-muted',
            )}
          >
            {t('mode.selector.modeB')}
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenInfo}
        aria-label={t('mode.selector.info')}
        title={t('mode.selector.info')}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-sx-md border border-sx-border bg-sx-surface-2',
          'text-sx-text-secondary transition-colors hover:bg-sx-surface-3 hover:text-sx-text',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus focus-visible:ring-offset-2 focus-visible:ring-offset-sx-bg',
        )}
      >
        <Icon icon={Info} size="md" tone="inherit" />
      </button>
    </div>
  );
}
