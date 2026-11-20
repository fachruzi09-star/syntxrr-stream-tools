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
        };
      case 'error':
        return {
          dot: 'var(--app-error)',
          text: 'var(--app-error)',
          bg: 'var(--app-error-soft)',
        };
      case 'warn':
        return {
          dot: 'var(--app-warn)',
          text: 'var(--app-warn)',
          bg: 'var(--app-warn-soft)',
        };
      default:
        return {
          dot: 'var(--app-text-muted)',
          text: 'var(--app-text-secondary)',
          bg: 'var(--app-surface-elevated)',
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
        className={`relative min-h-[44px] px-3 rounded-[9px] text-xs font-semibold whitespace-nowrap flex items-center transition-colors ${
          isActive
            ? 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] border border-[var(--app-accent-border)] font-bold'
            : 'text-[var(--app-text-secondary)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-elevated)] border border-transparent'
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
    <header className="pt-safe sticky top-0 z-30 bg-[var(--app-bg)]/95 backdrop-blur-md border-b border-[var(--app-border)] px-3 sm:px-5 py-2 flex items-center justify-between gap-2 sm:gap-3">
      {/* Zone 1: Brand Wordmark */}
      <div className="flex items-center min-w-0 shrink-0">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="min-h-[44px] flex items-center gap-2.5 text-left group pr-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          title={t('header.toDashboard', 'Ke Dashboard')}
        >
          <div className="w-9 h-9 rounded-[10px] bg-[var(--app-accent-soft)] border border-[var(--app-accent-border)] flex items-center justify-center text-[var(--app-accent-text)] shrink-0 transition-transform duration-150 group-hover:scale-[1.03]">
            <Radio className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-sm font-bold tracking-tight text-[var(--app-text)] flex items-center gap-1.5 leading-none">
              <span className="truncate">SYNTXRR</span>
              <span className="hidden sm:inline text-[9px] font-mono-num text-[var(--app-accent-text)] font-semibold tracking-wider uppercase">
                {t('app.badge', 'STUDIO')}
              </span>
            </div>
            <div className="text-[10px] text-[var(--app-text-muted)] font-medium tracking-tight mt-0.5 truncate max-w-[105px] sm:max-w-none">
              {t('app.subtitle', 'Mobile Streaming Studio')}
            </div>
          </div>
        </button>
      </div>

      {/* Zone 2: Executive Desktop Navigation — Exactly Six Grouped Menus */}
      <nav
        aria-label="Navigasi utama desktop"
        className="hidden xl:flex items-center gap-1 px-1.5 py-1 rounded-xl bg-[var(--app-surface)] border border-[var(--app-border)]"
      >
        <div className="flex items-center gap-1">{primaryGroup.map(renderNavItem)}</div>
        <div className="h-5 w-px bg-[var(--app-border-strong)] mx-1" aria-hidden="true" />
        <div className="flex items-center gap-1">{systemGroup.map(renderNavItem)}</div>
      </nav>

      {/* Zone 3: Operational Status, Active Preset Shortcut & Mode Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div
          className="hidden md:flex items-center gap-2 px-2.5 min-h-[38px] rounded-[9px] border border-[var(--app-border)] text-[11px]"
          style={{ backgroundColor: statusToneStyles.bg }}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: statusToneStyles.dot }}
          />
          <span
            className="font-semibold max-w-[190px] truncate"
            style={{ color: statusToneStyles.text }}
          >
            {honestStatusLabel || t('header.idle', 'Belum Siaran')}
          </span>
        </div>

        {activePreset && (
          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className="hidden lg:flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-[9px] bg-[var(--app-surface)] border border-[var(--app-border)] hover:border-[var(--app-border-strong)] text-[11px] text-[var(--app-text-secondary)] hover:text-[var(--app-text)] transition-colors"
            title={t('header.activePreset', 'Kelola Preset di Studio')}
          >
            <Layers className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
            <span className="truncate max-w-[96px] font-medium">{activePreset.name}</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenModeModal}
          className="min-h-[44px] px-2.5 sm:px-3 rounded-[9px] bg-[var(--app-surface-elevated)] hover:bg-[var(--app-surface-hover)] border border-[var(--app-border-strong)] hover:border-[var(--app-accent-border)] text-[var(--app-text)] text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors max-w-[152px] sm:max-w-none"
          title={t('header.changeMode', 'Ubah Mode Operasi Studio')}
        >
          <Monitor className="w-3.5 h-3.5 text-[var(--app-accent-text)] shrink-0" />
          <span className="truncate">
            {isModeA ? t('header.modeA', 'Mode A: TikTok') : t('header.modeB', 'Mode B: Encoder')}
          </span>
        </button>
      </div>
    </header>
  );
};
