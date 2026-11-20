import { Info } from 'lucide-react';
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
  'flex min-h-[46px] flex-1 flex-col items-start justify-center gap-0.5 rounded-sx-md px-3 py-1.5 text-left ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-sx-bg';

/**
 * The single authoritative Mode A / Mode B switching surface.
 *
 * This is the only primary selector in the app: the header shows the current
 * context as read-only status and the explanation sheet no longer switches.
 */
export function ModeSelector({ isModeA, onSelect, onOpenInfo }: ModeSelectorProps) {
  const { isEnglish } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <div
        role="tablist"
        aria-label={isEnglish ? 'Select operating mode' : 'Pilih mode operasi'}
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
              ? 'bg-sx-accent text-sx-accent-fg shadow-sx-raised'
              : 'text-sx-text-secondary hover:bg-sx-surface-3 hover:text-sx-text',
          )}
        >
          <span className="text-sx-caption font-bold leading-none">Mode A</span>
          <span
            className={cn(
              'text-[10px] font-semibold leading-none',
              isModeA ? 'text-sx-accent-fg/75' : 'text-sx-text-muted',
            )}
          >
            {isEnglish ? 'TikTok Companion' : 'Kompanion TikTok'}
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
              ? 'bg-sx-accent text-sx-accent-fg shadow-sx-raised'
              : 'text-sx-text-secondary hover:bg-sx-surface-3 hover:text-sx-text',
          )}
        >
          <span className="text-sx-caption font-bold leading-none">Mode B</span>
          <span
            className={cn(
              'text-[10px] font-semibold leading-none',
              !isModeA ? 'text-sx-accent-fg/75' : 'text-sx-text-muted',
            )}
          >
            {isEnglish ? 'RTMP Encoder' : 'Encoder RTMP'}
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenInfo}
        aria-label={isEnglish ? 'How the two modes differ' : 'Perbedaan kedua mode'}
        title={isEnglish ? 'How the two modes differ' : 'Perbedaan kedua mode'}
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
