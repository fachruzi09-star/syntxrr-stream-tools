import { NavigationTab, OperatingMode, StudioPreset } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import {
  Radio,
  Monitor,
  ShieldAlert,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';

interface HeaderProps {
  activeNav: NavigationTab;
  operatingMode: OperatingMode;
  activePreset: StudioPreset | null;
  onNavigate: (nav: NavigationTab) => void;
  onOpenModeModal: () => void;
  onOpenDrawer?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeNav,
  operatingMode,
  activePreset,
  onNavigate,
  onOpenModeModal,
}) => {
  const { t } = useTranslation();
  const isModeA = operatingMode === 'MODE_A_TIKTOK_COMPANION' || operatingMode === 'MODE_A_OVERLAY';

  return (
    <header className="pt-safe sticky top-0 z-30 bg-[#080c16]/95 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
      {/* Zone 1: Single element brand wordmark */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex items-center gap-2 text-left group"
          title={t('header.toDashboard', 'Ke Dashboard')}
        >
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:bg-blue-600/30 transition-colors">
            <Radio className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-wider text-white flex items-center gap-1.5 leading-none">
              SYNTXRR STREAM
              <span className="text-[9px] text-blue-400 font-bold tracking-normal px-1 py-0.5 rounded bg-blue-950/80 border border-blue-800/60 uppercase">
                {t('app.badge', 'STUDIO')}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
              {t('app.subtitle', 'Mobile Streaming Studio')}
            </div>
          </div>
        </button>
      </div>

      {/* Zone 2: Desktop / Tablet navigation links */}
      <div className="hidden xl:flex items-center gap-4 text-xs font-semibold text-slate-300">
        {[
          { id: 'dashboard' as NavigationTab, label: t('nav.dashboard', 'Dashboard') },
          { id: 'studio' as NavigationTab, label: t('nav.studio', 'Studio') },
          { id: 'live_center' as NavigationTab, label: t('nav.live_center', 'Live') },
          { id: 'remote_deck' as NavigationTab, label: t('nav.remote_deck', 'Remote Deck') },
          { id: 'integrations' as NavigationTab, label: t('nav.integrations', 'Integrasi') },
          { id: 'settings' as NavigationTab, label: t('nav.settings', 'Pengaturan') },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`transition-colors whitespace-nowrap px-2.5 py-1 rounded-md ${
              activeNav === item.id
                ? 'text-blue-400 font-bold bg-blue-950/50 border border-blue-800/40'
                : 'hover:text-blue-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Zone 3: Connection status, Active Preset, Mode Switcher */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1626] border border-amber-900/60 text-[11px]">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="font-semibold text-amber-300">{t('header.idle', 'Belum Siaran')}</span>
        </div>

        {activePreset && (
          <button
            onClick={() => onNavigate('studio')}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0e1626] border border-blue-900/40 text-[11px] text-blue-300 hover:border-blue-700/60 transition-colors"
            title={t('header.activePreset', 'Kelola Preset di Studio')}
          >
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span className="truncate max-w-[100px]">{activePreset.name}</span>
          </button>
        )}

        <button
          onClick={onOpenModeModal}
          className="min-h-[38px] px-2.5 sm:px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/50 text-blue-300 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          title={t('header.changeMode', 'Ubah Mode Operasi Studio')}
        >
          <Monitor className="w-3.5 h-3.5 text-blue-400" />
          <span className="whitespace-nowrap">
            {isModeA ? t('header.modeA', 'Mode A: TikTok') : t('header.modeB', 'Mode B: Encoder')}
          </span>
        </button>
      </div>
    </header>
  );
};
