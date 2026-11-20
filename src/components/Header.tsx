import React from 'react';
import { NavigationTab, OperatingMode, isModeAOperatingMode, StudioPreset } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import { Layers, Menu } from 'lucide-react';
import { Icon } from './ui/Icon';
import { StatusDot } from './ui/StatusDot';
import type { StatusTone } from './ui/StatusDot';
import { cn } from './ui/cn';
import { BrandMark } from './shell/BrandMark';

interface HeaderProps {
  activeNav: NavigationTab;
  operatingMode: OperatingMode;
  activePreset: StudioPreset | null;
  honestStatusLabel?: string;
  honestStatusTone?: 'ok' | 'warn' | 'error' | 'off';
  onNavigate: (nav: NavigationTab) => void;
  /** Retained for API compatibility. Mode switching now lives on the Dashboard. */
  onOpenModeModal?: () => void;
  onOpenDrawer: () => void;
}

const TONE_TO_DOT: Record<'ok' | 'warn' | 'error' | 'off', StatusTone> = {
  ok: 'ready',
  warn: 'connecting',
  error: 'disconnected',
  off: 'idle',
};

/**
 * Compact premium application header.
 *
 * Identity + honest operational status + drawer access. It deliberately does
 * NOT offer Mode A/B switching: the Dashboard owns the single authoritative
 * selector, so this header only reports the current context as read-only text.
 */
export const Header: React.FC<HeaderProps> = ({
  activeNav,
  operatingMode,
  activePreset,
  honestStatusLabel,
  honestStatusTone = 'off',
  onNavigate,
  onOpenDrawer,
}) => {
  const { t, isEnglish } = useTranslation();
  const isModeA = isModeAOperatingMode(operatingMode);
  const statusLabel = honestStatusLabel || t('dash.statusNotConnected');
  const showPresetChip = Boolean(activePreset) && activeNav !== 'studio';

  return (
    <header className="sticky top-0 z-40 border-b border-sx-border bg-sx-bg/95 backdrop-blur-md">
      <div className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-3 sm:px-5">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label={isEnglish ? 'Open navigation' : 'Buka navigasi'}
            className={cn(
              '-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-sx-md text-sx-text-secondary',
              'transition-colors hover:bg-sx-surface-2 hover:text-sx-text active:bg-sx-surface-3',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus focus-visible:ring-offset-2 focus-visible:ring-offset-sx-bg',
            )}
          >
            <Icon icon={Menu} size="lg" tone="inherit" />
          </button>

          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark size={30} />
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5 leading-none">
                <span className="truncate text-[15px] font-bold tracking-[0.14em] text-sx-text">
                  SYNTXRR
                </span>
                <span className="truncate text-[15px] font-bold tracking-[0.14em] text-sx-accent">
                  STREAM
                </span>
              </div>
              <div className="mt-1 truncate text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-sx-text-muted">
                {isModeA
                  ? isEnglish
                    ? 'LIVE COMPANION'
                    : 'KOMPANION LIVE'
                  : isEnglish
                    ? 'RTMP ENCODER'
                    : 'ENCODER RTMP'}
              </div>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {showPresetChip && activePreset ? (
              <button
                type="button"
                onClick={() => onNavigate('studio')}
                title={activePreset.name}
                className={cn(
                  'hidden min-h-[36px] max-w-[150px] items-center gap-1.5 rounded-sx-full border border-sx-border bg-sx-surface px-2.5',
                  'text-[11px] font-semibold text-sx-text-secondary transition-colors hover:bg-sx-surface-2 hover:text-sx-text',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus sm:flex',
                )}
              >
                <Icon icon={Layers} size="xs" tone="muted" />
                <span className="truncate">{activePreset.name}</span>
              </button>
            ) : null}

            <div
              title={statusLabel}
              className="flex min-h-[32px] min-w-0 items-center gap-1.5 rounded-sx-full border border-sx-border bg-sx-surface px-2.5 py-1"
            >
              <StatusDot tone={TONE_TO_DOT[honestStatusTone]} />
              <span className="max-w-[132px] truncate text-[11px] font-semibold leading-none text-sx-text-secondary">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
