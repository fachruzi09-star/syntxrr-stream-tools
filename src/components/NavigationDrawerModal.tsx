import React from 'react';
import { NavigationTab } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import {
  X,
  LayoutDashboard,
  Tv,
  Box,
  Radio,
  ShoppingBag,
  Share2,
  Settings,
  Smartphone,
  ChevronRight,
} from 'lucide-react';

interface NavigationDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNav: NavigationTab;
  onNavigate: (nav: NavigationTab) => void;
  pendingMusicCount?: number;
}

export const NavigationDrawerModal: React.FC<NavigationDrawerModalProps> = ({
  isOpen,
  onClose,
  activeNav,
  onNavigate,
  pendingMusicCount = 0,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const modules: {
    id: NavigationTab;
    label: string;
    sublabel: string;
    icon: React.ElementType;
    badge?: string | number;
  }[] = [
    {
      id: 'dashboard',
      label: t('drawer.dashboard.title', '1. Dashboard'),
      sublabel: t('drawer.dashboard.sub', 'Pusat kendali, status hardware, dan telemetri streaming'),
      icon: LayoutDashboard,
    },
    {
      id: 'studio',
      label: t('drawer.studio.title', '2. Studio Editor & Presets'),
      sublabel: t('drawer.studio.sub', 'Pusat pemilihan preset, editor canvas 9:16 & 16:9, dan layer compositor'),
      icon: Tv,
    },
    {
      id: 'sources',
      label: t('drawer.sources.title', '3. Sources & Audio Library'),
      sublabel: t('drawer.sources.sub', 'Pustaka elemen overlay, audio manual, dan widget interaktif'),
      icon: Box,
    },
    {
      id: 'live_center',
      label: t('drawer.live.title', '4. Live Center & Event'),
      sublabel: t('drawer.live.sub', 'Simulator chat, gift, follow, donasi, dan Text-to-Speech (TTS)'),
      icon: Radio,
    },
    {
      id: 'remote_deck',
      label: t('drawer.deck.title', '5. Remote Stream Deck'),
      sublabel: t('drawer.deck.sub', 'Kontroler nirkabel P2P LAN dari HP kedua dengan tombol fisik virtual'),
      icon: Smartphone,
    },
    {
      id: 'integrations',
      label: t('drawer.integrations.title', '6. Integrations'),
      sublabel: t('drawer.integrations.sub', 'TikTok LIVE, YouTube, Twitch, Saweria, Sociabuzz, Trakteer, BagiBagi'),
      icon: Share2,
    },
    {
      id: 'marketplace',
      label: t('drawer.marketplace.title', '7. Marketplace'),
      sublabel: t('drawer.marketplace.sub', 'Koleksi scene, widget donasi, alert pack, dan overlay interaktif'),
      icon: ShoppingBag,
    },
    {
      id: 'settings',
      label: t('drawer.settings.title', '8. Settings (Pengaturan)'),
      sublabel: t('drawer.settings.sub', 'Mode streaming, encoder, profil performa, izin Android, dan backup JSON'),
      icon: Settings,
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nav-drawer-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="relative w-full max-w-lg bg-[#0e1626] border border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Grab Handle for mobile */}
        <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 id="nav-drawer-title" className="text-base font-bold text-white flex items-center gap-2">
              {t('drawer.title', 'Pusat Navigasi & Fitur')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('drawer.subtitle', 'Pilih modul studio siaran yang ingin dikelola')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modules List */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-1.5">
          {modules.map((mod) => {
            const Icon = mod.icon;
            const isActive = activeNav === mod.id;

            return (
              <button
                key={mod.id}
                onClick={() => {
                  onNavigate(mod.id);
                  onClose();
                }}
                className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-colors ${
                  isActive
                    ? 'bg-blue-950/60 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                    : 'bg-[#131f36]/70 border-slate-800/80 hover:bg-[#182744] hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#080c16] text-blue-400 border border-slate-800'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                      <span>{mod.label}</span>
                      {mod.badge !== undefined && (
                        <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                          {mod.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {mod.sublabel}
                    </div>
                  </div>
                </div>

                <ChevronRight
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    isActive ? 'text-blue-400 translate-x-0.5' : 'text-slate-500'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
