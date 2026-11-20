import React from 'react';
import { NavigationTab } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import { Gamepad2, LayoutDashboard, Layers, Menu, Radio } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './ui/Icon';
import { cn } from './ui/cn';

interface BottomNavProps {
  activeNav: NavigationTab;
  onNavigate: (nav: NavigationTab) => void;
  onOpenDrawer: () => void;
  pendingRequestsCount?: number;
}

interface PrimaryItem {
  tab: NavigationTab;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

/**
 * Five-destination mobile navigation.
 *
 * The previous six-tab bar was cramped and unreadable at 360dp. Four real
 * modules plus a "More" destination that opens the full drawer (all ten
 * routes), so no screen becomes unreachable.
 */
export const BottomNav: React.FC<BottomNavProps> = ({
  activeNav,
  onNavigate,
  onOpenDrawer,
  pendingRequestsCount = 0,
}) => {
  const { t } = useTranslation();

  const primaryItems: PrimaryItem[] = [
    { tab: 'dashboard', label: t('nav.dashboard', 'Dashboard'), icon: LayoutDashboard },
    { tab: 'studio', label: t('nav.studio', 'Studio'), icon: Layers },
    {
      tab: 'live_center',
      label: t('nav.liveCenter', 'Live Center'),
      icon: Radio,
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
    },
    { tab: 'remote_deck', label: t('nav.remoteDeck', 'Remote Deck'), icon: Gamepad2 },
  ];

  const isMoreActive = !primaryItems.some((item) => item.tab === activeNav);

  const itemClass =
    'relative flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 rounded-sx-md px-1 pb-1 pt-2 ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sx-focus ' +
    'focus-visible:ring-inset motion-reduce:transition-none';

  return (
    <nav
      aria-label={t('shell.primaryNav', 'Primary navigation')}
      className="sticky bottom-0 z-40 border-t border-sx-border bg-sx-surface/95 backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto flex w-full max-w-6xl items-stretch gap-0.5 px-1.5 pb-[env(safe-area-inset-bottom)]">
        {primaryItems.map((item) => {
          const isActive = activeNav === item.tab;
          return (
            <button
              key={item.tab}
              type="button"
              data-testid={`nav-tab-${item.tab}`}
              onClick={() => onNavigate(item.tab)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(itemClass, isActive ? 'bg-sx-surface-2/70' : 'hover:bg-sx-surface-2/50')}
            >
              {isActive ? (
                <span className="absolute inset-x-3 top-0 h-[2px] rounded-sx-full bg-sx-accent" />
              ) : null}
              <span className="relative">
                <Icon icon={item.icon} size="lg" tone={isActive ? 'accent' : 'muted'} active={isActive} />
                {item.badge ? (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-sx-full bg-sx-accent px-1 text-[9px] font-bold leading-none text-sx-accent-fg">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  'max-w-full truncate text-[11px] leading-none',
                  isActive ? 'font-semibold text-sx-text' : 'font-medium text-sx-text-muted',
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenDrawer}
          data-testid="nav-more"
          aria-label={t('shell.moreModules', 'More modules')}
          className={cn(itemClass, isMoreActive ? 'bg-sx-surface-2/70' : 'hover:bg-sx-surface-2/50')}
        >
          {isMoreActive ? (
            <span className="absolute inset-x-3 top-0 h-[2px] rounded-sx-full bg-sx-accent" />
          ) : null}
          <Icon icon={Menu} size="lg" tone={isMoreActive ? 'accent' : 'muted'} active={isMoreActive} />
          <span
            className={cn(
              'text-[11px] leading-none',
              isMoreActive ? 'font-semibold text-sx-text' : 'font-medium text-sx-text-muted',
            )}
          >
            {t('shell.more', 'More')}
          </span>
        </button>
      </div>
    </nav>
  );
};
