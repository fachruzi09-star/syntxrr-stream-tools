import React, { useEffect, useRef } from 'react';
import { NavigationTab } from '../types';
import { useTranslation } from '../i18n/I18nContext';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
 *
 * Enter/exit motion is handled with AnimatePresence so the sheet slides out
 * instead of disappearing, and it collapses to an instant swap when the user
 * prefers reduced motion.
 */
export const NavigationDrawerModal: React.FC<NavigationDrawerModalProps> = ({
  isOpen,
  onClose,
  activeNav,
  onNavigate,
  pendingMusicCount = 0,
}) => {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Escape closes the sheet; Tab stays inside it while it is open.
  useEffect(() => {
    if (!isOpen) return;

    const getFocusable = (): HTMLElement[] => {
      const panel = panelRef.current;
      if (!panel) return [];
      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = getFocusable();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !panelRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Move focus into the sheet on open, then hand it back to the opener on close.
  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>('[data-drawer-autofocus]') ?? panel;
      target.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const opener = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (opener && document.contains(opener) && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  const groups: DrawerGroup[] = [
    {
      title: t('drawer.group.control'),
      items: [
        {
          tab: 'dashboard',
          label: t('nav.dashboard', 'Dashboard'),
          hint: t('drawer.item.dashboard.hint'),
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: t('drawer.group.studio'),
      items: [
        {
          tab: 'studio',
          label: t('nav.studio', 'Studio'),
          hint: t('drawer.item.studio.hint'),
          icon: Layers,
        },
        {
          tab: 'sources',
          label: t('drawer.item.sources.label'),
          hint: t('drawer.item.sources.hint'),
          icon: FolderOpen,
        },
        {
          tab: 'presets',
          label: t('drawer.item.presets.label'),
          hint: t('drawer.item.presets.hint'),
          icon: LayoutTemplate,
        },
        {
          tab: 'marketplace',
          label: t('nav.marketplace', 'Marketplace'),
          hint: t('drawer.item.marketplace.hint'),
          icon: Store,
        },
      ],
    },
    {
      title: t('drawer.group.live'),
      items: [
        {
          tab: 'live_center',
          label: t('drawer.item.live.label'),
          hint: t('drawer.item.live.hint'),
          icon: Radio,
        },
        {
          tab: 'music',
          label: t('drawer.item.music.label'),
          hint: t('drawer.item.music.hint'),
          icon: Music,
          badge: pendingMusicCount > 0 ? pendingMusicCount : undefined,
        },
        {
          tab: 'remote_deck',
          label: t('nav.remoteDeck', 'Remote Deck'),
          hint: t('drawer.item.deck.hint'),
          icon: Gamepad2,
        },
      ],
    },
    {
      title: t('drawer.group.connections'),
      items: [
        {
          tab: 'integrations',
          label: t('drawer.item.integrations.label'),
          hint: t('drawer.item.integrations.hint'),
          icon: Plug,
        },
      ],
    },
    {
      title: t('drawer.group.preferences'),
      items: [
        {
          tab: 'settings',
          label: t('drawer.item.settings.label'),
          hint: t('drawer.item.settings.hint'),
          icon: SettingsIcon,
        },
      ],
    },
  ];

  return (
    <AnimatePresence>
      {isOpen ? (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label={t('shell.allModules')}
        >
          <motion.button
            type="button"
            aria-label={t('shell.closeNav')}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.16, ease: 'easeOut' }}
            className="absolute inset-0 h-full w-full cursor-default bg-black/60"
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            data-testid="nav-drawer-panel"
            initial={{ x: prefersReducedMotion ? 0 : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: prefersReducedMotion ? 0 : '-100%' }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: 'easeOut' }}
            className="absolute inset-y-0 left-0 flex w-[86%] max-w-[340px] flex-col border-r border-sx-border bg-sx-bg shadow-sx-overlay outline-none"
          >
            <div className="border-b border-sx-border px-4 pb-3 pt-[calc(env(safe-area-inset-top)+14px)]">
              <div className="flex items-start gap-2.5">
                <BrandMark size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-[15px] font-bold tracking-[0.14em] text-sx-text">SYNTXRR</span>
                    <span className="text-[15px] font-bold tracking-[0.14em] text-sx-accent">STREAM</span>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sx-text-muted">
                    {t('shell.allModules')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  data-drawer-autofocus
                  aria-label={t('shell.close')}
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
                          data-testid={`nav-item-${item.tab}`}
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
                            <span className="block truncate text-[10px] text-sx-text-muted">
                              {item.hint}
                            </span>
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
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
