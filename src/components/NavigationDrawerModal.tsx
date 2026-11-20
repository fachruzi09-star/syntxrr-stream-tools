import React, { useEffect } from 'react';
import { NavigationTab } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import {
  ChevronRight,
  FolderOpen,
  Gamepad2,
  LayoutDashboard,
  LayoutTemplate,
  Layers,
  Music,
  Plug,
  Radio,
  Settings as SettingsIcon,
  Store,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './ui/Icon';
import { cn } from './ui/cn';
import { BrandMark } from './shell/BrandMark';

interface NavigationDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNav: NavigationTab;
  onNavigate: (nav: NavigationTab) => void;
  pendingMusicCount?: number;
}

interface DrawerItem {
  tab: NavigationTab;
  label: string;
  hint: string;
  icon: LucideIcon;
  badge?: number;
}

interface DrawerGroup {
  title: string;
  items: DrawerItem[];
}

/**
 * Full module drawer. Reaches every one of the ten NavigationTab routes,
 * including Presets and Music which the compact bottom bar cannot hold.
 */
export const NavigationDrawerModal: React.FC<NavigationDrawerModalProps> = ({
  isOpen,
  onClose,
  activeNav,
  onNavigate,
  pendingMusicCount = 0,
}) => {
  const { isEnglish } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const groups: DrawerGroup[] = [
    {
      title: isEnglish ? 'Control' : 'Kontrol',
      items: [
        {
          tab: 'dashboard',
          label: 'Dashboard',
          hint: isEnglish ? 'Mode, status and next actions' : 'Mode, status, dan langkah berikutnya',
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: 'Studio',
      items: [
        {
          tab: 'studio',
          label: 'Studio',
          hint: isEnglish ? 'Canvas, elements and presets' : 'Canvas, elemen, dan preset',
          icon: Layers,
        },
        {
          tab: 'sources',
          label: isEnglish ? 'Sources' : 'Sumber',
          hint: isEnglish ? 'Camera, microphone, media' : 'Kamera, mikrofon, media',
          icon: FolderOpen,
        },
        {
          tab: 'presets',
          label: isEnglish ? 'Presets' : 'Preset',
          hint: isEnglish ? 'Saved layouts and triggers' : 'Layout dan trigger tersimpan',
          icon: LayoutTemplate,
        },
        {
          tab: 'marketplace',
          label: isEnglish ? 'Marketplace' : 'Marketplace',
          hint: isEnglish ? 'Preset and asset library' : 'Pustaka preset dan aset',
          icon: Store,
        },
      ],
    },
    {
      title: isEnglish ? 'Live & Audio' : 'Live & Audio',
      items: [
        {
          tab: 'live_center',
          label: isEnglish ? 'Live Center' : 'Pusat Live',
          hint: isEnglish ? 'Chat, gifts, TTS and events' : 'Chat, gift, TTS, dan event',
          icon: Radio,
        },
        {
          tab: 'music',
          label: isEnglish ? 'Music' : 'Musik',
          hint: isEnglish ? 'Queue, requests and history' : 'Antrean, request, dan riwayat',
          icon: Music,
          badge: pendingMusicCount > 0 ? pendingMusicCount : undefined,
        },
        {
          tab: 'remote_deck',
          label: 'Remote Deck',
          hint: isEnglish ? 'Hardware deck control' : 'Kontrol deck perangkat',
          icon: Gamepad2,
        },
      ],
    },
    {
      title: isEnglish ? 'Connections' : 'Koneksi',
      items: [
        {
          tab: 'integrations',
          label: isEnglish ? 'Integrations' : 'Integrasi',
          hint: isEnglish ? 'TikTok, YouTube, Spotify' : 'TikTok, YouTube, Spotify',
          icon: Plug,
        },
      ],
    },
    {
      title: isEnglish ? 'Preferences' : 'Preferensi',
      items: [
        {
          tab: 'settings',
          label: isEnglish ? 'Settings' : 'Pengaturan',
          hint: isEnglish ? 'App, audio, HUD, performance' : 'Aplikasi, audio, HUD, performa',
          icon: SettingsIcon,
        },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={isEnglish ? 'All modules' : 'Semua modul'}>
      <button
        type="button"
        aria-label={isEnglish ? 'Close navigation' : 'Tutup navigasi'}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 motion-safe:animate-[sx-fade-in_160ms_ease-out]"
      />

      <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[340px] flex-col border-r border-sx-border bg-sx-bg shadow-sx-overlay motion-safe:animate-[sx-slide-in_220ms_cubic-bezier(0.22,1,0.36,1)]">
        <div className="border-b border-sx-border px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
          <div className="flex items-start gap-2.5">
            <BrandMark size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5 leading-none">
                <span className="text-[15px] font-bold tracking-[0.14em] text-sx-text">SYNTXRR</span>
                <span className="text-[15px] font-bold tracking-[0.14em] text-sx-accent">STREAM</span>
              </div>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sx-text-muted">
                {isEnglish ? 'All modules' : 'Semua modul'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={isEnglish ? 'Close' : 'Tutup'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sx-md text-sx-text-secondary transition-colors hover:bg-sx-surface-2 hover:text-sx-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus"
            >
              <Icon icon={X} size="md" tone="inherit" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3">
          {groups.map((group) => (
            <div key={group.title} className="mb-3 last:mb-0">
              <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sx-text-muted">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = activeNav === item.tab;
                  return (
                    <button
                      key={item.tab}
                      type="button"
                      onClick={() => {
                        onNavigate(item.tab);
                        onClose();
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[52px] w-full items-center gap-2.5 rounded-sx-md border px-2.5 py-2 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus',
                        isActive
                          ? 'border-sx-accent/40 bg-sx-accent-soft'
                          : 'border-transparent hover:bg-sx-surface-2',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-sx-sm border',
                          isActive
                            ? 'border-sx-accent/40 bg-sx-accent text-sx-accent-fg'
                            : 'border-sx-border bg-sx-surface-2',
                        )}
                      >
                        <Icon
                          icon={item.icon}
                          size="sm"
                          tone={isActive ? 'inherit' : 'secondary'}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block truncate text-sx-caption',
                            isActive ? 'font-bold text-sx-text' : 'font-semibold text-sx-text',
                          )}
                        >
                          {item.label}
                        </span>
                        <span className="block truncate text-[10px] text-sx-text-muted">{item.hint}</span>
                      </span>
                      {item.badge ? (
                        <span className="flex h-4 min-w-[16px] items-center justify-center rounded-sx-full bg-sx-accent px-1 text-[9px] font-bold leading-none text-sx-accent-fg">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      ) : null}
                      <Icon icon={ChevronRight} size="xs" tone="muted" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
