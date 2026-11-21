import React from 'react';
import { NavigationTab, OperatingMode, isModeAOperatingMode, StudioPreset } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import { Radio, Monitor, Layers } from 'lucide-react';

interface HeaderProps {
  activeNav: NavigationTab;
  operatingMode: OperatingMode;
  activePreset: StudioPreset | null;
  honestStatusLabel?: string;
  honestStatusTone?: 'ok' | 'warn' | 'error' | 'off';
  onNavigate: (nav: NavigationTab) => void;
  onOpenModeModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeNav,
  operatingMode,
  activePreset,
  honestStatusLabel,
  honestStatusTone = 'off',
  onNavigate,
  onOpenModeModal,
}) => {
  const { t } = useTranslation();
  const isModeA = isModeAOperatingMode(operatingMode);

  const primaryGroup: { id: NavigationTab; label: string }[] = [
    { id: 'dashboard', label: t('nav.dashboard', 'Dashboard') },
    { id: 'studio', label: t('nav.studio', 'Studio') },
    { id: 'live_center', label: t('nav.live_center', 'Live') },
    { id: 'remote_deck', label: t('nav.remote_deck', 'Remote Deck') },
  ];

  const systemGroup: { id: NavigationTab; label: string }[] = [
    { id: 'integrations', label: t('nav.integrations', 'Integrasi') },
    { id: 'settings', label: t('nav.settings', 'Pengaturan') },
  ];

  const statusToneStyles = (() => {
    switch (honestStatusTone) {
      case 'ok':
        return {
          dot: 'var(--app-ok)',
          text: 'var(--app-ok)',
          bg: 'var(--app-ok-soft)',
          border: 'color-mix(in srgb, var(--app-ok) 32%, var(--app-border))',
        };
      case 'error':
        return {
          dot: 'var(--app-error)',
          text: 'var(--app-error)',
          bg: 'var(--app-error-soft)',
          border: 'color-mix(in srgb, var(--app-error) 32%, var(--app-border))',
        };
      case 'warn':
        return {
          dot: 'var(--app-warn)',
          text: 'var(--app-warn)',
          bg: 'var(--app-warn-soft)',
          border: 'color-mix(in srgb, var(--app-warn) 32%, var(--app-border))',
        };
      default:
        return {
          dot: 'var(--app-text-muted)',
          text: 'var(--app-text-secondary)',
          bg: 'var(--app-surface)',
          border: 'var(--app-border)',
        };
    }
  })();

  const renderNavItem = (item: { id: NavigationTab; label: string }) => {
    const isActive = activeNav === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onNavigate(item.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`btn-press relative min-h-[44px] px-3 rounded-[9px] text-xs whitespace-nowrap shrink-0 flex items-center ${
          isActive
            ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] border border-[var(--app-accent-border)] font-bold'
            : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] border border-transparent font-semibold'
        }`}
      >
        <span>{item.label}</span>
        {isActive && (
          <span
            aria-hidden="true"
            className="absolute bottom-1 left-3 right-3 h-[2px] rounded-full bg-[var(--app-accent)]"
          />
        )}
      </button>
    );
  };

  return (
    <header className="pt-safe sticky top-0 z-30 bg-[var(--app-bg)]/95 backdrop-blur-md border-b border-[var(--app-border)] px-2.5 sm:px-5 h-12 sm:h-14 flex items-center justify-between gap-2">
      {/* Zone 1: Compact Brand Wordmark */}
      <div className="flex items-center min-w-0 shrink-0">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="btn-press min-h-[44px] flex items-center gap-2 text-left group pr-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          title={t('header.toDashboard', 'Ke Dashboard')}
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-[9px] bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)] shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-bold tracking-tight text-[var(--app-text)] flex items-center gap-1.5 leading-none">
              <span className="truncate">SYNTXRR</span>
              <span className="hidden sm:inline text-[9px] font-mono-num text-[var(--app-accent-text)] font-semibold tracking-wider uppercase">
                {t('app.badge', 'STUDIO')}
              </span>
            </div>
            <div className="hidden sm:block text-[10px] text-[var(--app-text-muted)] font-medium tracking-tight mt-0.5 truncate">
              {t('app.subtitle', 'Mobile Streaming Studio')}
            </div>
          </div>
        </button>
      </div>

      {/* Zone 2: Executive Desktop Navigation — Exactly Six Grouped Menus */}
      <nav
        aria-label="Navigasi utama desktop"
        className="hidden xl:flex items-center gap-1 px-1.5 py-0.5 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]"
      >
        <div className="flex items-center gap-1">{primaryGroup.map(renderNavItem)}</div>
        <div className="h-5 w-px bg-[var(--app-border-strong)] mx-1" aria-hidden="true" />
        <div className="flex items-center gap-1">{systemGroup.map(renderNavItem)}</div>
      </nav>

      {/* Zone 3: Operational Status, Active Preset Shortcut & Mode Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
        {/* Compact live status indicator on mobile, full readout on md+ */}
        <div
          className="flex items-center gap-1.5 px-2 sm:px-2.5 min-h-[34px] sm:min-h-[36px] rounded-[8px] border text-[11px] shrink-0"
          style={{
            backgroundColor: statusToneStyles.bg,
            borderColor: statusToneStyles.border,
          }}
          title={honestStatusLabel || t('header.idle', 'Belum Siaran')}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: statusToneStyles.dot }}
          />
          <span
            className="hidden sm:inline font-semibold max-w-[168px] truncate"
            style={{ color: statusToneStyles.text }}
          >
            {honestStatusLabel || t('header.idle', 'Belum Siaran')}
          </span>
        </div>

        {activePreset && (
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className="btn-press hidden lg:flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-[9px] bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] text-[11px] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] whitespace-nowrap shrink-0"
            title={t('header.activePreset', 'Kelola Preset di Studio')}
          >
            <Layers className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
            <span className="truncate max-w-[96px] font-medium">{activePreset.name}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenModeModal}
          className="btn-press min-h-[44px] px-2.5 sm:px-3 rounded-[9px] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] hover:border-[var(--app-accent-border)] text-[var(--app-text)] text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          title={t('header.changeMode', 'Ubah Mode Operasi Studio')}
        >
          <Monitor className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
          <span className="sm:hidden">{isModeA ? 'Mode A' : 'Mode B'}</span>
          <span className="hidden sm:inline">
            {isModeA ? t('header.modeA', 'Mode A: TikTok') : t('header.modeB', 'Mode B: Encoder')}
          </span>
        </button>
      </div>
    </header>
  );
};
