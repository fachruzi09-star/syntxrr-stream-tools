import React from 'react';
import { NavigationTab } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import {
  LayoutDashboard,
  Tv,
  Radio,
  Smartphone,
  Plug,
  Settings,
} from 'lucide-react';

interface BottomNavProps {
  activeNav: NavigationTab;
  onNavigate: (nav: NavigationTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeNav, onNavigate }) => {
  const { t } = useTranslation();

  const primaryTabs: {
    id: NavigationTab;
    label: string;
    icon: React.ElementType;
  }[] = [
    { id: 'dashboard', label: t('nav.dock.home', 'Home'), icon: LayoutDashboard },
    { id: 'studio', label: t('nav.dock.studio', 'Studio'), icon: Tv },
    { id: 'live_center', label: t('nav.dock.live', 'Live'), icon: Radio },
    { id: 'remote_deck', label: t('nav.dock.deck', 'Deck'), icon: Smartphone },
    { id: 'integrations', label: t('nav.dock.connect', 'Connect'), icon: Plug },
    { id: 'settings', label: t('nav.dock.config', 'Config'), icon: Settings },
  ];

  return (
    <nav
      aria-label="Navigasi bawah mobile"
      className="xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--app-surface)]/95 backdrop-blur-lg border-t border-[var(--app-border)] pb-safe shadow-[0_-10px_28px_-14px_rgba(0,0,0,0.62)]"
    >
      <div className="grid grid-cols-6 items-end h-[46px] px-1 max-w-xl mx-auto">
        {primaryTabs.map((item) => {
          const Icon = item.icon;
          const isActive = activeNav === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`btn-press relative flex flex-col items-center justify-end w-full min-h-[44px] min-w-[44px] pt-1 pb-1 px-0.5 rounded-[9px] ${
                isActive
                  ? 'text-[var(--app-accent-text)]'
                  : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 w-7 h-[2px] rounded-full bg-[var(--app-accent)]"
                />
              )}
              <div
                className={`flex items-center justify-center w-7 h-[18px] rounded-md transition-colors ${
                  isActive ? 'bg-[var(--app-accent-soft)]' : 'bg-transparent'
                }`}
              >
                <Icon
                  className={`w-[15px] h-[15px] transition-transform duration-150 ${
                    isActive ? 'scale-105 text-[var(--app-accent-text)] stroke-[2.2]' : 'stroke-[1.8]'
                  }`}
                />
              </div>
              <span
                className={`text-[10px] leading-none tracking-tight mt-[2px] truncate max-w-full text-center whitespace-nowrap ${
                  isActive ? 'font-bold text-[var(--app-accent-text)]' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
